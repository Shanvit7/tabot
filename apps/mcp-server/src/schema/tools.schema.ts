import { z } from "zod";
import { MAX_HOURS, MAX_MEMORY_ID_CHARS, MAX_QUERY_CHARS } from "../lib/tools";

/** Input shape for `search_context` (plan §19). */
export const searchContextInputSchema = {
	query: z.string().min(1).max(MAX_QUERY_CHARS),
};

/** Input shape for `get_recent_context` (plan §19). */
export const getRecentContextInputSchema = {
	hours: z.number().int().min(1).max(MAX_HOURS),
};

/** Input shape for `get_memory` (plan §19). */
export const getMemoryInputSchema = {
	id: z.string().min(1).max(MAX_MEMORY_ID_CHARS),
};

/** Input shape for `get_current_context` — no arguments. */
export const getCurrentContextInputSchema = {};
