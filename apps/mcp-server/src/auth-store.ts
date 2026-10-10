import { DurableObject } from "cloudflare:workers";
import {
	ACCESS_TOKEN_TTL_SECONDS,
	AUTH_CLEANUP_INTERVAL_MS,
	AUTHORIZATION_TRANSACTION_TTL_MS,
	CLIENT_TTL_MS,
	REFRESH_TOKEN_TTL_SECONDS,
	SCOPES_SUPPORTED,
} from "./lib/constants";
import { logEvent } from "./lib/log";
import {
	randomToken,
	sha256Base64Url,
	timingSafeEqual,
	verifyPkce,
} from "./lib/oauth";

export interface OAuthClientRecord {
	clientId: string;
	clientName: string;
	redirectUris: string[];
	tokenEndpointAuthMethod: "none" | "client_secret_post";
	clientSecretHash?: string;
	createdAt: number;
	expiresAt?: number;
}
interface AuthCodeRecord {
	clientId: string;
	installationId: string;
	codeChallenge: string;
	redirectUri: string;
	resource?: string;
	scopes: string[];
	expiresAt: number;
}
interface TokenRecord {
	clientId: string;
	installationId: string;
	scopes: string[];
	resource?: string;
	grantId?: string;
	expiresAt: number;
}
interface AuthorizationTransactionRecord {
	clientId: string;
	redirectUri: string;
	codeChallenge: string;
	resource?: string;
	scopes: string[];
	state?: string;
	expiresAt: number;
	installationId?: string;
}
export interface AuthorizedToken {
	clientId: string;
	installationId: string;
	scopes: string[];
	resource?: string;
	expiresAt: number;
}
export interface IssuedTokens {
	access_token: string;
	token_type: "Bearer";
	expires_in: number;
	refresh_token: string;
	scope: string;
}
type StoredRecord = {
	expiresAt: number;
	installationId?: string;
	grantId?: string;
};
// ponytail: cap 100k auth rows; raise with storage budget, shard this DO if traffic grows.
const MAX_AUTH_RECORDS = 100_000;
const MIGRATION_BATCH_SIZE = 100;
const now = () => Date.now();

/** OAuth state only, never browsing data. SQLite indexes avoid global token scans. */
export class TabotAuth extends DurableObject<{ MCP_PUBLIC_URL: string }> {
	private migrated = false;

	constructor(ctx: DurableObjectState, env: { MCP_PUBLIC_URL: string }) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			ctx.storage.sql.exec(
				"CREATE TABLE IF NOT EXISTS auth_records (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL, installation_id TEXT, grant_id TEXT)",
			);
			ctx.storage.sql.exec(
				"CREATE INDEX IF NOT EXISTS auth_expiry ON auth_records(expires_at)",
			);
			ctx.storage.sql.exec(
				"CREATE INDEX IF NOT EXISTS auth_installation ON auth_records(installation_id, expires_at)",
			);
			ctx.storage.sql.exec(
				"CREATE INDEX IF NOT EXISTS auth_grant ON auth_records(grant_id)",
			);
			ctx.storage.sql.exec(
				"CREATE TABLE IF NOT EXISTS auth_count (id INTEGER PRIMARY KEY CHECK(id = 1), total INTEGER NOT NULL)",
			);
			if (
				ctx.storage.sql
					.exec("SELECT total FROM auth_count WHERE id = 1")
					.toArray().length === 0
			) {
				ctx.storage.sql.exec(
					"INSERT INTO auth_count SELECT 1, COUNT(*) FROM auth_records",
				);
			}
			ctx.storage.sql.exec(
				"CREATE TRIGGER IF NOT EXISTS auth_insert AFTER INSERT ON auth_records BEGIN UPDATE auth_count SET total = total + 1 WHERE id = 1; END",
			);
			ctx.storage.sql.exec(
				"CREATE TRIGGER IF NOT EXISTS auth_delete AFTER DELETE ON auth_records BEGIN UPDATE auth_count SET total = total - 1 WHERE id = 1; END",
			);
			this.migrated =
				(await ctx.storage.get<boolean>("auth:migration:done")) ?? false;
			if (!this.migrated) await this.migrateBatch();
			await this.scheduleCleanup();
		});
	}

	private getRecord<T>(key: string): T | null {
		const row = this.ctx.storage.sql
			.exec<{ value: string; expires_at: number }>(
				"SELECT value, expires_at FROM auth_records WHERE key = ?",
				key,
			)
			.toArray()[0];
		if (!row) return null;
		if (row.expires_at <= now()) {
			this.deleteRecord(key);
			return null;
		}
		return JSON.parse(row.value) as T;
	}

	private putRecord(key: string, record: StoredRecord, legacy = false): void {
		if (
			!legacy &&
			!this.ctx.storage.sql
				.exec("SELECT key FROM auth_records WHERE key = ?", key)
				.toArray().length
		) {
			if (
				this.ctx.storage.sql
					.exec<{ total: number }>("SELECT total FROM auth_count WHERE id = 1")
					.one().total >= MAX_AUTH_RECORDS
			) {
				this.ctx.storage.sql.exec(
					"DELETE FROM auth_records WHERE key IN (SELECT key FROM auth_records WHERE expires_at <= ? LIMIT 500)",
					now(),
				);
				if (
					this.ctx.storage.sql
						.exec<{ total: number }>(
							"SELECT total FROM auth_count WHERE id = 1",
						)
						.one().total >= MAX_AUTH_RECORDS
				) {
					const error = new Error("Authorization store capacity reached.");
					error.name = "AuthCapacityError";
					throw error;
				}
			}
		}
		const token = key.startsWith("access:") || key.startsWith("refresh:");
		this.ctx.storage.sql.exec(
			`INSERT INTO auth_records (key, value, expires_at, installation_id, grant_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) ${legacy ? "DO NOTHING" : "DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at, installation_id = excluded.installation_id, grant_id = excluded.grant_id"}`,
			key,
			JSON.stringify(record),
			record.expiresAt,
			token ? (record.installationId ?? null) : null,
			token ? (record.grantId ?? null) : null,
		);
	}

	private deleteRecord(key: string): void {
		this.ctx.storage.sql.exec("DELETE FROM auth_records WHERE key = ?", key);
	}

	/** One-time, bounded migration from the existing Durable Object KV records. */
	private async migrateBatch(): Promise<void> {
		const cursor = await this.ctx.storage.get<string>("auth:migration:cursor");
		const records = await this.ctx.storage.list<Record<string, unknown>>({
			limit: MIGRATION_BATCH_SIZE,
			...(cursor ? { startAfter: cursor } : {}),
		});
		const keys: string[] = [];
		this.ctx.storage.transactionSync(() => {
			for (const [key, record] of records) {
				if (!/^(client|code|access|refresh|authorization):/.test(key)) continue;
				this.importLegacy(key, record);
				keys.push(key);
			}
		});
		// Copy commits before deleting originals. A retry uses INSERT ... DO NOTHING.
		if (keys.length) await this.ctx.storage.delete(keys);
		if (records.size < MIGRATION_BATCH_SIZE) {
			await this.ctx.storage.put("auth:migration:done", true);
			await this.ctx.storage.delete("auth:migration:cursor");
			this.migrated = true;
		} else {
			await this.ctx.storage.put(
				"auth:migration:cursor",
				[...records.keys()].at(-1),
			);
		}
		logEvent("auth_migration", { count: keys.length, outcome: "ok" });
	}

	private importLegacy(key: string, record: Record<string, unknown>): void {
		const client = key.startsWith("client:");
		const token = key.startsWith("access:") || key.startsWith("refresh:");
		const grantId =
			record.grantId ?? `${record.clientId}:${record.installationId}`;
		if (token && this.getRecord(`revoked:${grantId}`)) return;
		this.putRecord(
			key,
			{
				...record,
				expiresAt:
					typeof record.expiresAt === "number"
						? record.expiresAt
						: now() + CLIENT_TTL_MS,
				...(!client
					? { resource: record.resource ?? this.env.MCP_PUBLIC_URL }
					: {}),
				...(token ? { grantId } : {}),
			} as StoredRecord,
			true,
		);
	}

	private async ensureMigrated(key: string): Promise<void> {
		if (this.migrated) return;
		await this.ctx.blockConcurrencyWhile(async () => {
			const legacy = await this.ctx.storage.get<Record<string, unknown>>(key);
			if (legacy) this.importLegacy(key, legacy);
			await this.ctx.storage.delete(key);
		});
	}

	private async scheduleCleanup(): Promise<void> {
		const deadline = now() + (this.migrated ? AUTH_CLEANUP_INTERVAL_MS : 1_000);
		if (
			this.migrated &&
			!this.ctx.storage.sql
				.exec("SELECT key FROM auth_records LIMIT 1")
				.toArray().length
		)
			return;
		const alarm = await this.ctx.storage.getAlarm();
		if (alarm === null || alarm > deadline)
			await this.ctx.storage.setAlarm(deadline);
	}

	async alarm(): Promise<void> {
		if (!this.migrated)
			await this.ctx.blockConcurrencyWhile(() => this.migrateBatch());
		const expired = this.ctx.storage.sql
			.exec<{ key: string }>(
				"SELECT key FROM auth_records WHERE expires_at <= ? LIMIT 500",
				now(),
			)
			.toArray();
		this.ctx.storage.transactionSync(() => {
			for (const { key } of expired) this.deleteRecord(key);
		});
		logEvent("auth_cleanup", { count: expired.length, outcome: "ok" });
		if (
			this.ctx.storage.sql
				.exec(
					"SELECT key FROM auth_records WHERE expires_at <= ? LIMIT 1",
					now(),
				)
				.toArray().length
		) {
			await this.ctx.storage.setAlarm(now() + 60_000);
		} else await this.scheduleCleanup();
	}

	async saveClient(client: OAuthClientRecord): Promise<void> {
		this.putRecord(`client:${client.clientId}`, {
			...client,
			expiresAt: now() + CLIENT_TTL_MS,
		});
		await this.scheduleCleanup();
	}

	async getClient(clientId: string): Promise<OAuthClientRecord | null> {
		const key = `client:${clientId}`;
		await this.ensureMigrated(key);
		return this.getRecord<OAuthClientRecord>(key);
	}

	async checkClientSecret(clientId: string, secret: string): Promise<boolean> {
		const client = await this.getClient(clientId);
		return (
			!!client?.clientSecretHash &&
			timingSafeEqual(await sha256Base64Url(secret), client.clientSecretHash)
		);
	}

	async createCode(record: AuthCodeRecord & { code: string }): Promise<void> {
		const { code, ...rest } = record;
		this.putRecord(`code:${await sha256Base64Url(code)}`, rest);
		await this.scheduleCleanup();
	}

	async consumeCode(args: {
		code: string;
		clientId: string;
		codeVerifier: string;
		redirectUri: string;
		resource: string;
	}): Promise<{
		installationId: string;
		scopes: string[];
		resource?: string;
	} | null> {
		const key = `code:${await sha256Base64Url(args.code)}`;
		await this.ensureMigrated(key);
		const record = this.getRecord<AuthCodeRecord>(key);
		if (
			!record ||
			record.clientId !== args.clientId ||
			(record.resource ?? this.env.MCP_PUBLIC_URL) !== args.resource
		)
			return null;
		this.deleteRecord(key); // Synchronous read + burn: concurrent redemptions cannot both win.
		if (
			record.redirectUri !== args.redirectUri ||
			!(await verifyPkce(args.codeVerifier, record.codeChallenge))
		)
			return null;
		return {
			installationId: record.installationId,
			scopes: record.scopes,
			resource: record.resource ?? this.env.MCP_PUBLIC_URL,
		};
	}

	async issueTokens(args: {
		clientId: string;
		installationId: string;
		scopes: string[];
		resource: string;
		grantId?: string;
	}): Promise<IssuedTokens> {
		const accessToken = randomToken(32);
		const refreshToken = randomToken(32);
		const [accessHash, refreshHash] = await Promise.all([
			sha256Base64Url(accessToken),
			sha256Base64Url(refreshToken),
		]);
		const record: TokenRecord = {
			...args,
			grantId: args.grantId ?? crypto.randomUUID(),
			expiresAt: now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
		};
		if (this.getRecord(`revoked:${record.grantId}`))
			throw new Error("Authorization grant was revoked.");
		this.ctx.storage.transactionSync(() => {
			this.putRecord(`access:${accessHash}`, record);
			this.putRecord(`refresh:${refreshHash}`, {
				...record,
				expiresAt: now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
			});
			// Public lookups cannot keep unused registrations alive indefinitely.
			const clientKey = `client:${args.clientId}`;
			const client = this.getRecord<OAuthClientRecord>(clientKey);
			if (client)
				this.putRecord(clientKey, {
					...client,
					expiresAt: now() + CLIENT_TTL_MS,
				});
		});
		await this.scheduleCleanup();
		return {
			access_token: accessToken,
			token_type: "Bearer",
			expires_in: ACCESS_TOKEN_TTL_SECONDS,
			refresh_token: refreshToken,
			scope: args.scopes.join(" "),
		};
	}

	async verifyAccessToken(token: string): Promise<AuthorizedToken | null> {
		const key = `access:${await sha256Base64Url(token)}`;
		await this.ensureMigrated(key);
		const record = this.getRecord<TokenRecord>(key);
		return record
			? {
					clientId: record.clientId,
					installationId: record.installationId,
					scopes: record.scopes,
					resource: record.resource ?? this.env.MCP_PUBLIC_URL,
					expiresAt: record.expiresAt,
				}
			: null;
	}

	async rotateRefreshToken(args: {
		clientId: string;
		refreshToken: string;
		resource: string;
	}): Promise<IssuedTokens | null> {
		const key = `refresh:${await sha256Base64Url(args.refreshToken)}`;
		await this.ensureMigrated(key);
		const record = this.getRecord<TokenRecord>(key);
		if (
			!record ||
			record.clientId !== args.clientId ||
			(record.resource ?? this.env.MCP_PUBLIC_URL) !== args.resource
		)
			return null;
		this.deleteRecord(key);
		return this.issueTokens({
			clientId: record.clientId,
			installationId: record.installationId,
			scopes: record.scopes,
			resource: record.resource ?? this.env.MCP_PUBLIC_URL,
			grantId: record.grantId,
		});
	}

	async hasAssistantConnection(installationId: string): Promise<boolean> {
		if (
			this.ctx.storage.sql
				.exec(
					"SELECT key FROM auth_records WHERE installation_id = ? AND expires_at > ? LIMIT 1",
					installationId,
					now(),
				)
				.toArray().length
		)
			return true;
		if (!this.migrated) {
			// An incomplete legacy index must not falsely report that grants were revoked.
			const error = new Error("Authorization migration is in progress.");
			error.name = "AuthMigrationError";
			throw error;
		}
		return false;
	}

	async revokeToken(token: string, clientId: string): Promise<void> {
		const hash = await sha256Base64Url(token);
		for (const prefix of ["access:", "refresh:"]) {
			const key = `${prefix}${hash}`;
			await this.ensureMigrated(key);
			const record = this.getRecord<TokenRecord>(key);
			if (record?.clientId !== clientId) continue;
			if (prefix === "refresh:" && record.grantId) {
				this.ctx.storage.transactionSync(() => {
					this.ctx.storage.sql.exec(
						"DELETE FROM auth_records WHERE grant_id = ?",
						record.grantId,
					);
					// Prevent a later legacy batch from resurrecting this revoked family.
					this.putRecord(
						`revoked:${record.grantId}`,
						{ expiresAt: now() + REFRESH_TOKEN_TTL_SECONDS * 1000 },
						true,
					);
				});
			} else this.deleteRecord(key);
		}
	}

	async createAuthorizationTransaction(
		record: Omit<AuthorizationTransactionRecord, "expiresAt"> & { id: string },
	): Promise<void> {
		const { id, ...rest } = record;
		this.putRecord(`authorization:${await sha256Base64Url(id)}`, {
			...rest,
			expiresAt: now() + AUTHORIZATION_TRANSACTION_TTL_MS,
		});
		await this.scheduleCleanup();
	}

	async approveAuthorizationTransaction(
		id: string,
		installationId: string,
	): Promise<boolean> {
		const key = `authorization:${await sha256Base64Url(id)}`;
		await this.ensureMigrated(key);
		const record = this.getRecord<AuthorizationTransactionRecord>(key);
		if (
			!record ||
			(record.installationId && record.installationId !== installationId)
		)
			return false;
		this.putRecord(key, { ...record, installationId });
		return true;
	}

	async consumeAuthorizationTransaction(
		id: string,
	): Promise<
		(AuthorizationTransactionRecord & { installationId: string }) | null
	> {
		const key = `authorization:${await sha256Base64Url(id)}`;
		await this.ensureMigrated(key);
		const record = this.getRecord<AuthorizationTransactionRecord>(key);
		if (!record?.installationId) return null;
		this.deleteRecord(key);
		return record as AuthorizationTransactionRecord & {
			installationId: string;
		};
	}
}
export const DEFAULT_SCOPES: string[] = [...SCOPES_SUPPORTED];
