import { createFileRoute } from "@tanstack/react-router";
import { siteUrl } from "~/lib/site";

const Terms = () => (
	<main className="min-h-screen bg-[#07100c] px-6 py-12 text-[#eff5e7] sm:px-10 sm:py-16 lg:px-14">
		<article className="mx-auto max-w-3xl">
			<a
				className="text-sm font-semibold text-[#bfff00] underline decoration-2 underline-offset-4"
				href="./"
			>
				TABOT
			</a>
			<h1 className="mt-10 text-balance text-5xl font-semibold tracking-[-0.04em] sm:text-7xl">
				Terms of service
			</h1>
			<p className="mt-4 text-sm text-[#8ca493]">
				Last updated: October 11, 2026
			</p>
			<div className="mt-10 space-y-8 text-base leading-7 text-[#c2d1c7]">
				<section>
					<h2 className="text-2xl font-semibold text-[#eff5e7]">Using Tabot</h2>
					<p className="mt-3">
						These terms apply when you use the Tabot Chrome extension,
						dashboard, and online connection service. By installing or using
						Tabot, you agree to these terms. If you do not agree, stop using
						Tabot and remove the extension.
					</p>
				</section>
				<section>
					<h2 className="text-2xl font-semibold text-[#eff5e7]">
						What Tabot does
					</h2>
					<p className="mt-3">
						The extension stores browser activity data locally on your device.
						If you authorize a connected assistant, Tabot’s MCP service relays
						selected context and aggregate results requested by that assistant.
						The service also stores connection and authorization records. See
						the{" "}
						<a className="text-[#bfff00] underline" href="./privacy/">
							Privacy Policy
						</a>{" "}
						for details.
					</p>
				</section>
				<section>
					<h2 className="text-2xl font-semibold text-[#eff5e7]">
						Your responsibilities
					</h2>
					<p className="mt-3">
						Use Tabot only with browsers, devices, and accounts you are
						authorized to use. Keep your extension and connected accounts
						secure. You are responsible for deciding what information to share
						with an assistant and for complying with laws and third-party terms
						that apply to your use. Do not misuse Tabot, interfere with its
						operation, or attempt to access another person’s data or account.
					</p>
				</section>
				<section>
					<h2 className="text-2xl font-semibold text-[#eff5e7]">
						Limits and availability
					</h2>
					<p className="mt-3">
						Tabot is an early-stage proof of concept and may change, be
						interrupted, or become unavailable. Browser activity estimates are
						approximate; they do not measure attention, intent, or productivity
						and are not professional advice. Tabot is provided “as is” and “as
						available,” to the extent permitted by law. To the extent permitted
						by law, Tabot’s developer is not liable for indirect, incidental,
						special, consequential, or punitive damages arising from use of
						Tabot.
					</p>
				</section>
				<section>
					<h2 className="text-2xl font-semibold text-[#eff5e7]">
						Changes and contact
					</h2>
					<p className="mt-3">
						These terms may be updated as Tabot changes. Continued use after an
						update means you accept the revised terms. For questions, contact{" "}
						<a
							className="text-[#bfff00] underline"
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

export const Route = createFileRoute("/terms")({
	head: () => ({
		meta: [
			{ title: "Terms of Service | Tabot" },
			{
				name: "description",
				content:
					"Terms for using the Tabot Chrome extension, dashboard, and MCP service.",
			},
			{ property: "og:url", content: siteUrl("terms/") },
			{ property: "og:title", content: "Terms of Service | Tabot" },
		],
		links: [{ rel: "canonical", href: siteUrl("terms/") }],
	}),
	component: Terms,
});
