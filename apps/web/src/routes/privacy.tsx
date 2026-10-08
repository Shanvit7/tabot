import { createFileRoute } from "@tanstack/react-router";
import { siteUrl } from "~/lib/site";

const Privacy = () => (
	<main className="min-h-screen bg-[#07100c] px-6 py-12 text-[#eff5e7] sm:px-10 sm:py-16 lg:px-14">
		<article className="mx-auto max-w-3xl">
			<a
				className="text-sm font-semibold text-[#bfff00] underline decoration-2 underline-offset-4"
				href="./"
			>
				TABOT
			</a>
			<h1 className="mt-10 text-balance text-5xl font-semibold tracking-[-0.04em] sm:text-7xl">
				Privacy policy
			</h1>
			<p className="mt-4 text-sm text-[#8ca493]">
				Last updated: October 7, 2026
			</p>

			<div className="mt-12 space-y-10 text-base leading-7 text-[#c2d1c7]">
				<section>
					<h2 className="text-2xl font-semibold text-[#eff5e7]">
						What Tabot records
					</h2>
					<p className="mt-3">
						Tabot records browser activity signals: pages and page titles, tab
						creation and switching, navigation, clicks, scrolling, whether
						keyboard activity occurred, and page visibility. Tabot does not
						record typed keys, form values, passwords, page text, images, audio,
						or video.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-[#eff5e7]">
						Storage and use
					</h2>
					<p className="mt-3">
						Raw browser activity stays in storage on your device. Tabot uses it
						to build your local timeline, browsing estimates, and exports. An
						optional assistant connection stores authorization and connection
						state on Tabot’s relay, not your browser history.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-[#eff5e7]">Sharing</h2>
					<p className="mt-3">
						Tabot does not sell browser activity. The dashboard reads directly
						from the extension on your device. Data leaves your device only when
						you export it or authorize an assistant connection. Through that
						connection, an assistant can request sanitized derived context,
						recurring-pattern summaries and supporting occurrence
						timestamps/site sequences, or site-level metrics for a time range,
						such as estimated browsing time, visits, active days, and moves
						between sites. The relay forwards these results without storing
						browser history. Metrics and pattern occurrence evidence exclude raw
						events, page paths, query strings, credentials, and favicons. Site
						origins, including subdomains, remain visible to the connected
						assistant; they are not anonymized. Exports and assistant responses
						are subject to the recipient’s privacy and retention policies.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-[#eff5e7]">
						Retention and deletion
					</h2>
					<p className="mt-3">
						Activity remains on your device until you remove the extension or
						clear its extension data in Chrome. You can pause new recording at
						any time from the Tabot extension popup. Exported files are
						controlled by you.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-[#eff5e7]">
						Changes and contact
					</h2>
					<p className="mt-3">
						We may update this policy if Tabot's data practices change.
						Questions about privacy:
						<a
							className="text-[#bfff00] underline decoration-2 underline-offset-4"
							href="mailto:shanvit7@gmail.com"
						>
							shanvit7@gmail.com
						</a>
						.
					</p>
				</section>
			</div>
		</article>
	</main>
);

export const Route = createFileRoute("/privacy")({
	head: () => ({
		meta: [
			{ title: "Privacy Policy | Tabot" },
			{
				name: "description",
				content:
					"What Tabot records, local storage, and optional user-authorized sharing of derived context, recurring patterns and activity metrics.",
			},
			{ property: "og:url", content: siteUrl("privacy/") },
			{ property: "og:title", content: "Privacy Policy | Tabot" },
		],
		links: [{ rel: "canonical", href: siteUrl("privacy/") }],
	}),
	component: Privacy,
});
