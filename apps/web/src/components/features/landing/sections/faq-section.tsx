import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

const faqs = [
	[
		"What does Tabot do?",
		"Tabot helps you find things you've looked at in Chrome and save your own takeaways, so you can bring your browsing context to ChatGPT.",
	],
	[
		"What if I just use ChatGPT to browse?",
		"ChatGPT is great for research you do with it. Tabot helps when useful work is already in Chrome: ask ChatGPT about selected browsing activity and saved notes without tracking down every link yourself.",
	],
	[
		"What does Tabot remember?",
		"While recording is on, Tabot keeps a limited record of what you browse and short bits of text from some things you open. It doesn't record what you type or enter into forms, or take screenshots or full-page copies.",
	],
	[
		"Does my browsing leave my device?",
		<>
			Your browsing data stays in Chrome on your device—we don't collect or
			store it on our servers. If you ask ChatGPT about it, Tabot sends selected
			results. Tabot filters recognized sensitive details from your browser
			context before saving it. Read our{" "}
			<Link
				to="/privacy"
				className="cursor-pointer underline underline-offset-4 hover:text-work-ink"
			>
				privacy policy
			</Link>{" "}
			for details.
		</>,
	],
	[
		"Is Tabot free because you train AI on my data?",
		"No—we don’t train AI on your browsing data. Tabot is free and open source, so you can use it without paying for another AI service or handing your browsing history to a cloud platform. We’d rather keep the core experience free and let the community shape where it goes next.",
	],
	[
		"Does my computer need to be on to use Tabot with ChatGPT?",
		"Yes. Keep your computer on, Chrome open, and the Tabot extension connected while ChatGPT accesses your browsing data. If your computer is off or the extension is disconnected, ChatGPT can't access it through Tabot.",
	],
	[
		"Can Tabot take actions for me?",
		<>
			Not yet. We’re working toward automations you can create locally and
			direct yourself to help with your tasks.{" "}
			<a
				href="#automations"
				className="cursor-pointer underline underline-offset-4 hover:text-work-ink"
			>
				See what’s coming.
			</a>
		</>,
	],
] as const;

export const FaqSection = () => (
	<section
		id="questions"
		aria-labelledby="questions-heading"
		className="px-5 py-16 sm:px-8 sm:py-24"
	>
		<div className="mx-auto max-w-3xl">
			<h2
				id="questions-heading"
				className="mb-8 text-center font-display text-4xl tracking-tight sm:text-[48px]"
			>
				Questions, Answered
			</h2>
			<div className="divide-y divide-work-line border-y border-work-line">
				{faqs.map(([question, answer]) => (
					<details key={question} className="landing-disclosure group">
						<summary className="flex min-h-19 cursor-pointer list-none items-center justify-between gap-5 py-5 text-base font-medium sm:text-lg">
							{question}
							<Plus
								aria-hidden="true"
								className="size-4 shrink-0 transition-transform group-open:rotate-45"
							/>
						</summary>
						<p className="max-w-[65ch] pb-6 pr-5 text-base leading-relaxed text-work-muted">
							{answer}
						</p>
					</details>
				))}
			</div>
		</div>
	</section>
);
