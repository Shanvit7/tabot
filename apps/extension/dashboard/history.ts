import {
	BEHAVIOR_MODEL_LIMITS,
	buildWorkflowHandoff,
	deriveSiteDomain,
	discoverHandwiredWorkflows,
	type StoredTabEvent,
	safeRecallUrl,
	sanitizeEventsForRead,
	sessionForNote,
	sessionize,
	type TabotDatabase,
	UUID_PATTERN,
	validateNoteText,
} from "@tabot/shared";
import {
	type DashboardHistoryResponse,
	type DashboardPagePreview,
	isDashboardPagePreview,
	isRecord,
} from "@tabot/shared/dashboard";
import { isDashboardSender } from "./sender";

type HistoryReader = Pick<
	TabotDatabase,
	| "searchHistory"
	| "searchNotes"
	| "getSearchStatus"
	| "getPageObservation"
	| "readEvents"
	| "getWorkflowCheckpoint"
> &
	Partial<
		Pick<
			TabotDatabase,
			| "updateNoteText"
			| "createWorkflowHandoff"
			| "listWorkflowScriptDrafts"
			| "deleteWorkflowScriptDraft"
		>
	>;

export const readDashboardHistory = async (
	message: unknown,
	senderUrl: string | undefined,
	getDb: () => Promise<HistoryReader>,
	trackingEnabled: () => Promise<boolean> = async () => false,
): Promise<DashboardHistoryResponse> => {
	if (!isDashboardSender(senderUrl))
		return { ok: false, code: "unauthorized-sender" };
	if (!isRecord(message)) return { ok: false, code: "invalid-request" };
	const search = message.type === "SEARCH_HISTORY";
	const updateNote = message.type === "UPDATE_NOTE";
	const workflows = message.type === "GET_WORKFLOW_CANDIDATES";
	const createHandoff = message.type === "CREATE_WORKFLOW_HANDOFF";
	const listScripts = message.type === "GET_WORKFLOW_SCRIPT_DRAFTS";
	const deleteScript = message.type === "DELETE_WORKFLOW_SCRIPT_DRAFT";
	if (workflows || listScripts) {
		// Tracking is rechecked for grants; saved drafts remain readable while paused.
	} else if (
		createHandoff &&
		(typeof message.candidateId !== "string" ||
			!/^handwired-v1-[a-f0-9]{8}$/.test(message.candidateId))
	) {
		return { ok: false, code: "invalid-request" };
	} else if (
		deleteScript &&
		(typeof message.id !== "string" || message.id.length > 128)
	) {
		return { ok: false, code: "invalid-request" };
	} else if (createHandoff || deleteScript) {
		// The validated request is handled by the owner below.
	} else if (updateNote) {
		if (
			typeof message.id !== "string" ||
			message.id.length > 64 ||
			!validateNoteText(message.text)
		)
			return { ok: false, code: "invalid-request" };
	} else if (search) {
		if (
			typeof message.query !== "string" ||
			!message.query.trim() ||
			message.query.length > 240 ||
			(message.limit !== undefined &&
				(typeof message.limit !== "number" ||
					!Number.isInteger(message.limit) ||
					message.limit < 1 ||
					message.limit > 20)) ||
			(message.offset !== undefined &&
				(typeof message.offset !== "number" ||
					!Number.isSafeInteger(message.offset) ||
					message.offset < 0)) ||
			(message.noteOffset !== undefined &&
				(typeof message.noteOffset !== "number" ||
					!Number.isSafeInteger(message.noteOffset) ||
					message.noteOffset < 0)) ||
			(message.from !== undefined &&
				(typeof message.from !== "number" ||
					!Number.isFinite(message.from) ||
					message.from < 0)) ||
			(message.to !== undefined &&
				(typeof message.to !== "number" ||
					!Number.isFinite(message.to) ||
					message.to < 0)) ||
			(typeof message.from === "number" &&
				typeof message.to === "number" &&
				message.from > message.to) ||
			(message.origin !== undefined &&
				(typeof message.origin !== "string" ||
					safeRecallUrl(message.origin)?.origin !== message.origin))
		)
			return { ok: false, code: "invalid-request" };
	} else if (
		message.type !== "GET_PAGE_PREVIEW" ||
		typeof message.id !== "string" ||
		!UUID_PATTERN.test(message.id) ||
		typeof message.url !== "string" ||
		message.url.length > 8192 ||
		safeRecallUrl(message.url)?.href !== message.url
	) {
		return { ok: false, code: "invalid-request" };
	}
	try {
		const db = await getDb();
		if (updateNote) {
			if (!db.updateNoteText)
				return { ok: false, code: "note-update-unavailable" };
			const note = await db.updateNoteText(
				message.id as string,
				message.text as string,
			);
			return note ? { note } : { ok: false, code: "note-not-found" };
		}
		if (listScripts) {
			if (!db.listWorkflowScriptDrafts)
				return { ok: false, code: "workflow-script-unavailable" };
			return { drafts: await db.listWorkflowScriptDrafts() };
		}
		if (deleteScript) {
			if (!db.deleteWorkflowScriptDraft)
				return { ok: false, code: "workflow-script-unavailable" };
			return db.deleteWorkflowScriptDraft(message.id as string);
		}
		if (workflows || createHandoff) {
			if (!(await trackingEnabled()))
				return { ok: false, code: "tracking-disabled" };
			const checkpoint = await db.getWorkflowCheckpoint();
			if (!checkpoint) {
				if (createHandoff)
					return { ok: false, code: "workflow-model-not-ready" };
				return {
					candidates: [],
					modelReady: false,
					trainedThrough: null,
					sourceCount: 0,
					truncated: false,
				};
			}
			const events = await db.readEvents({
				limit: BEHAVIOR_MODEL_LIMITS.events + 1,
				types: ["NAVIGATION", "TAB_ACTIVATED"],
			});
			const retained = await sanitizeEventsForRead(events);
			const candidates = discoverHandwiredWorkflows(
				retained.slice(-BEHAVIOR_MODEL_LIMITS.events),
				checkpoint,
			);
			if (createHandoff) {
				const candidate = candidates.find(
					(item) => item.id === message.candidateId,
				);
				if (!candidate)
					return { ok: false, code: "workflow-candidate-not-found" };
				if (!db.createWorkflowHandoff)
					return { ok: false, code: "workflow-unavailable" };
				await db.createWorkflowHandoff({
					payload: buildWorkflowHandoff(candidate),
					sourceIds: [
						...new Set(candidate.occurrences.flatMap((item) => item.sourceIds)),
					],
				});
				return { prepared: true };
			}
			return {
				candidates,
				modelReady: true,
				trainedThrough: checkpoint.trainedThrough,
				sourceCount: checkpoint.sourceIds.length,
				truncated:
					events.length > BEHAVIOR_MODEL_LIMITS.events ||
					candidates.length === 50,
			};
		}
		if (search) {
			const options = {
				from: message.from as number | undefined,
				to: message.to as number | undefined,
				origin: message.origin as string | undefined,
				limit: (message.limit as number | undefined) ?? 20,
				offset: (message.offset as number | undefined) ?? 0,
			};
			const noteOffset = (message.noteOffset as number | undefined) ?? 0;
			const domain = options.origin
				? new URL(options.origin).hostname
				: undefined;
			const [results, notes, events, searchStatus] = await Promise.all([
				db.searchHistory(message.query as string, options),
				db.searchNotes(message.query as string, {
					from: options.from,
					to: options.to,
					domain,
					limit: options.limit,
					offset: noteOffset,
				}),
				db.readEvents(),
				db.getSearchStatus(),
			]);
			const sessions = sessionize(events as StoredTabEvent[]);
			return {
				results,
				searchStatus,
				notes: notes.map((note) => {
					const session = sessionForNote(note, sessions);
					return {
						id: note.id,
						text: note.text.slice(0, 4_000),
						createdAt: note.createdAt,
						updatedAt: note.updatedAt,
						url: note.url,
						host: note.host,
						site: deriveSiteDomain(note.host),
						title: note.title,
						favicon: safeRecallUrl(note.favicon ?? undefined)?.href ?? null,
						session: session
							? {
									start: session.startTimestamp,
									end: session.endTimestamp,
									durationMs: session.duration,
								}
							: null,
					};
				}),
			};
		}
		const page = await db.getPageObservation(message.id as string);
		const url = safeRecallUrl(page?.url)?.href;
		if (!page || page.id !== message.id || !url || url !== message.url)
			return { preview: null };
		// Explicit projection: no tab/window IDs, document keys, or privacy findings leave the owner.
		const preview: DashboardPagePreview = {
			id: page.id,
			url,
			timestamp: page.timestamp,
			segments: page.segments,
			...(page.title ? { title: page.title } : {}),
			trigger: page.trigger,
			coverage: {
				partial: page.coverage.partial,
				truncated: page.coverage.truncated,
			},
			redacted: page.privacy.redacted,
		};
		if (!isDashboardPagePreview(preview))
			return { ok: false, code: "preview-unavailable" };
		return { preview };
	} catch {
		return {
			ok: false,
			code: search
				? "search-unavailable"
				: workflows || createHandoff
					? "workflow-unavailable"
					: listScripts || deleteScript
						? "workflow-script-unavailable"
						: "preview-unavailable",
		};
	}
};
