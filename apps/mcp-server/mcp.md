# MCP tool surface and AI-response review

Tabot exposes eight read-only MCP tools as its current beta assistant interface. They are not a reusable context workspace or automation API. Examples show representative JSON wrapped in one MCP text block. Timestamps are Unix milliseconds. Activity results contain site origins, bounded counts, match metadata, and anchors—not titles, page text, paths, or raw browser-event fields. Requested note text/title use selected local library patterns for credentials, payment-card PANs (credit/debit), CVV/expiry, bank/payment, and some tax/business identifiers. Email, phone and Indian income-tax PAN are not covered; detection is not exhaustive.

## `search_notes`

Search user notes. Optional `site` filter matches a domain and its subdomains. Note text and titles are redacted for selected sensitive-data patterns before leaving the extension. Results include derived site domain, host, timestamps and derived session details when available; full page paths and tab identifiers remain local.

## `get_page_notes`

Get up to 8 notes for an HTTP(S) page. The extension canonicalizes the URL locally and matches by the shared page key. The result returns redacted note text, host, timestamps and session details; it does not return the path.

## `get_site_notes`

Get up to 50 notes for a website domain, including subdomains. For example, `linkedin.com` includes notes from `www.linkedin.com` and other LinkedIn subdomains. Result includes derived site domain, host, redacted text, timestamps and session details; page paths stay local. `search_notes` also accepts `site` as a domain filter and returns this derived site association.

## `search_all`

Search retained pages, user-authored notes, and sites with one natural-language or keyword query. Page results use local hybrid text and semantic search over activity and page content; note and site results use local keyword search. Each category returns up to `limit` matches; `search_all` is a discovery response, not paginated.

**Input**

```json
{
  "query": "OAuth callback setup",
  "from": 1782777600000,
  "to": 1782864000000,
  "limit": 8
}
```

- `query`: required, trimmed, 1–200 characters.
- `from`, `to`: optional Unix-millisecond time bounds.
- `limit`: optional integer 1–8 per result category; defaults to 8. Use `search_notes`, `list_pages`, or `list_sites` for paginated browsing.

**Representative response**

```json
{
  "pages": [
    {
      "site": "https://docs.example.test",
      "firstSeen": 1782860000000,
      "lastSeen": 1782864000000,
      "eventCount": 5,
      "pageCount": 1,
      "matchedFrom": ["title-only", "auto-snippet"],
      "matchedTerms": ["oauth", "callback"],
      "anchors": [
        { "kind": "page", "id": "page-abc", "timestamp": 1782864000000 }
      ]
    }
  ],
  "notes": [],
  "sites": []
}
```

Page `matchedFrom` identifies local evidence type without returning its text. Page results include reusable `anchors` for related-activity and timeline tools. Note text uses selected-pattern redaction; detection is not exhaustive. No results mean no retained match, not proof of absence.

## `find_related_activity`

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

- `anchors`: required array of 1–8 `{ "kind": "event" | "page", "id": string }` references, normally from `search_all`.
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
      "matchedBy": ["same_site", "within_time_window"],
      "matchedAnchorIds": ["page-abc"]
    }
  ]
}
```

`count` is page size. `matchedBy` lists exact conditions: `same_page`, `same_site`, and/or `within_time_window`. Matches sort by timestamp descending, then ID. These are literal matches, not semantic similarity, causality, or inferred intent. State the specific condition instead of presenting a match as confirmed related activity.

## `get_browsing_timeline`

Show a chronological view around selected anchors, with one page of matching activity. Uses same input and options as `find_related_activity`.

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
      "role": "anchor"
    },
    {
      "id": "event-def",
      "kind": "event",
      "timestamp": 1782864100000,
      "site": "https://docs.example.test",
      "matchedBy": ["same_site", "within_time_window"],
      "matchedAnchorIds": ["page-abc"],
      "role": "match"
    }
  ]
}
```

`count` and `nextCursor` describe matches only. Anchor entries repeat on every page; pagination applies to matches. Clients can deduplicate anchors for display while preserving their role. Never present query matches as user-confirmed steps.

## Errors and transport shape

A failed tool call returns `isError: true` and a text block containing the error message. Successful calls currently serialize JSON into one text block, rather than using typed `structuredContent`. Keep text fallback for client compatibility if structured output is added.

## Assessment

- `search_all` returns bounded page, note, and site result arrays; page search is hybrid semantic/text, while notes and sites use keyword matching.
- Related activity uses exact same-page, same-site, and time-window conditions; it does not infer semantic relatedness or intent.
- Keep full URL paths, raw browser events, and unbounded content private. Keep full URL paths, raw browser events, and unbounded content private.

## Source of truth

Tool names/descriptions and input schemas: `apps/mcp-server/src/mcp/tools.ts` and `apps/mcp-server/src/mcp/schema/tools.schema.ts`. MCP registration and text/error wrapping: `apps/mcp-server/src/index.ts`. Runtime projections: `apps/extension/relay/relay.ts` and `packages/shared/src/recall/history-search.ts`. Keep this document aligned with public schemas and projections.
