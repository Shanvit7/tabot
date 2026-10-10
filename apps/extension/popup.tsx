import logo from "data-base64:~assets/icon.png";
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import {
	chatGptContextUrl,
	derive,
	type StatsSnapshot,
	type StoredTabEvent,
} from "@tabot/shared";
import {
	ChevronDown,
	ChevronRight,
	Globe,
	History,
	Pause,
	Play,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	contextDuration,
	contextHomeUrl,
	type PopupSummary,
	parseAssistantConnection,
	popupSummary,
	siteFavicon,
	siteLabel,
} from "~/popup-model";
import "./popup.tailwind.css";

const HOME_URL =
	process.env.PLASMO_PUBLIC_HOME_URL ?? "https://shanvit7.github.io/tabot/home";
const LAST_VIEWED_KEY = "tabot_popup_last_viewed_v1";
const CHATGPT_URL = "https://chatgpt.com/plugins?search=Tabot";
const NOTIFICATION_PREVIEWS = [
	{
		title: "Activity summary ready",
		message: "3 sites · 24 min. Ask ChatGPT to explore this thread.",
		button: "Connect ChatGPT",
	},
	{
		title: "Activity summary ready",
		message: "3 sites · 24 min. Ask ChatGPT to explore this thread.",
		button: "Ask ChatGPT",
	},
	{
		title: "Activity worth a look",
		message: "3 sites · 24 min. Ask ChatGPT to explore this thread.",
		button: "Connect ChatGPT",
	},
	{
		title: "Activity worth a look",
		message: "3 sites · 24 min. Ask ChatGPT to explore this thread.",
		button: "Ask ChatGPT",
	},
	{
		title: "A browsing pattern is repeating",
		message:
			"Similar activity appeared 4 times across separate periods. Ask ChatGPT what repeats.",
		button: "Connect ChatGPT",
	},
	{
		title: "A browsing pattern is repeating",
		message:
			"Similar activity appeared 4 times across separate periods. Ask ChatGPT what repeats.",
		button: "Ask ChatGPT",
	},
] as const;

const Arrow = () => (
	<ChevronRight
		aria-hidden="true"
		strokeWidth={1.5}
		className="size-4 shrink-0"
	/>
);

const SiteIcon = ({
	domain,
	favicons,
}: {
	domain: string;
	favicons: PopupSummary["favicons"];
}) => {
	const src = siteFavicon(domain, favicons);
	const [failedSrc, setFailedSrc] = useState<string | null>(null);
	return (
		<span
			aria-hidden="true"
			className="flex size-6 shrink-0 items-center justify-center rounded-md bg-canvas text-muted"
		>
			{src && failedSrc !== src ? (
				<img
					src={src}
					alt=""
					width={16}
					height={16}
					referrerPolicy="no-referrer"
					onError={() => setFailedSrc(src)}
					className="size-4 object-contain"
				/>
			) : (
				<Globe aria-hidden="true" strokeWidth={1.5} className="size-4" />
			)}
		</span>
	);
};

const ActivitySites = ({
	context,
	favicons,
}: {
	context: NonNullable<PopupSummary["featured"]>;
	favicons: PopupSummary["favicons"];
}) => {
	const allSites = context.domains.toSorted(
		(a, b) => b.eventCount - a.eventCount,
	);
	const sites = allSites.slice(0, 3);
	return (
		<div>
			<div className="relative mt-4 grid grid-cols-[minmax(0,1fr)_56px] items-center gap-6">
				<svg
					aria-hidden="true"
					viewBox="0 0 100 100"
					preserveAspectRatio="none"
					className="pointer-events-none absolute inset-0 h-full w-full text-trace-line"
				>
					{sites.map((site, index) => {
						const y = ((index + 0.5) / sites.length) * 100;
						return (
							<path
								key={site.domain}
								d={`M60 ${y} C76 ${y} 70 50 90 50`}
								fill="none"
								stroke="currentColor"
								strokeWidth="0.5"
							/>
						);
					})}
				</svg>
				<ul
					aria-label="Sites in this activity"
					className="relative min-w-0 space-y-2"
				>
					{sites.map((site) => (
						<li
							key={site.domain}
							className="flex h-10 min-w-0 items-center gap-2 rounded-md bg-trace-raised px-2 text-xs text-trace-text"
						>
							<SiteIcon domain={site.domain} favicons={favicons} />
							<span className="min-w-0 truncate">{siteLabel(site.domain)}</span>
						</li>
					))}
				</ul>
				<div className="relative flex size-14 flex-col items-center justify-center gap-1 rounded-xl border border-trace-line bg-trace-raised text-trace-text">
					<History
						aria-hidden="true"
						strokeWidth={1.5}
						className="size-5 shrink-0 text-lime-brand"
					/>
					<span className="text-xs font-medium">Activity</span>
				</div>
			</div>
			<details className="popup-sites mt-2">
				<summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-md px-1 text-xs text-trace-text">
					<span>View all sites</span>
					<ChevronDown
						aria-hidden="true"
						strokeWidth={1.5}
						className="size-4 shrink-0"
					/>
				</summary>
				<ul
					aria-label="All sites in this activity"
					className="space-y-2 rounded-md bg-trace-raised p-2"
				>
					{allSites.map((site) => (
						<li
							key={site.domain}
							className="flex min-w-0 items-center gap-2 text-xs leading-5 text-trace-text"
						>
							<SiteIcon domain={site.domain} favicons={favicons} />
							<span className="min-w-0 wrap-anywhere">
								{siteLabel(site.domain)}
							</span>
						</li>
					))}
				</ul>
			</details>
		</div>
	);
};

const IndexPopup = () => {
	const [summary, setSummary] = useState<PopupSummary | null>(null);
	const [tracking, setTracking] = useState<boolean | null>(null);
	const [assistantConnected, setAssistantConnected] = useState<boolean | null>(
		null,
	);
	const [toggling, setToggling] = useState(false);
	const [dropped, setDropped] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [attempt, setAttempt] = useState(0);
	const [notificationPreview, setNotificationPreview] = useState<number | null>(
		null,
	);
	const previousVisit = useRef<Promise<number | null> | null>(null);

	useEffect(() => {
		if (
			process.env.NODE_ENV !== "development" ||
			process.env.PLASMO_PUBLIC_NOTIFICATION_PREVIEW !== "1"
		)
			return;
		let active = true;
		void chrome.storage.local
			.get("tabot_notification_preview_index")
			.then((stored) => {
				if (!active) return;
				const index = stored.tabot_notification_preview_index;
				setNotificationPreview(Number.isInteger(index) ? index : 0);
			});
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		let active = true;
		let timer: ReturnType<typeof setTimeout>;
		if (attempt > 0) setError(null);
		const refreshAssistantConnection = async () => {
			let connected: boolean | null = null;
			try {
				connected = parseAssistantConnection(
					await chrome.runtime.sendMessage({
						type: "GET_ASSISTANT_CONNECTION",
					}),
				);
			} catch {
				// An unavailable relay is unknown, not disconnected.
			}
			if (active) setAssistantConnected(connected);
		};
		const start = async () => {
			previousVisit.current ??= (async () => {
				try {
					const stored = await chrome.storage.local.get(LAST_VIEWED_KEY);
					const value = stored[LAST_VIEWED_KEY];
					return typeof value === "number" &&
						Number.isFinite(value) &&
						value > 0 &&
						value <= Date.now()
						? value
						: null;
				} catch {
					// Context still works without a saved visit; do not invent an unread count.
					return null;
				}
			})();
			const lastViewed = await previousVisit.current;
			const refresh = async () => {
				// Optional network check must not delay loading local activity.
				void refreshAssistantConnection();
				try {
					const [events, status, stats] = await Promise.all([
						chrome.runtime.sendMessage({ type: "GET_EVENTS" }) as Promise<
							StoredTabEvent[]
						>,
						chrome.runtime.sendMessage({ type: "GET_TRACKING" }) as Promise<{
							enabled: boolean;
						}>,
						chrome.runtime.sendMessage({
							type: "GET_STATS",
						}) as Promise<StatsSnapshot>,
					]);
					if (!active) return;
					if (
						!Array.isArray(events) ||
						typeof status?.enabled !== "boolean" ||
						!stats
					)
						throw new Error("Unavailable");
					const now = Date.now();
					// Keep full derivation so context IDs match dashboard; never derive a sliced export.
					setSummary(popupSummary(derive(events), lastViewed, now));
					setTracking(status.enabled);
					setDropped(stats.droppedEvents);
					setError(null);
					try {
						await chrome.storage.local.set({ [LAST_VIEWED_KEY]: now });
					} catch {
						// Visit tracking is optional; capture and context remain unaffected.
					}
				} catch {
					if (active) setError("Could not load your activity. Try again.");
				} finally {
					if (active) timer = setTimeout(refresh, 10_000);
				}
			};
			if (active) await refresh();
		};
		void start();
		return () => {
			active = false;
			clearTimeout(timer);
		};
	}, [attempt]);

	const toggleTracking = async () => {
		if (tracking === null || toggling) return;
		setToggling(true);
		try {
			const response = await chrome.runtime.sendMessage({
				type: "SET_TRACKING",
				enabled: !tracking,
			});
			if (
				typeof response?.enabled !== "boolean" ||
				response.enabled === tracking
			)
				throw new Error("Not saved");
			setTracking(response.enabled);
		} catch {
			setError("Could not save your preference. Try again.");
		} finally {
			setToggling(false);
		}
	};

	const openTabot = async (contextId?: string) => {
		try {
			await chrome.tabs.create({ url: contextHomeUrl(HOME_URL, contextId) });
			window.close();
		} catch {
			setError("Could not open Tabot. Try again.");
		}
	};

	const featured = summary?.featured;
	const paused = tracking === false;
	const TrackingIcon = paused ? Play : Pause;
	return (
		<div className="popup-shell flex max-h-150 w-100 max-w-full flex-col overflow-hidden bg-canvas font-sans text-ink">
			<header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
				<div className="flex items-center gap-2.5">
					<img
						src={logo}
						alt=""
						width={32}
						height={32}
						className="size-8 rounded-lg"
					/>
					<span className="text-lg font-semibold tracking-tight">Tabot</span>
				</div>
				<div className="flex items-center gap-2">
					<span
						className={`flex h-11 w-26 shrink-0 items-center justify-center gap-2 rounded-md px-2 text-xs font-medium ${paused || tracking === null ? "bg-surface text-muted" : "bg-trace text-trace-text"}`}
					>
						<span
							aria-hidden="true"
							className={`size-2 shrink-0 rounded-full ${paused || tracking === null ? "bg-muted" : "popup-observing bg-lime-brand"}`}
						/>
						{tracking === null ? "Loading" : paused ? "Paused" : "Observing"}
					</span>
					<button
						type="button"
						onClick={toggleTracking}
						disabled={tracking === null || toggling}
						aria-pressed={paused}
						aria-label={paused ? "Resume observing" : "Pause observing"}
						className="popup-quiet flex h-11 w-26 shrink-0 items-center justify-center gap-1.5 border border-line px-2 text-xs"
					>
						<TrackingIcon
							aria-hidden="true"
							strokeWidth={1.5}
							className="size-3.5 shrink-0"
						/>
						{toggling ? "Updating…" : paused ? "Resume" : "Pause"}
					</button>
				</div>
			</header>

			<main
				className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-4"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to focus the popup's only scroll region.
				tabIndex={0}
				aria-label="Browser activity"
				aria-busy={!summary && !error}
			>
				{notificationPreview !== null && (
					<aside
						aria-label={`Notification preview ${notificationPreview + 1} of ${NOTIFICATION_PREVIEWS.length}`}
						className="mb-4 rounded-xl border border-line bg-surface p-4 shadow-lg"
					>
						<div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
							<span
								aria-hidden="true"
								className="size-1.5 animate-pulse rounded-full bg-lime-brand"
							/>
							Auto preview · every 15 seconds
						</div>
						<div className="flex items-start gap-3">
							<img
								src={logo}
								alt=""
								width={32}
								height={32}
								className="size-8 rounded-lg"
							/>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-semibold">
									{NOTIFICATION_PREVIEWS[notificationPreview].title}
								</p>
								<p className="mt-1 text-xs leading-5 text-muted">
									{NOTIFICATION_PREVIEWS[notificationPreview].message}
								</p>
							</div>
							<button
								type="button"
								onClick={() => setNotificationPreview(null)}
								aria-label="Dismiss preview"
								className="popup-row px-2 text-xs"
							>
								×
							</button>
						</div>
						<div className="mt-3 flex justify-end">
							<span className="flex items-center gap-1.5 rounded-md border border-line bg-canvas px-3 py-2 text-xs">
								<OpenAIMono aria-hidden="true" className="size-3.5" />
								{NOTIFICATION_PREVIEWS[notificationPreview].button}
							</span>
						</div>
					</aside>
				)}
				{assistantConnected === false && (
					<aside
						aria-label="ChatGPT connection"
						className="mb-4 flex items-center gap-3 rounded-lg border border-line bg-surface p-3"
					>
						<OpenAIMono
							aria-hidden="true"
							className="size-5 shrink-0 text-ink"
						/>
						<div className="min-w-0 flex-1">
							<p className="text-sm font-medium">Connect ChatGPT</p>
							<p className="mt-0.5 text-xs leading-4 text-muted">
								Ask about your browsing.
							</p>
						</div>
						<a
							href={CHATGPT_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="popup-quiet flex min-h-11 shrink-0 items-center justify-center border border-line bg-canvas px-3 text-xs no-underline"
						>
							Connect
							<span className="sr-only"> ChatGPT (opens in a new tab)</span>
						</a>
					</aside>
				)}
				{error && (
					<div
						role="alert"
						className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-surface p-3 text-sm"
					>
						<p>{error}</p>
						<button
							type="button"
							onClick={() => setAttempt((value) => value + 1)}
							className="popup-quiet shrink-0 px-3"
						>
							Retry
						</button>
					</div>
				)}
				{!summary ? (
					<section className="min-h-64">
						<h1 className="text-2xl font-semibold tracking-tight">
							Loading your activity.
						</h1>
						<p role="status" className="mt-2 text-sm leading-6 text-muted">
							{error
								? "Your recorded activity is still on this device."
								: "Reading your browser activity from this device…"}
						</p>
					</section>
				) : (
					<>
						<h1 className="text-2xl font-semibold leading-tight tracking-tight text-balance">
							{paused ? "Tabot is paused." : "Your activity across tabs."}
						</h1>
						<p className="mt-2 text-sm leading-6 text-muted">
							{paused
								? "New browser activity is not being recorded. You can still review and share earlier activity."
								: "Tabot records the sites you visit and how you move between them."}
						</p>

						{!summary.ready && !paused && summary.sessions > 0 && (
							<section
								aria-label="Today's browsing progress"
								role="status"
								className="mt-4 rounded-lg border border-line bg-surface p-3"
							>
								<p className="text-xs text-muted">Today so far</p>
								<p className="mt-0.5 text-sm font-medium">
									{summary.sessions} browsing{" "}
									{summary.sessions === 1 ? "session" : "sessions"}
								</p>
								<p className="mt-1 text-xs leading-5 text-muted">
									Keep browsing normally. A summary appears once Tabot has
									enough browsing to summarize.
								</p>
							</section>
						)}

						{summary.updated > 0 && featured && (
							<section
								aria-label="New activity since your last visit"
								role="status"
								className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3"
							>
								<div>
									<p className="text-xs text-muted">Since your last visit</p>
									<p className="mt-0.5 text-sm font-medium">
										{summary.updated === 1
											? "1 new activity summary"
											: `${summary.updated} new activity summaries`}
									</p>
								</div>
								<button
									type="button"
									onClick={() => openTabot(featured.id)}
									className="popup-quiet flex min-h-11 shrink-0 items-center gap-2 border border-line bg-canvas px-3 text-xs font-medium"
								>
									Review
									<Arrow />
								</button>
							</section>
						)}

						{featured ? (
							<section
								aria-label="Featured browser activity"
								className="mt-5 rounded-xl bg-trace p-4 text-trace-text"
							>
								<h2 className="min-w-0 truncate text-base font-medium">
									{siteLabel(featured.primaryDomain)}
								</h2>
								<ActivitySites context={featured} favicons={summary.favicons} />
								{summary.ready && (
									<div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-trace-line pt-3">
										<div>
											<p className="text-sm font-medium">
												Activity summary ready
											</p>
											<p className="mt-0.5 text-xs leading-4 text-muted">
												{featured.domains.length} sites ·{" "}
												{contextDuration(featured.duration)}
											</p>
										</div>
										{assistantConnected === true ? (
											<a
												href={chatGptContextUrl(featured.id)}
												target="_blank"
												rel="noopener noreferrer"
												className="popup-quiet flex min-h-11 shrink-0 items-center border border-line bg-canvas px-3 text-xs font-medium no-underline"
											>
												Ask ChatGPT
											</a>
										) : assistantConnected === false ? (
											<a
												href={CHATGPT_URL}
												target="_blank"
												rel="noopener noreferrer"
												className="popup-quiet flex min-h-11 shrink-0 items-center border border-line bg-canvas px-3 text-xs font-medium no-underline"
											>
												Connect ChatGPT
											</a>
										) : (
											<span role="status" className="text-xs text-muted">
												Checking ChatGPT…
											</span>
										)}
									</div>
								)}
							</section>
						) : (
							<section
								aria-label="Getting started"
								className="mt-5 rounded-xl bg-surface p-5"
							>
								<h2 className="text-base font-medium">
									No recent activity to show.
								</h2>
								<p className="mt-2 text-sm leading-6 text-muted">
									{paused
										? "Choose Resume whenever you’re ready."
										: "Browse as usual. The connections between your visits will appear here."}
								</p>
							</section>
						)}

						{summary.recent.length > 0 && (
							<section aria-labelledby="recent-heading" className="mt-5">
								<h2 id="recent-heading" className="text-sm font-medium">
									Earlier activity
								</h2>
								<ul className="mt-2 divide-y divide-line">
									{summary.recent.map((context) => (
										<li key={context.id}>
											<button
												type="button"
												onClick={() => openTabot(context.id)}
												className="popup-row flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left"
											>
												<SiteIcon
													domain={context.primaryDomain}
													favicons={summary.favicons}
												/>
												<span className="min-w-0 flex-1">
													<span className="line-clamp-2 text-sm font-medium wrap-anywhere">
														{siteLabel(context.primaryDomain)}
													</span>
												</span>
												<Arrow />
											</button>
										</li>
									))}
								</ul>
							</section>
						)}
					</>
				)}
				{dropped > 0 && (
					<p role="status" className="mt-4 text-xs leading-5 text-muted">
						Some browser activity could not be recorded. Your earlier activity
						is still available.
					</p>
				)}
			</main>
			<footer className="shrink-0 border-t border-line px-5 py-3">
				<button
					type="button"
					onClick={() => openTabot(featured?.id)}
					className="popup-primary flex min-h-11 w-full items-center justify-between rounded-lg px-4 text-sm font-semibold"
				>
					{featured ? "Review activity" : "Open Tabot"}
					<Arrow />
				</button>
				<div className="mt-2 flex min-h-11 items-center justify-between gap-3 text-xs text-muted">
					<span>Stays on this device. Choose what to share.</span>
					{featured && (
						<button
							type="button"
							onClick={() => openTabot()}
							className="popup-row min-h-11 shrink-0 px-1 font-medium"
						>
							Open Tabot
						</button>
					)}
				</div>
			</footer>
		</div>
	);
};

export default IndexPopup;
