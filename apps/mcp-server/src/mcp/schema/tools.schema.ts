import { z } from "zod";
import { MAX_QUERY_CHARS } from "../tools";

const timeRangeSchema = {
	from: z
		.string()
		.datetime()
		.optional()
		.describe(
			"Inclusive start as an ISO 8601 UTC date-time string ending in Z, for example 2026-11-15T00:00:00Z. Do not pass a Unix timestamp. Omit for no lower time bound.",
		),
	to: z
		.string()
		.datetime()
		.optional()
		.describe(
			"Inclusive end as an ISO 8601 UTC date-time string ending in Z, for example 2026-11-22T23:59:59Z. Do not pass a Unix timestamp. Must be at or after from; omit to use the current time.",
		),
};

/** Input shape for `search_all`. */
export const searchAllInputSchema = {
	query: z
		.string()
		.trim()
		.min(1)
		.max(MAX_QUERY_CHARS)
		.describe(
			"Search text (1–200 characters). Pages use hybrid text/semantic search; notes and sites use keyword search. To browse a time range without search text, use list_sites instead.",
		),
	...timeRangeSchema,
	limit: z
		.number()
		.int()
		.min(1)
		.max(8)
		.optional()
		.describe(
			"Maximum results per category (pages, notes, sites), from 1 to 8; defaults to 8.",
		),
};

export const searchNotesInputSchema = {
	query: z
		.string()
		.trim()
		.min(1)
		.max(MAX_QUERY_CHARS)
		.describe("Keyword text to match user-written notes (1–200 characters)."),
	...timeRangeSchema,
	site: z
		.string()
		.trim()
		.min(1)
		.max(253)
		.optional()
		.describe(
			"Website domain, for example example.com; includes its subdomains. Omit to search notes across all sites.",
		),
	limit: z
		.number()
		.int()
		.min(1)
		.max(8)
		.optional()
		.describe("Maximum notes per page, from 1 to 8; defaults to 8."),
	cursor: z
		.string()
		.regex(/^\d{1,16}:[1-9]\d{0,5}$/)
		.optional()
		.describe(
			"Opaque nextCursor from the previous search_notes response; copy exactly with the same query and filters. Omit on the first request; null nextCursor means no more results.",
		),
};

export const getSiteNotesInputSchema = {
	site: z
		.string()
		.trim()
		.min(1)
		.max(253)
		.describe(
			"Website domain, for example example.com; includes notes from its subdomains.",
		),
};

export const listSitesInputSchema = {
	query: z
		.string()
		.trim()
		.max(MAX_QUERY_CHARS)
		.optional()
		.describe(
			"Optional literal keyword filter (up to 200 characters), not semantic search. Omit to browse all retained data in the time range.",
		),
	...timeRangeSchema,
	limit: z
		.number()
		.int()
		.min(1)
		.max(8)
		.optional()
		.describe(
			"Maximum sites or pages per response, from 1 to 8; defaults to 8.",
		),
	cursor: z
		.string()
		.regex(/^\d{1,16}:[1-9]\d{0,5}$/)
		.optional()
		.describe(
			"Opaque nextCursor from the previous response to this tool; copy exactly with the same site/query/time filters. Omit on the first request; null nextCursor means no more results.",
		),
};
export const listSitePagesInputSchema = {
	...listSitesInputSchema,
	site: z
		.string()
		.trim()
		.min(1)
		.max(253)
		.describe(
			"Registrable site domain returned by list_sites, for example example.com; includes its subdomains.",
		),
};

export const getPageNotesInputSchema = z
	.object({
		pageRef: z
			.string()
			.regex(/^[a-z0-9.%A-F-]{1,765}:[a-f0-9]{64}$/)
			.optional()
			.describe(
				"Opaque pageRef returned by list_pages; copy exactly, do not invent. Preferred over url. Provide exactly one of pageRef or url.",
			),
		url: z
			.string()
			.url()
			.max(2_048)
			.refine((value) => {
				try {
					const url = new URL(value);
					return (
						["http:", "https:"].includes(url.protocol) &&
						!url.username &&
						!url.password
					);
				} catch {
					return false;
				}
			})
			.optional()
			.describe(
				"Known HTTP(S) page URL for legacy lookup. Prefer pageRef from list_pages to avoid disclosing the URL. Provide exactly one of url or pageRef.",
			),
		limit: z
			.number()
			.int()
			.min(1)
			.max(8)
			.optional()
			.describe("Maximum notes per page, from 1 to 8; defaults to 8."),
		cursor: z
			.string()
			.regex(/^\d{1,16}:[1-9]\d{0,5}$/)
			.optional()
			.describe(
				"Opaque nextCursor from the previous get_page_notes response; copy exactly with the same page selector. Omit on the first request; null nextCursor means no more results.",
			),
	})
	.refine(
		(input) => (input.url === undefined) !== (input.pageRef === undefined),
		{
			message: "Provide exactly one of url or pageRef.",
		},
	);

/** Input shape for `find_related_activity`. */
export const findActivityMatchesInputSchema = {
	anchors: z
		.array(
			z.object({
				kind: z
					.enum(["event", "page"])
					.describe(
						"Activity kind returned with the selected id; copy it from a previous tool result.",
					),
				id: z
					.string()
					.min(1)
					.max(64)
					.describe(
						"Activity id returned by search_all or another activity tool. Copy exactly; not a pageRef, URL, or timestamp.",
					),
			}),
		)
		.min(1)
		.max(8)
		.describe(
			"1–8 existing page/event references from previous tool results to use as anchors. Do not invent ids.",
		),
	limit: z
		.number()
		.int()
		.min(1)
		.max(8)
		.optional()
		.describe(
			"Maximum matching activity items per page, from 1 to 8; defaults to 8. Timeline anchors are included separately.",
		),
	cursor: z
		.string()
		.regex(/^\d{1,16}:[1-9]\d{0,5}$/)
		.optional()
		.describe(
			"Opaque nextCursor from the previous response to this tool; copy exactly with the same anchors and options. Omit on the first request; null nextCursor means no more results.",
		),
	maxGapHours: z
		.number()
		.int()
		.min(1)
		.max(720)
		.optional()
		.describe(
			"Time-window distance from each anchor, in HOURS (not milliseconds). Integer from 1 to 720; defaults to 168 (7 days). Same-page/site matches can also occur outside this window.",
		),
};
