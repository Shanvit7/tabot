# MCP tool surface and AI-response review

Tabot exposes three read-only MCP tools for locally captured browser activity. Examples show representative JSON wrapped in one MCP text block. Timestamps are Unix milliseconds. No tool returns full URL paths or raw browser-event fields.

## `search_activity`

Search captured activity using a natural-language or keyword query.

**Input**

```json
{
  "query": "OAuth callback setup",
  "limit": 8,
  "cursor": "1782864000000:8"
}
```

- `query`: required, trimmed, 1–200 characters.
- `limit`: optional integer 1–8; defaults to 8.
- `cursor`: optional continuation cursor. Pass `nextCursor` with the same query. Cursor pins first-page timestamp snapshot; late-arriving older activity can shift offset-based pages.

**Representative response**

```json
{
  "count": 1,
  "nextCursor": null,
  "results": [
    {
      "site": "https://docs.example.test",
      "firstSeen": 1782860000000,
      "lastSeen": 1782864000000,
      "eventCount": 5,
      "pageCount": 1,
      "title": "OAuth callback guide",
      "preview": "Configure the callback URL in your application settings…",
      "matchedFrom": ["title-only", "auto-snippet"],
      "matchedTerms": ["oauth", "callback"],
      "anchors": [
        { "kind": "page", "id": "page-abc", "timestamp": 1782864000000 }
      ]
    }
  ]
}
```

`count` is number of results on this page, not total matches. `title` is the captured page title when available. `preview` is redacted and capped; null means there is no matching captured page text. `matchedFrom` identifies whether results matched a title, automatic or interaction excerpt, search phrase, or URL. Pass `anchors` to the other activity tools. No results mean no matching retained activity, not proof that a visit never happened.

## `find_activity_matches`

Find captured activity matching the same page, site, or time window as 1–8 selected anchors.

**Input**

```json
{
  "anchors": [{ "kind": "page", "id": "page-abc" }],
  "limit": 8,
  "maxGapHours": 168,
  "cursor": "1782864000000:8"
}
```

- `anchors`: required array of 1–8 `{ "kind": "event" | "page", "id": string }` references, normally from `search_activity`.
- `limit`: optional integer 1–8; defaults to 8.
- `maxGapHours`: optional integer 1–720; defaults to 168. Same-page and same-site matches may be older than this window.
- `cursor`: optional continuation cursor; reuse the same anchors/options and pass response `nextCursor`.

**Representative response**

```json
{
  "count": 1,
  "nextCursor": null,
  "matches": [
    {
      "id": "event-def",
      "kind": "event",
      "timestamp": 1782864100000,
      "site": "https://docs.example.test",
      "preview": null,
      "matchedBy": ["same_site", "within_time_window"],
      "matchedAnchorIds": ["page-abc"]
    }
  ]
}
```

`count` is page size. `matchedBy` lists exact conditions: `same_page`, `same_site`, and/or `within_time_window`. Matches sort by timestamp descending, then ID. These are literal matches, not semantic similarity, causality, or inferred intent. State the specific condition instead of presenting a match as confirmed related activity.

## `get_activity_timeline`

Show a chronological view around selected anchors, with one page of matching activity. Uses same input and options as `find_activity_matches`.

**Representative response**

```json
{
  "count": 1,
  "nextCursor": null,
  "items": [
    {
      "id": "page-abc",
      "kind": "page",
      "timestamp": 1782864000000,
      "site": "https://docs.example.test",
      "preview": "Configure the OAuth callback URL…",
      "role": "anchor"
    },
    {
      "id": "event-def",
      "kind": "event",
      "timestamp": 1782864100000,
      "site": "https://docs.example.test",
      "preview": null,
      "matchedBy": ["same_site", "within_time_window"],
      "matchedAnchorIds": ["page-abc"],
      "role": "match"
    }
  ]
}
```

`count` and `nextCursor` describe matches only. Anchor entries repeat on every page; pagination applies to matches. Clients can deduplicate anchors for display while preserving their role. Never present query matches as user-confirmed workflow steps.

## Errors and transport shape

A failed tool call returns `isError: true` and a text block containing the error message. Successful calls currently serialize JSON into one text block, rather than using typed `structuredContent`. Keep text fallback for client compatibility if structured output is added.

## Assessment

- Search returns compact, bounded results with query matches, timestamps, previews, and reusable activity anchors.
- Related activity uses exact same-page, same-site, and time-window conditions; it does not infer semantic relatedness, intent, or automation.
- Keep full URL paths, raw browser events, and unbounded content private. Follow `docs/automations-plan.md`: user-stated goal, explicit activity selection, per-item feedback, and local user approval are required before automation.

## Source of truth

Tool names/descriptions and input schemas: `apps/mcp-server/src/mcp/tools.ts` and `apps/mcp-server/src/mcp/schema/tools.schema.ts`. MCP registration and text/error wrapping: `apps/mcp-server/src/index.ts`. Runtime projections: `apps/extension/relay/relay.ts` and `packages/shared/src/recall/history-search.ts`. Keep this document aligned with public schemas and projections.
