import { DurableObject } from "cloudflare:workers";
import {
	ACCESS_TOKEN_TTL_SECONDS,
	AUTHORIZATION_TRANSACTION_TTL_MS,
	REFRESH_TOKEN_TTL_SECONDS,
	SCOPES_SUPPORTED,
} from "./lib/constants";
import {
	randomToken,
	sha256Base64Url,
	timingSafeEqual,
	verifyPkce,
} from "./lib/oauth";

/** Registered OAuth client (DCR, RFC 7591). Secrets are stored hashed. */
export interface OAuthClientRecord {
	clientId: string;
	clientName: string;
	redirectUris: string[];
	tokenEndpointAuthMethod: "none" | "client_secret_post";
	clientSecretHash?: string;
	createdAt: number;
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

const now = () => Date.now();

/**
 * Single auth-store Durable Object (idFromName("auth")). Holds OAuth client
 * registrations, one-time authorization codes, hashed access/refresh tokens and
 * short-lived browser-bridge authorization transactions. Strongly consistent by
 * construction — a code or transaction can only be consumed once.
 *
 * Only identifiers live here: no browsing context, ever (plan §12, §19).
 */
export class TabotAuth extends DurableObject {
	// ponytail: expired rows are pruned lazily on read; add storage.setAlarm for
	// proactive sweeping only if the store actually grows large.
	async saveClient(client: OAuthClientRecord): Promise<void> {
		await this.ctx.storage.put(`client:${client.clientId}`, client);
	}

	async getClient(clientId: string): Promise<OAuthClientRecord | null> {
		return (
			(await this.ctx.storage.get<OAuthClientRecord>(`client:${clientId}`)) ??
			null
		);
	}

	async checkClientSecret(clientId: string, secret: string): Promise<boolean> {
		const client = await this.getClient(clientId);
		if (!client?.clientSecretHash) return false;
		return timingSafeEqual(
			await sha256Base64Url(secret),
			client.clientSecretHash,
		);
	}

	async createCode(record: AuthCodeRecord & { code: string }): Promise<void> {
		const { code, ...rest } = record;
		await this.ctx.storage.put(`code:${await sha256Base64Url(code)}`, rest);
	}

	/** One-time code redemption: verifies PKCE + redirect URI, then burns the code. */
	async consumeCode(args: {
		code: string;
		clientId: string;
		codeVerifier: string;
		redirectUri: string;
	}): Promise<{
		installationId: string;
		scopes: string[];
		resource?: string;
	} | null> {
		const key = `code:${await sha256Base64Url(args.code)}`;
		const record = await this.ctx.storage.get<AuthCodeRecord>(key);
		if (!record) return null;
		await this.ctx.storage.delete(key); // one-time, even on failure
		if (record.expiresAt < now()) return null;
		if (record.clientId !== args.clientId) return null;
		if (record.redirectUri !== args.redirectUri) return null;
		if (!(await verifyPkce(args.codeVerifier, record.codeChallenge)))
			return null;
		return {
			installationId: record.installationId,
			scopes: record.scopes,
			resource: record.resource,
		};
	}

	async issueTokens(args: {
		clientId: string;
		installationId: string;
		scopes: string[];
		resource?: string;
	}): Promise<IssuedTokens> {
		const accessToken = randomToken(32);
		const refreshToken = randomToken(32);
		const accessRecord: TokenRecord = {
			clientId: args.clientId,
			installationId: args.installationId,
			scopes: args.scopes,
			resource: args.resource,
			expiresAt: now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
		};
		const refreshRecord: TokenRecord = {
			...accessRecord,
			expiresAt: now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
		};
		await this.ctx.storage.put(
			`access:${await sha256Base64Url(accessToken)}`,
			accessRecord,
		);
		await this.ctx.storage.put(
			`refresh:${await sha256Base64Url(refreshToken)}`,
			refreshRecord,
		);
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
		const record = await this.ctx.storage.get<TokenRecord>(key);
		if (!record) return null;
		if (record.expiresAt < now()) {
			await this.ctx.storage.delete(key);
			return null;
		}
		return {
			clientId: record.clientId,
			installationId: record.installationId,
			scopes: record.scopes,
			resource: record.resource,
			expiresAt: record.expiresAt,
		};
	}

	/** Refresh-token rotation: the presented refresh token is burned on use. */
	async rotateRefreshToken(args: {
		clientId: string;
		refreshToken: string;
	}): Promise<IssuedTokens | null> {
		const key = `refresh:${await sha256Base64Url(args.refreshToken)}`;
		const record = await this.ctx.storage.get<TokenRecord>(key);
		if (!record) return null;
		await this.ctx.storage.delete(key);
		if (record.expiresAt < now()) return null;
		if (record.clientId !== args.clientId) return null;
		return this.issueTokens({
			clientId: record.clientId,
			installationId: record.installationId,
			scopes: record.scopes,
			resource: record.resource,
		});
	}

	async revokeToken(token: string): Promise<void> {
		const hash = await sha256Base64Url(token);
		await this.ctx.storage.delete(`access:${hash}`);
		await this.ctx.storage.delete(`refresh:${hash}`);
	}

	/** Start one OAuth authorization request awaiting extension proof. */
	async createAuthorizationTransaction(
		record: Omit<AuthorizationTransactionRecord, "expiresAt"> & { id: string },
	): Promise<void> {
		const { id, ...rest } = record;
		await this.ctx.storage.put(`authorization:${await sha256Base64Url(id)}`, {
			...rest,
			expiresAt: now() + AUTHORIZATION_TRANSACTION_TTL_MS,
		});
	}

	/** Bind a live extension credential to its one-time authorization request. */
	async approveAuthorizationTransaction(
		id: string,
		installationId: string,
	): Promise<boolean> {
		const key = `authorization:${await sha256Base64Url(id)}`;
		const record =
			await this.ctx.storage.get<AuthorizationTransactionRecord>(key);
		if (!record) return false;
		if (record.expiresAt < now()) {
			await this.ctx.storage.delete(key);
			return false;
		}
		if (record.installationId && record.installationId !== installationId)
			return false;
		await this.ctx.storage.put(key, { ...record, installationId });
		return true;
	}

	/** Burn one approved browser-bridge transaction and return its OAuth request. */
	async consumeAuthorizationTransaction(
		id: string,
	): Promise<
		(AuthorizationTransactionRecord & { installationId: string }) | null
	> {
		const key = `authorization:${await sha256Base64Url(id)}`;
		const record =
			await this.ctx.storage.get<AuthorizationTransactionRecord>(key);
		if (!record) return null;
		if (record.expiresAt < now()) {
			await this.ctx.storage.delete(key);
			return null;
		}
		if (!record.installationId) return null;
		await this.ctx.storage.delete(key);
		return record as AuthorizationTransactionRecord & {
			installationId: string;
		};
	}
}

export const DEFAULT_SCOPES: string[] = [...SCOPES_SUPPORTED];
