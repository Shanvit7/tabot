/** Public MCP evidence surface; derived summaries stay local. */
export const TOOL_NAMES = {
	SEARCH_EVIDENCE: "search_evidence",
	FIND_RELATED_EVIDENCE: "find_related_evidence",
	GET_EVIDENCE_TRAIL: "get_evidence_trail",
} as const;
export const MAX_QUERY_CHARS = 200;

export const TOOL_DESCRIPTIONS = {
	SEARCH_EVIDENCE: `Search retained local browser evidence by query. Returns up to 8 matching origins, timestamps, source IDs, and query-matching redacted page excerpts per page. Pass nextCursor with same query to fetch next page; null means no more results. Pages are bounded to 8 results and snapshot time. Page paths and raw event fields are never returned. Matching excerpts leave the device only when requested; avoid searching unrelated sensitive content. No results mean no matching retained evidence, not proof of absence.`,
	FIND_RELATED_EVIDENCE: `Find experimental evidence links around source references returned by search_evidence. Pass 1–8 {kind,id} references. Returns at most 8 bounded candidates per page, with origins, timestamps, redacted excerpts, match signals, and an uncalibrated heuristic score (not a probability or claim about intent). Pass nextCursor with same sources/options to continue; it reuses first-page event-time cutoff; late backfills with older timestamps can shift pages. Null means no more candidates. maxGapHours defaults to 168 and is capped at 720.`,
	GET_EVIDENCE_TRAIL: `Build a chronological view from 1–8 evidence references and their experimental related matches. Includes requested seed evidence plus up to 8 related candidates per page. Related links use unvalidated heuristic-v1 signals and are not claims about intent. Pass nextCursor with same sources/options to continue. maxGapHours defaults to 168 and is capped at 720.`,
} as const;
