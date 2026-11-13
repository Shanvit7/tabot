import { z } from "zod";
import { MAX_QUERY_CHARS } from "../tools";

/** Input shape for `search_activity`. */
export const searchActivityInputSchema = {
	query: z.string().trim().min(1).max(MAX_QUERY_CHARS),
	limit: z.number().int().min(1).max(8).optional(),
	cursor: z
		.string()
		.regex(/^\d{1,16}:[1-9]\d{0,5}$/)
		.optional(),
};

export const searchNotesInputSchema = {
	query: z.string().trim().min(1).max(MAX_QUERY_CHARS),
	from: z.number().finite().min(0).optional(),
	to: z.number().finite().min(0).optional(),
	site: z.string().trim().min(1).max(253).optional(),
	limit: z.number().int().min(1).max(8).optional(),
	cursor: z
		.string()
		.regex(/^\d{1,16}:[1-9]\d{0,5}$/)
		.optional(),
};

export const getSiteNotesInputSchema = {
	site: z.string().trim().min(1).max(253),
};

export const listSitesInputSchema = {
	query: z.string().trim().max(MAX_QUERY_CHARS).optional(),
	from: z.number().finite().min(0).optional(),
	to: z.number().finite().min(0).optional(),
	limit: z.number().int().min(1).max(8).optional(),
	cursor: z
		.string()
		.regex(/^\d{1,16}:[1-9]\d{0,5}$/)
		.optional(),
};
export const listSitePagesInputSchema = {
	...listSitesInputSchema,
	site: z.string().trim().min(1).max(253),
};

export const getPageNotesInputSchema = z
	.object({
		pageRef: z
			.string()
			.regex(/^[a-z0-9.%A-F-]{1,765}:[a-f0-9]{64}$/)
			.optional(),
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
			.optional(),
		limit: z.number().int().min(1).max(8).optional(),
		cursor: z
			.string()
			.regex(/^\d{1,16}:[1-9]\d{0,5}$/)
			.optional(),
	})
	.refine(
		(input) => (input.url === undefined) !== (input.pageRef === undefined),
		{
			message: "Provide exactly one of url or pageRef.",
		},
	);

/** Input shape for `find_activity_matches`. */
export const findActivityMatchesInputSchema = {
	anchors: z
		.array(
			z.object({
				kind: z.enum(["event", "page"]),
				id: z.string().min(1).max(64),
			}),
		)
		.min(1)
		.max(8),
	limit: z.number().int().min(1).max(8).optional(),
	cursor: z
		.string()
		.regex(/^\d{1,16}:[1-9]\d{0,5}$/)
		.optional(),
	maxGapHours: z.number().int().min(1).max(720).optional(),
};
