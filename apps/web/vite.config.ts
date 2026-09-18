import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type Plugin } from "vite";

// @openredaction/core builds a Node createRequire eagerly for its optional
// `compromise` NER load. The browser build would otherwise get an empty
// node:module stub and throw on first import of the privacy layer.
// Client env only — the SSR/nitro build needs the real createRequire
// (@tanstack/react-router calls it during server startup).
const NODE_MODULE_SHIM = fileURLToPath(
	new URL("./src/shims/node-module.ts", import.meta.url),
);

const nodeModuleShim = (): Plugin => ({
	name: "tabot:node-module-shim",
	// `enforce: "pre"` — vite:resolve externalizes node:module for the browser
	// before normal user plugins run, so an unenforced hook never fires.
	enforce: "pre",
	resolveId(id) {
		if (id === "node:module" && this.environment.name === "client") {
			return NODE_MODULE_SHIM;
		}
	},
});

export default defineConfig({
	base: process.env.VITE_BASE_PATH ?? "/",
	server: {
		port: 3000,
	},
	resolve: {
		tsconfigPaths: true,
	},
	optimizeDeps: {
		// The dep optimizer bundles esbuild-style and externalizes node builtins
		// itself, bypassing the resolveId shim above. Serve it un-prebundled so
		// the client pipeline (and the shim) handles node:module.
		exclude: ["@openredaction/core", "@openredaction/core/lite"],
	},
	plugins: [
		nodeModuleShim(),
		tailwindcss(),
		tanstackStart({
			spa: {
				enabled: true,
				prerender: {
					outputPath: "/index.html",
				},
			},
			srcDirectory: "src",
		}),
		viteReact(),
		nitro(),
	],
});
