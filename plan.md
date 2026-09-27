# Tabot v0.2.0 --- Product & UX Plan

## Release

-   Current version: `v0.1.3`
-   Next version: `v0.2.0`
-   Release type: **major product/UX release**
-   Goal: move Tabot from a browser-activity product into an **AI
    context product** centered on ChatGPT.

------------------------------------------------------------------------

# 1. Product Direction

Tabot should evolve from:

> Record my browser activity.

into:

> Understand my browser activity.

and, with `v0.2.0`:

> **Turn my browser activity into context my AI can use.**

The release should make the following loop the core product experience:

``` text
INSTALL
   ↓
BROWSE NORMALLY
   ↓
TABOT OBSERVES LOCALLY
   ↓
SESSION FORMS
   ↓
CONTEXT FORMS
   ↓
MEMORY FORMS
   ↓
AI-READY CONTEXT
   ↓
USER IS NOTIFIED
   ↓
GIVE CONTEXT TO CHATGPT
   ↓
CHATGPT CAN REASON WITH USER'S BROWSER CONTEXT
```

Do not treat the dashboard, memories, notifications, and ChatGPT
integration as unrelated features. They should form one coherent product
loop.

------------------------------------------------------------------------

# 2. Scope

## P0 --- ChatGPT Integration

`v0.2.0` should support **ChatGPT as the only AI provider**.

Other AI providers should remain disabled/out of scope for this release.

The user experience should be:

``` text
Install Tabot
    ↓
Connect Tabot to ChatGPT
    ↓
ChatGPT can retrieve useful Tabot context
```

MCP is implementation plumbing. **Do not expose MCP terminology or
configuration complexity to normal users.**

The user-facing concept should be:

> **Connect Tabot to ChatGPT**

or equivalent.

### Expected behavior

ChatGPT should be able to access relevant Tabot context through the
integration.

The integration should prioritize:

-   recent context
-   relevant contexts
-   sessions
-   memories
-   useful activity evidence when required

Do not make the primary AI experience depend on dumping the entire raw
telemetry export into ChatGPT.

The architecture should preserve Tabot's local-first principle as much
as technically possible.

------------------------------------------------------------------------

# 3. P0 --- AI-Ready Context

The important state is not merely:

``` text
Memory created
```

It is:

``` text
AI-ready context
```

A memory/context should become AI-ready when it has enough meaningful
evidence to be useful.

Conceptually:

``` text
activity
   ↓
session
   ↓
context
   ↓
memory
   ↓
AI-ready context
```

Do not notify users for every low-value event or memory.

The system should use the existing derived-context pipeline and only
surface meaningful activity.

Examples of useful AI-ready context:

-   sustained research around a topic
-   a coherent workflow across multiple sites
-   repeated activity around a project
-   meaningful transitions between research and implementation
-   a newly formed memory with enough supporting activity

Avoid inventing conclusions that are not supported by observed activity.

------------------------------------------------------------------------

# 4. P0 --- Memory / Context Notification

When meaningful AI-ready context is formed, Tabot should notify the
user.

The notification should communicate value rather than implementation
details.

Example:

``` text
🧠 Tabot found something

You spent 42 minutes researching
AI browser context + MCP.

A new context was formed.

[See what Tabot learned]
[Give to ChatGPT]
```

Another possible state:

``` text
🧠 Context ready

You've been researching
"AI browser context"

Tabot has enough context for AI
to understand this thread.

[Ask ChatGPT]
```

### Important

Do not make notifications noisy.

A notification should require meaningful evidence, such as:

-   sufficient activity duration
-   multiple related activities
-   meaningful context formation
-   a new/useful memory
-   enough information for an AI assistant to reason over

The product should feel like:

> Tabot interrupted me because it found something useful.

Not:

> Tabot is notifying me because an algorithm ran.

------------------------------------------------------------------------

# 5. P0 --- Dashboard Redesign

The dashboard should stop feeling like a telemetry/debugging dashboard.

Current-style metrics such as:

``` text
Activities: 1,284
Sessions: 43
Contexts: 18
Memories: 7
```

may still exist, but they should not be the primary experience.

The dashboard should answer:

> **What has Tabot learned about what I've been doing?**

## Dashboard hierarchy

Use the following conceptual hierarchy:

``` text
Activities
    ↓
Sessions
    ↓
Contexts
    ↓
Memories
```

### Activities

Raw evidence of browsing behavior.

Show:

-   timeline
-   activity counts
-   sites
-   timestamps
-   meaningful transitions

### Sessions

Temporal groupings of activity.

Show:

-   duration
-   activity count
-   participating sites
-   timeline
-   session topic/context where available

### Contexts

What the user appears to have been doing during a group of activity.

Example:

``` text
AI Browser Context

18 activities · 6 sites
47 min

Research → implementation
```

### Memories

Higher-level derived observations.

Examples:

``` text
🧠 You spent most of the morning
researching AI context systems.

🧠 You repeatedly moved between
GitHub, ChatGPT and documentation.

🧠 Your recent activity appears
centered around Tabot.
```

Memory wording must distinguish observed evidence from inference. Do not
claim page contents or user intent unless the underlying data supports
it.

------------------------------------------------------------------------

# 6. Dashboard Visual Experience

The dashboard should be interesting to inspect.

Prefer visual storytelling over raw statistics.

A conceptual layout:

``` text
TODAY

Your browsing activity

09:00 ────────●──────────────
              │
              │ Research
              │
10:00 ────────●───────●──────
                      │
                      │ Tabot
                      │
11:00 ────────●───────●──────
              │
              │ GitHub
              │
12:00 ────────────────────────
```

Then show context cards:

``` text
┌─────────────────────────────┐
│ 🧠 AI + Browser Context     │
│                             │
│ You spent 1h 24m exploring  │
│ browser-based AI context.   │
│                             │
│ 34 activities · 8 sites     │
│                             │
│ [Explore context]           │
└─────────────────────────────┘
```

And memory cards:

``` text
MEMORIES

🧠 You spent most of the morning
researching AI context systems.

🧠 You repeatedly moved between
GitHub, ChatGPT and documentation.
```

The goal is for the dashboard to feel like a **visual history of the
user's work/research**, not an observability console.

------------------------------------------------------------------------

# 7. P0/P1 --- First-Run Experience

The fundamental problem after installation is:

> At T+0, Tabot has no meaningful context yet.

Do not manufacture fake immediate value.

Instead, make the user understand that Tabot is actively building
context.

Immediately after installation, show something like:

``` text
Tabot is watching.

Browse normally. Tabot will automatically
build useful context from what you do
across Chrome.

0 memories yet

Once Tabot finds something interesting,
we'll let you know.
```

As activity accumulates, provide lightweight progress:

``` text
Building your context

● 12 activities
● 2 sessions
○ First memory forming...

Keep browsing normally.
```

This gives the user a reason to continue browsing instead of seeing an
empty dashboard.

------------------------------------------------------------------------

# 8. Popup Redesign

The popup should become a **re-engagement surface**, not primarily a
settings screen.

Its primary question should be:

> What happened since I last looked?

Example:

``` text
┌───────────────────────────┐
│ TABOT                     │
│                           │
│ 🧠 2 new memories         │
│                           │
│ You were researching:     │
│                           │
│ AI context systems        │
│                           │
│ 23 activities · 5 sites   │
│                           │
│ ───────────────────────   │
│                           │
│ ✨ Give this to ChatGPT   │
│                           │
│ [Open Tabot]              │
└───────────────────────────┘
```

The primary CTA should eventually be:

> **Give this to ChatGPT**

or:

> **Ask ChatGPT**

The popup should surface meaningful derived value rather than raw
telemetry.

------------------------------------------------------------------------

# 9. Chrome Startup / Re-engagement

When Chrome starts, Tabot should be able to surface a lightweight
reminder when appropriate.

Do not simply notify on Chrome startup every time.

The trigger should depend on useful new context.

Conceptually:

``` text
Chrome startup
      ↓
Has meaningful new context formed?
      ↓
      YES
      ↓
Show lightweight Tabot reminder
```

Example:

``` text
🧠 Tabot found something new

A new memory was formed from your
recent browsing.

[See it]
[Give to ChatGPT]
```

Avoid notification fatigue.

If there is no meaningful new context, do nothing.

------------------------------------------------------------------------

# 10. ChatGPT "Aha" Moment

The most important UX outcome of `v0.2.0` is:

> **The user realizes that ChatGPT now understands what they've actually
> been working on.**

Example user interaction:

``` text
User:
Help me figure out what I should do next.
```

ChatGPT should be able to use Tabot context and reason over recent
activity.

A useful response might identify:

-   recent research threads
-   related projects
-   repeated browsing patterns
-   transitions between research and implementation
-   relevant recent memories

The exact response is controlled by ChatGPT, but Tabot must provide
sufficiently structured context for this to work reliably.

This is the core product "aha" moment.

------------------------------------------------------------------------

# 11. Data Access Principles

Maintain the local-first architecture.

Prefer:

``` text
Raw telemetry
    ↓
Local processing
    ↓
Derived context
    ↓
AI retrieval
```

over:

``` text
Raw telemetry
    ↓
Upload everything
    ↓
AI
```

The AI-facing interface should expose useful derived context first.

Potential conceptual retrieval capabilities:

``` text
search_context(query)
get_current_context()
get_recent_context()
get_session(id)
get_page_context()
```

Exact implementation should follow the existing architecture rather than
introducing unnecessary infrastructure.

Do not build a new cloud data store for browser history as part of this
release.

------------------------------------------------------------------------

# 12. Privacy Requirements

Preserve the existing PII redaction behavior and local-first
architecture.

Do not regress:

-   default PII redaction
-   covered sensitive-data detection
-   sanitization of derived context
-   useful project/site identifiers that are not inherently sensitive

The release should continue treating PII redaction as protection for
covered sensitive classes, not as universal detection of every possible
personal identifier.

Before shipping, verify that sensitive URL components such as
authentication/session/query data are not unnecessarily exposed through
the AI-facing context path.

Do not block the release merely because generic names/usernames are not
automatically redacted.

------------------------------------------------------------------------

# 13. UX Principles

## Principle 1 --- Value comes from derived context

Do not make raw telemetry the main product experience.

## Principle 2 --- No fake value at install

At installation there may be no meaningful context. Tell the user Tabot
is building it.

## Principle 3 --- Reward meaningful moments

When Tabot forms useful context, surface it.

## Principle 4 --- AI is the destination

The dashboard explains what Tabot knows.

ChatGPT is where that context becomes actionable.

## Principle 5 --- MCP stays invisible

Users should connect Tabot to ChatGPT, not configure an MCP server.

## Principle 6 --- Notifications must be sparse

Only notify when there is meaningful new context.

## Principle 7 --- Evidence before inference

Derived memories must remain grounded in observed activity.

------------------------------------------------------------------------

# 14. Release Priorities

## P0

### ChatGPT integration

-   ChatGPT-only provider
-   Tabot connection flow
-   AI context retrieval
-   relevant context exposed to ChatGPT
-   MCP implementation hidden from normal users

### AI-ready context

-   meaningful-context detection
-   AI-ready state
-   context retrieval

### Notification / re-engagement

-   memory/context notification
-   popup CTA
-   "Give to ChatGPT" / "Ask ChatGPT"

### Dashboard

-   activity timeline
-   sessions
-   contexts
-   memories
-   meaningful visualizations
-   "what you've been working on" section

## P1

### First-run onboarding

-   explain local observation
-   show context-building progress
-   explain when value will appear

### Chrome startup reminder

-   only when meaningful new context exists
-   avoid repeated notifications

## Out of scope

For `v0.2.0`, do not expand into:

-   additional AI providers
-   generic personal-profile generation
-   centralized browser-history storage
-   large raw JSONL AI exports
-   desktop/native companion application
-   broad universal PII detection
-   unnecessary telemetry architecture rewrites

------------------------------------------------------------------------

# 15. Implementation Strategy

Before changing architecture:

1.  Inspect the current Tabot data model and derived-context pipeline.
2.  Reuse existing activity → session → context → memory generation.
3.  Identify the cleanest existing interface for AI-facing retrieval.
4.  Implement ChatGPT integration around that interface.
5.  Build dashboard visualizations from existing derived data.
6.  Add meaningful-context detection for notifications.
7.  Add popup/re-engagement UX.
8.  Add first-run state.
9.  Test the complete install → browse → memory → ChatGPT flow.
10. Bump version from `0.1.3` to `0.2.0`.

Do not rewrite working telemetry or privacy infrastructure unless
required by the new UX.

------------------------------------------------------------------------

# 16. Acceptance Criteria

`v0.2.0` is complete when a new user can:

### Installation

-   install Tabot
-   understand what Tabot does
-   understand that useful context will form as they browse

### Browsing

-   browse normally without manual actions
-   have activities collected locally
-   have sessions/contexts/memories generated normally

### Context formation

-   see meaningful derived context
-   receive a notification when meaningful context becomes AI-ready
-   open the corresponding context from the notification

### Dashboard

-   visually inspect activity
-   understand sessions
-   understand contexts
-   inspect memories
-   see what they have been working on
-   see when context is ready for AI

### ChatGPT

-   connect Tabot to ChatGPT
-   ChatGPT can retrieve relevant Tabot context
-   ChatGPT can reason over that context
-   user does not need to understand MCP configuration

### Re-engagement

-   returning to Chrome can surface meaningful new context
-   notifications are not generated for every event
-   popup provides a clear route to ChatGPT

### Privacy

-   existing PII redaction remains enabled
-   AI-facing data uses the intended sanitized/derived path
-   raw telemetry is not unnecessarily uploaded or exposed
-   sensitive URL components are handled appropriately

------------------------------------------------------------------------

# 17. Success Metric for the Release

The most important metric is not:

``` text
number of events collected
```

or:

``` text
number of memories generated
```

The product loop should be measured around:

``` text
Install
  ↓
First meaningful context
  ↓
User sees it
  ↓
User connects/uses ChatGPT
  ↓
ChatGPT uses Tabot context
  ↓
User returns
```

The central question is:

> **Does a new user experience the moment where Tabot makes their AI
> materially more aware of what they have been doing?**

If yes, the release has achieved its primary product objective.

------------------------------------------------------------------------

# 18. Version

Current:

``` text
v0.1.3
```

Next:

``` text
v0.2.0
```

This is intentionally a minor-version bump because the release
introduces a substantially larger product surface and a new primary
interaction model while remaining within the existing Tabot product
architecture.
