import { ArrowUpRight } from "lucide-react";
import type { ReadingDeskSearchState } from "~/components/home/reading-desk-state";
import {
	actionClass,
	dateLabel,
	timeLabel,
} from "~/components/home/reading-desk-utils";

export const SearchNoteCards = ({
	notes,
}: {
	notes: ReadingDeskSearchState["notes"];
}) =>
	notes.length > 0 && (
		<section aria-label="Matching notes" className="mb-8">
			<h2 className="mb-3 text-lg font-medium">Notes</h2>
			<ul className="grid gap-3 sm:grid-cols-2">
				{notes.map((note) => (
					<li key={note.id} className="rounded-xl border border-border p-4">
						<p className="whitespace-pre-wrap text-sm leading-6">{note.text}</p>
						<p className="mt-3 text-xs text-muted-foreground">
							{note.host} · {note.title ?? "Saved page"} ·{" "}
							{dateLabel(note.createdAt)}
							{note.session
								? ` · Session ${timeLabel(note.session.start)}–${timeLabel(note.session.end)} UTC`
								: " · No recorded session"}
						</p>
						<a
							href={note.url}
							target="_blank"
							rel="noreferrer"
							className={actionClass}
						>
							Open page <ArrowUpRight aria-hidden="true" className="size-4" />
						</a>
					</li>
				))}
			</ul>
		</section>
	);
