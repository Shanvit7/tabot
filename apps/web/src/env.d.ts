declare module "*.css";

interface ImportMetaEnv {
	readonly BASE_URL: string;
	readonly DEV: boolean;
	readonly MODE: string;
	readonly VITE_CHROME_WEB_STORE_URL?: string;
	readonly VITE_SITE_URL?: string;
	readonly VITE_POSTHOG_ENABLED?: string;
	readonly VITE_POSTHOG_KEY?: string;
	readonly VITE_POSTHOG_HOST?: string;
	readonly VITE_POSTHOG_RELEASE?: string;
	readonly VITE_TABOT_EXTENSION_ID?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
