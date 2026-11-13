const IDENTITY_KEY = "tabot_capture_identity_key_v1";

let keyPromise: Promise<CryptoKey> | undefined;

const getKey = async (): Promise<CryptoKey> => {
	if (keyPromise) return keyPromise;
	keyPromise = (async () => {
		const stored = await chrome.storage.local.get(IDENTITY_KEY);
		let raw = stored[IDENTITY_KEY] as number[] | undefined;
		if (
			!Array.isArray(raw) ||
			raw.length !== 32 ||
			raw.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
		) {
			raw = Array.from(crypto.getRandomValues(new Uint8Array(32)));
			await chrome.storage.local.set({ [IDENTITY_KEY]: raw });
		}
		return crypto.subtle.importKey(
			"raw",
			new Uint8Array(raw),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);
	})();
	try {
		return await keyPromise;
	} catch (error) {
		keyPromise = undefined;
		throw error;
	}
};

/** Keyed replay identity; raw URL/text inputs are never persisted in key material. */
export const createCaptureIdentity = async (
	value: unknown,
): Promise<string> => {
	const key = await getKey();
	const signature = new Uint8Array(
		await crypto.subtle.sign(
			"HMAC",
			key,
			new TextEncoder().encode(
				`tabot:capture-identity:v1\0${JSON.stringify(value)}`,
			),
		),
	);
	return Array.from(signature, (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
};

export const createLibraryPageReference = async (
	site: string,
	url: string,
): Promise<string> =>
	`${encodeURIComponent(site)}:${await createCaptureIdentity(["library-page:v1", url])}`;
