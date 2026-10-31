import logo from "data-base64:~assets/icon.png";
import { createTrackingClient } from "@tabot/shared/tracking";
import { Globe2, Pause, Play, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import "./popup.tailwind.css";

const HOME_URL =
	process.env.PLASMO_PUBLIC_HOME_URL ?? "https://shanvit7.github.io/tabot/home";
const MAX_NOTE_LENGTH = 4_000;
const trackingClient = createTrackingClient((message) =>
	chrome.runtime.sendMessage(message),
);
type Note = { id: string; text: string; createdAt: number; updatedAt: number };
type Page = {
	eligible: boolean;
	reason?: string;
	tabId: number;
	pageKey: string;
	title: string | null;
	favicon?: string | null;
	url: string;
	host: string;
	notes: Note[];
};

const relativeTime = (timestamp: number) =>
	new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(timestamp);

export default function Popup() {
	const [page, setPage] = useState<Page | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [draft, setDraft] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [tracking, setTracking] = useState<boolean | null>(null);
	const [trackingBusy, setTrackingBusy] = useState(false);
	const [trackingError, setTrackingError] = useState("");

	const loadPage = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const result = await chrome.runtime.sendMessage({
				type: "GET_ACTIVE_PAGE",
			});
			if (result?.ok === false)
				throw new Error(result.code ?? "Could not load notes.");
			setPage({ ...result, notes: result.notes ?? [] } as Page);
		} catch {
			setError("Could not load notes. Retry.");
		} finally {
			setLoading(false);
		}
	}, []);

	const loadTracking = useCallback(async () => {
		setTrackingError("");
		try {
			setTracking(await trackingClient.read());
		} catch {
			setTracking(null);
			setTrackingError("Tracking status unavailable.");
		}
	}, []);

	useEffect(() => {
		document.documentElement.lang = "en";
		void loadPage();
		void loadTracking();
	}, [loadPage, loadTracking]);

	const toggleTracking = async () => {
		if (tracking === null || trackingBusy) return;
		setTrackingError("");
		setTrackingBusy(true);
		try {
			setTracking(await trackingClient.set(!tracking));
		} catch {
			setTrackingError("Could not update tracking. Try again.");
		} finally {
			setTrackingBusy(false);
		}
	};

	const saveNote = async () => {
		if (!page?.eligible || !draft.trim() || saving) return;
		setSaving(true);
		setError("");
		try {
			const result = await chrome.runtime.sendMessage({
				type: "SAVE_NOTE",
				tabId: page.tabId,
				pageKey: page.pageKey,
				...(editingId ? { id: editingId } : {}),
				text: draft,
			});
			if (!result?.note) throw new Error(result?.code ?? "save-failed");
			setPage({
				...page,
				notes: [
					result.note,
					...page.notes.filter((note) => note.id !== result.note.id),
				].sort((a, b) => b.createdAt - a.createdAt),
			});
			setDraft("");
			setEditingId(null);
		} catch (reason) {
			const code = reason instanceof Error ? reason.message : "";
			setError(
				code === "page-changed"
					? "Page changed. Reload notes before saving."
					: code
						? `Could not save note (${code}). Your draft is still here.`
						: "Could not save note. Your draft is still here.",
			);
		} finally {
			setSaving(false);
		}
	};

	const deleteNote = async (id: string) => {
		if (!page || !window.confirm("Delete this note?")) return;
		try {
			const result = await chrome.runtime.sendMessage({
				type: "DELETE_NOTE",
				id,
			});
			if (result?.deleted)
				setPage({
					...page,
					notes: page.notes.filter((note) => note.id !== id),
				});
			else setError("Could not delete note.");
		} catch {
			setError("Could not delete note.");
		}
	};

	return (
		<div className="popup-shell w-full bg-canvas text-ink">
			<header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
				<div className="flex min-w-0 items-center gap-2.5">
					<img
						src={logo}
						alt="Tabot"
						width={26}
						height={26}
						className="size-[26px] shrink-0 object-contain"
					/>
					<div className="min-w-0">
						<p className="text-xs font-semibold">Tabot</p>
						<p
							role="status"
							aria-live="polite"
							className="flex items-center gap-1.5 text-xs text-muted"
						>
							<span
								aria-hidden="true"
								className={`size-2 rounded-full ${tracking === true ? "bg-lime-brand" : "bg-muted"}`}
							/>
							{tracking === null
								? "Checking tracking…"
								: tracking
									? "Tracking on"
									: "Tracking paused"}
						</p>
					</div>
				</div>
				<button
					type="button"
					onClick={() => void toggleTracking()}
					disabled={tracking === null || trackingBusy}
					aria-label={
						tracking === null
							? "Checking tracking status"
							: tracking
								? "Pause tracking"
								: "Resume tracking"
					}
					className="flex min-h-11 min-w-[92px] items-center justify-center gap-2 rounded-md bg-ink px-3 text-xs font-semibold text-white hover:bg-muted disabled:opacity-50"
				>
					{tracking === true ? (
						<Pause aria-hidden="true" className="size-4" />
					) : (
						<Play aria-hidden="true" className="size-4" />
					)}
					{trackingBusy
						? "Updating…"
						: tracking === null
							? "Checking…"
							: tracking
								? "Pause"
								: "Resume"}
				</button>
			</header>
			{trackingError && (
				<div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
					<p role="alert" className="text-xs text-red-700">
						{trackingError}
					</p>
					<button
						type="button"
						onClick={() => void loadTracking()}
						className="min-h-9 px-2 text-xs font-semibold text-ink underline underline-offset-2"
					>
						Retry
					</button>
				</div>
			)}
			<main className="max-h-[532px] overflow-y-auto">
				<section
					className="border-b border-line px-4 py-4"
					aria-label="Current page"
				>
					{loading ? (
						<p className="text-sm text-muted">Checking this page…</p>
					) : page?.eligible ? (
						<div className="flex min-w-0 items-center gap-3">
							{page.favicon ? (
								<img
									src={page.favicon}
									alt=""
									aria-hidden="true"
									className="size-7 shrink-0 rounded-sm object-contain"
								/>
							) : (
								<Globe2
									aria-hidden="true"
									className="size-6 shrink-0 text-muted"
								/>
							)}
							<div className="min-w-0">
								<h1 className="line-clamp-2 text-sm font-semibold leading-5">
									{page.title || page.host}
								</h1>
								<p className="mt-0.5 truncate text-xs text-muted">
									{page.host}
								</p>
							</div>
						</div>
					) : (
						<p className="text-sm text-muted">
							{page?.reason ?? "Could not load this page."}
						</p>
					)}
					{error && !page && (
						<button
							type="button"
							onClick={() => void loadPage()}
							className="mt-2 min-h-9 text-sm font-medium text-ink underline underline-offset-2"
						>
							{error} Retry
						</button>
					)}
				</section>
				<section className="px-4 pt-4" aria-label="Page notes">
					<div className="mb-2 flex items-center justify-between">
						<h2 className="text-sm font-semibold">Page notes</h2>
						<span className="min-w-7 rounded-full bg-raised px-2 py-0.5 text-center text-xs font-medium text-muted">
							{page?.notes.length ?? 0}
						</span>
					</div>
					{loading ? (
						<p className="py-3 text-sm text-muted">Loading notes…</p>
					) : page?.eligible && page.notes.length === 0 ? (
						<p className="py-2 text-sm text-muted">
							No notes saved on this page.
						</p>
					) : null}
					<div>
						{page?.notes.map((note) => (
							<article key={note.id} className="border-b border-line py-3">
								{editingId === note.id ? (
									<textarea
										aria-label="Edit note"
										value={draft}
										maxLength={MAX_NOTE_LENGTH}
										onChange={(event) => setDraft(event.target.value)}
										onKeyDown={(event) => {
											if (
												(event.metaKey || event.ctrlKey) &&
												event.key === "Enter"
											)
												void saveNote();
										}}
										className="min-h-20 w-full resize-y rounded-md border border-line bg-white p-2 text-sm outline-none focus:border-ink"
									/>
								) : (
									<p className="whitespace-pre-wrap break-words text-sm leading-5">
										{note.text}
									</p>
								)}
								<div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
									<span>
										{relativeTime(note.createdAt)}
										{note.updatedAt > note.createdAt ? " · edited" : ""}
									</span>
									<div className="flex items-center gap-1">
										{editingId === note.id ? (
											<>
												<button
													type="button"
													onClick={() => void saveNote()}
													disabled={saving || !draft.trim()}
													className="min-h-9 px-2 font-semibold text-ink"
												>
													Save
												</button>
												<button
													type="button"
													onClick={() => {
														setEditingId(null);
														setDraft("");
													}}
													className="min-h-9 px-2 font-semibold text-ink"
												>
													Cancel
												</button>
											</>
										) : (
											<button
												type="button"
												onClick={() => {
													setEditingId(note.id);
													setDraft(note.text);
												}}
												className="min-h-9 px-2 font-semibold text-ink"
											>
												Edit
											</button>
										)}
										<button
											type="button"
											onClick={() => void deleteNote(note.id)}
											aria-label="Delete note"
											className="grid size-9 place-items-center rounded-sm text-muted hover:bg-raised hover:text-ink"
										>
											<Trash2 aria-hidden="true" className="size-4" />
										</button>
									</div>
								</div>
							</article>
						))}
					</div>
					{error && page && (
						<p role="alert" className="py-2 text-xs text-red-700">
							{error}
						</p>
					)}
				</section>
				{page?.eligible && !editingId && (
					<section className="mt-2 border-t border-line px-4 py-4">
						<label
							htmlFor="page-note-draft"
							className="mb-2 block text-sm font-semibold"
						>
							Add a note
						</label>
						<textarea
							id="page-note-draft"
							placeholder="What do you want to remember?"
							value={draft}
							maxLength={MAX_NOTE_LENGTH}
							onChange={(event) => setDraft(event.target.value)}
							onKeyDown={(event) => {
								if ((event.metaKey || event.ctrlKey) && event.key === "Enter")
									void saveNote();
							}}
							className="min-h-20 w-full resize-y rounded-md border border-line bg-white p-3 text-sm leading-5 outline-none placeholder:text-muted/70 focus:border-ink focus:ring-2 focus:ring-lime-brand"
						/>
						<div className="mt-2 flex items-center justify-between gap-3">
							<span className="text-xs text-muted">
								{draft.length}/{MAX_NOTE_LENGTH} · ⌘/Ctrl + Enter to save
							</span>
							<button
								type="button"
								onClick={() => void saveNote()}
								disabled={saving || !draft.trim()}
								className="min-h-11 shrink-0 rounded-md bg-ink px-4 text-xs font-semibold text-white hover:bg-muted disabled:opacity-40"
							>
								{saving ? "Saving…" : "Save note"}
							</button>
						</div>
					</section>
				)}
				<a
					href={`${HOME_URL}?q=${encodeURIComponent(draft.trim())}`}
					target="_blank"
					rel="noreferrer"
					className="flex min-h-11 items-center justify-center gap-2 border-t border-line px-4 text-xs font-semibold text-muted hover:text-ink focus-visible:underline"
				>
					<Search aria-hidden="true" className="size-4" />
					Search notes on Home
				</a>
			</main>
		</div>
	);
}
