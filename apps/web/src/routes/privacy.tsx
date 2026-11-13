import { createFileRoute, Link } from "@tanstack/react-router";
import { PrivacyFlowFigure } from "~/components/features/privacy/privacy-flow-figure";
import { EMAIL, OG_IMAGE_URL, SITE_URL } from "~/lib/constants";

const Privacy = () => (
	<main className="min-h-svh bg-background px-6 py-12 font-sans text-foreground sm:px-10 sm:py-16 lg:px-14">
		<article className="mx-auto max-w-3xl">
			<Link
				className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
				to="/"
				aria-label="Tabot home"
			>
				<img
					src={`${import.meta.env.BASE_URL}logo.png`}
					alt=""
					width={48}
					height={48}
					className="size-12 object-contain"
				/>
			</Link>
			<h1 className="mt-10 text-balance font-display text-5xl font-semibold tracking-[-0.04em] sm:text-7xl">
				Privacy policy
			</h1>
			<p className="mt-4 text-sm text-muted-foreground">
				Last updated: October 11, 2026
			</p>
			<p className="mt-6 max-w-2xl leading-7 text-muted-foreground">
				Here’s what Tabot records, what stays on your device, and what happens
				when you connect an AI assistant.
			</p>

			<PrivacyFlowFigure />

			<aside
				aria-labelledby="privacy-summary"
				className="mt-8 rounded-lg border border-primary/50 bg-card p-5 text-card-foreground sm:p-6"
			>
				<h2 id="privacy-summary" className="text-xl font-semibold">
					Important privacy facts
				</h2>
				<ul className="mt-3 list-disc space-y-2 pl-5 leading-7">
					<li>
						Browsing activity, visible page excerpts, and notes are stored
						locally in Chrome. Tabot’s online connection service does not store
						them.
					</li>
					<li>
						When you use a connected AI assistant, it can request selected
						activity details, page and site listings, or notes you saved.
						Visible page excerpts are not returned by the assistant tools.
					</li>
					<li>
						Tabot’s online connection service (its MCP service) powers the Tabot
						connector you add in ChatGPT, sometimes called a plugin. It passes
						requests and results between the assistant and your extension; it
						does not save browsing records, excerpts, notes, or tool results in
						its application storage.
					</li>
					<li>
						The service keeps connection and authorization records so ChatGPT
						can connect. Tabot does store some connection data.
					</li>
					<li>
						ChatGPT receives the requested information and handles it under
						OpenAI’s privacy and retention policies.
					</li>
				</ul>
			</aside>

			<div className="mt-12 space-y-10 text-base leading-7 text-muted-foreground">
				<section>
					<h2 className="text-2xl font-semibold text-foreground">
						What Tabot records
					</h2>
					<p className="mt-3">
						With tracking enabled, the Chrome extension stores visited page
						addresses and activity signals in Chrome on your device. Signals
						include tab changes, foreground visibility, clicks, scroll position,
						and whether keyboard activity occurred. A saved page address may
						include its path or search terms.
					</p>
					<p className="mt-3">
						On eligible HTTP(S) pages, Tabot also automatically saves a small
						number of text fragments visible on screen after a brief foreground
						dwell, scroll, or interaction. Each capture is limited to four
						fragments of up to 1,000 characters each; this is not a full-page
						copy. Capture excludes incognito, hidden pages, form/editor areas,
						selected authentication URLs, and known password-manager sites.
						Before they are saved, titles and excerpts are filtered for selected
						sensitive patterns, including payment-card numbers, CVV/expiry,
						credentials, and some bank, payment, tax, and business identifiers.
						The filter covers selected patterns only and may miss other
						sensitive details. You can pause tracking to stop new captures.
						Stored excerpts have no fixed expiration date and oldest excerpts
						are removed when their 25 MiB storage budget is exceeded.
					</p>
					<p className="mt-3">
						Tabot does not record the keys you press, what you type, form
						entries, passwords, full-page HTML, screenshots, audio, or video.
						“Keyboard activity” means only that activity happened; it does not
						include the keys or text.
					</p>
				</section>

				<section id="when-you-connect-chatgpt">
					<h2
						id="when-you-connect-ai-assistant"
						className="text-2xl font-semibold text-foreground"
					>
						When you connect an AI assistant
					</h2>
					<p className="mt-3">
						After you authorize Tabot in a compatible assistant such as ChatGPT,
						it can request selected information from your extension through
						Tabot’s online connection service. This uses MCP, a standard way for
						an assistant to request information from Tabot.
					</p>
					<ol className="mt-3 list-decimal space-y-2 pl-5">
						<li>You ask a question in your AI assistant.</li>
						<li>
							The assistant requests information. The connection service checks
							permission and passes the request to your extension while it is
							online.
						</li>
						<li>
							The extension looks up the requested information from activity
							stored on your device, then returns the result through the service
							to the assistant.
						</li>
					</ol>
					<p className="mt-3">
						The dashboard also reads from the extension on your device. It does
						not send your browsing records to the connection service just to
						show them. Exporting a file is a separate action you control.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground">
						What the AI assistant receives
					</h2>
					<p className="mt-3">
						The assistant can call read-only Tabot tools to search activity,
						browse site and page listings, find related activity, and retrieve
						notes you saved. Results can include website names (including
						subdomains), timestamps, counts, match terms, and requested saved
						note titles and text. These are selected results, not a complete
						browsing history. Website names and timing are not hidden or
						anonymized. Automatically captured page excerpts stay on-device;
						tools may indicate whether a page has a capture, but never return
						excerpt text.
					</p>
					<p className="mt-3">
						The tools do not return raw event-by-event records, full page paths
						or query strings, login credentials, or website icons. Before
						return, selected sensitive patterns are filtered from requested note
						text and titles, including payment-card numbers, CVV/expiry,
						credentials, and some bank, payment, tax, and business identifiers.
						Your saved note itself stays as written on your device. The filter
						covers selected patterns only and may miss other sensitive details.
						Your connected AI provider (such as OpenAI or Anthropic) handles
						information it receives under its own policies and account settings.
						Tabot does not control how long it keeps it.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground">
						What the connection service keeps
					</h2>
					<p className="mt-3">
						The service keeps the records needed to recognize connected
						assistants and authorize access. These include connection IDs,
						client registration details, permissions, protected access-token
						records, and expiry dates. It does not save browsing activity, page
						excerpts, notes, or tool results in its application storage;
						requests and results pass through while handled. Cloudflare runs the
						service and may process service traffic and operational information
						under its own policies.
					</p>
					<p className="mt-3">
						You can revoke the assistant’s access in its connection settings.
						Revoking access removes its active authorization, but does not
						delete local browsing records or the assistant’s registration
						details held by the service. Tabot currently has no separate
						self-service control to delete those registration details.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground">
						Analytics and error reports
					</h2>
					<p className="mt-3">
						When configured for a build, Tabot sends allowlisted website route
						views and sanitized error reports to PostHog. Error reports may
						include error type and diagnostic source, source-file basenames and
						line numbers, app release, and platform. Error messages and function
						names are redacted. Events use fixed app-level identifiers, not
						account or installation IDs. Reports do not include browser history,
						page URLs, tab titles, page excerpts, or notes. Automatic
						interaction capture and session recording are disabled. PostHog
						processes these events under its own policies; analytics are
						disabled when a build has no project key.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground">
						Keeping and deleting your data
					</h2>
					<p className="mt-3">
						Your browsing records remain in Chrome on your device until you
						clear Tabot’s extension data or remove the extension. Page excerpts
						have a 25 MiB storage budget; when exceeded, Tabot removes the
						oldest excerpts. You can delete saved notes in Tabot. Pausing
						recording stops new activity and excerpt capture; it does not delete
						data already saved. To stop an AI assistant from accessing Tabot,
						revoke its connection in that assistant’s settings. This does not
						delete records stored on your device or ChatGPT’s registration
						details held by the connection service. You control exported files
						after downloading them.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground">
						Changes and contact
					</h2>
					<p className="mt-3">
						We may update this policy when Tabot’s data practices change. For
						privacy questions, email{" "}
						<a
							className="font-semibold text-foreground underline decoration-lime decoration-2 underline-offset-4 transition-colors hover:decoration-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
							href={`mailto:${EMAIL}`}
						>
							{EMAIL}
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
		links: [{ rel: "canonical", href: `${SITE_URL}/privacy/` }],
		meta: [
			{ title: "Privacy Policy | Tabot" },
			{
				name: "description",
				content:
					"Learn what Tabot stores on your device, what information ChatGPT can request, and what Tabot’s connection service keeps.",
			},
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: "Tabot" },
			{ property: "og:title", content: "Privacy Policy | Tabot" },
			{
				property: "og:description",
				content:
					"Learn what Tabot stores on your device, what information ChatGPT can request, and what Tabot’s connection service keeps.",
			},
			{ property: "og:url", content: `${SITE_URL}/privacy/` },
			{ property: "og:image", content: OG_IMAGE_URL },
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{
				property: "og:image:alt",
				content: "Tabot — browser context for AI-assisted work",
			},
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: "Privacy Policy | Tabot" },
			{
				name: "twitter:description",
				content:
					"Learn what Tabot stores on your device, what information ChatGPT can request, and what Tabot’s connection service keeps.",
			},
			{ name: "twitter:image", content: OG_IMAGE_URL },
			{
				name: "twitter:image:alt",
				content: "Tabot — browser context for AI-assisted work",
			},
		],
	}),
	component: Privacy,
});
