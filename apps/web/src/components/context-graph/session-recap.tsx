import {
	ArrowUpRight,
	Compass,
	Flag,
	PanelsTopLeft,
	Puzzle,
	X,
} from "lucide-react";
import {
	type KeyboardEventHandler,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
} from "react";
import { SessionDate } from "~/components/context-graph/session-date";
import { SessionTime } from "~/components/context-graph/session-time";
import type { SessionSummary } from "~/lib/context-graph-data";
import { sessionSiteLabel } from "~/lib/context-graph-data";
import { formatDuration } from "~/lib/home-data";

const keepSessionFocus: KeyboardEventHandler<HTMLDialogElement> = (event) => {
	if (event.key !== "Tab") return;
	const controls = [
		...event.currentTarget.querySelectorAll<HTMLElement>(
			"button, a[href], summary",
		),
	].filter((element) => element.getClientRects().length > 0);
	const first = controls[0];
	const last = controls.at(-1);
	const active = event.currentTarget.ownerDocument.activeElement;
	if (
		(event.shiftKey && active === first) ||
		(!event.shiftKey && active === last)
	) {
		event.preventDefault();
		(event.shiftKey ? last : first)?.focus();
	}
};

export const SessionRecap = ({
	session,
	onClose,
}: {
	session: SessionSummary;
	onClose: () => void;
}) => {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const onCloseRef = useRef(onClose);
	const titleId = useId();
	const sites = session.domains.filter((site) => site.kind === "site");
	const browserSources = session.domains.filter((site) => site.kind !== "site");

	useLayoutEffect(() => {
		onCloseRef.current = onClose;
	}, [onClose]);
	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		const previousFocus = dialog.ownerDocument.activeElement;
		const close = () => onCloseRef.current();
		dialog.showModal(); // Native top layer, focus containment, inert background and Escape.
		window.addEventListener("popstate", close);
		return () => {
			window.removeEventListener("popstate", close);
			dialog.close();
			if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
				previousFocus.focus({ preventScroll: true });
		};
	}, []);

	return (
		<dialog
			ref={dialogRef}
			aria-labelledby={titleId}
			className="session-recap session-dialog"
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
			onKeyDown={keepSessionFocus}
			onPointerDown={(event) => {
				if (event.target !== event.currentTarget) return;
				const bounds = event.currentTarget.getBoundingClientRect();
				if (
					event.clientX < bounds.left ||
					event.clientX > bounds.right ||
					event.clientY < bounds.top ||
					event.clientY > bounds.bottom
				) {
					onClose();
				}
			}}
		>
			<header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--session-line)] px-5 py-5 sm:px-8 sm:py-6">
				<div className="min-w-0">
					<h2
						id={titleId}
						className="flex items-center gap-3 text-2xl font-semibold tracking-tight sm:text-3xl"
					>
						<Compass
							aria-hidden="true"
							className="size-6 shrink-0 text-[var(--session-accent)]"
						/>
						Session recap
					</h2>
					<p className="mt-2 text-sm leading-6 text-[var(--session-muted)]">
						<SessionDate timestamp={session.startTimestamp} /> ·{" "}
						<SessionTime
							timestamp={session.startTimestamp}
							day={session.startTimestamp}
						/>
						{" — "}
						<SessionTime
							timestamp={session.endTimestamp}
							day={session.startTimestamp}
						/>
					</p>
				</div>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close session recap"
					className="flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--session-muted)] transition-colors hover:bg-[var(--session-raised)] hover:text-[var(--session-ink)] motion-reduce:transition-none"
				>
					<X aria-hidden="true" className="size-5" />
				</button>
			</header>
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8">
				<dl className="grid grid-cols-3 divide-x divide-[var(--session-line)] border-b border-[var(--session-line)] pb-6 text-center">
					<div className="px-2">
						<dt className="text-xs text-[var(--session-muted)] sm:text-sm">
							Time in Chrome
						</dt>
						<dd className="mt-2 text-lg font-semibold tabular-nums sm:text-2xl">
							{formatDuration(session.duration)}
						</dd>
					</div>
					<div className="px-2">
						<dt className="text-xs text-[var(--session-muted)] sm:text-sm">
							Tabs used
						</dt>
						<dd className="mt-2 text-lg font-semibold tabular-nums sm:text-2xl">
							{session.tabCount}
						</dd>
					</div>
					<div className="px-2">
						<dt className="text-xs text-[var(--session-muted)] sm:text-sm">
							Websites
						</dt>
						<dd className="mt-2 text-lg font-semibold tabular-nums text-[var(--session-accent)] sm:text-2xl">
							{sites.length}
						</dd>
					</div>
				</dl>
				<div className="mt-6 flex flex-wrap items-center justify-between gap-3">
					<h3 className="text-lg font-semibold">Exploration trail</h3>
					{sites.length > 0 && (
						<span className="inline-flex items-center gap-2 rounded-full bg-[var(--session-raised)] px-3 py-1 text-xs font-medium text-[var(--session-accent)]">
							<Flag aria-hidden="true" className="size-3.5" />
							{sites.length} {sites.length === 1 ? "checkpoint" : "checkpoints"}{" "}
							recorded
						</span>
					)}
				</div>
				{sites.length === 0 ? (
					<p className="py-8 text-sm text-[var(--session-muted)]">
						{session.domains.length === 0
							? "No sites recorded for this session."
							: "No websites recorded. Browser and other sources are below."}
					</p>
				) : (
					<ol
						aria-label="Website observations"
						className="mt-6 ml-4 border-l border-[var(--session-line)]"
					>
						{sites.map((site, index) => (
							<li key={site.domain} className="relative pb-6 pl-8 last:pb-0">
								<span
									aria-hidden="true"
									className="absolute -left-4 flex size-8 items-center justify-center rounded-full border border-[var(--session-line)] bg-[var(--session-raised)] text-sm font-semibold text-[var(--session-accent)]"
								>
									{sessionSiteLabel(site).charAt(0).toUpperCase()}
								</span>
								<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
									<h4 className="min-w-0 break-all text-base font-medium">
										{sessionSiteLabel(site)}
									</h4>
									<span className="text-xs tabular-nums text-[var(--session-muted)]">
										Checkpoint {index + 1}
									</span>
								</div>
								<p className="mt-1 text-sm leading-6 text-[var(--session-muted)]">
									First seen{" "}
									<SessionTime
										timestamp={site.firstSeen}
										day={session.startTimestamp}
									/>
									{site.lastSeen !== site.firstSeen && (
										<>
											{" · Last seen "}
											<SessionTime
												timestamp={site.lastSeen}
												day={session.startTimestamp}
											/>
										</>
									)}
								</p>
							</li>
						))}
					</ol>
				)}
				{browserSources.length > 0 && (
					<details className="mt-6 border-t border-[var(--session-line)] pt-3">
						<summary className="min-h-11 cursor-pointer py-3 text-sm text-[var(--session-muted)]">
							Browser &amp; other pages ({browserSources.length})
						</summary>
						<ul className="mt-2 space-y-3 pb-3">
							{browserSources.map((site) => (
								<li
									key={site.domain}
									className="flex items-start gap-3 text-sm leading-6"
								>
									{site.kind === "extension" ? (
										<Puzzle
											aria-hidden="true"
											className="mt-1 size-4 shrink-0 text-[var(--session-muted)]"
										/>
									) : (
										<PanelsTopLeft
											aria-hidden="true"
											className="mt-1 size-4 shrink-0 text-[var(--session-muted)]"
										/>
									)}
									<div>
										<span className="font-medium">
											{sessionSiteLabel(site)}
										</span>
										<p className="text-[var(--session-muted)]">
											First seen{" "}
											<SessionTime
												timestamp={site.firstSeen}
												day={session.startTimestamp}
											/>
											{site.lastSeen !== site.firstSeen && (
												<>
													{" · Last seen "}
													<SessionTime
														timestamp={site.lastSeen}
														day={session.startTimestamp}
													/>
												</>
											)}
										</p>
									</div>
								</li>
							))}
						</ul>
					</details>
				)}
				{session.contexts.length > 0 && (
					<nav
						aria-label="Activities in this session"
						className="mt-6 border-t border-[var(--session-line)] pt-5"
					>
						<h3 className="text-base font-semibold">Related activities</h3>
						<div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
							{session.contexts.map((context) => (
								<a
									key={context.id}
									href={`${import.meta.env.BASE_URL}home?context=${encodeURIComponent(context.id)}`}
									onClick={onClose}
									className="inline-flex min-h-11 max-w-full items-center gap-2 py-2 text-sm font-medium text-[var(--session-accent)] underline underline-offset-4 hover:text-[var(--session-ink)]"
								>
									<span className="break-words">
										View {context.title} activity
									</span>
									<ArrowUpRight
										aria-hidden="true"
										className="size-4 shrink-0"
									/>
								</a>
							))}
						</div>
					</nav>
				)}
			</div>
		</dialog>
	);
};
