import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import type { ConnectionState } from "@tabot/shared/assistant-connections";
import {
	Check,
	CircleHelp,
	LoaderCircle,
	Minus,
	RefreshCw,
	X,
} from "lucide-react";
import type { ReactNode } from "react";
import { CONNECTION_TAB_LABEL } from "./connection-tab-label";

type RowStatus = "ok" | "fail" | "pending" | "unknown" | "skipped";
type Primary = "connect" | "diagnose" | "reconnect" | "extensions";

const COPY: Record<
	ConnectionState,
	{ title: string; body: string; primary: Primary | null }
> = {
	checking: {
		title: "Checking ChatGPT connection…",
		body: "This usually takes a few seconds.",
		primary: null,
	},
	"extension-unreachable": {
		title: "Tabot isn’t responding in Chrome",
		body: "Open Chrome’s extensions page and switch Tabot on. Then return here and check again.",
		primary: "extensions",
	},
	"not-authorized": {
		title: "ChatGPT isn’t connected to Tabot",
		body: "In ChatGPT, open Plugins → Tabot and choose Connect. If you can’t find Tabot, review the setup steps.",
		primary: "connect",
	},
	"auth-unknown": {
		title: "Couldn’t check your ChatGPT connection",
		body: "In ChatGPT, open Plugins → Tabot. If it shows disconnected, choose Reconnect. If Tabot isn’t listed, review the setup steps, then check again here.",
		primary: "diagnose",
	},
	"relay-status-unknown": {
		title: "Can’t check Tabot’s live status",
		body: "ChatGPT is linked and Tabot is present in Chrome, but this extension couldn’t read its live connection status. Update or reload Tabot in Chrome’s extensions page, then check again.",
		primary: "extensions",
	},
	"relay-connecting": {
		title: "Tabot is reconnecting to ChatGPT",
		body: "Wait up to 30 seconds; we’ll check again automatically. If it doesn’t reconnect, open ChatGPT → Plugins → Tabot and choose Reconnect.",
		primary: null,
	},
	"relay-offline": {
		title: "Tabot is offline",
		body: "Make sure Tabot is switched on in Chrome, then reconnect it here. If it stays offline, open ChatGPT → Plugins → Tabot and choose Reconnect.",
		primary: "reconnect",
	},
	"round-trip-failed": {
		title: "ChatGPT didn’t get a reply from Tabot",
		body: "In ChatGPT, open Plugins → Tabot and reconnect it. If it already says connected, reload the Tabot extension in Chrome, then check again.",
		primary: "diagnose",
	},
	healthy: {
		title: "ChatGPT is ready to use Tabot",
		body: "Open ChatGPT and ask a question using Tabot.",
		primary: "diagnose",
	},
};

const rows = (
	state: ConnectionState,
): { label: string; status: RowStatus }[] => {
	if (state === "not-authorized")
		return [{ label: "ChatGPT isn’t connected to Tabot", status: "fail" }];
	const reached = state !== "checking" && state !== "extension-unreachable";
	return [
		{
			label:
				state === "checking"
					? "Checking ChatGPT connection…"
					: !reached
						? "ChatGPT connection not checked"
						: state === "auth-unknown"
							? "Couldn’t check whether ChatGPT is connected"
							: "ChatGPT is connected to Tabot",
			status:
				state === "checking"
					? "pending"
					: !reached
						? "skipped"
						: state === "auth-unknown"
							? "unknown"
							: "ok",
		},
		{
			label:
				state === "checking"
					? "Checking Tabot in this Chrome profile…"
					: state === "extension-unreachable"
						? "Tabot didn’t respond in this Chrome profile"
						: "Tabot extension found in this Chrome profile",
			status: state === "checking" ? "pending" : reached ? "ok" : "fail",
		},
		{
			label:
				state === "checking"
					? "Checking whether ChatGPT can reach Tabot…"
					: state === "healthy"
						? "ChatGPT got a reply from Tabot"
						: state === "round-trip-failed"
							? "ChatGPT didn’t get a reply from Tabot"
							: state === "relay-connecting"
								? "Waiting for Tabot to reconnect"
								: state === "relay-offline"
									? "Reconnect Tabot to check that it replies"
									: state === "relay-status-unknown"
										? "Couldn’t check Tabot’s live connection status"
										: state === "extension-unreachable"
											? "Turn on Tabot in Chrome to check that it replies"
											: "Check the ChatGPT connection before testing Tabot",
			status:
				state === "checking"
					? "pending"
					: state === "healthy"
						? "ok"
						: state === "round-trip-failed"
							? "fail"
							: state === "relay-connecting"
								? "pending"
								: state === "relay-status-unknown"
									? "unknown"
									: "skipped",
		},
	];
};

const ICON: Record<RowStatus, ReactNode> = {
	ok: <Check aria-hidden="true" className="size-4 text-emerald-600" />,
	fail: <X aria-hidden="true" className="size-4 text-red-600" />,
	pending: (
		<LoaderCircle
			aria-hidden="true"
			className="size-4 animate-spin text-amber-600 motion-reduce:animate-none"
		/>
	),
	unknown: <CircleHelp aria-hidden="true" className="size-4 text-amber-600" />,
	skipped: <Minus aria-hidden="true" className="size-4 text-work-muted" />,
};

const BUTTON =
	"inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const PRIMARY = `${BUTTON} bg-primary text-primary-foreground hover:bg-primary/90`;
const SECONDARY = `${BUTTON} border border-work-line text-work-ink hover:bg-work-raised`;

export const AssistantConnectionPanel = ({
	state,
	connectUrl,
	diagnoseUrl,
	reconnecting,
	onCheckConnection,
	onReconnect,
	onCopyExtensionsLink,
	onShowInstructions,
}: {
	state: ConnectionState;
	connectUrl: string;
	diagnoseUrl: string;
	reconnecting: boolean;
	onCheckConnection: () => void;
	onReconnect: () => void;
	onCopyExtensionsLink: () => void;
	onShowInstructions: () => void;
}) => {
	const { title, body, primary } = COPY[state];
	return (
		<section
			aria-label={`ChatGPT connection: ${CONNECTION_TAB_LABEL[state]}`}
			className="max-w-3xl rounded-xl border border-work-line bg-work-surface"
		>
			<div className="space-y-4 p-5 sm:p-6">
				<div aria-live="polite">
					<h3 className="font-heading text-lg font-semibold leading-6 tracking-tight text-work-ink">
						{title}
					</h3>
					<p className="mt-1 max-w-prose text-base leading-7 text-work-muted">
						{body}
					</p>
				</div>
				<ul className="divide-y divide-work-line rounded-lg border border-work-line text-sm leading-6 text-work-ink">
					{rows(state).map((row) => (
						<li
							key={row.label}
							className="flex items-center justify-between gap-4 px-3 py-2.5"
						>
							<span className="flex min-w-0 items-center gap-2">
								{ICON[row.status]}
								<span className="font-medium">{row.label}</span>
							</span>
						</li>
					))}
				</ul>
				<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
					{(primary === "connect" || primary === "diagnose") && (
						<a
							href={primary === "connect" ? connectUrl : diagnoseUrl}
							target="_blank"
							rel="noopener noreferrer"
							className={PRIMARY}
						>
							<OpenAIMono aria-hidden="true" className="size-4" />
							{primary === "connect"
								? "Connect Tabot in ChatGPT"
								: state === "healthy"
									? "Ask ChatGPT to test"
									: "Get help in ChatGPT"}
							<span className="sr-only">(opens in a new tab)</span>
						</a>
					)}
					{primary === "reconnect" && (
						<button
							type="button"
							onClick={onReconnect}
							disabled={reconnecting}
							className={`${PRIMARY} disabled:cursor-wait disabled:opacity-70`}
						>
							<RefreshCw aria-hidden="true" className="size-4" />
							{reconnecting ? "Reconnecting…" : "Reconnect Tabot"}
						</button>
					)}
					{primary === "extensions" && (
						<button
							type="button"
							onClick={onCopyExtensionsLink}
							className={PRIMARY}
						>
							Copy address to open Chrome extensions
						</button>
					)}
					<button
						type="button"
						onClick={onCheckConnection}
						className={SECONDARY}
					>
						<RefreshCw aria-hidden="true" className="size-4" /> Check again
					</button>
					{(state === "not-authorized" || state === "auth-unknown") && (
						<button
							type="button"
							onClick={onShowInstructions}
							className={`${BUTTON} text-work-ink hover:bg-work-raised`}
						>
							Review setup steps
						</button>
					)}
				</div>
			</div>
		</section>
	);
};
