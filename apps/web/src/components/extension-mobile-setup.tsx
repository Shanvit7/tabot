import { Check, Copy, Monitor } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";

const mobileSteps = [
	{
		title: "Open Tabot on your computer",
		body: "Send yourself this link, or type tabot’s address into your computer.",
	},
	{
		title: "Use Google Chrome",
		body: "Chrome on phones can’t run extensions, so this only works on desktop Chrome.",
	},
	{
		title: "Add the extension",
		body: "Press “Add to Chrome” on the Web Store page. That’s it.",
	},
];

export const MobileView = ({
	chromeWebStoreUrl,
}: {
	chromeWebStoreUrl: string;
}) => {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		await globalThis.navigator.clipboard?.writeText(chromeWebStoreUrl);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};
	return (
		<>
			<Monitor aria-hidden="true" className="size-8" strokeWidth={2.5} />
			<p className="mt-3 font-mono text-[11px] font-bold uppercase tracking-[0.2em]">
				Desktop only
			</p>
			<h1 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-balance">
				Tabot lives in Chrome on your computer.
			</h1>
			<p className="mt-2 text-sm leading-6 text-[#244d39]">
				Open this page on your laptop or desktop to get the free extension. Your
				activity stays on that computer.
			</p>
			<ol className="mt-5 space-y-3">
				{mobileSteps.map((step, index) => (
					<li key={step.title} className="grid grid-cols-[auto_1fr] gap-3">
						<span className="flex size-6 items-center justify-center rounded-full bg-black font-mono text-xs font-bold text-lime">
							{index + 1}
						</span>
						<div>
							<h2 className="text-sm font-semibold leading-6">{step.title}</h2>
							<p className="text-xs leading-5 text-[#244d39]">{step.body}</p>
						</div>
					</li>
				))}
			</ol>
			<Button
				className="mt-5 w-full"
				type="button"
				variant="secondary"
				onClick={copy}
			>
				{copied ? (
					<Check aria-hidden="true" className="size-4" />
				) : (
					<Copy aria-hidden="true" className="size-4" />
				)}
				{copied ? "Link copied" : "Copy link for my computer"}
			</Button>
		</>
	);
};
