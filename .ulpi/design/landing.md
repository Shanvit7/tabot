# Landing — browsing trail

Mode: Persuade. Scope: `/` and its landing components only; dashboard, privacy route, and extension remain separate.

Audience: non-technical office workers who spend their workday across Chrome tabs. Within the first viewport, make clear that Tabot records sites visited and shows how browsing moves between them. Keep visitor copy concrete and brief; avoid context, MCP, JSONL, pipeline, generic AI promises, and repeated claims. The primary action depends on extension state: detected → open today's activity; not detected → install/setup; unknown → no install CTA until detection resolves. ChatGPT is a connected capability, not the core pitch. Downloads are a quiet audit/review copy.

Preserve existing lime #bfff00, black/white, self-hosted IBM Plex, square borders and restrained hard offset shadows. Readable type hierarchy: fluid hero 36–52px/600, section headings 32–36px/600, body 18px with 32px leading; supporting copy and controls stay at least 16px. Max content width 1152px. No oversized headline stamps, lime step badges, redundant icons, gradients, glows, scroll traps, fake testimonials, or pipeline diagrams.

Signature: show the current extension popup, not an invented timeline. Match its actual 400×600 layout, system UI type, white/ink palette, Observing/Pause controls, site rows connected to Activity, View all sites, Earlier activity, and Review activity footer. Cap preview at 400px and label sample sites. Use one activity preview only; no separate ChatGPT/share animation. Keep reduced-motion and static fallbacks; pause animation offscreen.

Truth: current README.md, docs/system.md and MCP README supersede PRODUCT.md's outdated no-relay boundary for this surface. Do not claim that no data ever leaves the device, that every AI has a live connection, or that visits reveal intent or productivity. ChatGPT summaries leave the device on authorized requests. Downloads remain sensitive.

Installation: use configured Chrome Web Store URL when present; otherwise link to repository setup, not a fabricated listing. Dashboard and privacy links respect deployment base path. Detect extension using the existing message channel. Installed users should land in the dashboard/current activity; never show them duplicate install instructions. Keep privacy statements accurate: ChatGPT requests send derived summaries off-device; relay does not store browsing history.

Verification: code checks and production prerender checks only. User retains visual verification; browser automation prohibited for this session.
