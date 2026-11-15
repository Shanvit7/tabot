# mcp-server

## 0.2.5

### Unified read-only tool surface

The relay exposes eight read-only tools: `search_all`, `search_notes`, `list_sites`, `list_pages`, `get_page_notes`, `get_site_notes`, `find_related_activity` and `get_browsing_timeline`. Legacy context, memory, recurring-pattern and activity-metric tools are removed, so assistants must refresh their connector tool list after this release.

Results stay projected: page paths, page titles, thresholded excerpt text and raw browser events remain on-device. Note text and titles leave only on explicit note tool calls, after selected sensitive-pattern filtering. OAuth keeps requests scoped to the authenticated installation, and the relay stores connection state, not browser history or tool results.
