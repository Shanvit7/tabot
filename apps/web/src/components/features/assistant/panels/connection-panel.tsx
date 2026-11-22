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
type Primary = "connect" | "diagnose" | "reconnect" | "recheck" | "extensions";

const COPY: Record<
	ConnectionState,
	{ title: string; body: string; primary: Primary | null }
> = {
	checking: {
		title: "Checking your ChatGPT connection…",
		body: "Checking that Tabot is available and ChatGPT can use it.",
		primary: null,
	},
	"extension-unreachable": {
		title: "Tabot isn’t available in this Chrome browser",
		body: "Copy the address below, paste it into Chrome’s address bar, and make sure Tabot is turned on. If you have more than one copy installed, set up that same copy in ChatGPT.",
		primary: "extensions",
	},
	"not-authorized": {
		title: "ChatGPT access isn’t set up",
		body: "Allow ChatGPT to use Tabot. You’ll finish setup in ChatGPT.",
		primary: "connect",
	},
	"auth-unknown": {
		title: "Can’t check ChatGPT access",
		body: "We couldn’t confirm that ChatGPT can use Tabot. Try again, or ask ChatGPT for help.",
		primary: "recheck",
	},
	"relay-connecting": {
		title: "Tabot is reconnecting",
		body: "This usually takes a few seconds. We’ll check again automatically.",
		primary: null,
	},
	"relay-offline": {
		title: "Tabot can’t connect right now",
		body: "Tabot is having trouble connecting to ChatGPT. Try reconnecting.",
		primary: "reconnect",
	},
	"round-trip-failed": {
		title: "Tabot didn’t get a reply",
		body: "Tabot is connected, but its connection test got no response. Reconnect; if this keeps happening, reload Tabot in Chrome.",
		primary: "reconnect",
	},
	healthy: {
		title: "ChatGPT can use Tabot",
		body: "Everything is working. Last checked just now.",
		primary: "diagnose",
	},
};

const rows = (
	state: ConnectionState,
): { label: string; status: RowStatus }[] => {
	const reached = state !== "checking" && state !== "extension-unreachable";
	const granted =
		reached && state !== "not-authorized" && state !== "auth-unknown";
	const relayUp = state === "healthy" || state === "round-trip-failed";
	return [
		{
			label:
				state === "checking"
					? "Checking your ChatGPT account connection…"
					: !reached
						? "ChatGPT account connection not checked"
						: state === "not-authorized"
							? "ChatGPT isn’t connected to your account"
							: state === "auth-unknown"
								? "Couldn’t verify your ChatGPT account connection"
								: "Your ChatGPT account is connected to Tabot",
			status:
				state === "checking"
					? "pending"
					: !reached
						? "skipped"
						: state === "not-authorized"
							? "fail"
							: state === "auth-unknown"
								? "unknown"
								: "ok",
		},
		{
			label:
				state === "checking"
					? "Checking if Tabot is reachable from ChatGPT…"
					: !granted
						? "Tabot availability not checked yet"
						: state === "healthy"
							? "Tabot is reachable from ChatGPT"
							: state === "relay-connecting"
								? "Tabot is reconnecting to ChatGPT"
								: state === "round-trip-failed"
									? "ChatGPT can’t get a reply from Tabot"
									: "Tabot can’t reach ChatGPT right now",
			status:
				state === "checking"
					? "pending"
					: !granted
						? "skipped"
						: relayUp
							? "ok"
							: state === "relay-connecting"
								? "pending"
								: "fail",
		},
		{
			label:
				state === "checking"
					? "Checking whether Tabot responds to ChatGPT…"
					: state === "healthy"
						? "Tabot responds to ChatGPT"
						: state === "round-trip-failed"
							? "ChatGPT didn’t get a reply from Tabot"
							: "ChatGPT response check not run yet",
			status:
				state === "checking"
					? "pending"
					: state === "healthy"
						? "ok"
						: state === "round-trip-failed"
							? "fail"
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
								? "Set up in ChatGPT"
								: "Ask ChatGPT to test"}
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
							{reconnecting ? "Reconnecting…" : "Try reconnecting"}
						</button>
					)}
					{primary === "extensions" && (
						<button
							type="button"
							onClick={onCopyExtensionsLink}
							className={PRIMARY}
						>
							Copy Chrome extensions address
						</button>
					)}
					<button
						type="button"
						onClick={onCheckConnection}
						className={primary === "recheck" ? PRIMARY : SECONDARY}
					>
						<RefreshCw aria-hidden="true" className="size-4" /> Check connection
					</button>
					{state === "not-authorized" && (
						<button
							type="button"
							onClick={onShowInstructions}
							className={`${BUTTON} text-work-ink hover:bg-work-raised`}
						>
							Review setup steps
						</button>
					)}
					{state === "auth-unknown" && (
						<a
							href={diagnoseUrl}
							target="_blank"
							rel="noopener noreferrer"
							className={`${BUTTON} text-work-ink hover:bg-work-raised`}
						>
							Ask ChatGPT to diagnose
							<span className="sr-only">(opens in a new tab)</span>
						</a>
					)}
				</div>
				{state === "healthy" && (
					<p className="text-sm leading-6 text-work-muted">
						To disconnect, remove Tabot from ChatGPT Settings → Apps.
					</p>
				)}
			</div>
		</section>
	);
};
