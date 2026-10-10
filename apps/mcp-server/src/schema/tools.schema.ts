import { z } from "zod";
import {
	MAX_CONTEXT_ID_CHARS,
	MAX_HOURS,
	MAX_MEMORY_ID_CHARS,
	MAX_QUERY_CHARS,
} from "../lib/tools";

/** Input shape for `search_context`. */
export const searchContextInputSchema = {
	query: z.string().min(1).max(MAX_QUERY_CHARS),
	hours: z.number().int().min(1).max(MAX_HOURS).optional(),
};

/** Input shape for `get_recent_context`. */
export const getRecentContextInputSchema = {
	hours: z.number().int().min(1).max(MAX_HOURS),
};

/** Input shape for `get_context`. */
export const getContextInputSchema = {
	id: z.string().min(1).max(MAX_CONTEXT_ID_CHARS),
};

/** Bounded pattern discovery; no arbitrary history export. */
export const listRecurringPatternsInputSchema = {
	limit: z
		.number()
		.int()
		.min(1)
		.max(20)
		.optional()
		.describe(
			"Maximum recurring patterns, most recently seen first; default 10.",
		),
};

/** Input shape for `get_memory`. */
export const getMemoryInputSchema = {
	id: z.string().min(1).max(MAX_MEMORY_ID_CHARS),
};

/** Epoch milliseconds, inclusive start/exclusive end. Site filter is an origin, not a URL. */
export const getActivityMetricsInputSchema = z
	.object({
		from: z
			.number()
			.int()
			.min(0)
			.max(8_640_000_000_000_000)
			.describe(
				"Inclusive start, Unix milliseconds; 0 means all retained activity.",
			),
		to: z
			.number()
			.int()
			.positive()
			.max(8_640_000_000_000_000)
			.describe("Exclusive end, Unix milliseconds; must not be in the future."),
		origin: z
			.string()
			.max(256)
			.refine((value) => {
				try {
					const url = new URL(value);
					return (
						(url.protocol === "http:" || url.protocol === "https:") &&
						url.origin === value
					);
				} catch {
					return false;
				}
			}, "Use an HTTP(S) origin without credentials, path, query, or fragment.")
			.optional(),
	})
	.refine(({ from, to }) => from < to, "from must be earlier than to.");

/** Input shape for `get_current_context` — no arguments. */
export const getCurrentContextInputSchema = {};
