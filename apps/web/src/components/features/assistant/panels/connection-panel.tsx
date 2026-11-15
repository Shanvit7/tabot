import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import { RefreshCw } from "lucide-react";

export const AssistantConnectionPanel = ({
	chatGptConnected,
	connectUrl,
	diagnoseUrl,
	onCheckConnection,
	onShowInstructions,
}: {
	chatGptConnected: boolean | null;
	connectUrl: string;
	diagnoseUrl: string;
	onCheckConnection: () => void;
	onShowInstructions: () => void;
}) => (
	<section
		aria-label={
			chatGptConnected ? "ChatGPT connection status" : "ChatGPT troubleshooting"
		}
		className="max-w-3xl rounded-xl border border-work-line bg-work-surface"
	>
		<div className="space-y-4 p-5 sm:p-6">
			<div>
				<h3 className="font-heading text-lg font-semibold leading-6 tracking-tight text-work-ink">
					{chatGptConnected
						? "Having trouble connecting?"
						: "Connected, but still showing disconnected?"}
				</h3>
				<p className="mt-1 max-w-prose text-base leading-7 text-work-muted">
					{chatGptConnected
						? "Check your connection or walk through the setup steps."
						: "Try these checks, then refresh the connection status."}
				</p>
			</div>
			{!chatGptConnected && (
				<ul className="space-y-2 text-sm leading-6 text-work-muted">
					<li>
						Keep Tabot open in the same Chrome profile you use for ChatGPT.
					</li>
					<li>
						Confirm Tabot is enabled in ChatGPT and authorization completed in
						Chrome.
					</li>
					<li>
						If status still looks stale, refresh this page and check again.
					</li>
				</ul>
			)}
			<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
				<a
					href={chatGptConnected ? diagnoseUrl : connectUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
				>
					<OpenAIMono aria-hidden="true" className="size-4" />
					{chatGptConnected ? "Ask ChatGPT to diagnose" : "Ask ChatGPT to help"}
					<span className="sr-only">(opens in a new tab)</span>
				</a>
				<button
					type="button"
					onClick={onCheckConnection}
					className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-work-line px-4 text-sm font-semibold text-work-ink transition-colors hover:bg-work-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-wait disabled:opacity-70"
				>
					<RefreshCw aria-hidden="true" className="size-4" /> Check connection
				</button>
				<button
					type="button"
					onClick={onShowInstructions}
					className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-4 text-sm font-semibold text-work-ink hover:bg-work-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
				>
					Review setup steps
				</button>
			</div>
			{chatGptConnected && (
				<p className="text-sm leading-6 text-work-muted">
					To disconnect, remove Tabot from ChatGPT Settings → Apps.
				</p>
			)}
		</div>
	</section>
);
