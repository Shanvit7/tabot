import logo from "data-base64:~assets/icon.png";
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import { derive, type StatsSnapshot, type StoredTabEvent } from "@tabot/shared";
import {
	ArrowRight,
	ChevronDown,
	Globe,
	History,
	Pause,
	Play,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
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

const Arrow = () => (
	<ArrowRight
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
	const previousVisit = useRef<Promise<number | null> | null>(null);

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

						{featured ? (
							<section
								aria-label="Recent browser activity"
								className="mt-5 rounded-xl bg-trace p-4 text-trace-text"
							>
								<h2 className="min-w-0 truncate text-base font-medium">
									{siteLabel(featured.primaryDomain)}
								</h2>
								<ActivitySites context={featured} favicons={summary.favicons} />
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
					<span>Recorded on this device. You choose what to share.</span>
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
