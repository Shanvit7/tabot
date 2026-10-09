# Session recap

Mode: Operate. Scope: context-detail session cards and session inspector only. Keep incumbent selected-context green/lime palette and IBM Plex; no landing, graph or extension redesign.

Purpose: help non-technical users recall sites and tabs in one observed session without reading telemetry. Compact cards open one `react-call` Callable, mounted once in the app Root. Use native dialog top layer: roomy centered desktop view; full-screen mobile view; bounded scrolling with reachable close control. Escape, backdrop, close and context navigation end the Call; restore trigger focus and page scrolling. Repeated opens use upsert, never stack inspectors.

Hierarchy: date/time once → Time in Chrome / Tabs used / Websites → exploration checkpoints ordered by first observation → collapsed browser/other pages → exact context links. Light gamification is real recorded checkpoints, not invented XP, productivity, attention scores, tasks or rewards. Site monograms stay local; no third-party favicon calls. Long hosts wrap. Visible focus, touch targets, reduced motion and mobile safe areas remain.

Copy: user-facing labels say **activity** / **activity summary**, never **context**. Session links are "Related activities" and "View … activity"; the opener section is "Browsing sessions". No technical footer or recording/derivation disclaimer. Site timestamps use short "First seen" / "Last seen" labels. Internal `context` identifiers and API/URL contracts remain unchanged. Follow the binding terminology and plain-language rules in PRODUCT.md.

Truth: website counts exclude browser/extension/unknown sources. Tabs used counts unique session tab participants, including browser pages. Derive source kind from URL schemes before projecting safe aggregates; don't guess extension IDs from their spelling. Never show raw IDs as website names. No event/activity counters in this surface. Duration is recorded foreground time, not wall time or attention; first/last observations are not continuous site dwell or complete return-visit history. A full session may span multiple contexts.

Verification: formatting, TypeScript and production build only going forward. User owns visual/UI review. Do not add UI tests, browser automation or throwaway preview files. Previously added session checks and preview fixtures were removed at the user's request; preserve pre-existing checks.
