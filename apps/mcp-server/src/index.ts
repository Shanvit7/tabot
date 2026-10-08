import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { DEFAULT_SCOPES, type TabotAuth } from "./auth-store";
import { signInstallationToken, verifyInstallationToken } from "./lib/auth";
import { AUTH_CODE_TTL_MS, NAME, VERSION } from "./lib/constants";
import {
	authorizationServerMetadata,
	protectedResourceMetadata,
	protectedResourceMetadataUrl,
	randomToken,
	sha256Base64Url,
} from "./lib/oauth";
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from "./lib/tools";
import {
	getActivityMetricsInputSchema,
	getContextInputSchema,
	getCurrentContextInputSchema,
	getMemoryInputSchema,
	getRecentContextInputSchema,
	listRecurringPatternsInputSchema,
	searchContextInputSchema,
} from "./schema";

export { TabotAuth } from "./auth-store";
export { TabotInstallation } from "./installation";

export interface Env {
	MCP_PUBLIC_URL: string;
	TABOT_AUTH_SECRET: string;
	TABOT_EXTENSION_ID?: string;
	TABOT_INSTALLATION: DurableObjectNamespace;
	TABOT_AUTH: DurableObjectNamespace<TabotAuth>;
}

/** Send a tool call to the caller's live extension and await its correlated result. */
type ToolDispatch = (method: string, params: unknown) => Promise<unknown>;

const READ_ONLY_ANNOTATIONS = {
	readOnlyHint: true,
	openWorldHint: false,
	destructiveHint: false,
};

const createMcpServer = (dispatch: ToolDispatch): McpServer => {
	const server = new McpServer({ name: NAME, version: VERSION });

	// Shared wrapper: one try/catch for every tool, results JSON-stringified into
	// a single text block, relay errors surfaced as `isError` tool errors.
	const call = async (method: string, params: unknown) => {
		try {
			const result = await dispatch(method, params);
			return {
				content: [{ type: "text" as const, text: JSON.stringify(result) }],
			};
		} catch (error) {
			return {
				isError: true,
				content: [
					{
						type: "text" as const,
						text:
							error instanceof Error ? error.message : "Tabot request failed.",
					},
				],
			};
		}
	};

	server.registerTool(
		TOOL_NAMES.SEARCH_CONTEXT,
		{
			title: "Search Tabot browser context",
			description: TOOL_DESCRIPTIONS.SEARCH_CONTEXT,
			annotations: READ_ONLY_ANNOTATIONS,
			inputSchema: searchContextInputSchema,
		},
		({ query, hours }) => call(TOOL_NAMES.SEARCH_CONTEXT, { query, hours }),
	);

	server.registerTool(
		TOOL_NAMES.GET_RECENT_CONTEXT,
		{
			title: "Recent Tabot browser context",
			description: TOOL_DESCRIPTIONS.GET_RECENT_CONTEXT,
			annotations: READ_ONLY_ANNOTATIONS,
			inputSchema: getRecentContextInputSchema,
		},
		({ hours }) => call(TOOL_NAMES.GET_RECENT_CONTEXT, { hours }),
	);

	server.registerTool(
		TOOL_NAMES.GET_CURRENT_CONTEXT,
		{
			title: "Current Tabot browser context",
			description: TOOL_DESCRIPTIONS.GET_CURRENT_CONTEXT,
			annotations: READ_ONLY_ANNOTATIONS,
			inputSchema: getCurrentContextInputSchema,
		},
		() => call(TOOL_NAMES.GET_CURRENT_CONTEXT, {}),
	);

	server.registerTool(
		TOOL_NAMES.GET_CONTEXT,
		{
			title: "Specific Tabot browser context",
			description: TOOL_DESCRIPTIONS.GET_CONTEXT,
			annotations: READ_ONLY_ANNOTATIONS,
			inputSchema: getContextInputSchema,
		},
		({ id }) => call(TOOL_NAMES.GET_CONTEXT, { id }),
	);

	server.registerTool(
		TOOL_NAMES.LIST_RECURRING_PATTERNS,
		{
			title: "Tabot recurring patterns",
			description: TOOL_DESCRIPTIONS.LIST_RECURRING_PATTERNS,
			annotations: READ_ONLY_ANNOTATIONS,
			inputSchema: listRecurringPatternsInputSchema,
		},
		(params) => call(TOOL_NAMES.LIST_RECURRING_PATTERNS, params),
	);

	server.registerTool(
		TOOL_NAMES.GET_MEMORY,
		{
			title: "Tabot memory",
			description: TOOL_DESCRIPTIONS.GET_MEMORY,
			annotations: READ_ONLY_ANNOTATIONS,
			inputSchema: getMemoryInputSchema,
		},
		({ id }) => call(TOOL_NAMES.GET_MEMORY, { id }),
	);

	server.registerTool(
		TOOL_NAMES.GET_ACTIVITY_METRICS,
		{
			title: "Tabot activity metrics",
			description: TOOL_DESCRIPTIONS.GET_ACTIVITY_METRICS,
			annotations: READ_ONLY_ANNOTATIONS,
			inputSchema: getActivityMetricsInputSchema,
		},
		(params) => call(TOOL_NAMES.GET_ACTIVITY_METRICS, params),
	);

	return server;
};

const app = new Hono<{ Bindings: Env }>();

app.use(
	"*",
	cors({
		origin: "*",
		allowHeaders: [
			"Authorization",
			"Content-Type",
			"Accept",
			"Mcp-Session-Id",
			"MCP-Protocol-Version",
			"Last-Event-ID",
		],
		exposeHeaders: ["WWW-Authenticate", "Mcp-Session-Id"],
	}),
);

app.get("/health", (c) =>
	c.json({ ok: true, service: NAME, version: VERSION }),
);

// --- Durable Object helpers -------------------------------------------------
const installationStub = (env: Env, installationId: string) =>
	env.TABOT_INSTALLATION.get(env.TABOT_INSTALLATION.idFromName(installationId));

const authStub = (env: Env) =>
	env.TABOT_AUTH.get(env.TABOT_AUTH.idFromName("auth"));

/** Dispatch a tool call through the installation DO to the live extension. */
const dispatchToInstallation = async (
	env: Env,
	installationId: string,
	method: string,
	params: unknown,
): Promise<unknown> => {
	const response = await installationStub(env, installationId).fetch(
		new Request("https://do/dispatch", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ method, params }),
		}),
	);
	const body = (await response.json()) as
		| { ok: true; result: unknown }
		| { ok: false; error: { code: string; message: string } };
	if (!body.ok) throw new Error(body.error.message);
	return body.result;
};

const originOf = (c: {
	req: { url: string; header: (name: string) => string | undefined };
}): string => {
	const url = new URL(c.req.url);
	if (c.req.header("x-forwarded-proto") === "https") url.protocol = "https:";
	return url.origin;
};

const oauthError = (
	error: string,
	description: string,
	status = 400,
): Response =>
	Response.json({ error, error_description: description }, { status });

const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

/** Redirect URIs must be HTTPS, or loopback HTTP for local development. */
const isAllowedRedirectUri = (uri: string): boolean => {
	try {
		const url = new URL(uri);
		if (url.protocol === "https:") return true;
		if (url.protocol !== "http:") return false;
		return (
			url.hostname === "localhost" ||
			url.hostname === "127.0.0.1" ||
			url.hostname === "[::1]"
		);
	} catch {
		return false;
	}
};

// --- Installation registration ----------------------------------------------
// Issues an opaque installation ID plus a server-signed token. The ID alone is
// never a credential; only a valid signed token is accepted on the relay.
app.post("/installations", async (c) => {
	const secret = c.env.TABOT_AUTH_SECRET;
	if (!secret) return c.text("Server not configured", 500);
	const installationId = crypto.randomUUID();
	const token = await signInstallationToken(secret, installationId);
	return c.json({ installationId, token });
});

// Authorization state is separate from relay availability. Only this installation
// can inspect its grants; no credentials or account identifiers reach the dashboard.
app.get("/connection", async (c) => {
	c.header("Cache-Control", "no-store");
	const secret = c.env.TABOT_AUTH_SECRET;
	if (!secret) return c.text("Server not configured", 500);
	const header = c.req.header("Authorization") ?? "";
	const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
	const installationId = await verifyInstallationToken(secret, token);
	if (!installationId) return c.text("Unauthorized", 401);
	return c.json({
		connected: await authStub(c.env).hasAssistantConnection(installationId),
	});
});

// --- OAuth discovery (RFC 9728 + RFC 8414) ----------------------------------
app.get("/.well-known/oauth-protected-resource", (c) =>
	c.json(protectedResourceMetadata(originOf(c))),
);
app.get("/.well-known/oauth-protected-resource/mcp", (c) =>
	c.json(protectedResourceMetadata(originOf(c))),
);
app.get("/.well-known/oauth-authorization-server", (c) =>
	c.json(authorizationServerMetadata(originOf(c))),
);

// --- Dynamic client registration (RFC 7591) ---------------------------------
app.post("/register", async (c) => {
	const body = (await c.req.json().catch(() => null)) as {
		redirect_uris?: unknown;
		client_name?: unknown;
		token_endpoint_auth_method?: unknown;
	} | null;
	const redirectUris = Array.isArray(body?.redirect_uris)
		? body.redirect_uris.filter((u): u is string => typeof u === "string")
		: [];
	if (redirectUris.length === 0 || !redirectUris.every(isAllowedRedirectUri)) {
		return oauthError(
			"invalid_redirect_uri",
			"redirect_uris must be non-empty HTTPS (or loopback) URLs.",
		);
	}
	const authMethod =
		body?.token_endpoint_auth_method === "client_secret_post"
			? "client_secret_post"
			: "none";
	const clientId = randomToken(16);
	const clientSecret =
		authMethod === "client_secret_post" ? randomToken(32) : undefined;
	await authStub(c.env).saveClient({
		clientId,
		clientName:
			typeof body?.client_name === "string" ? body.client_name : "MCP client",
		redirectUris,
		tokenEndpointAuthMethod: authMethod,
		clientSecretHash: clientSecret
			? await sha256Base64Url(clientSecret)
			: undefined,
		createdAt: Date.now(),
	});
	return c.json(
		{
			client_id: clientId,
			...(clientSecret ? { client_secret: clientSecret } : {}),
			redirect_uris: redirectUris,
			token_endpoint_auth_method: authMethod,
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
		},
		201,
	);
});

/** Validate the authorization request against a registered client. */
const validateAuthorizeRequest = async (
	env: Env,
	params: URLSearchParams,
): Promise<
	| { ok: true; clientId: string; redirectUri: string; clientName: string }
	| { ok: false; response: Response }
> => {
	const clientId = params.get("client_id") ?? "";
	const redirectUri = params.get("redirect_uri") ?? "";
	if (!clientId || !redirectUri)
		return {
			ok: false,
			response: oauthError(
				"invalid_request",
				"client_id and redirect_uri are required.",
			),
		};
	const client = await authStub(env).getClient(clientId);
	if (!client?.redirectUris.includes(redirectUri))
		return {
			ok: false,
			response: oauthError(
				"invalid_request",
				"Unknown client or redirect_uri.",
			),
		};
	if (params.get("response_type") !== "code")
		return {
			ok: false,
			response: oauthError(
				"unsupported_response_type",
				"Only response_type=code is supported.",
			),
		};
	if (
		(params.get("code_challenge_method") ?? "S256") !== "S256" ||
		!params.get("code_challenge")
	)
		return {
			ok: false,
			response: oauthError(
				"invalid_request",
				"PKCE S256 code_challenge is required.",
			),
		};
	return { ok: true, clientId, redirectUri, clientName: client.clientName };
};

// --- Authorization endpoint + extension-bridge consent page -----------------
const consentPage = ({
	clientName,
	extensionId,
	transactionId,
}: {
	clientName: string;
	extensionId: string;
	transactionId: string;
}): string => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect Tabot</title></head>
<body data-extension-id="${escapeHtml(extensionId)}" data-transaction-id="${escapeHtml(transactionId)}" style="font-family:system-ui,sans-serif;max-width:26rem;margin:4rem auto;padding:0 1rem;color:#111">
<h1 style="font-size:1.25rem">Connect Tabot to ${escapeHtml(clientName)}</h1>
<p style="color:#444">Connects this Chrome profile’s Tabot extension to ${escapeHtml(clientName)}. Tabot keeps browser context on this device.</p>
<p id="status" role="status" style="color:#444">Ready to connect Tabot in this browser.</p>
<form id="authorize" method="post" action="/authorize">
<input type="hidden" name="transaction" value="${escapeHtml(transactionId)}">
<button id="connect" type="button" style="margin-top:1rem;width:100%;padding:.7rem;font-size:1rem;background:#111;color:#fff;border:0;border-radius:.4rem;cursor:pointer">Connect Tabot</button>
</form>
<script>
const body = document.body;
const button = document.getElementById("connect");
const status = document.getElementById("status");
const form = document.getElementById("authorize");
const fail = (message) => {
  button.disabled = false;
  status.textContent = message;
  status.style.color = "#b00020";
};
button.addEventListener("click", () => {
  const runtime = globalThis.chrome && globalThis.chrome.runtime;
  if (!runtime || !runtime.sendMessage) {
    fail("Tabot is not available in this Chrome profile. Install or enable Tabot, then try again.");
    return;
  }
  button.disabled = true;
  status.textContent = "Connecting Tabot…";
  runtime.sendMessage(body.dataset.extensionId, {
    type: "TABOT_APPROVE_AUTHORIZATION",
    transactionId: body.dataset.transactionId,
  }, (response) => {
    if (runtime.lastError || !response || response.ok !== true) {
      fail("Tabot could not connect in this Chrome profile. Enable Tabot, then try again.");
      return;
    }
    form.requestSubmit();
  });
});
</script></body></html>`;

app.get("/authorize", async (c) => {
	const params = new URL(c.req.url).searchParams;
	const result = await validateAuthorizeRequest(c.env, params);
	if (!result.ok) return result.response;
	const extensionId = c.env.TABOT_EXTENSION_ID;
	if (!extensionId)
		return c.text("Tabot extension bridge is not configured", 503);
	const transactionId = randomToken(32);
	const requestedScopes = (params.get("scope") ?? "")
		.split(" ")
		.filter((scope) => (DEFAULT_SCOPES as readonly string[]).includes(scope));
	await authStub(c.env).createAuthorizationTransaction({
		id: transactionId,
		clientId: result.clientId,
		redirectUri: result.redirectUri,
		codeChallenge: params.get("code_challenge") ?? "",
		resource: params.get("resource") ?? undefined,
		scopes: requestedScopes.length > 0 ? requestedScopes : DEFAULT_SCOPES,
		state: params.get("state") ?? undefined,
	});
	return c.html(
		consentPage({
			clientName: result.clientName,
			extensionId,
			transactionId,
		}),
	);
});

app.post("/authorize", async (c) => {
	const form = new URLSearchParams(await c.req.text());
	const transaction = await authStub(c.env).consumeAuthorizationTransaction(
		form.get("transaction") ?? "",
	);
	if (!transaction)
		return oauthError(
			"access_denied",
			"Tabot authorization was not approved or has expired.",
		);

	const code = randomToken(32);
	await authStub(c.env).createCode({
		code,
		clientId: transaction.clientId,
		installationId: transaction.installationId,
		codeChallenge: transaction.codeChallenge,
		redirectUri: transaction.redirectUri,
		resource: transaction.resource,
		scopes: transaction.scopes,
		expiresAt: Date.now() + AUTH_CODE_TTL_MS,
	});

	const redirect = new URL(transaction.redirectUri);
	redirect.searchParams.set("code", code);
	if (transaction.state) redirect.searchParams.set("state", transaction.state);
	return c.redirect(redirect.toString(), 302);
});

// The authorization page never receives an installation credential. Its
// extension calls this endpoint with that credential to approve its own nonce.
app.post("/authorize/transactions/:id/approve", async (c) => {
	const secret = c.env.TABOT_AUTH_SECRET;
	if (!secret) return c.text("Server not configured", 500);
	const header = c.req.header("Authorization") ?? "";
	const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
	const installationId = await verifyInstallationToken(secret, token);
	if (!installationId) return c.text("Unauthorized", 401);
	const approved = await authStub(c.env).approveAuthorizationTransaction(
		c.req.param("id"),
		installationId,
	);
	return approved
		? c.json({ ok: true })
		: c.text("Invalid authorization transaction", 400);
});

// --- Token endpoint ---------------------------------------------------------
/** Resolve + authenticate the client for a token/revocation request. */
const authenticateClient = async (
	env: Env,
	form: URLSearchParams,
): Promise<
	{ ok: true; clientId: string } | { ok: false; response: Response }
> => {
	const clientId = form.get("client_id") ?? "";
	const client = await authStub(env).getClient(clientId);
	if (!client)
		return {
			ok: false,
			response: oauthError("invalid_client", "Unknown client.", 401),
		};
	if (client.tokenEndpointAuthMethod === "client_secret_post") {
		const secret = form.get("client_secret") ?? "";
		if (!(await authStub(env).checkClientSecret(clientId, secret)))
			return {
				ok: false,
				response: oauthError("invalid_client", "Bad client secret.", 401),
			};
	}
	return { ok: true, clientId };
};

app.post("/token", async (c) => {
	const form = new URLSearchParams(await c.req.text());
	const client = await authenticateClient(c.env, form);
	if (!client.ok) return client.response;

	if (form.get("grant_type") === "authorization_code") {
		const redeemed = await authStub(c.env).consumeCode({
			code: form.get("code") ?? "",
			clientId: client.clientId,
			codeVerifier: form.get("code_verifier") ?? "",
			redirectUri: form.get("redirect_uri") ?? "",
		});
		if (!redeemed)
			return oauthError(
				"invalid_grant",
				"Authorization code is invalid or expired.",
			);
		return c.json(
			await authStub(c.env).issueTokens({
				clientId: client.clientId,
				installationId: redeemed.installationId,
				scopes: redeemed.scopes,
				resource: redeemed.resource,
			}),
		);
	}

	if (form.get("grant_type") === "refresh_token") {
		const tokens = await authStub(c.env).rotateRefreshToken({
			clientId: client.clientId,
			refreshToken: form.get("refresh_token") ?? "",
		});
		if (!tokens)
			return oauthError(
				"invalid_grant",
				"Refresh token is invalid or expired.",
			);
		return c.json(tokens);
	}

	return oauthError("unsupported_grant_type", "Unsupported grant_type.");
});

// --- Token revocation (RFC 7009) --------------------------------------------
app.post("/revoke", async (c) => {
	const form = new URLSearchParams(await c.req.text());
	const client = await authenticateClient(c.env, form);
	if (!client.ok) return client.response;
	const token = form.get("token") ?? "";
	if (token) await authStub(c.env).revokeToken(token);
	return c.body(null, 200);
});

// --- Extension relay WebSocket ----------------------------------------------
app.get("/relay", async (c) => {
	if (c.req.header("Upgrade") !== "websocket") {
		return c.text("Expected WebSocket upgrade", 426);
	}
	const secret = c.env.TABOT_AUTH_SECRET;
	if (!secret) return c.text("Server not configured", 500);
	// Extension WebSockets cannot set Authorization. Its only subprotocol is the
	// server-signed credential, keeping bearer material out of request URLs.
	const token = c.req.header("Sec-WebSocket-Protocol")?.trim() ?? "";
	const installationId = await verifyInstallationToken(secret, token);
	if (!installationId) return c.text("Unauthorized", 401);
	return installationStub(c.env, installationId).fetch(c.req.raw);
});

// --- Correlation check (Phase 3) -------------------------------------------
// Round-trips a request through the DO to the live extension. Proves auth,
// presence, and request/response correlation.
app.post("/relay/:installationId/ping", async (c) => {
	const secret = c.env.TABOT_AUTH_SECRET;
	if (!secret) return c.text("Server not configured", 500);
	const installationId = c.req.param("installationId");
	const header = c.req.header("Authorization") ?? "";
	const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
	const authorized = await verifyInstallationToken(secret, token);
	if (authorized !== installationId) return c.text("Unauthorized", 401);
	const response = await installationStub(c.env, installationId).fetch(
		new Request("https://do/dispatch", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ method: "ping", params: {} }),
		}),
	);
	return new Response(response.body, {
		status: response.status,
		headers: { "content-type": "application/json" },
	});
});

// --- MCP endpoint -----------------------------------------------------------
// Requires an OAuth access token (Phase 6). The token's installation binding is
// authoritative — no client-supplied installation ID is ever trusted.
const unauthorizedMcp = (origin: string): Response =>
	new Response(
		JSON.stringify({
			error: "invalid_token",
			error_description: "A valid OAuth access token is required.",
		}),
		{
			status: 401,
			headers: {
				"content-type": "application/json",
				"WWW-Authenticate": `Bearer resource_metadata="${protectedResourceMetadataUrl(origin)}"`,
			},
		},
	);

app.all("/mcp", async (c) => {
	const origin = originOf(c);
	const header = c.req.header("Authorization") ?? "";
	const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
	const auth = token ? await authStub(c.env).verifyAccessToken(token) : null;
	if (!auth) return unauthorizedMcp(origin);

	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
	});
	const server = createMcpServer((method, params) =>
		dispatchToInstallation(c.env, auth.installationId, method, params),
	);
	await server.connect(transport);
	return transport.handleRequest(c.req.raw);
});

export default app;
