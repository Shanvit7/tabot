# Tabot homepage functionality

## Product direction

Homepage is local browser-evidence search and exploration. User searches what they remember; Tabot finds retained evidence with TalaDB, then uses Handwired to surface possible connections across results. A network animation helps inspect those connections. Animation is an explanation of the current candidate links, not proof that links are correct.

## Core flow

1. A caller submits a natural-language query through the local evidence-search interface.
2. TalaDB-backed local search over retained browser evidence returns ranked results. No vector embeddings are required.
3. Each result shows its origin, time range, evidence kind, and a short redacted excerpt when available. Source IDs remain available for citation and follow-up.
4. User selects a result or asks to explore connections.
5. Handwired uses bounded numeric features from local evidence to rank candidate relationships and assemble an evidence trail. It does not independently understand arbitrary page text or user intent.
6. Homepage visualizes selected evidence and candidate links as an animated network. Selecting a node or link reveals the supporting evidence, timestamp, and match signals; user can open the cited page in their browser.

## Homepage states

- **No evidence yet:** explain that Tabot needs locally captured browser activity; provide extension connection/setup action.
- **Ready / empty query:** show search prompt and concise explanation of local evidence search.
- **Searching:** show progress without replacing the page with a blank state.
- **Results:** show ranked evidence, provenance, and an explicit action to explore connections.
- **No matches:** distinguish “no matching retained evidence” from “this never happened.”
- **Connections loading:** show progress for candidate generation/scoring separately from search.
- **Trail/network view:** show seed evidence, candidate links, and selected-node details; keep evidence list available for scanning.
- **Extension unavailable or storage read failed:** explain that results could not be loaded; do not present the error as empty history.
- **Reduced motion:** provide the same network and evidence interaction without animation.

## Search and relationship behavior

- TalaDB is the direct-search foundation and source of evidence. Use its local indexed records and existing ranked text search; do not add vector embeddings. Keep results grounded in stored evidence and cite source IDs/timestamps.
- Handwired is a second-stage relationship scorer over bounded candidates, not a replacement for direct search. Show why each candidate appeared using inspectable signals and source evidence. Never label an uncalibrated score as probability.
- Relationship exploration should be user-directed from search results. Do not infer a single task, session, or intent from temporal proximity alone.
- Network nodes represent evidence records; edges represent candidate relationships and must remain distinguishable from observed facts. Preserve a non-graph list/table view so graph navigation is not required.

## Locality and privacy

- Search, candidate generation, scoring, and visualization operate on the local profile.
- Do not send raw event payloads, full page paths, or page text to a remote service as a side effect of homepage use.
- Show only bounded, redacted excerpts when useful. External MCP sharing remains a separate, explicit tool call under its existing privacy contract.
- A missing excerpt or unavailable feature is missing evidence, not evidence of a mismatch.

## Scope boundaries

- Homepage is a search-and-evidence workspace, not a chat agent or an automatic activity/attention judgment.
- Handwired does not generate explanations from raw browser JSON and does not replace TalaDB retrieval.
- Network animation is a visualization layer; it cannot imply model confidence or relationship quality beyond the data returned.
- Legacy sessions, contexts, episodes, and memories are not required inputs to this experience.

## Current implementation status

This describes desired behavior; it is not a claim that the homepage is implemented. `apps/web/src/routes/index.tsx` currently renders `null`. Local TalaDB-backed search uses indexed record/time filters and BM25-like ranking; vector embeddings are not needed. The Handwired scorer/model interface exists in shared code, but the MCP runtime still uses `heuristic-v1` and no trained model checkpoint is stored for runtime use. `get_evidence_trail` returns seed evidence plus heuristic candidates. No UI is in scope for the current wiring work.
