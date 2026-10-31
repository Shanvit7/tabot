/** MCP tools for searching and inspecting locally captured browser activity. */
export const TOOL_NAMES = {
	SEARCH_ACTIVITY: "search_activity",
	FIND_ACTIVITY_MATCHES: "find_activity_matches",
	GET_ACTIVITY_TIMELINE: "get_activity_timeline",
} as const;
export const MAX_QUERY_CHARS = 200;

export const TOOL_DESCRIPTIONS = {
	SEARCH_ACTIVITY: `Search locally captured browser activity. Returns up to 8 matching pages with site, time range, title, redacted preview, match context, and reusable anchors. Pass nextCursor with the same query to continue; null means no more results. Results are capped at 8 and fixed to the first request's snapshot time. Page paths and raw browser-event fields are never returned. Matching previews leave the device only when requested. No results mean nothing matched retained activity, not proof that activity never occurred.`,
	FIND_ACTIVITY_MATCHES: `Find captured activity matching the same page, site, or time window as 1–8 anchors from search_activity. Returns up to 8 matches with matchedBy, matchedAnchorIds, timestamps, sites, and redacted previews. Matching is literal; it does not infer intent or rank relevance. Pass nextCursor with the same anchors and options to continue. maxGapHours defaults to 168 and is capped at 720.`,
	GET_ACTIVITY_TIMELINE: `Show a chronological timeline around 1–8 activity anchors. Includes the selected anchors and up to 8 matches per page, with timestamps, sites, previews, and matchedBy. Matches use explicit page/site/time conditions; they are not inferred intent or relevance rankings. Pass nextCursor with the same anchors and options to continue. maxGapHours defaults to 168 and is capped at 720.`,
} as const;
