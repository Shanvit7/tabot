// BPP defaults to publishing. Only Chrome credentials may reach this workflow.
export const chromeDraftKeys = (secret) => {
	const { chrome } = JSON.parse(secret);
	if (!chrome || typeof chrome !== "object" || Array.isArray(chrome)) {
		throw new Error("SUBMIT_KEYS must contain a Chrome credentials object.");
	}
	return JSON.stringify({ chrome: { ...chrome, uploadOnly: true } });
};
