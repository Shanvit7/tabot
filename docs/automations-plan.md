# Tabot Automations Plan

## Goal

Let Tabot help users turn useful, recurring browser activity into reviewable automations. Use local activity as evidence and candidate input—not as proof of intent. The user states the goal, selects or records the workflow, reviews the draft, and explicitly starts any run.

## Product boundaries

- TalaDB is the local source of committed browser events and redacted page observations.
- Recurring-pattern detection may surface a **hypothesis** from separate temporal episodes. Repetition, same-tab membership, volume, or proximity alone never proves that activity is an intended automation.
- Search and recurrence identify candidate evidence. A user-stated goal and explicit selection or demonstration are needed to establish task relevance.
- Handwired is a local numeric **second-stage ranker** for task-to-evidence/workflow relevance. TalaDB text search retrieves candidates first; vector embeddings are not required.
- ChatGPT may interpret the stated goal and cited evidence to draft a constrained workflow representation. It does not execute workflows or produce arbitrary scripts.
- Tabot validates and stores drafts locally. Users review and explicitly start runs locally. MCP can share bounded, cited, privacy-filtered context only on an authorized request; MCP cannot run workflows.
- No autonomous or hidden automation discovery, execution, or training from all browsing activity.

## User flow

1. Tabot may show a recurring behavior as a candidate, with its occurrences, time spread, and evidence. Describe it as a hypothesis, not a fact or calibrated probability.
2. User chooses a candidate or selects local evidence, states an automation goal, and may record an explicit workflow demonstration.
3. TalaDB-backed BM25-like search retrieves candidate evidence locally. Handwired ranks candidate evidence or demonstrations against the stated goal and returns inspectable scores/features and provenance.
4. User reviews why each item was suggested and accepts or rejects items individually. A non-graph evidence list remains available; graph views are optional and accessible.
5. On explicit request, MCP shares only bounded, cited, privacy-filtered context. ChatGPT drafts a constrained workflow representation from that context.
6. Tabot validates and saves the draft locally. User inspects and edits steps, then explicitly starts a local run.
7. User can correct evidence, edit steps, and record per-step success, failure, or correction. Those explicit judgments become local training examples.

## Evidence and demonstrations

- Existing tab lifecycle events and redacted page observations can support search and recurrence hypotheses. They do **not** provide reliable intent labels or a replayable action trace by themselves.
- A demonstration is opt-in and records only what is needed to understand and replay the selected workflow: user-stated goal, ordered action type, page origin, semantic target description (for example, role and accessible name), non-sensitive page evidence, and step outcome.
- Never record typed values, passwords, authentication material, or secret form content. Exclude or redact sensitive targets. Let users inspect and delete demonstrations and feedback.
- Any richer action capture requires separate privacy review and explicit user control.

## Feedback and local training

- Training examples connect a user-stated goal to evidence or a demonstrated workflow, with explicit useful/not-useful judgments, edits, and step outcomes.
- Support per-item evidence correction and per-step workflow feedback; do not rely on one vague overall rating.
- Ignored suggestions and missing feedback are **not** negative examples.
- Explain when feedback is used for local training. Provide controls to inspect/delete examples and reset learned model state.
- Keep training and inference on-device. Never upload raw events, page text, demonstrations, or labels for model training.
- Train a task-to-evidence/workflow ranking model from explicit feedback. Do not promote generic identity/time matches into relevance scores: their conditions do not represent task relevance.

## Safety and UX requirements

- Workflow drafts use a constrained representation; validate allowed actions and targets before saving or running.
- No arbitrary autonomous execution. Every run follows explicit local user action and remains reviewable.
- Show provenance and why evidence was suggested. Distinguish observed evidence from inferred workflow steps.
- Present recurrence and ranker output as hypotheses/scores, never proof of intent or calibrated probabilities.
- Support reduced motion and provide an accessible non-graph evidence list.

## Implementation sequence

1. **Candidate evidence:** use existing TalaDB search and recurrence derivation to present inspectable, explicitly non-binding candidate workflows. No new automatic capture or hidden labels.
2. **Goal and demonstration UX:** capture user-stated goals and opt-in, privacy-reviewed demonstrations with redaction and deletion controls.
3. **Feedback model:** collect explicit per-item and per-step judgments locally; add inspect/reset/delete controls. Missing feedback remains unlabeled.
4. **Task ranker:** define task-to-evidence/workflow features and evaluation from explicit judgments; do not reuse generic evidence-match conditions as relevance. Train and infer locally.
5. **Draft lifecycle:** define, validate, store, edit, and locally execute constrained workflows only after explicit user action. Keep MCP as context relay only.
6. **Quality and privacy gates:** test usefulness, false suggestions, replay safety, redaction, deletion, and no-network/no-upload guarantees before release.

## Current status

Planning only—not an implementation claim. The homepage is empty. Shared local search uses TalaDB records and BM25-like ranking. Recurring `Memory` patterns are derived locally from browser contexts; they are not stored as workflow records. Handwired experiment/scoring code exists in shared code, but no runtime workflow model or user-feedback dataset exists. MCP exposes local search and evidence trails; related-evidence results are explicit page-key, origin, or time-window matches with no relevance score. Candidate automation UX, demonstration capture, feedback UX/dataset, task-ranking model, and safe local workflow lifecycle remain unimplemented.
