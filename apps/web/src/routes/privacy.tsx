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
				Last updated: October 9, 2026
			</p>
			<p className="mt-6 max-w-2xl leading-7 text-[#c2d1c7]">
				Here’s what Tabot records, what stays on your device, and what happens
				when you connect ChatGPT.
			</p>

			<aside
				aria-labelledby="privacy-summary"
				className="mt-8 border-2 border-[#bfff00] bg-white p-5 text-black sm:p-6"
			>
				<h2 id="privacy-summary" className="text-xl font-semibold">
					Important privacy facts
				</h2>
				<ul className="mt-3 list-disc space-y-2 pl-5 leading-7">
					<li>
						Your browsing records stay in Chrome on your device. Tabot’s online
						connection service does not store them.
					</li>
					<li>
						When you ask ChatGPT about your activity, it can request selected
						information from Tabot, such as site counts or details about a
						browsing context or recurring pattern.
					</li>
					<li>
						Tabot’s online connection service (its MCP service) powers the Tabot
						connector you add in ChatGPT, sometimes called a plugin. It passes
						requests and results between ChatGPT and the extension; it does not
						save browsing records or results in its application storage.
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

			<div className="mt-12 space-y-10 text-base leading-7 text-[#c2d1c7]">
				<section>
					<h2 className="text-2xl font-semibold text-[#eff5e7]">
						What Tabot records
					</h2>
					<p className="mt-3">
						The Chrome extension stores visited page addresses and activity
						signals in Chrome on your device. These include tab changes, pages
						being visible, clicks, scroll position, and whether keyboard
						activity occurred. A saved page address may include its path or
						search terms in the address.
					</p>
					<p className="mt-3">
						Tabot does not record the keys you press, what you type, form
						entries, passwords, page contents, screenshots, audio, or video.
						“Keyboard activity” means only that activity happened; it does not
						include the keys or text.
					</p>
				</section>

				<section>
					<h2
						id="when-you-connect-chatgpt"
						className="text-2xl font-semibold text-[#eff5e7]"
					>
						When you connect ChatGPT
					</h2>
					<p className="mt-3">
						After you authorize the Tabot plugin/connector in ChatGPT, ChatGPT
						can request selected information from the extension through Tabot’s
						online connection service. This service uses MCP, the connection
						method that lets ChatGPT request information from Tabot.
					</p>
					<ol className="mt-3 list-decimal space-y-2 pl-5">
						<li>You ask a question in ChatGPT.</li>
						<li>
							ChatGPT requests relevant information. The connection service
							checks permission and passes the request to your extension while
							it is online.
						</li>
						<li>
							The extension looks up the requested information from activity
							stored on your device, then returns the result through the service
							to ChatGPT.
						</li>
					</ol>
					<p className="mt-3">
						The dashboard also reads from the extension on your device. It does
						not send your browsing records to the connection service just to
						show them. Exporting a file is a separate action you control.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-[#eff5e7]">
						What the AI assistant receives
					</h2>
					<p className="mt-3">
						ChatGPT requests information by calling a Tabot tool. Depending on
						the tool, the extension returns selected details such as a
						description of a browsing context, website names (including
						subdomains), dates and times, counts, recurring-pattern details, or
						estimated activity measures. These are structured results, not a
						single general summary. Website names are not hidden or anonymized.
					</p>
					<p className="mt-3">
						The extension does not return raw event-by-event records, page paths
						or query strings, login credentials, or website icons. Some returned
						text is checked for personal details, but this cannot guarantee
						every sensitive detail is removed. OpenAI may keep information
						ChatGPT receives under its own policies and account settings. Tabot
						does not control how long it keeps it.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-[#eff5e7]">
						What the connection service keeps
					</h2>
					<p className="mt-3">
						The service keeps the records needed to recognize ChatGPT and
						authorize its access. These include connection IDs, ChatGPT
						registration details, permissions, protected access-token records,
						and expiry dates. It does not save your browsing records or the
						information returned to ChatGPT in its application storage; requests
						and results pass through while being handled. Cloudflare runs the
						service and may process service traffic and operational information
						under its own policies.
					</p>
					<p className="mt-3">
						You can revoke ChatGPT’s access in its connection settings. Revoking
						access removes its active authorization, but does not delete local
						browsing records or ChatGPT’s registration details held by the
						service. Tabot currently has no separate self-service control to
						delete those registration details.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-[#eff5e7]">
						Website analytics
					</h2>
					<p className="mt-3">
						The Tabot website uses Umami Cloud to measure visits to the website.
						This is separate from the Chrome extension: Umami does not read the
						extension’s local browsing records. Umami Cloud handles
						website-usage information under its own policies.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-[#eff5e7]">
						Keeping and deleting your data
					</h2>
					<p className="mt-3">
						Your browsing records remain in Chrome on your device until you
						clear Tabot’s extension data or remove the extension. Pausing
						recording stops new activity from being recorded; it does not delete
						what Tabot has already saved. To stop ChatGPT from accessing Tabot,
						revoke its connection in ChatGPT’s settings. This does not delete
						records stored on your device or ChatGPT’s registration details held
						by the connection service. You control exported files after
						downloading them.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-[#eff5e7]">
						Changes and contact
					</h2>
					<p className="mt-3">
						We may update this policy when Tabot’s data practices change. For
						privacy questions, email{" "}
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
					"Learn what Tabot stores on your device, what information ChatGPT can request, and what Tabot’s connection service keeps.",
			},
			{ property: "og:url", content: siteUrl("privacy/") },
			{ property: "og:title", content: "Privacy Policy | Tabot" },
		],
		links: [{ rel: "canonical", href: siteUrl("privacy/") }],
	}),
	component: Privacy,
});
