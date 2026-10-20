# Activities playground — throwaway, not approved for production

Question: which graph makes finding a past activity feel inviting without a heavy renderer?

Start from repository root: `pnpm --filter web prototype:activities`.
Open `http://localhost:3012/activities?variant=A` (or B/C).
Check while server runs: `node apps/web/src/prototypes/activities/check.mjs`.

## Three structures

- **A — Constellation:** forest-green workspace, three circular clusters, right-side website inspector. 21 nodes.
- **B — Trail Map:** light field journal on the left, ordered checkpoint path, detail shelf below. 6 nodes.
- **C — Signal Garden:** layered website/activity/time graph, explorer quest and evidence shelf below. 12 nodes. Neural-network-inspired geometry, not an ML claim.

Shared typography is the existing self-hosted IBM Plex Sans. White/light-green surfaces use green ink `#15251b` and muted `#476151`; dark surfaces use `#101c16`, `#1b2e23`, pale ink and green-tinted secondary text. Lavender `#e3d9ff`, lime `#d9ef9e`, peach `#f4d3b6` identify sample trails. Rounded 8px controls and 12–16px panels extend the selected Quest Board vocabulary. Graphs use actual SVG geometry and native button nodes, not illustrative neural-network images.

## Interaction and boundaries

Node clicks and the website list update selection. Sample activity buttons mark that sample explored; opening all three completes the exploration quest. Keep/undo and reset are memory-only. No invented productivity scores, raw event metrics, real browser events, storage, fetch or XHR. URLs preserve only the chosen design; arrow keys and the floating switcher cycle designs. Header navigation is a nonfunctional preview of the production shell.

Trace trail runs a finite 1.6-second SVG dash animation. Nothing animates at idle; document visibility, a motion toggle and reduced-motion preferences gate motion. No force simulation, frame-driven React state, Remotion player, remote favicons or new dependency. This small authored layout is NOT a large-history performance benchmark: any production design must cap/group derived summaries before rendering. Small viewports scroll inside the graph and retain the full website-list alternative.

Production isolation is structural: only the separate Rsbuild preview entry imports these files. Production Start routes, Home and landing are unchanged. Production asset inspection confirmed no prototype strings or CSS selectors shipped.

## Preview review

Review performed inline because this harness has no subagent tool. Code-led, user-pinned graph brief; no generated comp or separate visual-world selection. Root design documents are intentionally not rewritten for an unselected throwaway experiment.

- **Persistence:** prototype-only documentation; no durable product choice recorded.
- **Fidelity:** three distinct structures, existing Plex/type and Quest Board palette, SVG linework; sample labels visible. No physical-material or model-inference claims.
- **Ceiling:** deliberately bounded geometry; no 3D, force layout or endless animation. Large-data validation deferred until a direction is selected.
- **Material fixes:** language attribute, checkpoint-edge alignment and compact-network node overlap corrected. Two desktop axe contrast checks remain automated-incomplete (switcher label/SVG caption); both are visibly legible dark-on-light text, not reported contrast violations.
- **Keep:** graph selection, list alternative, explicit mock status, memory-only state and zero idle animation.

Checked all three designs at 1440×1000 and 375×812; no document overflow. Browser smoke check, TypeScript, Biome, production build, existing Home/activity checks passed. Axe reported zero violations for all three. Mechanical design detector returned no findings. Screenshots: `.impeccable/review/activities/{A,B,C}-{desktop,mobile}.png`.

Verdict: **ship for prototype comparison only**, not production promotion. No winning variant chosen yet.
