/** MCP tool identifiers the relay dispatches to the extension. */
export const TOOL_NAMES = {
	SEARCH_CONTEXT: "search_context",
	GET_RECENT_CONTEXT: "get_recent_context",
	GET_CURRENT_CONTEXT: "get_current_context",
	GET_CONTEXT: "get_context",
	GET_MEMORY: "get_memory",
} as const;

/** Bounded inputs — reject oversized tool args. */
export const MAX_QUERY_CHARS = 200;
export const MAX_HOURS = 168; // 7 days
export const MAX_MEMORY_ID_CHARS = 256;
export const MAX_CONTEXT_ID_CHARS = 256;

// Plan §8 — descriptions must state the local/derived nature of the data and
// that inferred intent is not confirmed fact. Kept verbatim from the plan where
// the plan gives wording.
export const TOOL_DESCRIPTIONS = {
	SEARCH_CONTEXT: `Search the user's AI-ready locally-derived Tabot browser contexts. Optionally restrict by hours (last 1–168 hours). Results include context ids; call get_context with an id for one specific context.

Use this when the user asks about what they recently researched, worked on, browsed, or explored across Chrome.

Results represent observed browser activity and derived context. Do not treat inferred intent as confirmed fact.`,
	GET_RECENT_CONTEXT: `Retrieve up to 20 AI-ready locally-derived Tabot browser contexts overlapping the last 1–168 hours. Returns ids for targeted get_context calls; does not upload an entire browser history.

Use this when the user asks what they were doing in the last few hours or days across Chrome.

Results represent observed browser activity and derived context. Do not treat inferred intent as confirmed fact.`,
	GET_CURRENT_CONTEXT: `Return the user's most recent AI-ready locally-derived Tabot browser context, if one exists.

Use this when the user asks what they are doing right now or what they were just working on.

Results represent observed browser activity and derived context. Do not treat inferred intent as confirmed fact.`,
	GET_CONTEXT: `Retrieve one specific locally-derived Tabot browser context by id from a previous result or a user-provided id. Returns only that context, even if it is not AI-ready. No raw activity is returned.

Results represent observed browser activity and derived context. Do not treat inferred intent as confirmed fact.`,
	GET_MEMORY: `Retrieve one specific Tabot memory and its supporting derived evidence by id.

Use this when a previous result referenced a memory id and the user wants more detail on it.

Results represent observed browser activity and derived context. Do not treat inferred intent as confirmed fact.`,
} as const;
