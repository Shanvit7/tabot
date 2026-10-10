# Assistants on Home

User-pinned layout: **three equal CTA tiles in one horizontal grid**. This supersedes the rejected stacked list. Bound to existing Work trace identity in `DESIGN.md`; Operate mode. Every screen must read as the same product if placed side by side.

## Engineering handoff
Implement exactly this spec in `apps/web/src/components/connectors.tsx`. Keep connection fetch/effect unchanged. No dependencies, backend edits, or new test files.
- Retain Assistants heading, one short purpose line, and privacy note.
- `grid-cols-3` at every width. Equal-height tiles, 8px corners, 8px mobile / 12px desktop gaps. No shadows or separate Open action.
- Each tile contains provider icon/name and its status inside the same target. At narrow widths icon moves above name; the three tiles remain on one row.
- ChatGPT uses existing ink/white CTA colors. True: Connected, non-interactive status tile. False: Connect, opens existing connector setup URL. Pending: Checking…; failed request: Status unknown with existing recovery copy. Pending and unknown tiles are non-interactive. Only Connect has link semantics, hover styling, keyboard focus, and a new-tab announcement. Never label an unknown state disconnected.
- Claude and Gemini are native disabled buttons labeled Coming soon. No tab stops or click handlers.
- Existing visible focus ring and new-tab announcement on the Connect link only, polite connection status, hidden decorative icons. No animation. White/ink contrast 16:1; muted/surface 6.33:1.
- Verify desktop and 320px: three equal columns on one row, no overflow, disabled future CTAs, real connection behavior preserved. TypeScript/lint only; no added tests.

Three equal tiles are explicitly requested by the user; they override the generic anti-slop card-pattern ban. Existing context map remains the page's signature. No new visual language or global token changes.
