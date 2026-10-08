/** MCP tool identifiers the relay dispatches to the extension. */
export const TOOL_NAMES = {
	SEARCH_CONTEXT: "search_context",
	GET_RECENT_CONTEXT: "get_recent_context",
	GET_CURRENT_CONTEXT: "get_current_context",
	GET_CONTEXT: "get_context",
	GET_MEMORY: "get_memory",
	LIST_RECURRING_PATTERNS: "list_recurring_patterns",
	GET_ACTIVITY_METRICS: "get_activity_metrics",
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
	GET_ACTIVITY_METRICS: `Retrieve locally computed Tabot browsing metrics for [from, to), using Unix timestamps in milliseconds. Both bounds are required; use from=0 for all retained activity. to must not be in the future. Optionally provide one exact HTTP(S) origin, such as https://github.com, without a path, query, fragment, credentials, or trailing slash.

Use this for questions about estimated browsing time, visits, active days, busiest hour, longest observed single-site stretch, or moves between sites. Summary always covers the entire period; origin filters only sites and adjacent transitions. Daily metrics use the extension's local timezone, returned in range.timezone. Results include up to 50 sites and 100 transition pairs within a 60,000-character response budget, with explicit truncation flags. Empty results mean no retained observations, not proof of inactivity.

Only origin-level aggregates leave the device, never raw events, page paths, query strings, or favicons. Time is estimated from consecutive observations with a five-minute gap cap and no extrapolation after the final observation. Do not equate it with attention, intent, or productivity.`,
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
	LIST_RECURRING_PATTERNS: `Discover the user's locally-derived recurring browsing patterns without needing a pattern id. Optional limit is an integer from 1 to 20 (default 10). Returns recurrent patterns only, most recently seen first, with ids for get_memory, site origins, representative fingerprint ordering, occurrence counts, first/last seen and heuristic confidence.

Patterns are derived from the latest 500 local contexts, not exhaustive history. Results are bounded to 60,000 characters and report truncation. Empty results mean no matching retained evidence, not proof that the user has no routines. Only sanitized derived summaries leave the device; never raw events or page URLs. Origins and subdomains remain visible.

Use get_memory(id) to compare supporting occurrences and get_context(id) for a specific supporting context. Confidence describes heuristic pattern similarity, not a probability of intent, attention or productivity. Keep observed repetition separate from inferred explanations.`,
	GET_MEMORY: `Retrieve one specific Tabot memory and its supporting derived evidence by id, including an id from list_recurring_patterns or the dashboard. Returns bounded recent occurrence timestamps, supporting context ids and origin-only site sequences, plus representative fingerprint ordering, local timezone and explicit truncation flags. At most 20 occurrences, 50 origins per sequence, 20 domains, 100 overall context ids and 20 actual lookup ids per occurrence fit within 60,000 characters; older occurrences may be omitted. Page paths, queries, credentials and raw events are never returned in occurrence evidence.

Derived from the latest 500 local contexts; a dashboard id may no longer be found after derivation changes. Fingerprint and occurrence sequences show derived first-occurrence ordering, not a complete navigation trace or proof of an exact repeated workflow. Per-occurrence contextIds are actual get_context lookup ids, not the internal composite occurrence range identifier. Occurrence bounds span observed periods, not continuous attention. Confidence is a heuristic similarity score, not a probability of intent. Keep observations distinct from inferred explanations. Use get_context for selected supporting context ids; note omitted evidence rather than assuming it did not happen.`,
} as const;
