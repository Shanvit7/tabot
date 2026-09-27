import { jwtVerify, SignJWT } from "jose";
import { INSTALLATION_TOKEN_TTL } from "./constants";

const encoder = new TextEncoder();

const keyFor = (secret: string): Uint8Array => encoder.encode(secret);

/**
 * Mint a signed installation token. The installation ID is only authoritative
 * inside a server-signed token — an ID alone is never a credential (plan §4B, §19).
 */
export const signInstallationToken = (
	secret: string,
	installationId: string,
): Promise<string> =>
	new SignJWT({})
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(installationId)
		.setIssuedAt()
		.setExpirationTime(INSTALLATION_TOKEN_TTL)
		.sign(keyFor(secret));

/** Verify a token and return its installation ID, or null when invalid/expired. */
export const verifyInstallationToken = async (
	secret: string,
	token: string,
): Promise<string | null> => {
	if (!token) return null;
	try {
		const { payload } = await jwtVerify(token, keyFor(secret));
		return typeof payload.sub === "string" && payload.sub.length > 0
			? payload.sub
			: null;
	} catch {
		return null;
	}
};
