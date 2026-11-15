# Tabot landing page: bring your work with you

> Creative and content specification. Not production UI. Public copy appears in blockquotes; other text directs the build.

## 1. The sell

**Sell continuity, not a database.** Someone has spent their morning researching, comparing, or reading. They open ChatGPT and face another blank conversation. Tabot connects those two parts of their day through browser activity and saved notes.

Lead with that recognizable frustration and a visible payoff. Explain the technology after the visitor wants the product. Local storage is a reason to trust the connection, not the opening pitch. Search is an entry point, not Tabot’s whole identity.

- Audience: people working across Chrome and ChatGPT, not developers evaluating infrastructure.
- Main action: **Add to Chrome**, linked directly to the published Chrome Web Store listing.
- Secondary action: **See it in action**, anchored to the interactive product demo.
- No beta badge, apology paragraph, GitHub-first funnel, standalone roadmap section, or speculative productivity numbers.
- Keep current capability boundaries in the right places: demo captions, technical explanation, setup guidance, FAQ. Honesty does not require making limitations the headline.

**Launch status:** Chrome Web Store availability is confirmed by the founder. Older repository language describing a planned release is stale on this point. The exact listing URL must come from the configured `VITE_CHROME_WEB_STORE_URL`, not an invented link.

## 2. Reference read: what to take from Underdog

Reviewed https://underdog.ai/ in the browser, including its illustrated opening, product hero, task selector, and page structure.

| Observed on Underdog | Why it sells | Tabot interpretation |
| --- | --- | --- |
| Full-width illustrated world before the product explanation | Makes an unfamiliar AI product feel approachable and memorable | Build a browser-work world around a continuous tab trail, not an abstract AI orb |
| “The most loyal AI” followed by email, calendar, meeting notes, and errands | Emotional promise first; familiar tasks make it concrete | Lead with carrying browser work into ChatGPT, then show notes and activity examples |
| Product demonstration with task tabs and example choices | Visitor explores their own reason to care instead of reading a feature inventory | Three selectable scenes: bring notes to ChatGPT, retrace browsing, find a page locally |
| Handwritten annotations around a real product visual | Explains where to look without sounding like documentation | A few drawn arrows and margin notes: “your notes,” “you ask,” “selected results” |
| Scene changes with a scale settle, caption entrance, and active-tab transitions | Feels staged and authored rather than like a screenshot carousel | Maintain one browser frame while actual product scenes transition inside it |
| Models and local operation explained farther down | Technical depth reassures after desire exists | A plain-language “What happens under the hood?” section with optional engineering detail |

Borrow its warmth, theatrical reveal, task-led proof, and confident hierarchy. Do not copy its dog, drawing style, “adopt” metaphor, claims, testimonials, or local-AI promise. Tabot does not run ChatGPT on-device.

**Important improvement:** Unlike the reference’s full-screen art-first opening, Tabot’s first viewport must also show the headline and install button. Do not make visitors scroll before discovering what it is.

## 3. Locked creative direction: The thread through your tabs

**Mode:** Persuade. **World:** a playful, illustrated browser workbench grounded in real product evidence.

The signature is a continuous green thread. It passes behind illustrated browser tabs, bookmarks a user-written note, and reaches a separate ChatGPT conversation. It connects the story across sections. It is not a pipe sucking full web pages into an AI.

### Hero composition

Use a wide illustrated stage rather than the usual copy-left/dashboard-right split:

- Headline and CTA occupy the calm upper-left/central reading area.
- An oversized browser-tab rail curves across the lower half of the hero. Tabs represent the visitor’s work: a supplier site, a research page, a reference document.
- A clearly separate note slip sits on that rail. A conversation window sits at its far end. Small Tabot mark is the hinge between browser evidence and requested results.
- Layers overlap with controlled depth: tab rail behind, notes in the middle, request/result in front. Keep copy on an opaque surface with clear contrast, never over busy illustration.
- Hand-drawn annotation: **“You did the browsing.”** Near the conversation: **“Bring something useful into the chat.”** These are supporting flourishes, not additional headlines.
- Use friendly tactile contours and a few drawn arrows, not a new mascot. No floating SaaS card cloud, glowing neural network, decorative code terminal, or particle galaxy.

### Visual system

Reuse the brand already present in `apps/web/src/styles/globals.css`:

| Role | Choice |
| --- | --- |
| Display | Clash Display 600; 64–80px desktop, 40–48px mobile; deliberate two-line headline |
| Body/UI | Clash Grotesk; 18–20px lead, 16–18px body |
| Technical labels only | IBM Plex Mono; never the main explanation |
| Canvas / surfaces | `--work-canvas` white, `--work-surface` soft green-white, `--work-raised` for selected scenes |
| Main / secondary text | `--work-ink` and `--work-muted` |
| Brand thread and main CTA | Existing `--lime` / `--work-accent`, with dark text; never lime text on white |
| Corners | 8px controls; 16px media frames; pill shapes only for CTA/task selectors |
| Layout | 1200px maximum content width, 24px desktop / 20px mobile gutters; 96px section rhythm desktop, 64px mobile |

Keep white dominant. Lime marks the thread, selection, and install action; it should not flood every section. Illustration uses existing green tones and neutral shading rather than introducing a second brand palette. Use Lucide icons where needed.

Personality comes from the browser-work scene, composition, and copy, not five font families. Handwritten-feeling arrows can be SVG strokes with accessible adjacent text; no additional handwriting font required.

## 4. Page sequence and finished copy

### A. Navigation

Logo; **See it work**, **How it works**, **Questions**; **Add to Chrome**.

Header starts visually light and becomes an opaque compact bar after the hero. Avoid elaborate liquid-glass navigation. On mobile, show logo and install CTA without a hamburger full of marketing anchors.

### B. Hero: make the handoff desirable

> # You did the browsing. Bring it to ChatGPT.
>
> Tabot connects your Chrome activity and saved notes to ChatGPT, so you can ask about your browsing and use the notes you’ve already made.
>
> **Add to Chrome**
>
> See it in action ↓
>
> Available on the Chrome Web Store · Connect ChatGPT when you’re ready

The headline stays readable and static. Put the spectacle in the illustrated stage, not a rotating sentence the visitor has to wait to understand.

**Hero result preview:** a user-written supplier note is requested in a conversation. Label the small preview **Illustrative example** and keep it consistent with actual note-tool fields. The detailed demo below provides the real UI proof.

The sample note might say: “Ask about minimum order and delivery schedule.” Never invent the answer to those questions from activity records.

### C. Recognition: the hidden work before the work

> ## The work before the prompt is still work.
>
> You read the pages. Compared the options. Wrote down what mattered.
>
> Then you opened ChatGPT and started explaining it all again.
>
> **Give that work a way into the conversation.**

Visual: a compact strip of repeated manual handoff motions, “reopen → copy → explain.” On scroll, a single thread cuts through the repetition and leads into the demo. This communicates the problem, not a measured time-saving claim.

Keep this section short. No wall of pain copy, fabricated hours lost, or promises to eliminate every copy/paste step.

### D. Interactive proof: let the visitor choose a reason to care

> ## What would you bring into the conversation?
>
> Start with your notes, retrace your browsing, or find the page you want to work from.

One large product stage; three task selectors. Default to **Use my notes**, because it shows the clearest currently supported browser-to-assistant payoff.

#### Scene 1: Use my notes

> **The useful bit you wrote down, ready for the next question.**
>
> Save a note while you browse. Ask ChatGPT to retrieve it, then work with that note in the conversation.

Show a real note-saving interaction in the extension, followed by a real authorized ChatGPT note request. Use synthetic test data, never personal browsing.

Example prompt:

> Find my saved notes for this supplier’s website.

Follow-up prompt:

> Turn those notes into questions for our next call.

The first action is Tabot retrieval. The follow-up is ChatGPT working with the returned notes, not a built-in Tabot workflow. Make that distinction in a small caption:

> Tabot brings back the notes. ChatGPT helps you work with them.

Do not imply an entire supplier website was read or analyzed.

#### Scene 2: Retrace my browsing

> **Pick up the trail without opening every tab again.**
>
> Ask ChatGPT about retained browser activity, including sites and time ranges. Follow related results to retrace where you’ve been.

Example prompt:

> Which sites did I visit yesterday afternoon?

Show a verified activity result with only allowed site/time information. No page titles, page paths, document contents, or inferred task labels in the assistant reply.

Supporting caption:

> Activity results show sites and timing, not the contents of the pages.

#### Scene 3: Find that page

> **“I saw it somewhere” is enough reason to look.**
>
> Search retained pages, excerpts, and notes in Tabot. Review what you found before deciding what to do next.

Show the actual local search interface and a page/excerpt reader. This scene stays on-device. Do not animate excerpts moving to ChatGPT.

Supporting caption:

> Search and review work even without a ChatGPT connection.

**Demo interaction:** selecting a task changes the caption and media together. One stable browser frame maintains continuity. Include **Replay scene**, **Pause**, and an unobtrusive **View full demo** link. No sign-in wall or live browser-data request to explore this sample.

**Proof rule:** the stage uses recordings or stills of working features. Illustrated overlays may explain transitions but cannot masquerade as a shipped screen. Existing promo footage is source material, not automatic proof every frame is current.

### E. Three steps: make starting feel manageable

> ## Keep browsing. Add a connection when you need it.
>
> **Add Tabot to Chrome.**
> Keep browser activity and page notes together on your device.
>
> **Save what you want to say about a page.**
> Add your own notes, then search and review them alongside retained pages.
>
> **Connect ChatGPT.**
> Authorize the connection and request activity or saved notes from your conversation.

Small expectation-setting line:

> Local search works on its own. ChatGPT setup is separate; keep Chrome open and Tabot connected when requesting results.

Pair steps with three narrow crops of the real store/setup, note, and assistant surfaces. No “ready in 30 seconds” claim unless verified. “Add to Chrome” opens the store; it does not itself grant ChatGPT access.

Repeat **Add to Chrome** here, after the visitor understands the payoff.

### F. Explain the technology without sounding like infrastructure

> ## A connection to your browser work. Not a copy of your browser.
>
> Tabot keeps a searchable record on your device. When you ask through a connected ChatGPT conversation, Tabot looks up the request locally and returns selected results.

Use an interactive cutaway with three labeled stations:

**1. On your device**

> Your retained activity, page excerpts, notes, and search index live in the Chrome extension. Search happens here too.

**2. The connection**

> A secure relay carries authorized requests between ChatGPT and your running extension. It stores connection details, not browser history or tool results.

**3. In the conversation**

> ChatGPT receives selected activity results or requested notes. It does not receive the history database or automatic page excerpts.

A button labeled **Show a sample request** animates a request going toward the device and a smaller selected result returning. Keep the local archive visibly stationary. This is the technical explanation’s main teaching moment.

#### Optional disclosure: For the technically curious

Use a native expandable disclosure, not a whole architecture essay in the main scroll.

> **Local storage:** TalaDB in Chrome’s on-device file storage (OPFS), accessed by the extension. The dashboard asks the extension for results rather than opening the database itself.
>
> **Local search:** Full-text and vector search with an on-device embedding model. The model helps index and retrieve content; it is not ChatGPT running locally. Keyword search remains available if embeddings fail.
>
> **Assistant connection:** Eight read-only MCP tools, authorized using OAuth. A Cloudflare relay connects ChatGPT to the running extension over WebSocket. MCP is the interface that lets ChatGPT request a tool result.
>
> **Result limits:** Activity/site results omit raw event rows, page titles, paths, and excerpt bodies. Requested note titles/text can be returned after limited sensitive-pattern filtering. The relay does not store history or tool results.

No protocol vocabulary appears before the value and task demonstrations.

### G. Trust: answer the worry, then return to the payoff

> ## You choose the connection. Your records stay local.
>
> Use local search without connecting an assistant. Pause tracking from the extension. Connect ChatGPT when you want to request activity or notes.

Three concise supporting rows, not “security certification” cards:

- **No typed input or form values recorded.** No screenshots or full-page snapshots either.
- **Selected results, not your history database.** Automatic page excerpts stay local.
- **Read-only assistant tools.** Tabot’s tools retrieve information; they do not click through sites or perform browser actions.

Necessary disclosure, visible rather than hidden in a tooltip:

> Requested note text and titles can leave your device. Selected sensitive patterns are filtered, but not every sensitive detail is caught. Email and phone numbers are not covered.

Link: **Read how your data is handled** → existing privacy page.

### H. Questions that remove install friction

Use five native accordions. Answers are real copy, not placeholders.

**Is this another browser history search?**

> Search is one part of Tabot. The connection lets ChatGPT request retained browser activity and saved notes, so those records can become an input to your conversation, not just something you look up.

**Will ChatGPT see everything I browse?**

> No. Authorized requests return selected results, not a copy of your history. Activity results contain site and timing information, not page text. Requested note text and titles can be shared; automatic excerpts remain local.

**Can it read a whole page or do tasks for me?**

> Not through the current assistant tools. You can review saved excerpts locally and request your own saved notes through ChatGPT. Reusable task contexts and user-directed automations are future direction, not features available now.

**Do I have to connect ChatGPT?**

> No. You can use Tabot’s local search and review without it. Connect ChatGPT separately when you want to request activity or notes in a conversation. Your ChatGPT account must support the connection setup described in the guide.

**What needs to stay open?**

> Chrome must be open with Tabot enabled and connected in the same Chrome profile used for authorization. If the extension is unavailable, assistant requests cannot return local results. Tabot does not keep a cloud copy to answer instead.

Avoid invented pricing, “free forever,” and compatibility promises. If pricing must be addressed, first verify the actual offer.

### I. Final close: return to the emotional promise

> ## Don’t leave your browser work at the chat box.
>
> Bring your Chrome activity and saved notes into your next conversation with ChatGPT.
>
> **Add to Chrome**
>
> Available on the Chrome Web Store.

Resolve the green thread from the hero here: the browser trail and conversation are side by side, with one explicitly requested note between them. No confetti or animated success state before installation.

Footer: Tabot, privacy, GitHub, and existing setup/help destinations. GitHub is for inspection and contribution, not the main user journey.

## 5. Motion choreography: one memorable story, not ten fade-ins

### Hero sequence: “Carry the thread”

**Duration:** one approximately 8-second sequence after the poster is ready. Text and CTA remain usable from first paint. Play once, hold the final composition, offer **Replay animation** and **Pause animation**.

| Time | Choreography | Meaning |
| --- | --- | --- |
| 0–1.2s | Three illustrated tabs settle along a curved rail with different depths; thread draws along the rail using an SVG stroke mask | Work is scattered across browsing |
| 1.2–2.6s | One distinct user-written note folds into view beside a tab; highlight only its note marker | Notes are authored by the user, not automatically inferred |
| 2.6–4.0s | A chat question appears as one complete message; a request marker travels back toward the local note | The user asks first; the archive is not streaming to AI |
| 4.0–6.0s | A duplicate of only the selected note moves to the conversation using matched-position transforms; original note stays in place | A requested result leaves, not the database |
| 6.0–8.0s | Illustration settles; final result and local archive both remain visible; a drawn annotation underlines “you ask” | A clear, legible end state, not perpetual motion |

“Fold” is an illustrated transformation, not a fake application interaction. Label the whole scene **Illustrative example**. Do not animate an automatic summary being generated from the three tabs.

### Product scene transitions

- Tabs respond in 120–180ms. Active capsule slides to the chosen task; text changes with a short crossfade.
- Keep the shared browser frame. Match the note/result crop across two shots when real recordings allow it; otherwise use a clean 300ms crossfade instead of inventing UI continuity.
- Give the incoming image a restrained 1.03 → 1 scale settle over 600ms and a drawn annotation a 100ms-delayed entrance.
- Default is manual scene selection. After a scene ends, show **Next: Retrace my browsing** rather than auto-switching while someone is reading.
- One playback control manages the active scene. Switching tabs stops the old media; keyboard focus stays on the selected tab.

### Scroll-linked transformation

On wide screens, the demo media stage can remain sticky while its three concise explanation blocks pass beside it. Use at most one roughly 1.5-viewport sticky passage, with enough clearance below the header. Scroll remains native and reversible; no wheel interception, snap trapping, or forced playback.

Use the thread as the shared visual anchor between recognition, proof, and technical cutaway. It may draw into each section on entry once. Do not run a giant full-document animation that demands continuous repaint.

On mobile, remove sticky choreography and stack the three scenes or use the explicit selectors above the stage. No hidden sideways carousel.

### Cutaway request animation

Only runs on **Show a sample request**. A question travels ChatGPT → connection → local archive, a lookup highlight appears locally, then a small result travels back. The archive stays put. Different shapes plus labels distinguish request and response; color is not the only cue.

Duration about 3 seconds; replayable, interruptible, and backed by a static three-step text explanation. No blinking server farm or streaming full-page text.

### Small moments

- Main CTA: arrow moves 3px on hover, 120ms press feedback; visible keyboard focus, no magnetic cursor.
- FAQ: plus rotates into minus while native disclosure updates immediately; no slow height animation that blocks reading.
- Final thread: a single 500ms stroke finish on first entry, not an infinite pulse.
- General easing: `cubic-bezier(0.16, 1, 0.3, 1)`. No reflex bounce, letter-by-letter headlines, scroll-jacked page zoom, or content hidden until animation runs.

### Motion controls and delivery

- Respect `prefers-reduced-motion`: static hero end frame, no spatial transfers or sticky scene changes, direct tab content updates. Preserve every caption and proof point.
- Visible pause for any nonessential animation lasting over five seconds. Pause offscreen and when the document is hidden. Never autoplay audio.
- Use CSS/SVG and existing `motion/react`. No new animation dependency or mandatory WebGL canvas for this concept.
- Design desktop depth, mobile framing, and static fallback separately rather than shrinking the entire desktop illustration to unreadable size.

## 6. Conversion UX and states

### Install path

`Landing → Chrome Web Store → install → extension’s existing onboarding → local review → optional ChatGPT setup`.

Only claim each state when the relevant system verifies it. Clicking the store link does not mean installation succeeded. Landing page must not show a celebratory “Connected” state on a click or OAuth grant alone.

- Before install: **Add to Chrome**.
- Already installed, if the existing validated extension check confirms it: **Open Tabot**. Unknown/error stays unknown, not installed.
- Unsupported/mobile browser: say **Install in desktop Chrome**. Provide the store link and setup instructions; do not offer an unbuilt “send to desktop” email flow.
- Store URL missing: release-blocking configuration error. Never silently fall back to GitHub while leaving an install label.

### Demo states

- Ready: poster and useful caption visible; play control available.
- Loading: stable stage with poster; no page-wide skeleton or layout jump.
- Media error/offline: keep scene stills and transcript; **Try loading demo again**.
- No JavaScript: all page copy, store link, static scene descriptions, privacy link, and native disclosures still work.
- Sample data: visibly identified as illustrative; no actual visitor history queried or uploaded by the marketing demo.

### Accessibility and responsive behavior

- Semantic headings/landmarks, keyboard-operable tabs with proper tab/tabpanel relationships, arrow-key selection, and visible focus.
- Do not announce every animation frame or fictional chat token. Present a concise static scene description to assistive technology.
- At least 48px touch targets, body at least 16px, controls usable at 200% zoom, no content clipped at 320px width.
- Dark text on lime for CTA; measure WCAG AA contrast in the rendered implementation. Decorative thin thread is not a control boundary.
- Caption recorded speech, provide transcripts, and put important annotations in selectable text, not only inside pixels.
- Sticky mobile install bar appears only after the hero CTA leaves view, respects safe areas, and does not cover demo controls or FAQ content.

## 7. Build handoff and proof checklist

**Implement this landing spec in the existing TanStack Start web app. Do not redesign the workspace or change capture/relay behavior.** Reuse logo, fonts, theme, messaging checks, privacy route, and URL configuration. No production UI changes are part of this document task.

### Assets needed

1. Original browser-work hero illustration in separated SVG layers; mobile crop and static end-frame export.
2. Synthetic supplier note fixture and real capture of save → retrieve note in ChatGPT, plus verified follow-up if shown.
3. Synthetic activity query capture showing only actual allowed fields.
4. Current local search/excerpt-reader capture.
5. Posters, short captions, and transcript. Existing `videos/tabot-promo/renders/tabot-30s.mp4` and `videos/tabot-promo/renders/working-demo-mcp.mov` are candidates to audit/reuse, not assumed fresh.

No made-up testimonials or traction. Until authentic social proof exists, product proof carries that role. Do not display a Chrome Web Store badge as endorsement or invent ratings.

### Engineering constraints

- Public `/` remains prerendered and useful without hydration. Preserve canonical/share metadata and base-path-safe links/assets.
- Hero poster/illustration loads before motion. Demo footage loads on intent or near viewport; never preload all scenes or autoplay the existing 30-second movie behind the page.
- Target LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at the 75th percentile when field data exists; these are goals, not claimed measurements.
- Aim for ≤200KB compressed initial hero illustration/poster and bounded transform/opacity animation. If artwork exceeds that, simplify its visible layers before adding a renderer.
- Technical nouns belong in disclosure, not above-fold copy. No “OPFS,” “MCP,” “embeddings,” or “bounded projections” in hero text.

### Acceptance

- A nontechnical visitor can say “It connects my Chrome activity and notes to ChatGPT,” not “It’s a local database” or “It automatically reads every page for AI.”
- First viewport contains a strong promise, plain explanation, visible Chrome install action, and recognizable browser/assistant relationship.
- Three different task scenes show real current capabilities; scene one proves the browser-to-assistant payoff, not merely a settings screen.
- Hero, product selector, and technical cutaway have distinct authored motion. Reduced-motion/static versions retain the same meaning.
- Current product limits are accurate without dominating the pitch. No recurring beta warnings or roadmap sales bait.
- Published store link, mobile behavior, demo failure, keyboard flow, contrast, reduced motion, and real Chrome/ChatGPT setup are checked before release.

**Source boundaries:** `PRODUCT.md`, `docs/system.md`, and `apps/mcp-server/README.md` establish capability/data limits; current code establishes implementation behavior. Founder confirmation supersedes stale launch-status text. This brief changes presentation, not the product contract.
