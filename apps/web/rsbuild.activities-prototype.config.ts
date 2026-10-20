// Throwaway preview only. Never imported by the production Start config.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

export default defineConfig({
	plugins: [pluginReact()],
	source: {
		entry: {
			index: fileURLToPath(
				new URL("./src/prototypes/activities/main.tsx", import.meta.url),
			),
		},
	},
	html: {
		template: fileURLToPath(
			new URL("./src/prototypes/activities/index.html", import.meta.url),
		),
		title: "Activities playground | Tabot",
		meta: { robots: "noindex, nofollow" },
	},
	server: { port: 3012, strictPort: true },
	output: { distPath: { root: ".output/activities-prototype" } },
});
