# Tabot

A Chrome extension + web dashboard for collecting and processing browser activity events at high volume.

## Architecture

```text
Chrome Extension
  → Browser activity events
  → SharedArrayBuffer + Atomics
  → Web Worker
  → Dexie / IndexedDB
  → TanStack Start dashboard
```

## Research & Experimentation

Tabot explores whether low-level browser interaction telemetry can be transformed into useful representations of user activity.

### Research Questions

- Can browser interaction signals help identify meaningful user activity?
- Can browsing activity be segmented into coherent sessions and contexts?
- Can recurring behavioral patterns be discovered from interaction logs?
- How much useful context can be derived without collecting page contents or typed text?

The current pipeline is:

```text
Events
  ↓
Sessions
  ↓
Contexts
  ↓
Memories
```

### Relevant Research

**Kellar & Watters (2006) — Using Web Browser Interactions to Predict Task**

Investigated whether logged browser interactions could predict high-level user tasks.

DOI: `10.1145/1135777.1135906`

**Ustinovskiy, Mazur & Serdyukov (2013) — Intent-Based Browse Activity Segmentation**

Investigated segmentation of browsing logs into logically related activity and the limitations of simple inactivity-based sessionization.

DOI: `10.1007/978-3-642-36973-5_21`

**Apaolaza & Vigo (2019) — Assisted Pattern Mining for Discovering Interactive Behaviours on the Web**

Investigated discovering higher-order behavioral patterns from low-level web interaction logs.

DOI: `10.1016/j.ijhcs.2019.06.012`

### Current Experiment

The immediate goal is to make Tabot's telemetry and derived data exportable for independent analysis and human evaluation.

```text
Browser activity
  ↓
Telemetry
  ↓
Derived representations
  ↓
Export
  ↓
Evaluation
```

The initial experiment is intentionally non-AI: first determine whether the telemetry itself contains useful signal.

## Privacy

Tabot's initial telemetry does not intentionally capture:

- Typed text
- Input contents
- Passwords
- Page DOM contents
- Page text

## Status

**Experimental / research-oriented.**
