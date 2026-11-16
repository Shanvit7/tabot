import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "~/components/features/landing/landing-page";
import { OG_IMAGE_URL, SHARE_URL } from "~/lib/constants";

const title = "Tabot — Bring your browser work to your AI assistant";
const description =
	"Search pages and notes, review browser activity, and ask ChatGPT about selected activity or saved notes.";

export const Route = createFileRoute("/")({
	head: () => ({
		links: [{ rel: "canonical", href: SHARE_URL }],
		meta: [
			{ title },
			{ name: "description", content: description },
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: "Tabot" },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:url", content: SHARE_URL },
			{ property: "og:image", content: OG_IMAGE_URL },
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{
				property: "og:image:alt",
				content:
					"Tabot helps you search pages and notes, review browser activity, and ask ChatGPT about selected results.",
			},
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: title },
			{ name: "twitter:description", content: description },
			{ name: "twitter:image", content: OG_IMAGE_URL },
			{
				name: "twitter:image:alt",
				content:
					"Tabot helps you search pages and notes, review browser activity, and ask ChatGPT about selected results.",
			},
		],
	}),
	component: LandingPage,
});
