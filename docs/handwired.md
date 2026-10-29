# Handwired: workflow-learning direction

## Goal

Use Handwired as a local numeric model that helps Tabot find useful evidence and prior workflow examples for a user’s requested automation. Handwired ranks evidence; ChatGPT handles language understanding and drafts the workflow. The model must not generate scripts or execute them.

## Product flow

1. User selects a local evidence trail or records a workflow demonstration and states its goal.
2. TalaDB text search retrieves candidate evidence locally; vector embeddings are not required.
3. Handwired ranks candidate evidence or demonstrations for that goal and returns inspectable scores/features.
4. MCP shares only bounded, cited, privacy-filtered context when explicitly requested. ChatGPT can draft a workflow from that context.
5. Tabot saves the draft locally. User reviews and starts runs locally; MCP cannot run workflows.
6. After review or a run, user corrects specific evidence/steps and marks outcomes. These explicit judgments become local training examples.

## Training data and objective

- Raw browser events and page observations are evidence, not relevance labels. Volume, temporal proximity, or same-tab membership alone must not be treated as proof that two items are useful for the same task.
- Training examples should connect a user-stated goal to selected evidence or a demonstrated workflow, with explicit useful/not-useful judgments, edits, and step outcomes.
- Train a task-to-evidence/workflow ranking model. Do not treat the existing pairwise `heuristic-v1` relatedness scorer as the workflow model; its features and objective do not represent task relevance.
- Keep training and inference on-device. Do not upload raw events, page text, or labels for training.
- Do not infer labels from ignored suggestions. Missing feedback is not a negative example.

## Data to collect for demonstrations

Collect only what is needed to understand and replay an explicitly selected workflow: user-stated goal, ordered action type, page origin, semantic target description (such as role and accessible name), non-sensitive page evidence, and step outcome. Never record typed values, passwords, authentication material, or secret form content. Exclude or redact sensitive targets and let users inspect and delete demonstrations and feedback.

Existing tab lifecycle events and redacted page excerpts support local search, but do not by themselves provide reliable intent labels or a replayable action trace. Any richer action capture must be opt-in and separately privacy-reviewed.

## User experience requirements

- Make recording/selecting a demonstration and stating its goal explicit.
- Show candidate evidence with provenance and why it was suggested; allow per-item correction rather than a vague overall star rating.
- Let users edit generated workflow steps and record per-step success, failure, or correction.
- Explain when feedback is used for local training. Provide controls to inspect and delete training examples and reset the learned model.
- Visualize candidate relationships as hypotheses, not facts or calibrated probabilities. Keep an accessible non-graph evidence list and support reduced motion.

## Boundaries

- No vector embeddings are required for this design. TalaDB-backed BM25-like search remains direct retrieval; Handwired is a second-stage ranker.
- ChatGPT drafts a constrained workflow representation from cited context. Tabot validates, stores, and runs it only after local user action.
- No arbitrary autonomous execution, hidden learning from all browsing activity, or claims that a neural score proves intent.

## Current status

This is a pinned product/architecture direction, not an implementation claim. The homepage is empty. Shared local search uses TalaDB records and BM25-like ranking. Handwired training/scoring code exists in shared experiment code, but no runtime workflow model or user-feedback dataset exists. MCP currently exposes local search and evidence trails; related-evidence ranking still uses `heuristic-v1`. The workflow demonstration, feedback UX, task-ranking model, and safe local workflow lifecycle remain unimplemented.
