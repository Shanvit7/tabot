export const EMAIL = "shanvit7@gmail.com";
export const GITHUB_REPOSITORY_URL = "https://github.com/Shanvit7/tabot";

export const BASE_URL = import.meta.env.BASE_URL;
export const LOGO_URL = `${BASE_URL}logo.png`;
export const CHROME_LOGO_URL = `${BASE_URL}chrome.svg`;
export const CHROME_WEB_STORE_URL = import.meta.env.VITE_CHROME_WEB_STORE_URL;
export const TABOT_EXTENSION_ID = import.meta.env.VITE_TABOT_EXTENSION_ID;
export const IS_DEVELOPMENT = import.meta.env.DEV;
export const MCP_SERVER_URL = `https://tabot-mcp${IS_DEVELOPMENT ? "-dev" : ""}.shanvit7.workers.dev/mcp`;

export const SITE_URL = (
	import.meta.env.VITE_SITE_URL || "https://shanvit7.github.io/tabot"
).replace(/\/+$/, "");
export const SHARE_URL = `${SITE_URL}/`;
export const OG_IMAGE_URL = `${SITE_URL}/og-card.png`;

export const POSTHOG_ENABLED = import.meta.env.VITE_POSTHOG_ENABLED === "true";
export const POSTHOG_PROJECT_KEY = POSTHOG_ENABLED
	? import.meta.env.VITE_POSTHOG_KEY?.trim()
	: undefined;
export const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST;
export const POSTHOG_RELEASE =
	import.meta.env.VITE_POSTHOG_RELEASE || "development";
export const APP_ENVIRONMENT = import.meta.env.MODE;
