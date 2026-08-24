# Tabot — Phase 2: Derived Browser Intelligence
## AI Agent Execution Plan

### Objective

Build the next intelligence layer for **Tabot** on top of the existing browser telemetry.

The existing telemetry remains the source of truth. Phase 2 transforms raw events into progressively more meaningful representations:

**Events → Sessions → Contexts → Memories**

This phase has **no LLM requirement**. The derived layer should first establish whether deterministic behavioral signals are sufficient to represent useful browser context.

---

## Operating Principles

1. **Inspect before changing.** Understand the current event model, persistence, extension lifecycle, consumers, and data flow before introducing anything.
2. **Preserve raw telemetry.** Raw events remain the source of truth and must not be replaced or mutated by derived state.
3. **No LLM in Phase 2.** Sessionization, context construction, clustering, and memory generation must use signals already available from telemetry.
4. **Choose the implementation.** This plan specifies outcomes and invariants, not algorithms, schemas, libraries, databases, APIs, or file structures. The implementing agent decides what is best after inspecting the codebase.
5. **Prefer derivation over new collection.** Do not expand telemetry until the existing signals have been tested for usefulness.
6. **Validate each layer independently.** Do not move forward until the current layer can be demonstrated with representative data.
7. **Keep derived state rebuildable.** Sessions, contexts, and memories must be reproducible from raw events.
8. **Do not prematurely optimize.** Prove the intelligence model before optimizing for scale.

---

# Phase 1 — Establish the Derived-Layer Boundary

### Goal

Establish a clean conceptual boundary between raw browser observations and derived browser intelligence.

### Agent Tasks

- Inspect the existing event collection and persistence flow.
- Identify the authoritative raw event representation.
- Identify available signals: timestamps, URLs, tab identity, visibility, navigation, interaction, and lifecycle.
- Identify information explicitly unavailable to the system.
- Identify existing consumers that must remain unaffected.
- Decide where the derived layer should live.
- Establish that raw events are immutable source data and derived objects are disposable/rebuildable.

### Completion Criteria

The agent can explain:

- what constitutes a raw event;
- what information is available for behavioral derivation;
- what information is unavailable;
- how derived state can be rebuilt from raw events;
- how the new layer can be introduced without disrupting collection.

Do not proceed until this boundary is clear.

---

# Phase 2 — Events → Sessions

### Goal

Transform individual browser events into meaningful periods of continuous browser activity.

A **session** represents a coherent period during which browser activity can reasonably be treated as one continuous unit.

### Agent Tasks

Determine the appropriate sessionization strategy from the available signals. Reason about:

- inactivity;
- visibility;
- active-tab changes;
- navigation;
- interaction;
- tab lifecycle;
- transitions between active and inactive periods.

A session should answer:

> What happened during this period of browser activity?

### Session Outcome

A session should represent enough information to describe:

- start and end;
- participating tabs/sites;
- activity intensity;
- navigation/activity sequence;
- meaningful transitions;
- overall interaction characteristics.

Do not add semantic interpretation that raw data cannot support.

### Completion Criteria

Given a raw event stream, the system consistently produces sessions such that:

- long inactive periods do not appear continuous;
- normal tab switching does not unnecessarily fragment sessions;
- session boundaries are explainable;
- sessions can be rebuilt from raw events;
- representative event streams produce sensible results.

---

# Phase 3 — Sessions → Contexts

### Goal

Turn sessions into higher-level representations of browser activity that appears to belong together.

A **context** is not a claim about the user's exact intent. It is a representation of a related cluster of browser activity.

### Agent Tasks

Design a deterministic context model using the strongest available signals. Consider:

- temporal proximity;
- recurring sites;
- tab/domain overlap;
- navigation sequences;
- interaction intensity;
- repeated transitions;
- continuity across sessions.

The agent should determine whether contexts should be short-lived, persistent, overlapping, hierarchical, or another structure based on evidence from the codebase and evaluation.

### Context Outcome

A context should help answer:

> Which browser activity appears related to the same piece of work or browsing intent?

The representation should retain evidence for why activity was grouped together.

### Important Constraint

Do not name the user's task unless the available data justifies it.

Supported:

> This context is primarily associated with GitHub, Jira, and Slack.

Not supported by sparse v1 telemetry alone:

> The user was fixing the authentication bug.

### Completion Criteria

The agent can demonstrate:

- related sessions being grouped;
- unrelated sessions remaining separate;
- context membership being explainable;
- contexts being rebuildable;
- confidence/evidence being distinguishable from factual observations.

---

# Phase 4 — Contexts → Memories

### Goal

Create durable, useful representations of browser history from contexts.

A **memory** is not a dump of events. It is a compact representation of something that may be useful later.

Potential memory forms include:

- a period of activity primarily associated with certain sites;
- a recurring browsing pattern;
- several sessions repeatedly involving the same applications;
- a browser context that was revisited multiple times.

### Agent Tasks

Determine what qualifies as a memory.

Establish:

- when a context is worth remembering;
- how memories can be summarized without semantic hallucination;
- how repeated contexts should consolidate;
- how stale or low-value memories should be handled;
- how evidence is retained so each memory can be traced to observed activity.

### Memory Principle

Every memory must distinguish observed facts from inference.

Observed:

> The user repeatedly visited GitHub, Jira, and Slack within the same activity periods.

Not established by v1 alone:

> The user was working on a software issue.

### Completion Criteria

Memories:

- are derived only from available evidence;
- avoid unnecessary duplication;
- can be traced to supporting contexts;
- can be rebuilt;
- are useful for historical browser-context retrieval.

---

# Phase 5 — Browser Memory Retrieval

### Goal

Make the derived layer useful to Tabot without introducing an LLM.

The system should support browser-history questions at the level the evidence permits, such as:

- What browser activity happened recently?
- Which sites were involved in the previous context?
- What contexts occurred today?
- Have I repeatedly visited this group of sites?
- When was the last similar browser context?
- What was I doing immediately before the current context?

### Agent Tasks

Design retrieval around the derived representations. Determine:

- useful retrieval primitives;
- how current context and historical memory should interact;
- how evidence should be surfaced;
- how uncertainty should be represented.

### Completion Criteria

Tabot can retrieve meaningful browser context without requiring an LLM to interpret the raw event stream at request time.

---

# Phase 6 — Live Browser Context

### Goal

Produce a continuously updated representation of the user's current browser state. This is the foundation for the future **Context Understander** and **Native Copilot**.

The live representation should answer:

> What browser context is the user currently in?

### Agent Tasks

Combine the current event stream with derived sessions and contexts. Determine:

- current active context;
- recently relevant tabs/sites;
- interaction intensity;
- recent navigation sequence;
- related prior contexts;
- confidence and supporting evidence.

The live context should update as the user browses.

### Completion Criteria

At any point during normal browser use, Tabot can produce a compact representation of current browser context without requiring an LLM.

---

# Phase 7 — Evaluation Before AI

### Goal

Determine whether the derived layer actually produces useful signal before adding semantic AI.

### Agent Tasks

Construct representative browser activity scenarios and evaluate:

1. Session quality
2. Context coherence
3. Context separation
4. Memory usefulness
5. Historical retrieval quality
6. Live context stability
7. Rebuild consistency

Test ambiguous behavior deliberately, including:

- rapid tab switching;
- long reading sessions;
- multiple unrelated tasks in one browser window;
- the same website used for different tasks;
- returning to an old task after several hours;
- many tabs open but only one actively used.

### Decision Gate

Explicitly answer:

> **Does sparse browser telemetry provide enough signal to represent useful user context?**

If yes, identify the strongest signals and proceed toward semantic enrichment.

If no, identify the minimum additional metadata required and why it is necessary.

Do not add data collection merely because it is available.

---

# Phase 8 — Prepare for the Future Tabot Agent

This phase does **not** implement the LLM agent.

Prepare the derived layer so a future agent can consume:

```text
Current Browser Context
        +
Relevant Browser Memories
        +
Supporting Evidence
```

rather than thousands of raw browser events.

The derived layer becomes the context substrate for future Tabot capabilities:

- Browser Memory
- Context Understanding
- Native Copilot
- contextual actions
- eventually, workflow discovery and automation

---

# Definition of Done

Phase 2 is complete when:

- raw telemetry remains intact;
- events can deterministically become sessions;
- sessions can become contexts;
- contexts can become memories;
- every derived object is rebuildable from raw events;
- current browser context can be queried;
- historical browser context can be retrieved;
- derived claims remain grounded in observed evidence;
- no LLM is required anywhere in the derived layer;
- representative browser behavior has been evaluated;
- there is an evidence-based decision about whether additional metadata is necessary.

## Architectural North Star

```text
Raw Browser Events
        ↓
     Sessions
        ↓
     Contexts
        ↓
     Memories
        ↓
Current + Historical Browser Context
        ↓
          Tabot
        ↓
 ┌───────┼────────┐
 ↓       ↓        ↓
Memory  Copilot  Future Automation
```

**The purpose of Phase 2 is not to build an AI agent.**

It is to build the **browser-context substrate that an AI agent can later reason over.**
