/** MCP tools for searching and inspecting locally captured browser activity. */
export const TOOL_NAMES = {
	SEARCH_ACTIVITY: "search_activity",
	FIND_ACTIVITY_MATCHES: "find_activity_matches",
	GET_ACTIVITY_TIMELINE: "get_activity_timeline",
	SEARCH_NOTES: "search_notes",
	GET_PAGE_NOTES: "get_page_notes",
	LIST_SITES: "list_sites",
	LIST_SITE_PAGES: "list_site_pages",
	GET_SITE_NOTES: "get_site_notes",
} as const;
export const MAX_QUERY_CHARS = 200;

export const TOOL_DESCRIPTIONS = {
	SEARCH_ACTIVITY: `Search locally captured browser activity. Returns up to 8 matching pages with site, time range, match context, and reusable anchors. Page titles, paths, visible page text, and raw browser-event fields are not returned. To continue, pass the returned nextCursor value as cursor with the same query and filters; null means no more results. Results are capped at 8 and fixed to the first request's snapshot time. No results mean nothing matched retained activity, not proof that activity never occurred.`,
	FIND_ACTIVITY_MATCHES: `Find captured activity matching the same page, site, or time window as 1–8 anchors from search_activity. Returns up to 8 matches with matchedBy, matchedAnchorIds, timestamps, and sites. Page paths and visible page text are not returned. Matching is literal; it does not infer intent or rank relevance. Pass the returned nextCursor value as cursor with the same anchors and options to continue. maxGapHours defaults to 168 and is capped at 720.`,
	GET_ACTIVITY_TIMELINE: `Show a chronological timeline around 1–8 activity anchors. Includes the selected anchors and up to 8 matches per page, with timestamps, sites, and matchedBy. Page paths and visible page text are not returned. Matches use explicit page/site/time conditions; they are not inferred intent or relevance rankings. Pass the returned nextCursor value as cursor with the same anchors and options to continue. maxGapHours defaults to 168 and is capped at 720.`,
	SEARCH_NOTES: `Search notes saved by the user. Optional site filter matches a website domain and its subdomains. Returns up to 8 notes per page with redacted text, derived site domain, host, timestamp, and derived browsing session when available. Pass the returned nextCursor value as cursor with the same query and filters to continue; null means no more results. Page paths are not returned. Notes stay on the device; matching text leaves only on this authorized request. No results mean no retained note matched, not proof no note exists.`,
	LIST_SITES: `Browse retained sites, grouped by registrable domain including its subdomains. Returns up to 8 sites with distinct page counts, note counts and last activity, computed before pagination. Optional query is a literal keyword filter over locally retained page metadata/text and notes, not semantic search; counts then describe matching pages and their notes within the time range. Includes note-only pages with no capture. Page paths, titles, visible text, and favicons never leave the device. Pass nextCursor with the same filters to continue; null means no more results. Counts describe retained data, not complete browsing history.`,
	LIST_SITE_PAGES: `Browse distinct retained pages for one registrable site, including its subdomains. Returns up to 8 opaque pageRef values with host, timestamps, noteCount and capture availability; never page paths, titles or visible text. Includes pages retained only by notes or activity. Optional keyword/time filters apply before pagination. Use pageRef with get_page_notes to retrieve that page's saved notes without sending its URL. Pass nextCursor with the same site and filters to continue.`,
	GET_PAGE_NOTES: `Get user-written notes for one page. Provide exactly one selector: pageRef returned by list_site_pages (preferred; no URL disclosure) or a known HTTP(S) URL. Returns up to 8 notes with redacted text, site host, timestamps and derived session, never page paths. Pass nextCursor with the same selector to continue; null means no more results. pageRef browses all retained notes for the displayed URL, independently of captures or search text. Legacy URL lookup canonicalizes the original URL locally and is capped at 50 notes. Content leaves the device only on this authorized request.`,
	GET_SITE_NOTES: `Get up to 50 notes associated with a website domain, including its subdomains (for example, linkedin.com includes notes from all linkedin.com subdomains). Returns redacted text, site, host, title, timestamps, and derived sessions. Notes stay on the device; content leaves only on this authorized request.`,
} as const;
