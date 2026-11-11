# Plan: learned workflow discovery and browser automation

**Status:** in progress. Handwired checkpoint persistence, bounded automatic training, model-predicted candidates, one-click ChatGPT MCP tool/resource handoff, one-time candidate-bound `save_workflow_script`, and locally persisted unreviewed drafts are implemented. Feedback learning, draft import/edit/review, and execution remain. The MCP tool is implemented in source but not deployed. **Location:** existing AI page, `apps/web/src/routes/_workspace.ai.tsx`.

## 1. Product outcome

Tabot learns from a user's local browser behavior, identifies potentially useful recurring workflows, and presents them for review. User feedback updates the local Handwired model. A one-click **Ask ChatGPT** CTA hands the selected site route to ChatGPT through Tabot MCP, which asks the user what they intend, assesses feasibility, and can save a confirmed declarative script as a local draft.

```text
Local browser observations ──► ordered activity + recurring candidates
                                      │
                         Handwired behavior model
                                      │
                         Handwired-predicted, explainable routes
                                      │
                         user review + feedback ──────► local model update
                                      │
                           Ask ChatGPT (one click)
                                      │
               selected route ──► MCP handoff/resource ──► questions + feasibility
                                                           │
                                              confirmed script ──► local draft
                                                              │
                              import ──► validate ──► review ──► run locally
                                                              │
                            step results + explicit feedback ──┘
```

A workflow is a **hypothesis**, not proof of intent, success, or consent. A user can select, correct, dismiss, or ignore each suggestion. Nothing runs merely because it was observed or generated.

### How this relates to the source plans

This plan incorporates `docs/automations-plan.md`, `docs/notes-plan.md`, `docs/system.md`, and `/Users/zosmaai/Downloads/automata.md`. It **intentionally supersedes their treatment of Handwired as optional or only a task-to-evidence ranker**: workflow discovery itself is driven by the local Handwired behavior model. Do not add deterministic workflow discovery or a deterministic cold-start fallback. Existing documents describe a mix of shipped and proposed behavior; current code is the source of truth.

“Automation script” here means a versioned, executable **declarative script** interpreted by bundled Tabot code, not arbitrary ChatGPT-generated JavaScript. This follows `automata.md` and keeps execution reviewable and compatible with MV3. The user receives a real browser automation, subject to the supported action set.

## 2. Current baseline and limits

- The AI route now displays Handwired-predicted routines, reviewed handoff, and locally saved draft status. Keep `apps/web/src/routes/_workspace.assistant.tsx`, the ChatGPT connection guide, separate.
- Extension activity goes through the bounded pipeline to the offscreen TalaDB owner (`apps/extension/storage/owner.ts`). Dashboard reads go through `apps/web/src/lib/history.ts`, `apps/extension/background.ts`, and `apps/extension/dashboard/`. Only committed writes count as saved; storage/read errors are not empty history.
- Tab lifecycle events, trusted click coordinates, key-activity signals, scroll and bounded visible excerpts support behavioral analysis; they **do not** provide semantic action targets, typed values, a complete replayable action sequence, exact intent, or successful task completion. Existing recurring `Memory` data in `packages/shared/src/memories/memories.ts` uses derived groupings and first-occurrence ordering; it is not an exact reusable workflow. Notes are available as optional evidence, not observed actions or implicit labels.
- Search and notes are already local; reuse their code and storage instead of creating a parallel history pipeline. Preserve individual observation provenance and derive workflow groupings without making one session/memory hierarchy mandatory.
- `handwired` is pinned in `packages/shared/package.json`. The old experiment was removed in `43931d4`; it scored synthetic generic relatedness, not recurrent workflows. Do not restore its weights or treat its labels as user intent. The installed library provides numeric circuits and reference backpropagation; it is not an out-of-the-box workflow learner or reinforcement-learning system. A model, objective, optimizer, training data, and evaluation must be built and verified locally.
- `apps/mcp-server/README.md` documents seven read-only tools, resource `tabot://workflows/pending`, and `save_workflow_script`. The old relay preview mismatch is fixed in the extension projection; regression checks ensure page excerpts, paths, and titles do not reach MCP. Checkpoint persistence, bounded Handwired training, predicted candidates, one-click ChatGPT handoff, and local draft saving now exist; feedback, draft import/edit, and runner remain.

## 3. User journey on the AI page

1. **Automatic learning.** Explain which permitted local activity is ingested and analyzed, that training stays on-device, and what can and cannot be inferred. Existing browser tracking controls ingestion and training; do not add a separate workflow-learning opt-in. Show automatic-training/paused status.
2. **Discover.** Show candidate cards such as “This sequence appeared on several occasions” with sites, ordered observed steps, occurrences/time spread, stable versus varying portions, and missing information. Never claim a calibrated probability or successful completion from visits. Allow search, manual goal entry, and manual workflow creation when no candidate exists.
3. **Review and teach.** User confirms a suggestion is useful, rejects it, edits the goal/steps, or gives per-step corrections. Explain why it appeared and which observations support it. Distinguish observed navigation, notes, user-supplied steps, and inferred/proposed steps. Unreviewed or ignored candidates are not negative labels.
4. **Hand off.** **Ask ChatGPT** is one click, no modal. Tabot queues the selected site's ordered route, recurrence counts, and timestamps locally, then opens ChatGPT with static instructions only (no private data in the URL). ChatGPT reads the one-time handoff through `get_pending_workflow_handoff` or `tabot://workflows/pending`, asks the user what they are trying to accomplish, and assesses feasibility before suggesting steps. It must explain navigation-only evidence limits and never invent actions. After the user confirms the exact script in chat, `save_workflow_script` stores an unreviewed local draft. No automatic send or execution.
5. **Import and review.** Not implemented. User will need to inspect/import the returned JSON script into Tabot, review steps/origins/inputs/risks/missing targets, edit, validate, and save locally.
6. **Run and improve.** User manually starts a reviewed script with runtime inputs; watch progress, confirm consequential operations, stop/cancel, and see per-step results. Explicit feedback can improve future suggestions. A failed or interrupted step is not automatically a negative judgment about the original workflow.

Provide accessible keyboard navigation, labeled controls, reduced motion, and a non-graph list. Cover disconnected extension, no history, no recurrence, first-use/cold start, training and feedback pending, insufficient examples, model errors, missing sources, denied permissions, offline ChatGPT, invalid import, failed save, running, cancellation, and interrupted/unknown outcomes. Never fabricate example data as personal activity.

## 4. Discovery: observations → candidates

### 4.1 Normalize only what is observed

- Read bounded committed event/observation snapshots through the existing owner. Normalize permitted navigation into ordered, deduplicated visits with time, tab/window, canonical local page or origin key, and source IDs. Handle redirects, duplicate lifecycle events, simultaneous tabs, gaps, and missing data; avoid treating tab switches as navigations or crossing unrelated tabs solely because they are close in time.
- Preserve timestamp ordering and provenance. Use bounded temporal windows and explicit cross-tab links as derived analytical views, not mandatory permanent sessions. Grouping is heuristic: mark uncertainty, avoid claiming that a window is a complete action trace, and allow a workflow to span sites/tabs. Track automation-generated activity separately and exclude it from human-behavior training and recurrence evidence to prevent the runner reinforcing its own suggestions; do not rely on DOM `isTrusted` alone.
- Notes and selected page observations may add optional user-review evidence. They do not silently become steps or labels. Sensitive URLs, incognito, paused tracking, password/authentication pages, excluded sites, and capture policy must remain excluded at every new ingestion/analysis boundary.
- Initial discovery is **navigation-level**. A visit to Gmail does not mean “Compose” was clicked. User can add missing steps manually. Rich interaction capture is a separately gated phase below.

### 4.2 Generate explainable recurring candidates

- Use Handwired next-site predictions to discover candidate sequences. Join model-predicted transitions into bounded, same-tab navigation routes and surface a route only after repeated predictions across distinct evidence windows. No rule-based detector may create candidates or stand in when no usable checkpoint exists; show an honest learning/empty/error state instead.
- Give candidates stable, versioned IDs based on predicted route and evidence. Resolve rescans, deleted sources, stale UI references, and changed checkpoints without silently moving feedback to different evidence. Recompute candidates from retained observations and current local predictions; do not persist a duplicate raw-history database.
- Candidate record: ID and model/feature schema version; occurrence references and time range; ordered predicted sites; actual transition matches; prediction source and limits. The UI gets bounded projections, not raw event objects, and must not label model output as calibrated probability, intent, or completion.
- Bound source range, candidate count, sequence length, memory, and runtime. Show truncation and allow refresh. Keep scan/training out of the service worker's capture/serial-write critical path.

## 5. Handwired behavior model and learning loop

### 5.1 Purpose and model design

Handwired implements a local, bounded numeric neural circuit that learns **behavioral sequence regularities** and personalizes which recurring candidates are worth showing. It does not generate scripts, infer a user's true intent, or prove that a workflow is correct.

- Current encoder uses a fixed 32-bucket site hash and two-origin context (64 numeric inputs). Keep raw titles, notes, paths, form values, and secrets out of numeric inputs. Site buckets remain sensitive local data, can collide, and are not anonymization; disclose collisions as a limitation.
- Current Handwired `Circuit` trains a bounded linear next-origin head on ordered, deduplicated same-tab navigation transitions. Labels are the next observed site bucket, not “useful”, “successful”, or “intended”. Keep the model objective local and versioned; enrich features only when a concrete discovery need requires it.
- Discover candidate routes directly from Handwired's next-observed-site predictions; repeated matching evidence controls whether a predicted route is surfaced, not a deterministic fallback detector. Add a separate **feedback head** over candidate features and learned behavior features, trained only from explicit candidate-level useful/not-useful decisions. Handwired drives discovery first, then personalization.
- Use the pinned runtime's `Circuit.evaluateReference` / `backpropagateReference` for a small bounded training loop, and a validated bundled CPU inference path. Verify package imports and MV3 CSP in a real build; use no generated/eval code, remote code, or required WebGPU. Define loss, seed, weight initialization, finite-value checks, gradient clipping, learning-rate bounds, maximum epochs, and cancellation in the implementation and tests. Validate inputs, weights, and outputs; discard a failed update rather than corrupting the last good model.
- Keep the behavior encoder fixed while applying candidate feedback to the feedback head. When behavior retraining changes its feature space, rebuild the feedback head from retained explicit labels against the new model before activating it. This prevents old weights from being applied to incompatible features.

### 5.2 Local training and feedback

- Automatically train from committed local observations whenever existing browser tracking is enabled; no separate workflow-learning setting. This is local sequence prediction, **not** automatic labeling of user intent or quality. Disclose which activity is used. Pausing existing tracking stops ingestion and cancels in-flight training. Never use a network service for training or inference.
- Persist versioned model, feature schema, algorithm, seed, checkpoint, and training-data revision locally via the offscreen owner. Train in bounded chunks outside the service worker's event-ingestion path. Commit a new valid checkpoint atomically; restart, cancellation, expired worker, or failed update leaves previous checkpoint usable. Tracking pause stops new training; deleting source observations invalidates the model. Do not add a second learning toggle.
- Record `useful` / `not useful` feedback with candidate ID, referenced evidence version and timestamp. Save idempotently, show “saved” only on committed ACK, and update the feedback head locally after successful feedback. If a write/update fails, show pending/error and retain the previous valid model; don't imply learning succeeded. A correction is recorded separately from an acceptance; do not turn ignored cards or automatic run failures into negatives.
- On cold start or insufficient data, show no predicted routes and explain automatic training is waiting for enough committed transitions. Existing tracking controls pause/resume. Do not substitute deterministic discovery. Behavior prediction starts after the minimum transition examples exist; feedback-based personalization activates after explicit useful and not-useful labels are available. Store feedback before the personalization head is ready and show its actual state.
- Allow viewing/deleting examples and clearing learned weights, including behavior history-derived model state. Deleting source observations or feedback, or disabling relevant site access, invalidates affected candidates/training data and triggers a local rebuild/reset before affected results are used again. Tie checkpoints to data revisions; cancel or reject in-flight training/commit if its source revision changed so deleted data cannot be restored by a racing update. No deleted source should survive in a model presented as current. Document retention, export, delete-all and size limits.

### 5.3 Development evaluation (non-gating)

Use consented or synthetic fixtures with repeated routes, navigation noise, single visits, variable steps, and excluded sites to catch regressions. Treat metrics as diagnostics, not a launch gate or a user-facing probability. If the dependency, model, or data fails, show the learning error and no candidates; do not substitute deterministic discovery or fabricate confidence.

## 6. Optional explicit interaction demonstration

Navigation history alone cannot generate a dependable click/fill script. Add demonstration only after separate privacy, permissions and UI review; manual step entry is available first.

- User explicitly starts/stops a demonstration; show a persistent recording indicator, selected permitted origins, and deletion controls. Respect paused tracking, incognito, auth/payment/password pages and excluded sites. Do not record credentials, typed values, form contents, secrets or sensitive targets; if target safety is uncertain, omit/stop instead of guessing.
- Capture only permitted action kind, time/order, origin, safe semantic target description, and explicit outcome where available; never mark a click as successful completion by default. Clearly distinguish user-recorded steps from old navigation observations. Review, edit, and delete steps before use or sharing.
- Validate permissions and viable target strategies in real Chrome. This phase is not approval to silently capture every click or keystroke. Only meaningful, consented demonstration data joins candidates or feedback; do not train quality from absent outcomes.

## 7. ChatGPT handoff and return path

### 7.1 CTA and privacy

Implement **Ask ChatGPT** as one direct click on a Handwired candidate—no modal or separate prompt-preview step:

1. The card states what leaves the device: the selected repeated site-origin route and recurrence/timing evidence only. The click is the user's explicit choice to share that bounded handoff. Do not ask for the goal in Tabot first; ChatGPT asks it. Never include page titles, excerpts, paths, raw event IDs, notes, credentials, or user goal in the handoff or ChatGPT URL.
2. On click, queue a short-lived pending handoff in the local extension owner, including exact selected evidence references and a single-use save grant. Open ChatGPT using a static, non-sensitive instruction URL. ChatGPT fetches the pending evidence through `get_pending_workflow_handoff` or `tabot://workflows/pending`; the MCP server routes the request to the authorized installation. If no handoff is pending or MCP is disconnected, ChatGPT asks the user to return to Tabot and retry. No activity data or grant token goes in URL/query strings, browser history, referrers, or logs.
3. ChatGPT explains that evidence shows site navigation, not user intent or successful actions. It asks what the user is trying to accomplish, assesses whether automation can help, requests missing steps instead of inventing them, and proposes only a bounded declarative Tabot script.
4. `save_workflow_script` is the only MCP write tool. Require a one-time, short-lived, save-only grant bound to the candidate, retained evidence references, allowed origins, and exact handoff digest; the grant exists only in that local extension profile and is dispatched through the authorized relay installation. Recheck evidence availability, reject expired/replayed/expanded grants, validate the script at relay and extension, and report success only after local owner ACK. The tool stores an unreviewed local draft; it cannot approve or run it. ChatGPT must show the exact script and ask for user confirmation before calling the tool.
5. Treat ChatGPT as external: the user-selected route evidence leaves the device only through this click/MCP handoff and is subject to ChatGPT's handling. Existing assistant activity tools must also exclude page titles, paths, and excerpts; tests cover both projections and handoff.

### 7.2 Import and script contract

- Accept a validated draft delivered by the authorized `save_workflow_script` MCP tool or pasted/imported JSON when MCP is unavailable; ChatGPT cannot bypass the local validator. Parse with strict size/depth limits; reject unknown versions, fields, action types, unsafe URLs/targets and code. Show validation errors and let user correct/retry. Never evaluate JavaScript, CSS, expressions or remote code from the output.
- Contract: `version`, `name`, `description`, `trigger: manual`, declared input names/types/required status, explicitly allowed origins, and ordered bounded `steps`. Initial supported actions: `navigate` to a user-approved HTTPS origin, `click` on one uniquely resolved accessible target, `fill` a permitted non-secret field from an input supplied at run time, and simple supported `verify` conditions. Each step includes its target/condition and bounded timeout; missing/ambiguous targets fail closed. Do not treat example Gmail selectors as guaranteed.
- Input values are ephemeral runtime parameters; never store them in script, observation, model, prompt, or routine execution log. Reject password, hidden, payment, credential and other sensitive fields. A fill or click can itself trigger autosave, submission, or another side effect; constrain supported sites/targets and fail closed when safety cannot be established, rather than treating action names as a guarantee. Do not automatically submit forms or send, purchase, delete, publish, or change account settings in the first supported scope. Add consequential actions only with a separate risk review and explicit per-action confirmation.
- Validate at import, after every edit, before save, and immediately before each run. Persist the reviewed declarative script locally with stable ID/version via the owner. Track provenance and changes so edited/generated/observed steps stay distinguishable. A saved draft is not permission for unattended execution.

## 8. Browser execution boundary

- Build a bundled extension-side interpreter; ChatGPT supplies data, never executable code. Verify required MV3 permissions and Chrome Web Store/CSP compatibility with a prototype. Existing manifest has `tabs`, `webNavigation` and broad host permissions but no `scripting`; do not assume a dashboard click grants `activeTab`, or that access to an allowlisted dashboard origin authorizes browser control.
- Execute only after an explicit local run confirmation displaying steps, origin, and input names. Use extension-owned messaging with sender/shape validation; bind each request to the approved script, tab/document, permitted origins and current run. Recheck tab URL, redirect destination, tracking/exclusion policy and permission before each action. A destination or target change invalidates the pending action; navigation across origins requires prior approval and a fresh check.
- Resolve targets in the current document against a limited accessible role/name or label strategy. If zero or multiple matches, page changed, target is hidden/disabled/sensitive, or a condition cannot be evaluated, stop and report why. Page DOM is untrusted and semantic labels do not prove an action is harmless. Restrict high-impact controls rather than relying on label matching as a security guarantee.
- Show a running indicator and per-step progress; support cancellation and bounded timeouts. Never blindly retry a possibly consequential action. Prevent concurrent/double starts; persist only necessary run metadata and sanitized outcomes, not field values or page contents. Chrome service workers are ephemeral: restart/interruption yields an **unknown** outcome, not success or an automatic resume. User inspects state before retrying.
- Store reviewed scripts and feedback locally; deleting/disabling a script prevents future starts. A script's execution results can be presented for feedback, but never silently relabel raw observations as successful workflows.

## 9. Implementation slices and acceptance criteria

1. **Handwired workflow discovery.** Implement bounded, provenance-preserving navigation inputs, automatic training/checkpoint persistence, Handwired next-site inference, model-predicted repeated route candidates, and AI-page controls/empty/error states. **In progress:** checkpoint/training lifecycle, Handwired-predicted candidates, and initial page controls landed. **Accept:** candidates arise only from repeated Handwired predictions; no deterministic discovery or fallback; training starts after committed navigation and extension startup; tracking pause cancels training; source deletion/checkpoint corruption fail closed; local data never leaves the device.
3. **Feedback loop.** Add local candidate/step feedback records, feedback head and visible pending/saved/model-updated states. **Accept:** explicit feedback is committed, survives restart, changes the model/ranking when eligible, and can be inspected/deleted/reset; ignored suggestions remain unlabeled; behavior-model refresh rebuilds feedback head.
4. **One-click ChatGPT handoff and draft save.** Implemented one-click **Ask ChatGPT** from a candidate card; it queues selected route evidence locally and opens ChatGPT with static instructions. New `get_pending_workflow_handoff` MCP tool/resource exposes the one-time candidate/evidence-bound grant; `save_workflow_script` stores only a validated local draft after exact-script confirmation. **Accept:** one click → ChatGPT retrieves selected origin sequence via MCP → asks goal and assesses feasibility → user confirms exact script → local draft appears. No modal, page content, or user data in URL; no execution. MCP code is not deployed yet. Draft review/import remains next.
5. **Controlled runtime.** Validate action/permission prototype, then implement narrow bundled `navigate`/`click`/`fill`/`verify` interpreter, execution review, origin checks, user-provided parameters, cancellation and safe outcomes. **Accept:** a user-approved non-sensitive multi-step workflow runs on a test site; unsafe or ambiguous actions stop; restart and duplicate starts cannot silently repeat actions.
6. **Opt-in demonstration.** Only after privacy/permission review, add the recorder described in §6. **Accept:** no values or sensitive targets captured; recording state, exclusions, edit/delete, and provenance tested.
7. **Quality and documentation.** Run held-out model and usability evaluation plus privacy/security tests. Update `docs/automations-plan.md`, `docs/system.md`, `docs/tech.md`, and `apps/mcp-server/README.md` only as relevant behavior ships; explicitly document the changed Handwired role and new tools if any.

## 10. Verification

Add focused runnable checks for navigation normalization, Handwired prediction/candidate identity, feature schema, forward/backprop and finite updates, checkpoint persistence/cancellation/deletion invalidation, feedback persistence/retraining, handoff redaction/consent, script validation, sender authorization and safe execution. Include them in package `check` scripts. Run current relevant regressions:

```sh
pnpm --filter @tabot/shared check:notes
pnpm --filter @tabot/shared check:memories
pnpm --filter @tabot/shared check:historySearch
pnpm --filter @tabot/shared check:privacy
pnpm --filter extension check:storageOwner
pnpm --filter extension check:dashboardSender
pnpm --filter extension check:dashboardHistory
pnpm --filter extension check:pageCapturePolicy
pnpm --filter extension check:searchRanking
pnpm --filter extension check:activityRelay
pnpm --filter mcp-server check
pnpm --filter web check
pnpm --filter web build
pnpm test
pnpm lint
```

Build/load the real extension, check actual MV3/CSP and permission prompts, and exercise Chrome → event pipeline → offscreen owner → AI page → feedback/restart → ChatGPT handoff → imported script → controlled local run. Inspect network traffic: local analysis, learning, feedback, and runs must not upload history; only explicitly confirmed handoff data may leave. Extension build/search-asset preparation may download assets, so separate build traffic from runtime privacy testing.

## 11. Decisions to settle during implementation

- Exact bounded sequence windows, hashed feature dimensions, learning hyperparameters, and minimum training-example count: tune from observed fixtures. Do not block Handwired discovery on quality thresholds or represent predictions as calibrated probabilities.
- Local retention, export, delete-all integration and checkpoint rebuild cost; choose fail-closed behavior when a source disappears or model invalidation fails.
- The smallest usable permission and origin-approval design for the interpreter, including how a dashboard-initiated run is confirmed by the extension.
- Feasible robust target strategies and reliable risk classifications; if a site/action cannot be safely classified or verified, do not execute it.
- Whether optional candidate-specific MCP adds value beyond the first copy/paste handoff. It must not bypass field selection, explicit sharing, local review or execution approval.
