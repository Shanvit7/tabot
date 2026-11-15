import type {
	DashboardNoteResult,
	HistorySearchResult,
} from "@tabot/shared/dashboard";
import { Check, Pencil, X } from "lucide-react";
import { PageFavicon } from "~/components/features/home/library/page-favicon";
import { PageNotes } from "~/components/features/home/library/page-notes";
import { PageReader } from "~/components/features/home/library/page-reader";
import { dateLabel, urlLabel } from "~/components/features/home/search/utils";
import { Button } from "~/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "~/components/ui/sheet";

export type ActiveSearchResult =
	| { type: "page"; item: HistorySearchResult }
	| { type: "note"; item: DashboardNoteResult }
	| null;

export const SearchResultSheet = ({
	active,
	setActive,
	editingNote,
	setEditingNote,
	draft,
	setDraft,
	savingNote,
	setSavingNote,
	saveError,
	setSaveError,
	onUpdateNote,
}: {
	active: ActiveSearchResult;
	setActive: (active: ActiveSearchResult) => void;
	editingNote: boolean;
	setEditingNote: (editing: boolean) => void;
	draft: string;
	setDraft: (draft: string) => void;
	savingNote: boolean;
	setSavingNote: (saving: boolean) => void;
	saveError: string;
	setSaveError: (error: string) => void;
	onUpdateNote: (
		id: string,
		text: string,
	) => Promise<{ id: string; text: string; updatedAt: number }>;
}) => (
	<Sheet
		open={active !== null}
		onOpenChange={(open) => !open && setActive(null)}
	>
		<SheetContent
			side="right"
			className="w-full overflow-y-auto sm:w-[min(42rem,80vw)] sm:max-w-none"
		>
			{active && (
				<>
					<SheetHeader className="border-b border-border px-5 py-5 pr-14">
						<div className="flex min-w-0 items-center gap-3">
							<PageFavicon page={active.item} />
							<SheetTitle className="wrap-break-word">
								<a
									href={active.item.url}
									target="_blank"
									rel="noreferrer"
									className="underline underline-offset-4 hover:decoration-2 focus-visible:decoration-2"
								>
									{active.type === "page"
										? urlLabel(active.item)
										: (active.item.title ?? active.item.host)}
								</a>
							</SheetTitle>
						</div>
						<SheetDescription className="break-all">
							{active.item.host} ·{" "}
							{dateLabel(
								active.type === "page"
									? active.item.lastSeen
									: active.item.updatedAt,
							)}
						</SheetDescription>
					</SheetHeader>
					<div className="flex flex-col gap-5 overflow-y-auto px-5 pb-6">
						{active.type === "page" ? (
							<>
								<PageReader
									key={`${active.item.url}-${active.item.sources[0]?.id}`}
									page={active.item}
								/>
								<PageNotes
									key={active.item.url}
									url={active.item.url}
									onUpdateNote={onUpdateNote}
								/>
							</>
						) : (
							<>
								{editingNote ? (
									/* react-doctor-disable-next-line react-doctor/no-prevent-default -- note save is a client-only extension write, not a server action. */
									<form
										className="flex flex-col gap-3"
										onSubmit={async (event) => {
											event.preventDefault();
											if (active.type !== "note" || savingNote) return;
											setSavingNote(true);
											setSaveError("");
											try {
												const updated = await onUpdateNote(
													active.item.id,
													draft.trim(),
												);
												setActive({
													type: "note",
													item: { ...active.item, ...updated },
												});
												setDraft(updated.text);
												setEditingNote(false);
											} catch {
												setSaveError(
													"Couldn’t save note. Check connection and try again.",
												);
											} finally {
												setSavingNote(false);
											}
										}}
									>
										<label
											htmlFor="note-editor"
											className="text-sm font-medium"
										>
											Edit note
										</label>
										<textarea
											id="note-editor"
											value={draft}
											onChange={(event) => setDraft(event.target.value)}
											maxLength={4000}
											rows={7}
											required
											className="min-h-40 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
										/>
										<div className="flex items-center justify-between gap-3">
											<p
												aria-live="polite"
												className="text-xs text-muted-foreground"
											>
												{draft.length}/4000
											</p>
											<div className="flex gap-2">
												<Button
													type="button"
													variant="outline"
													disabled={savingNote}
													onClick={() => {
														setEditingNote(false);
														setDraft(active.item.text);
														setSaveError("");
													}}
												>
													<X aria-hidden="true" /> Cancel
												</Button>
												<Button
													type="submit"
													disabled={
														savingNote ||
														!draft.trim() ||
														draft.trim() === active.item.text
													}
												>
													<Check aria-hidden="true" />{" "}
													{savingNote ? "Saving…" : "Save note"}
												</Button>
											</div>
										</div>
										{saveError && (
											<p role="alert" className="text-sm text-destructive">
												{saveError}
											</p>
										)}
									</form>
								) : (
									<div className="flex flex-col gap-3">
										<p className="whitespace-pre-wrap wrap-break-word text-sm leading-7">
											{active.item.text}
										</p>
										<Button
											variant="outline"
											onClick={() => {
												setDraft(active.item.text);
												setEditingNote(true);
											}}
										>
											<Pencil aria-hidden="true" /> Edit note
										</Button>
									</div>
								)}
								{active.item.title && (
									<p className="text-sm text-muted-foreground">
										Saved from: {active.item.title}
									</p>
								)}
							</>
						)}
					</div>
				</>
			)}
		</SheetContent>
	</Sheet>
);
