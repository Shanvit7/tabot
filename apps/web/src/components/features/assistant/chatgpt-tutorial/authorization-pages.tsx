import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import { ArrowRight, ArrowUpRight, Check, X } from "lucide-react";
import { Img, useCurrentFrame } from "remotion";
import { DemoCursor } from "~/components/features/assistant/chatgpt-tutorial/primitives";
import { LOGO_URL } from "~/lib/constants";

/** Illustrated ChatGPT prompt, not a live connection or account dialog. */
export const ConnectPrompt = () => (
	<div
		aria-hidden="true"
		className="absolute inset-0 flex items-center justify-center bg-black/60 p-5"
	>
		<div className="relative w-176 rounded-3xl bg-tutorial-panel px-8 py-6 shadow-2xl">
			<X className="absolute right-5 top-5 size-5 text-tutorial-muted" />
			<div className="flex items-center justify-center gap-5">
				<span className="grid size-16 place-items-center rounded-2xl bg-black">
					<OpenAIMono className="size-11" />
				</span>
				<span className="text-2xl text-tutorial-muted">···</span>
				<Img
					src={LOGO_URL}
					alt=""
					width="64"
					height="64"
					className="size-16 rounded-2xl"
				/>
			</div>
			<h2 className="my-5 text-center text-3xl font-semibold">Connect Tabot</h2>
			<div className="space-y-4 text-base leading-6 text-tutorial-muted">
				<p>
					ChatGPT may share relevant memories (if enabled) and chats with Tabot.
					Tabot’s terms and privacy policy apply.
				</p>
				<p>
					If <strong>Suggested prompts</strong> is enabled, app data may be used
					to proactively provide helpful information or suggestions.
				</p>
				<p>
					If <strong>Improve the model for everyone</strong> is enabled, app
					information used in chats may improve models. Disconnect Tabot in
					settings to stop new access, or delete conversations containing its
					data.
				</p>
			</div>
			<div className="relative mt-5 flex items-center justify-center gap-2 rounded-full bg-tutorial-ink px-5 py-3 text-xl text-black">
				Connect Tabot <ArrowUpRight className="size-5" />
				<DemoCursor at={535} className="right-24 top-4" />
			</div>
			<div className="mt-3 rounded-full bg-tutorial-ink px-5 py-3 text-center text-xl text-black">
				Cancel
			</div>
		</div>
	</div>
);

/** Simplified Tabot consent page, with the same sharing boundary and button label. */
export const ConsentPage = () => {
	const frame = useCurrentFrame();
	return (
		<div
			aria-hidden="true"
			className="flex h-full w-full items-center justify-center bg-work-canvas p-8 font-sans text-work-ink"
		>
			<div className="w-full max-w-5xl rounded-3xl border border-work-line bg-white p-7 shadow-lg">
				<div className="mb-4 flex items-center gap-2 text-lg font-semibold">
					<Img
						src={LOGO_URL}
						alt=""
						width="32"
						height="32"
						className="size-8"
					/>
					tabot
				</div>
				<h2 className="text-4xl font-semibold tracking-tight">
					Connect Tabot to ChatGPT
				</h2>
				<p className="mt-2 text-lg text-work-muted">
					Let ChatGPT request selected activity from this profile when you ask.
				</p>
				<div className="my-5 flex items-center justify-around rounded-xl border border-work-line bg-work-raised px-5 py-4 text-lg font-medium">
					<span>This profile</span>
					<ArrowRight className="size-5" />
					<span className="flex items-center gap-2">
						<Img
							src={LOGO_URL}
							alt=""
							width="28"
							height="28"
							className="size-7"
						/>{" "}
						Tabot MCP
					</span>
					<ArrowRight className="size-5" />
					<span>ChatGPT</span>
				</div>
				<h3 className="mb-3 text-lg font-semibold">Privacy, at a glance</h3>
				<div className="grid grid-cols-2 gap-3 text-base leading-6">
					<div className="flex items-start gap-2 rounded-xl border border-work-line p-4">
						<Check className="mt-1 size-4 shrink-0" />
						<p>
							<strong>Shared on request:</strong> selected activity results and
							explicitly requested saved notes.
						</p>
					</div>
					<div className="flex items-start gap-2 rounded-xl border border-work-line p-4">
						<X className="mt-1 size-4 shrink-0" />
						<p>
							<strong>Stays on this device:</strong> full browsing history, raw
							events, and automatic page excerpts.
						</p>
					</div>
				</div>
				<p className="mt-3 text-sm leading-5 text-work-muted">
					Selected sensitive patterns are filtered from requested note titles
					and text. Detection is not exhaustive. Tabot’s relay stores connection
					details, not browsing history or tool results.
				</p>
				<div className="mt-5 flex items-center justify-between gap-5">
					<p className="text-sm text-work-muted">
						Before connecting, review our{" "}
						<span className="underline">Privacy Policy</span>.
					</p>
					<span className="relative flex items-center gap-3 rounded-xl bg-primary px-5 py-3 text-lg font-semibold text-primary-foreground">
						Connect to ChatGPT <ArrowRight className="size-5" />
						<DemoCursor at={855} className="right-5 top-5" />
					</span>
				</div>
				{frame >= 870 ? (
					<p className="mt-2 text-sm text-work-muted">Connecting Tabot…</p>
				) : null}
			</div>
		</div>
	);
};
