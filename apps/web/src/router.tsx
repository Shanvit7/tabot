import { createRouter, defaultParseSearch } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
	const router = createRouter({
		routeTree,
		parseSearch: (search) => {
			const parsed: Record<string, unknown> = { ...defaultParseSearch(search) };
			// Search text is not JSON: keep numeric/boolean deep links lossless.
			if (typeof parsed.q === "number" || typeof parsed.q === "boolean") {
				parsed.q = new URLSearchParams(search).get("q");
			}
			return parsed;
		},
		defaultPreload: "intent",
		scrollRestoration: true,
	});
	return router;
};
