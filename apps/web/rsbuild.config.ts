import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, rspack } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { tanstackStart } from "@tanstack/react-start/plugin/rsbuild";

const { publicVars } = loadEnv({ prefixes: ["VITE_"] });
const base = process.env.VITE_BASE_PATH || "/";
const NODE_MODULE_SHIM = fileURLToPath(
	new URL("./src/shims/node-module.ts", import.meta.url),
);
const REACT_GRAB_PACKAGE_SHIM = fileURLToPath(
	new URL("./src/shims/react-grab-package.ts", import.meta.url),
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
	resolve: { alias: { "react-grab/package.json$": REACT_GRAB_PACKAGE_SHIM } },
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
