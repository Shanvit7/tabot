// Canonical production origin + base path for the GitHub Pages project site.
// Canonical / Open Graph URLs must be absolute and must never point at a dev
// host, so this is intentionally NOT derived from import.meta.env.BASE_URL
// (which is "/" under `vite dev`). Override via VITE_SITE_URL on a domain change;
// the fallback keeps local builds and CI green when the var is unset.
export const SITE_URL = (
	import.meta.env.VITE_SITE_URL?.trim() || "https://shanvit7.github.io/tabot"
).replace(/\/+$/, "");

/** Absolute production URL for a route path. `siteUrl()` → site root. */
export const siteUrl = (path = ""): string =>
	`${SITE_URL}/${path.replace(/^\/+/, "")}`;

export const SITE_DESCRIPTION =
	"Tabot is a privacy-first Chrome extension that turns your browser activity into a private, portable work timeline. 100% local — no cloud, no account.";
