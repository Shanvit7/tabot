export const VERSION = "0.2.0";

export const NAME = "tabot-mcp";

/** Bounded request timeout for extension round-trips. */
export const REQUEST_TIMEOUT_MS = 10_000;

/** Bounded message size — reject oversized extension frames. */
export const MAX_MESSAGE_CHARS = 64_000;

export const MAX_PENDING_REQUESTS = 32;
export const MAX_HTTP_BODY_BYTES = 16_384;
export const AUTH_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
export const CLIENT_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Installation token lifetime. Long-lived; refresh flow is a later phase. */
export const INSTALLATION_TOKEN_TTL = "365d";

// --- OAuth 2.1 authorization server ----------------------------------------

/** Access token lifetime — short, refreshed by the client. */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1h

/** Refresh token lifetime. Rotates on every use. */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30d

/** Authorization code lifetime (one-time, short). */
export const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5m

/** Browser-bridge authorization transaction lifetime. */
export const AUTHORIZATION_TRANSACTION_TTL_MS = 5 * 60 * 1000; // 5m

/** Scopes advertised by the AS and attached to every access token. */
export const SCOPES_SUPPORTED = ["tabot.context"] as const;
