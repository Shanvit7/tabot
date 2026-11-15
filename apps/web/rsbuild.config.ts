import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, rspack } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { tanstackStart } from "@tanstack/react-start/plugin/rsbuild";

const { publicVars } = loadEnv({ prefixes: ["VITE_"] });
if (process.env.NODE_ENV === "production") {
	try {
		const storeUrl = new URL(process.env.VITE_CHROME_WEB_STORE_URL ?? "");
		if (
			storeUrl.origin !== "https://chromewebstore.google.com" ||
			!/^\/detail\/tabot\/[a-p]{32}$/.test(storeUrl.pathname)
		) {
			throw new Error();
		}
	} catch {
		throw new Error(
			"VITE_CHROME_WEB_STORE_URL must point to Tabot's Chrome Web Store listing.",
		);
	}
}
const base = process.env.VITE_BASE_PATH || "/";
const NODE_MODULE_SHIM = fileURLToPath(
	new URL("./src/shims/node-module.ts", import.meta.url),
);
export default defineConfig({
	plugins: [
		pluginReact({ reactCompiler: true }),
		tanstackStart({
			srcDirectory: "src",
			server: { build: { inlineCss: true } },
			prerender: {
				enabled: true,
				crawlLinks: true,
			},
		}),
	],
	server: { base, port: 3000 },
	output: { distPath: { root: ".output" } },
	environments: {
		client: {
			tools: {
				rspack: {
					plugins: [
						new rspack.NormalModuleReplacementPlugin(
							/^node:module$/,
							NODE_MODULE_SHIM,
						),
					],
				},
			},
		},
	},
	source: {
		define: {
			...publicVars,
			"import.meta.env.BASE_URL": JSON.stringify(base),
			"import.meta.env.VITE_TABOT_EXTENSION_ID": JSON.stringify(
				process.env.VITE_TABOT_EXTENSION_ID ?? "",
			),
		},
	},
	tools: {
		postcss: {
			postcssOptions: {
				plugins: [tailwindcss()],
			},
		},
	},
});
