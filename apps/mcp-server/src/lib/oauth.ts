import { SCOPES_SUPPORTED } from "./constants";

const encoder = new TextEncoder();

/** base64url without padding (RFC 4648 §5). */
export const base64Url = (bytes: Uint8Array): string => {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
};

/** Cryptographically random base64url string — tokens, codes, client ids. */
export const randomToken = (byteLength = 32): string =>
	base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));

/** SHA-256 → base64url. Used for token-at-rest hashing and PKCE S256. */
export const sha256Base64Url = async (input: string): Promise<string> =>
	base64Url(
		new Uint8Array(
			await crypto.subtle.digest("SHA-256", encoder.encode(input)),
		),
	);

/** Length-independent, timing-safe string comparison (fail closed on mismatch). */
export const timingSafeEqual = (a: string, b: string): boolean => {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
};

/** PKCE S256 verification (RFC 7636 §4.6). */
export const verifyPkce = async (
	codeVerifier: string,
	codeChallenge: string,
): Promise<boolean> => {
	if (
		!/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier) ||
		!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)
	)
		return false;
	return timingSafeEqual(await sha256Base64Url(codeVerifier), codeChallenge);
};

// --- Discovery metadata (RFC 9728 + RFC 8414) -------------------------------

export const protectedResourceMetadata = (origin: string) => ({
	resource: `${origin}/mcp`,
	authorization_servers: [origin],
	scopes_supported: [...SCOPES_SUPPORTED],
	bearer_methods_supported: ["header"],
	resource_name: "Tabot MCP",
});

export const authorizationServerMetadata = (origin: string) => ({
	issuer: origin,
	authorization_endpoint: `${origin}/authorize`,
	token_endpoint: `${origin}/token`,
	registration_endpoint: `${origin}/register`,
	revocation_endpoint: `${origin}/revoke`,
	response_types_supported: ["code"],
	grant_types_supported: ["authorization_code", "refresh_token"],
	code_challenge_methods_supported: ["S256"],
	token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
	revocation_endpoint_auth_methods_supported: ["none", "client_secret_post"],
	scopes_supported: [...SCOPES_SUPPORTED],
});

/** The `resource_metadata` URL advertised on a 401 (RFC 9728 §5.1). */
export const protectedResourceMetadataUrl = (origin: string): string =>
	`${origin}/.well-known/oauth-protected-resource/mcp`;
