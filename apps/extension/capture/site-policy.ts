const EXCLUDED_PASSWORD_HOSTS = [
	"1password.com",
	"bitwarden.com",
	"dashlane.com",
	"keepersecurity.com",
	"lastpass.com",
];

const AUTH_PATH =
	/(?:^|[\\/_-])(auth|login|log-in|signin|sign-in|password|passwd|reset|credential|oauth)(?:$|[\\/_-])/i;

export const isPageCaptureExcludedUrl = (value: unknown): boolean => {
	if (typeof value !== "string") return true;
	try {
		const url = new URL(value);
		return (
			EXCLUDED_PASSWORD_HOSTS.some(
				(host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
			) || AUTH_PATH.test(url.pathname)
		);
	} catch {
		return true;
	}
};

export const pageCaptureSite = (
	value: unknown,
	incognito = false,
): { origin: string; label: string } | null => {
	if (incognito || typeof value !== "string") return null;
	try {
		const url = new URL(value);
		if (
			(url.protocol !== "http:" && url.protocol !== "https:") ||
			url.username ||
			url.password
		)
			return null;
		return { origin: url.origin, label: url.host };
	} catch {
		return null;
	}
};
