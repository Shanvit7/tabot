import logo from "data-base64:~assets/icon.png";
import { createTrackingClient } from "@tabot/shared/tracking";
import { Globe2, Pause, Play, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import "./popup.tailwind.css";

const MAX_NOTE_LENGTH = 4_000;
const trackingClient = createTrackingClient((message) =>
	chrome.runtime.sendMessage(message),
);
type Note = { id: string; text: string; createdAt: number; updatedAt: number };
type SearchNote = Pick<Note, "id" | "text" | "createdAt"> & {
	title: string | null;
	host: string;
	url: string | null;
};
type Page = {
	eligible: boolean;
	reason?: string;
	tabId: number;
	pageKey: string;
	title: string | null;
	favicon?: string | null;
	url: string;
	origin: string;
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
	const [query, setQuery] = useState("");
	const [searchRevision, setSearchRevision] = useState(0);
	const [searchResult, setSearchResult] = useState<{
		query: string;
		revision: number;
		notes: SearchNote[];
		error: boolean;
	} | null>(null);
	const searchQuery = query.trim();
	const searchOrigin = page?.eligible ? page.origin : "";
	const searching =
		Boolean(searchQuery && searchOrigin) &&
		(searchResult?.query !== searchQuery ||
			searchResult.revision !== searchRevision);

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

	useEffect(() => {
		if (!searchQuery || !searchOrigin) return;
		let cancelled = false;
		const timer = window.setTimeout(async () => {
			try {
				const result = await chrome.runtime.sendMessage({
					type: "SEARCH_NOTES",
					query: searchQuery,
					origin: searchOrigin,
				});
				if (!Array.isArray(result?.notes)) throw new Error("search-failed");
				if (!cancelled)
					setSearchResult({
						query: searchQuery,
						revision: searchRevision,
						notes: result.notes,
						error: false,
					});
			} catch {
				if (!cancelled)
					setSearchResult({
						query: searchQuery,
						revision: searchRevision,
						notes: [],
						error: true,
					});
			}
		}, 250);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [searchOrigin, searchQuery, searchRevision]);

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
			setSearchRevision((revision) => revision + 1);
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
			if (result?.deleted) {
				setPage({
					...page,
					notes: page.notes.filter((note) => note.id !== id),
				});
				setSearchRevision((revision) => revision + 1);
			} else setError("Could not delete note.");
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
						<p className="text-sm font-semibold leading-5">Tabot</p>
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
					className="flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-line bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-raised disabled:opacity-50"
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
				<section className="px-4 pb-3 pt-4" aria-label="Current page">
					{loading ? (
						<p className="text-sm text-muted">Checking this page…</p>
					) : page?.eligible ? (
						<div className="flex min-w-0 items-center gap-3">
							{page.favicon ? (
								<img
									src={page.favicon}
									alt=""
									aria-hidden="true"
									className="size-8 shrink-0 rounded-md border border-line bg-surface p-1.5 object-contain"
								/>
							) : (
								<Globe2
									aria-hidden="true"
									className="size-8 shrink-0 rounded-md border border-line bg-surface p-1.5 text-muted"
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
				{page?.eligible && (
					<section className="px-4 pt-4" aria-label="Site notes">
						<div className="mb-2 flex items-center justify-between">
							<h2 className="text-sm font-semibold">Notes</h2>
							<span className="rounded-md bg-surface px-2 py-0.5 text-xs font-medium tabular-nums text-muted">
								{searchQuery
									? (searchResult?.notes.length ?? 0)
									: page.notes.length}
							</span>
						</div>
						<label htmlFor="search-notes" className="sr-only">
							Search notes on this site
						</label>
						<div className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 focus-within:border-ink focus-within:bg-white">
							<Search
								aria-hidden="true"
								className="size-4 shrink-0 text-muted"
							/>
							<input
								id="search-notes"
								type="search"
								placeholder="Search this site's notes"
								value={query}
								maxLength={200}
								onChange={(event) => {
									const value = event.target.value;
									if (value.trim() !== searchQuery) setSearchResult(null);
									setQuery(value);
								}}
								className="min-h-9 min-w-0 flex-1 text-sm outline-none placeholder:text-muted"
							/>
						</div>
						{searchQuery && (
							<div className="mt-3" aria-live="polite" aria-busy={searching}>
								{searching ? (
									<p className="py-2 text-sm text-muted">Searching notes…</p>
								) : searchResult?.error ? (
									<div className="flex items-center justify-between gap-3">
										<p role="alert" className="text-sm text-red-700">
											Could not search notes.
										</p>
										<button
											type="button"
											onClick={() =>
												setSearchRevision((revision) => revision + 1)
											}
											className="min-h-8 rounded-md px-2 text-xs font-semibold hover:bg-raised"
										>
											Retry
										</button>
									</div>
								) : searchResult?.notes.length ? (
									<>
										<p className="text-xs text-muted">
											{searchResult.notes.length === 20
												? "Showing up to 20 matches"
												: `${searchResult.notes.length} ${searchResult.notes.length === 1 ? "match" : "matches"}`}
										</p>
										<ul>
											{searchResult.notes.map((note) => (
												<li
													key={note.id}
													className="border-b border-line py-3 last:border-b-0"
												>
													<p className="whitespace-pre-wrap break-words text-sm leading-5">
														{note.text}
													</p>
													<div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted">
														{note.url ? (
															<a
																href={note.url}
																target="_blank"
																rel="noreferrer"
																className="min-w-0 break-all font-semibold text-ink underline underline-offset-2"
															>
																{note.title || note.host}
															</a>
														) : (
															<span className="break-all">
																{note.title || note.host}
															</span>
														)}
														<span>{relativeTime(note.createdAt)}</span>
													</div>
												</li>
											))}
										</ul>
									</>
								) : (
									<p className="py-2 text-sm text-muted">
										No notes match your search.
									</p>
								)}
							</div>
						)}
					</section>
				)}
				<section className="px-4 pb-4 pt-2" aria-label="Current page notes">
					{loading ? (
						<p className="py-3 text-sm text-muted">Loading notes…</p>
					) : !searchQuery && page?.eligible && page.notes.length === 0 ? (
						<p className="pt-2 text-sm text-muted">
							No notes on this page yet.
						</p>
					) : null}
					<div>
						{!searchQuery &&
							page?.notes.map((note) => (
								<article
									key={note.id}
									className="border-b border-line py-3 last:border-b-0"
								>
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
									<div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 text-xs text-muted">
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
														className="min-h-8 rounded-md px-2 font-semibold text-ink hover:bg-raised"
													>
														Save
													</button>
													<button
														type="button"
														onClick={() => {
															setEditingId(null);
															setDraft("");
														}}
														className="min-h-8 rounded-md px-2 font-semibold text-ink hover:bg-raised"
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
													className="min-h-8 rounded-md px-2 font-semibold text-ink hover:bg-raised"
												>
													Edit
												</button>
											)}
											<button
												type="button"
												onClick={() => void deleteNote(note.id)}
												aria-label="Delete note"
												className="grid size-8 place-items-center rounded-md text-muted hover:bg-raised hover:text-ink"
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
					<section className="px-4 pb-4 pt-4">
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
							className="block min-h-20 w-full resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm leading-5 outline-none placeholder:text-muted focus:border-ink"
						/>
						<div className="mt-2 flex items-center justify-between gap-3">
							<span className="text-xs text-muted">
								{draft.length}/{MAX_NOTE_LENGTH}
							</span>
							<button
								type="button"
								onClick={() => void saveNote()}
								disabled={saving || !draft.trim()}
								className="min-h-8 shrink-0 rounded-md bg-ink px-3 py-1 text-xs font-semibold text-white hover:bg-muted disabled:opacity-40"
							>
								{saving ? "Saving…" : "Save note"}
							</button>
						</div>
					</section>
				)}
			</main>
		</div>
	);
}
