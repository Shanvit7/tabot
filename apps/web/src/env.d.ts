interface ImportMetaEnv {
	readonly BASE_URL: string;
	readonly VITE_CHROME_WEB_STORE_URL?: string;
	readonly VITE_SITE_URL?: string;
	readonly VITE_TABOT_EXTENSION_ID?: string;
	readonly VITE_UMAMI_HOST?: string;
	readonly VITE_UMAMI_WEBSITE_ID?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
