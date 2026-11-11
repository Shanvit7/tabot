import { getDomain } from "tldts";
import type { Session } from "../sessions/sessions";

export interface PageNote {
	id: string;
	text: string;
	createdAt: number;
	updatedAt: number;
	url: string;
	origin: string;
	host: string;
	site: string;
	title: string | null;
	favicon: string | null;
	pageKey: string;
	tabId: number;
	windowId: number;
	eventId: string | null;
}

export const deriveSiteDomain = (host: string): string =>
	getDomain(host, { allowPrivateDomains: true }) ?? host.toLowerCase();

export type NewPageNote = Omit<
	PageNote,
	"id" | "createdAt" | "updatedAt" | "eventId"
>;

export const sessionForNote = (
	note: PageNote,
	sessions: Session[],
): Session | undefined =>
	(note.eventId &&
		sessions.find((session) =>
			session.eventSequence.some((event) => event.id === note.eventId),
		)) ||
	sessions.find(
		(session) =>
			note.createdAt >= session.startTimestamp &&
			note.createdAt <= session.endTimestamp &&
			session.tabs.some((tab) => tab.tabId === note.tabId),
	);

export const validateNoteText = (value: unknown): value is string =>
	typeof value === "string" && value.trim().length > 0 && value.length <= 4_000;

export const noteMatchesDomain = (host: string, domain: string): boolean => {
	const normalized = domain.toLowerCase().replace(/^\.+|\.+$/g, "");
	const value = host.toLowerCase();
	return (
		Boolean(normalized) &&
		(value === normalized || value.endsWith(`.${normalized}`))
	);
};

export const searchNoteRows = <
	T extends Pick<PageNote, "text" | "title" | "host" | "url" | "createdAt">,
>(
	notes: T[],
	query: string,
	options: { from?: number; to?: number; domain?: string; limit?: number } = {},
): T[] => {
	const tokens = [
		...new Set(query.toLowerCase().trim().split(/\s+/).filter(Boolean)),
	];
	if (!tokens.length) return [];
	return notes
		.filter(
			(note) =>
				(options.from === undefined || note.createdAt >= options.from) &&
				(options.to === undefined || note.createdAt <= options.to) &&
				(options.domain === undefined ||
					noteMatchesDomain(note.host, options.domain)),
		)
		.map((note) => ({
			note,
			score: tokens.filter((token) =>
				`${note.text} ${note.title ?? ""} ${note.host} ${note.url}`
					.toLowerCase()
					.includes(token),
			).length,
		}))
		.filter(({ score }) => score > 0)
		.sort((a, b) => b.score - a.score || b.note.createdAt - a.note.createdAt)
		.slice(0, options.limit ?? 20)
		.map(({ note }) => note);
};
