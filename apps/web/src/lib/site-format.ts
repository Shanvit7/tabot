// Same-origin fallback used when a captured tab favicon is unavailable.
export const faviconOf = (origin: string): string | undefined => {
	const bare = origin.replace(/\/+$/, "");
	return /^https?:\/\//.test(bare) ? `${bare}/favicon.ico` : undefined;
};
