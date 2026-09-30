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

/** Input shape for `get_memory`. */
export const getMemoryInputSchema = {
	id: z.string().min(1).max(MAX_MEMORY_ID_CHARS),
};

/** Input shape for `get_current_context` — no arguments. */
export const getCurrentContextInputSchema = {};
