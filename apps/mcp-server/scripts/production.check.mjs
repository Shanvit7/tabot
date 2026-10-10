// Local regression checks only: no deployment, real credentials or browsing history.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "cloudflare:workers")
			return {
				url: "data:text/javascript,export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }",
				shortCircuit: true,
			};
		try {
			return nextResolve(specifier, context);
		} catch (error) {
			if (error.code === "ERR_UNSUPPORTED_DIR_IMPORT")
				return nextResolve(`${specifier}/index.ts`, context);
			throw error;
		}
	},
});
const [
	{ TabotInstallation },
	{ parseClientMessage },
	{ MAX_PENDING_REQUESTS },
] = await Promise.all([
	import("../src/installation.ts"),
	import("../src/lib/protocol.ts"),
	import("../src/lib/constants.ts"),
]);
globalThis.WebSocketRequestResponsePair = class {};
const socket = () => ({
	readyState: WebSocket.OPEN,
	messages: [],
	send(raw) {
		this.messages.push(JSON.parse(raw));
	},
	close() {
		this.readyState = WebSocket.CLOSED;
	},
});
const stale = socket();
const current = socket();
const installation = new TabotInstallation(
	{ setWebSocketAutoResponse() {}, getWebSockets: () => [current] },
	{},
);
const result = installation.dispatch("ping", {});
await installation.webSocketClose(stale);
await installation.webSocketError(stale, new Error("stale"));
await installation.webSocketMessage(
	stale,
	JSON.stringify({
		type: "response",
		requestId: current.messages[0].requestId,
		result: "wrong socket",
	}),
);
assert.equal(
	installation.pending.size,
	1,
	"stale sockets cannot settle current requests",
);
await installation.webSocketMessage(
	current,
	JSON.stringify({
		type: "response",
		requestId: current.messages[0].requestId,
		result: "pong",
	}),
);
assert.equal(await result, "pong");
assert.equal(installation.pending.size, 0);

const brokenSocket = socket();
brokenSocket.send = () => {
	throw new Error("send failed");
};
const broken = new TabotInstallation(
	{ setWebSocketAutoResponse() {}, getWebSockets: () => [brokenSocket] },
	{},
);
await assert.rejects(broken.dispatch("ping", {}), {
	code: "extension_disconnected",
});
assert.equal(
	broken.pending.size,
	0,
	"failed send clears pending entry and timer",
);
const busySocket = socket();
const busy = new TabotInstallation(
	{ setWebSocketAutoResponse() {}, getWebSockets: () => [busySocket] },
	{},
);
const pending = Array.from({ length: MAX_PENDING_REQUESTS }, () =>
	busy.dispatch("ping", {}).catch((error) => error.code),
);
await assert.rejects(busy.dispatch("ping", {}), { code: "extension_busy" });
await busy.webSocketClose(busySocket);
assert.ok(
	(await Promise.all(pending)).every(
		(code) => code === "extension_disconnected",
	),
);
assert.equal(busy.pending.size, 0);
const binarySocket = socket();
const binary = new TabotInstallation(
	{ setWebSocketAutoResponse() {}, getWebSockets: () => [binarySocket] },
	{},
);
const binaryResult = binary.dispatch("ping", {}).catch((error) => error.code);
await binary.webSocketMessage(binarySocket, new ArrayBuffer(1));
assert.equal(await binaryResult, "malformed_message");
assert.equal(binary.pending.size, 0);
assert.equal(binarySocket.readyState, WebSocket.CLOSED);
assert.equal(parseClientMessage('{"type":"response","requestId":"id"}'), null);
assert.equal(
	parseClientMessage(
		'{"type":"response","requestId":"id","result":null,"error":{"code":"x","message":"x"}}',
	),
	null,
);
assert.equal(
	parseClientMessage('{"type":"response","requestId":"id","error":null}'),
	null,
);
assert.deepEqual(
	parseClientMessage('{"type":"response","requestId":"id","result":null}')
		.result,
	null,
);
const [
	{ TabotAuth },
	{ default: app },
	{ sha256Base64Url },
	{ signInstallationToken },
] = await Promise.all([
	import("../src/auth-store.ts"),
	import("../src/index.ts"),
	import("../src/lib/oauth.ts"),
	import("../src/lib/auth.ts"),
]);
const authState = (legacy = new Map()) => {
	const db = new DatabaseSync(":memory:");
	let barrier = Promise.resolve();
	let alarm = null;
	const state = {
		listCalls: 0,
		blockConcurrencyWhile(callback) {
			barrier = barrier.then(callback);
			return barrier;
		},
		get ready() {
			return barrier;
		},
		storage: {
			sql: {
				exec(query, ...bindings) {
					const rows = db.prepare(query).all(...bindings);
					return {
						toArray: () => rows,
						one: () => {
							assert.equal(rows.length, 1);
							return rows[0];
						},
					};
				},
			},
			transactionSync(callback) {
				db.exec("BEGIN");
				try {
					const value = callback();
					db.exec("COMMIT");
					return value;
				} catch (error) {
					db.exec("ROLLBACK");
					throw error;
				}
			},
			async get(key) {
				return structuredClone(legacy.get(key));
			},
			async put(key, value) {
				legacy.set(key, structuredClone(value));
			},
			async delete(keys) {
				for (const key of Array.isArray(keys) ? keys : [keys])
					legacy.delete(key);
			},
			async list({ limit, startAfter }) {
				state.listCalls++;
				return new Map(
					[...legacy]
						.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
						.filter(([key]) => !startAfter || key > startAfter)
						.slice(0, limit),
				);
			},
			async getAlarm() {
				return alarm;
			},
			async setAlarm(value) {
				alarm = value;
			},
		},
		db,
	};
	return state;
};
const state = authState();
const auth = new TabotAuth(state, {
	MCP_PUBLIC_URL: "https://test.invalid/mcp",
});
await state.ready;
const logs = [];
const originalLog = console.log;
console.log = (entry) => logs.push(JSON.parse(entry));
try {
	let dispatches = 0;
	const env = {
		MCP_PUBLIC_URL: "https://test.invalid/mcp",
		TABOT_EXTENSION_ID: "test-extension",
		TABOT_AUTH_SECRET: "local-test-only-signing-secret",
		TABOT_PUBLIC_RATE_LIMITER: { limit: async () => ({ success: true }) },
		TABOT_API_RATE_LIMITER: { limit: async () => ({ success: true }) },
		TABOT_AUTH: { idFromName: (id) => id, get: () => auth },
		TABOT_INSTALLATION: {
			idFromName: (id) => id,
			get: () => ({
				fetch: async () => {
					dispatches++;
					return Response.json({
						ok: false,
						error: {
							code: "extension_timeout",
							message: "private-error-sentinel",
						},
					});
				},
			}),
		},
	};
	const request = (path, init = {}, bindings = env) =>
		app.request(`https://test.invalid${path}`, init, bindings);
	const formPost = (path, form, headers = {}) =>
		request(path, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				...headers,
			},
			body: new URLSearchParams(form),
		});
	const register = async (body) =>
		request("/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	const registered = await register({
		redirect_uris: ["https://callback.invalid"],
		client_name: "Test",
	});
	assert.equal(registered.status, 201);
	assert.equal(registered.headers.get("Cache-Control"), "no-store");
	const { client_id: clientId } = await registered.json();
	const clientKey = `client:${clientId}`;
	const nearExpiry = Date.now() + 86_400_000;
	auth.putRecord(clientKey, {
		...(await auth.getClient(clientId)),
		expiresAt: nearExpiry,
	});
	await auth.getClient(clientId);
	assert.equal(
		state.storage.sql
			.exec("SELECT expires_at FROM auth_records WHERE key = ?", clientKey)
			.one().expires_at,
		nearExpiry,
		"public client lookup cannot renew expiry",
	);
	for (const body of [
		{ redirect_uris: ["https://callback.invalid#fragment"] },
		{ redirect_uris: ["https://user:pass@callback.invalid"] },
		{ redirect_uris: ["https://callback.invalid", 1] },
		{ redirect_uris: Array(11).fill("https://callback.invalid") },
		{
			redirect_uris: ["https://callback.invalid"],
			client_name: "x".repeat(201),
		},
		{
			redirect_uris: ["https://callback.invalid"],
			token_endpoint_auth_method: "unknown",
		},
	])
		assert.equal((await register(body)).status, 400);
	const verifier = "test-verifier-".padEnd(43, "x");
	const authorize = new URLSearchParams({
		client_id: clientId,
		redirect_uri: "https://callback.invalid",
		response_type: "code",
		code_challenge_method: "S256",
		code_challenge: await sha256Base64Url(verifier),
		state: "private-state-sentinel",
	});
	for (const [key, value] of [
		["resource", "https://other.invalid/mcp"],
		["scope", "wrong"],
		["code_challenge", "too-short"],
		["code_challenge_method", "plain"],
	]) {
		const invalid = new URLSearchParams(authorize);
		invalid.set(key, value);
		assert.equal((await request(`/authorize?${invalid}`)).status, 400);
	}
	const consent = await request(`/authorize?${authorize}`);
	assert.equal(consent.status, 200);
	assert.equal(
		consent.headers.get("Content-Security-Policy"),
		"frame-ancestors 'none'",
	);
	assert.equal(consent.headers.get("X-Frame-Options"), "DENY");
	assert.equal(consent.headers.get("Referrer-Policy"), "no-referrer");
	const html = await consent.text();
	const transaction = html.match(/data-transaction-id="([^"]+)"/)[1];
	assert.equal(
		(await formPost("/authorize", { transaction })).status,
		400,
		"unapproved transaction cannot mint code",
	);
	const installationToken = await signInstallationToken(
		env.TABOT_AUTH_SECRET,
		"test-installation",
	);
	assert.equal(
		(
			await request(`/authorize/transactions/${transaction}/approve`, {
				method: "POST",
				headers: { Authorization: `Bearer ${installationToken}` },
			})
		).status,
		200,
	);
	assert.equal(
		await auth.hasAssistantConnection("test-installation"),
		false,
		"approval alone is not an OAuth connection",
	);
	const approved = await formPost("/authorize", { transaction });
	assert.equal(approved.status, 302);
	const callback = new URL(approved.headers.get("Location"));
	assert.equal(callback.searchParams.get("state"), "private-state-sentinel");
	const code = callback.searchParams.get("code");
	assert.equal(
		(await formPost("/authorize", { transaction })).status,
		400,
		"transaction cannot replay",
	);
	const exchange = {
		grant_type: "authorization_code",
		client_id: clientId,
		code,
		code_verifier: verifier,
		redirect_uri: "https://callback.invalid",
	};
	assert.equal(
		(
			await formPost("/token", {
				...exchange,
				resource: "https://other.invalid/mcp",
			})
		).status,
		400,
	);
	const issued = await formPost("/token", exchange);
	assert.equal(issued.status, 200);
	assert.equal(issued.headers.get("Cache-Control"), "no-store");
	assert.equal(issued.headers.get("Pragma"), "no-cache");
	const tokens = await issued.json();
	assert.ok(
		state.storage.sql
			.exec("SELECT expires_at FROM auth_records WHERE key = ?", clientKey)
			.one().expires_at > nearExpiry,
		"authorized token issuance renews client lifetime",
	);
	assert.equal(
		(await formPost("/token", exchange)).status,
		400,
		"code cannot replay",
	);
	assert.equal(await auth.hasAssistantConnection("test-installation"), true);
	const listCalls = state.listCalls;
	await auth.hasAssistantConnection("not-connected");
	assert.equal(
		state.listCalls,
		listCalls,
		"connection query uses index, not KV scans",
	);
	const mcp = (token, params = { method: "tools/list", params: {} }) =>
		request("/mcp", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...params }),
		});
	assert.equal((await mcp(tokens.access_token)).status, 200);
	for (const [resource, scopes, expected] of [
		["https://other.invalid/mcp", ["tabot.context"], 401],
		["https://test.invalid/mcp", [], 403],
	]) {
		const wrong = await auth.issueTokens({
			clientId,
			installationId: "wrong-installation",
			resource,
			scopes,
		});
		assert.equal((await mcp(wrong.access_token)).status, expected);
	}
	assert.equal(dispatches, 0, "wrong audience/scope never dispatch");
	const toolResponse = await mcp(tokens.access_token, {
		method: "tools/call",
		params: { name: "get_current_context", arguments: {} },
	});
	assert.match(await toolResponse.text(), /private-error-sentinel/);
	const toolLog = logs.find((entry) => entry.event === "tool_call");
	assert.equal(toolLog.code, "extension_timeout");
	assert.equal(toolLog.outcome, "error");
	assert.equal(toolLog.requestId, toolResponse.headers.get("X-Request-Id"));
	assert.equal(typeof toolLog.durationMs, "number");
	assert.ok(
		logs.some((entry) => entry.route === "/authorize/transactions/:id/approve"),
	);
	const serializedLogs = JSON.stringify(logs);
	for (const sensitive of [
		transaction,
		code,
		verifier,
		installationToken,
		tokens.access_token,
		tokens.refresh_token,
		"private-error-sentinel",
		"private-state-sentinel",
	])
		assert.ok(
			!serializedLogs.includes(sensitive),
			"logs exclude sensitive data",
		);
	assert.equal(
		(await request("/mcp", { method: "POST", body: "x".repeat(16_385) }))
			.status,
		413,
	);
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(new Uint8Array(9000));
			controller.enqueue(new Uint8Array(9000));
			controller.close();
		},
	});
	assert.equal(
		(await request("/mcp", { method: "POST", body: stream, duplex: "half" }))
			.status,
		413,
		"chunked bodies bounded too",
	);
	assert.equal(
		(await request(`/authorize?state=${"x".repeat(8192)}`)).status,
		414,
	);
	let selectedKey;
	const blocked = {
		...env,
		TABOT_PUBLIC_RATE_LIMITER: {
			limit: async ({ key }) => {
				selectedKey = key;
				return { success: false };
			},
		},
	};
	const limited = await request(
		"/register",
		{
			method: "POST",
			headers: {
				"CF-Connecting-IP": "192.0.2.1",
				"X-Forwarded-For": "spoofed",
			},
			body: "{}",
		},
		blocked,
	);
	assert.equal(limited.status, 429);
	assert.equal(limited.headers.get("Retry-After"), "60");
	assert.equal(selectedKey, "192.0.2.1");
	assert.equal(
		(await request("/health", {}, blocked)).status,
		200,
		"health skips rate checks",
	);
	const noBinding = { ...env, TABOT_API_RATE_LIMITER: undefined };
	assert.equal(
		(await request("/mcp", { method: "POST" }, noBinding)).status,
		500,
		"missing binding fails closed",
	);
	assert.equal(
		(
			await formPost("/revoke", {
				client_id: "missing-client",
				token: tokens.access_token,
			})
		).status,
		401,
	);
	await auth.revokeToken(tokens.access_token, "wrong-client");
	assert.ok(
		await auth.verifyAccessToken(tokens.access_token),
		"another client cannot revoke token",
	);
	assert.equal(
		await auth.rotateRefreshToken({
			clientId: "wrong-client",
			refreshToken: tokens.refresh_token,
			resource: env.MCP_PUBLIC_URL,
		}),
		null,
	);
	const rotated = await formPost("/token", {
		grant_type: "refresh_token",
		client_id: clientId,
		refresh_token: tokens.refresh_token,
	});
	assert.equal(rotated.status, 200);
	const nextTokens = await rotated.json();
	assert.equal(
		(
			await formPost("/token", {
				grant_type: "refresh_token",
				client_id: clientId,
				refresh_token: tokens.refresh_token,
			})
		).status,
		400,
		"refresh cannot replay",
	);
	assert.equal(
		(
			await formPost("/revoke", {
				client_id: clientId,
				token: nextTokens.refresh_token,
			})
		).status,
		200,
	);
	assert.equal(await auth.verifyAccessToken(nextTokens.access_token), null);
	assert.equal(
		await auth.verifyAccessToken(tokens.access_token),
		null,
		"refresh revocation invalidates entire rotated grant",
	);
	assert.equal(await auth.hasAssistantConnection("test-installation"), false);
	const race = await auth.issueTokens({
		clientId,
		installationId: "race",
		resource: env.MCP_PUBLIC_URL,
		scopes: ["tabot.context"],
	});
	const refreshes = await Promise.all(
		Array.from({ length: 2 }, () =>
			auth.rotateRefreshToken({
				clientId,
				refreshToken: race.refresh_token,
				resource: env.MCP_PUBLIC_URL,
			}),
		),
	);
	assert.equal(
		refreshes.filter(Boolean).length,
		1,
		"concurrent refresh has one winner",
	);
	const codeRecord = {
		code: "race-code",
		clientId,
		installationId: "race",
		redirectUri: "https://callback.invalid",
		resource: env.MCP_PUBLIC_URL,
		scopes: ["tabot.context"],
		codeChallenge: await sha256Base64Url(verifier),
		expiresAt: Date.now() + 60_000,
	};
	await auth.createCode(codeRecord);
	const redemptions = await Promise.all(
		Array.from({ length: 2 }, () =>
			auth.consumeCode({
				code: codeRecord.code,
				clientId,
				redirectUri: codeRecord.redirectUri,
				resource: env.MCP_PUBLIC_URL,
				codeVerifier: verifier,
			}),
		),
	);
	assert.equal(
		redemptions.filter(Boolean).length,
		1,
		"concurrent code redemption has one winner",
	);
	await auth.createCode({
		...codeRecord,
		code: "expired-code",
		expiresAt: Date.now() - 1,
	});
	await auth.alarm();
	assert.equal(
		state.storage.sql
			.exec(
				"SELECT key FROM auth_records WHERE key = ?",
				`code:${await sha256Base64Url("expired-code")}`,
			)
			.toArray().length,
		0,
	);
	assert.ok(await state.storage.getAlarm(), "cleanup remains scheduled");
	const plan = state.storage.sql
		.exec(
			"EXPLAIN QUERY PLAN SELECT key FROM auth_records WHERE installation_id = ? AND expires_at > ? LIMIT 1",
			"race",
			Date.now(),
		)
		.toArray();
	assert.match(JSON.stringify(plan), /auth_installation/);
	state.storage.sql.exec("UPDATE auth_count SET total = 100000 WHERE id = 1");
	await assert.rejects(
		auth.saveClient({
			clientId: "capacity",
			clientName: "Test",
			redirectUris: ["https://callback.invalid"],
			tokenEndpointAuthMethod: "none",
			createdAt: Date.now(),
		}),
		{ name: "AuthCapacityError" },
	);
	state.storage.sql.exec(
		"UPDATE auth_count SET total = (SELECT COUNT(*) FROM auth_records) WHERE id = 1",
	);
} finally {
	console.log = originalLog;
	state.db.close();
}
const candidates = await Promise.all(
	Array.from({ length: 150 }, async (_, index) => ({
		token: `legacy-${index}`,
		hash: await sha256Base64Url(`legacy-${index}`),
	})),
);
candidates.sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));
const target = candidates.at(-1);
const legacyRecord = {
	clientId: "legacy-client",
	installationId: "legacy-installation",
	scopes: ["tabot.context"],
	expiresAt: Date.now() + 3_600_000,
};
const legacy = new Map(
	candidates.map(({ hash }) => [
		`access:${hash}`,
		{
			...legacyRecord,
			installationId:
				hash === target.hash ? "legacy-installation" : "other-installation",
		},
	]),
);
legacy.set(`refresh:${await sha256Base64Url("legacy-refresh")}`, legacyRecord);
legacy.set("client:legacy-client", {
	clientId: "legacy-client",
	clientName: "Legacy",
	redirectUris: ["https://callback.invalid"],
	tokenEndpointAuthMethod: "none",
	createdAt: Date.now(),
});
const legacyState = authState(legacy);
const legacyAuth = new TabotAuth(legacyState, {
	MCP_PUBLIC_URL: "https://test.invalid/mcp",
});
await legacyState.ready;
await assert.rejects(legacyAuth.hasAssistantConnection("legacy-installation"), {
	name: "AuthMigrationError",
});
await legacyAuth.revokeToken("legacy-refresh", "legacy-client");
await legacyAuth.alarm();
assert.equal(
	await legacyAuth.verifyAccessToken(target.token),
	null,
	"later migration cannot resurrect revoked legacy grant",
);
assert.equal(
	await legacyAuth.hasAssistantConnection("legacy-installation"),
	false,
);
assert.equal(
	(await legacyAuth.getClient("legacy-client")).clientName,
	"Legacy",
);
const first = candidates[0];
const preserved = await legacyAuth.verifyAccessToken(first.token);
assert.equal(
	preserved.resource,
	"https://test.invalid/mcp",
	"legacy audience defaults only to this Worker",
);
assert.equal(preserved.installationId, "other-installation");
assert.equal(
	legacyState.storage.sql
		.exec("SELECT COUNT(*) AS total FROM auth_records")
		.one().total,
	legacyState.storage.sql.exec("SELECT total FROM auth_count").one().total,
);
assert.ok(
	![...legacy.keys()].some((key) => /^(client|access|refresh):/.test(key)),
);
legacyState.db.close();
console.log(
	"Production checks passed: reconnects, OAuth/PKCE/replay, scopes/audience, revocation, safe logs, binding rate limits, body bounds, SQLite indexes, cleanup and legacy grant preservation.",
);
