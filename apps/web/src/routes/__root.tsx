/// <reference types="vite/client" />
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { NotFound } from "~/components/not-found";
import { SITE_DESCRIPTION, siteUrl } from "~/lib/site";
import ReactScan from "~/providers/react-scan";
// Side-effect import (not `?url` + a manual <link>) so the router owns this
// stylesheet and the prerender step can inline it — otherwise it stays a
// render-blocking request ahead of first paint.
import "~/styles/app.css";

const UMAMI_HOST = import.meta.env.VITE_UMAMI_HOST?.trim();
const UMAMI_WEBSITE_ID = import.meta.env.VITE_UMAMI_WEBSITE_ID?.trim();

const SITE_TITLE = "Tabot — Private, local browser activity timeline";
const OG_IMAGE = siteUrl("logo.png");

// SoftwareApplication rich result — helps search engines understand the product.
const structuredData = {
	"@context": "https://schema.org",
	"@type": "SoftwareApplication",
	name: "Tabot",
	applicationCategory: "BrowserApplication",
	operatingSystem: "Chrome",
	description: SITE_DESCRIPTION,
	url: siteUrl(),
	image: OG_IMAGE,
	license: "https://opensource.org/licenses/MIT",
	isAccessibleForFree: true,
	offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
	downloadUrl:
		import.meta.env.VITE_CHROME_WEB_STORE_URL?.trim() ||
		"https://github.com/Shanvit7/tabot",
};

const RootLayout = () => {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<Outlet />
				{process.env.NODE_ENV === "development" && <ReactScan />}
				<TanStackRouterDevtools position="bottom-right" />
				<Scripts />
			</body>
		</html>
	);
};

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: SITE_TITLE },
			{ name: "description", content: SITE_DESCRIPTION },
			{ name: "robots", content: "index, follow" },
			{ name: "theme-color", content: "#07100c" },
			// Open Graph — absolute URLs only; social crawlers skip relative ones.
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: "Tabot" },
			{ property: "og:title", content: SITE_TITLE },
			{ property: "og:description", content: SITE_DESCRIPTION },
			{ property: "og:url", content: siteUrl() },
			{ property: "og:image", content: OG_IMAGE },
			{ property: "og:image:alt", content: "Tabot" },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: SITE_TITLE },
			{ name: "twitter:description", content: SITE_DESCRIPTION },
			{ name: "twitter:image", content: OG_IMAGE },
		],
		links: [
			{
				rel: "icon",
				type: "image/png",
				href: `${import.meta.env.BASE_URL}logo.png`,
			},
		],
		scripts: [
			{
				type: "application/ld+json",
				children: JSON.stringify(structuredData),
			},
			...(UMAMI_HOST && UMAMI_WEBSITE_ID
				? [
						{
							src: `${UMAMI_HOST}/script.js`,
							defer: true,
							"data-website-id": UMAMI_WEBSITE_ID,
						},
					]
				: []),
		],
	}),
	component: RootLayout,
	notFoundComponent: NotFound,
});
