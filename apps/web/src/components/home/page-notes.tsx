import type { DashboardNoteResult } from "@tabot/shared/dashboard";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState } from "react";
import { dateLabel } from "~/components/home/reading-desk-utils";
import { useLibrary } from "~/components/home/use-library";
import { Button } from "~/components/ui/button";

type UpdateNote = (
	id: string,
	text: string,
) => Promise<{ id: string; text: string; updatedAt: number }>;

const EditablePageNote = ({
	note,
	onSave,
	onClose,
}: {
	note: DashboardNoteResult;
	onSave: UpdateNote;
	onClose: () => void;
}) => {
	const [draft, setDraft] = useState(note.text);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	return (
		<article className="flex flex-col gap-2 border-b border-border pb-4">
			<time
				dateTime={new Date(note.createdAt).toISOString()}
				className="text-xs text-muted-foreground"
			>
				{dateLabel(note.createdAt)}
			</time>
			{
				<form
					className="flex flex-col gap-2"
					onSubmit={async (event) => {
						event.preventDefault();
						if (saving || !draft.trim()) return;
						setSaving(true);
						setError("");
						try {
							await onSave(note.id, draft.trim());
							onClose();
						} catch {
							setError(
								"Couldn’t save note. Your edits are still here. Try again.",
							);
						} finally {
							setSaving(false);
						}
					}}
				>
					<label
						htmlFor={`page-note-${note.id}`}
						className="text-sm font-medium"
					>
						Edit note
					</label>
					<textarea
						id={`page-note-${note.id}`}
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						maxLength={4000}
						required
						rows={5}
						className="w-full resize-y rounded-lg border border-input bg-background p-3 text-sm leading-6 focus-visible:outline-2 focus-visible:outline-ring"
					/>
					<div className="flex flex-wrap gap-2">
						<Button type="submit" disabled={saving || !draft.trim()}>
							{saving ? "Saving…" : "Save note"}
						</Button>
						<Button
							type="button"
							variant="outline"
							disabled={saving}
							onClick={onClose}
						>
							Cancel
						</Button>
					</div>
					{error && (
						<p role="alert" className="text-sm text-destructive">
							{error}
						</p>
					)}
				</form>
			}
		</article>
	);
};

export const PageNotes = ({
	url,
	onUpdateNote,
}: {
	url: string;
	onUpdateNote: UpdateNote;
}) => {
	const { data, setData, loading, error, retry, loadMore } = useLibrary({
		level: "notes",
		url,
		limit: 20,
	});
	const [editing, setEditing] = useState<DashboardNoteResult | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const virtualizer = useVirtualizer({
		count: data.notes.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 180,
		overscan: 3,
		getItemKey: (index) => data.notes[index]?.id ?? index,
	});
	return (
		<section
			aria-label="Notes for this page"
			className="flex flex-col gap-3 border-t border-border pt-4"
		>
			<h3 className="text-base font-medium">
				Notes{" "}
				<span className="tabular-nums text-muted-foreground">{data.total}</span>
			</h3>
			{!loading && !error && !data.total && (
				<p className="text-sm text-muted-foreground">
					No notes saved for this page.
				</p>
			)}
			{editing && (
				<EditablePageNote
					key={editing.id}
					note={editing}
					onClose={() => setEditing(null)}
					onSave={async (id, text) => {
						const saved = await onUpdateNote(id, text);
						setData((previous) => ({
							...previous,
							notes: previous.notes.map((item) =>
								item.id === id ? { ...item, ...saved } : item,
							),
						}));
						return saved;
					}}
				/>
			)}
			{data.notes.length > 0 && (
				<div
					ref={scrollRef}
					onScroll={(event) => {
						const list = event.currentTarget;
						if (list.scrollHeight - list.scrollTop - list.clientHeight < 250)
							loadMore();
					}}
					className="relative max-h-[60svh] min-h-40 overflow-y-auto overscroll-y-contain"
					style={{ height: Math.min(480, virtualizer.getTotalSize()) }}
				>
					<div
						className="relative w-full"
						style={{ height: virtualizer.getTotalSize() }}
					>
						{virtualizer.getVirtualItems().map((row) => {
							const note = data.notes[row.index];
							return (
								note && (
									<div
										key={row.key}
										ref={virtualizer.measureElement}
										data-index={row.index}
										className="absolute left-0 top-0 w-full pb-3 pr-2"
										style={{ transform: `translateY(${row.start}px)` }}
									>
										<article className="flex flex-col gap-2 border-b border-border pb-4">
											<time
												dateTime={new Date(note.createdAt).toISOString()}
												className="text-xs text-muted-foreground"
											>
												{dateLabel(note.createdAt)}
											</time>
											<p className="whitespace-pre-wrap wrap-break-word text-sm leading-6">
												{note.text}
											</p>
											<Button
												variant="ghost"
												className="self-start"
												disabled={editing !== null}
												onClick={() => setEditing(note)}
											>
												Edit note
											</Button>
										</article>
									</div>
								)
							);
						})}
					</div>
				</div>
			)}
			{loading && (
				<p role="status" className="text-sm text-muted-foreground">
					Loading notes…
				</p>
			)}
			{error && (
				<div role="alert">
					<p className="text-sm text-destructive">{error}</p>
					<Button variant="outline" onClick={retry}>
						Retry notes
					</Button>
				</div>
			)}
			{data.hasMore && !error && (
				<Button variant="outline" disabled={loading} onClick={loadMore}>
					Load more notes
				</Button>
			)}
		</section>
	);
};
