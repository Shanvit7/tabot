export const prettySite = (domain: string): string => {
	const bare = domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
	if (bare.startsWith("chrome-extension://")) return "Extension page";
	if (bare.startsWith("chrome://")) {
		const name = bare.slice("chrome://".length);
		return name === "newtab" ? "New tab" : `Chrome ${name}`;
	}
	if (bare.startsWith("localhost")) return "Local preview";
	const host = bare.split("/")[0];
	const word = host.split(".")[0];
	return word ? word.charAt(0).toUpperCase() + word.slice(1) : host;
};

// Same-origin fallback used when a captured tab favicon is unavailable.
export const faviconOf = (origin: string): string | undefined => {
	const bare = origin.replace(/\/+$/, "");
	return /^https?:\/\//.test(bare) ? `${bare}/favicon.ico` : undefined;
};
