---
project: Tabot
register: product
aesthetic_direction: technical / utilitarian
color_strategy: restrained
design_system: existing Radix Slot + semantic HTML + Tailwind (extend installed components; no new kit)
design_variance: 6
motion_intensity: 2
visual_density: 5
---

# Tabot | Work trace

## Design Read
A calm, legible record of work across Chrome tabs: evidence comes into focus, not telemetry shouting for attention.

## Direction / lock
**Work trace, distilled.** One bounded evidence graph leads Home. Lines mean only observed context↔site membership or memory↔supporting-context IDs. Activity is a time-series; memories compare separate observed periods. No KPI grid or inferred intent. White page canvas, restrained ink/green, lime only for a selected or recurring signal. Native selectors reveal exact evidence without turning chart nodes into mystery controls.

## Signature
**The context map:** a small force-settled network of recent observed connections; no site↔site links unless a real relationship is recorded. Node selection is via a keyboard-operable native control below the visualization. At mobile width chart remains secondary to the exact text evidence.

## Color (locked)
| role | OKLCH | hex | use |
|---|---|---|---|
| canvas | oklch(1 0 0) | #FFFFFF | page/background image base; white at every viewport |
| surface | oklch(.976 .006 138) | #F5F8F4 | quiet inset panels |
| raised | oklch(.944 .010 141) | #E9EEE8 | selected list surface, subtle progress |
| ink | oklch(.247 .029 156) | #15251B | headings/body/button text |
| muted | oklch(.467 .040 157) | #476151 | metadata and secondary text |
| subtle | oklch(.521 .039 151) | #59705E | quiet text on white only |
| line | oklch(.886 .019 145) | #D2DDD2 | dividers/rail, NOT standalone UI boundaries |
| accent | oklch(.922 .234 126) | #BFFF00 | exactly one accent: selected context, primary action, focus outline |
| success | oklch(.447 .083 156) / oklch(.961 .018 151) | #276241 / #EAF6EC | saved/connected confirmation |
| warning | oklch(.475 .098 68) / oklch(.965 .034 83) | #80500F / #FFF2DA | paused/missing extension |
| danger | oklch(.475 .151 25) / oklch(.966 .016 27) | #A02D2D / #FFF0EE | export failure/data loss |
| info | oklch(.453 .068 224) / oklch(.963 .013 221) | #245E72 / #EAF5F9 | informational notices |

60% canvas, 30% surface/ruled content, at most 10% accent. Tinted neutrals extend logo's green family. Lime is **never** text on white; never use line color alone for focus or controls. Contrast ratios, verified against sRGB hex: ink/canvas 16:1, muted/canvas 6.78:1, ink/surface 14.95:1, muted/surface 6.33:1, ink/accent 13.35:1, white/ink 16:1; semantic foreground/background success 6.49:1, warning 6.17:1, danger 6.52:1, info 6.48:1. Accent/canvas 1.2:1 so add ink line or label on selected surfaces; line/canvas 1.4:1 so never sole active indication.

## Visual material
White canvas with one quiet green-tinted chart surface. No decorative artwork or extra illustration competing with observed connections.

## Type (locked)
Keep installed self-hosted IBM Plex Sans variable for headings (600) and body (400/500), IBM Plex Mono for compact timestamps/IDs only. Pair on humanist readable text vs precise instrumentation, not mono everywhere. Display 36/40 desktop, 28/32 mobile; h2 24/30; h3 18/24; body 15/23; small 13/19; mono meta 12/18 minimum in web, 12/18 in popup. Max text measure 70ch. Sentence case actions; no all-caps body. Tabular figures only on counts/times.

## Scales (locked)
Spacing (px): 0, 4, 8, 12, 16, 24, 32, 48, 64. Radius: sm 4, md 8, lg 12 (no decorative pills; native controls retain native geometry). Borders: 1px `line`, selected/focus 2px `ink` when needed. No hard offset shadows; only a subtle 0 8px 24px rgba(21,37,27,.08) for genuine floating surfaces. Width: reading 720px, work area 1160px. Breakpoints: 640 / 768 / 1024 / 1280px. Motion: 120ms state transitions, 240ms disclosure; cubic-bezier(.16,1,.3,1). No ambient motion; reduced motion = instant state change. Z-index: base 0, sticky 30, toast 70, skipLink 80.

## Iconography & voice
One family: installed icons if needed; otherwise semantic text and simple CSS lines. Keep original Tabot logo. No emoji brain, decorative dots, or vendor logos as decoration. Voice: specific, observant, unhurried. “Context ready” means evidence threshold passed, not that Tabot inferred a task. “Ask ChatGPT about this context” only when context exists; “Download context” produces a local file requiring manual upload. Explain connected-tool behavior separately from manual export. No “digital worker”, “Tabot learned your intent”, productivity scoring, or promise of universal PII removal.

## Scope
This identity is locked for operational web routes (`/home`, `/activities`, `/memories`); there is no legacy route. Popup, public landing and privacy retain existing implementation until separately scoped.
