export {
	type ActivityStats,
	computeActivityStats,
	computePlaceStats,
	dayKeyOf,
	type PlaceStats,
	type RefSample,
	type WeekDay,
} from "./activities/activity-stats";
export {
	type ActivityRef,
	type ActivityTransition,
	activityRef,
	type DerivedEvent,
	deriveMeaningfulEvents,
	deriveTransitions,
} from "./activities/meaningful-events";
export {
	type ActivityMetricsInput,
	activityMetricsResponse,
	buildActivityMetrics,
	type MetricSite,
	type MetricTransition,
	parseActivityMetricsInput,
} from "./activities/metrics";
export {
	type AssistantConnections,
	type AssistantProvider,
	assistantProviderFromClientName,
	parseAssistantConnections,
} from "./assistant-connections";
export {
	type BrowserContext,
	buildContexts,
	CONTEXT_THRESHOLDS,
	type ContextDomain,
	type Excursion,
	getContextById,
	getContexts,
	getRecentContexts,
} from "./contexts/contexts";
export {
	bulkInsertEvents,
	bulkInsertIngestRecords,
	countEvents,
	createEventsDb,
	deletePageObservations,
	getAllEvents,
	getEventsBetween,
	getPageCaptureSiteSummaries,
	getPageObservationById,
	getPageObservations,
	type InsertEventsResult,
	type PageCaptureSiteSummary,
	type PageObservationSummary,
	prunePageObservations,
	type StorageTransport,
	type StoredIngestRecord,
	type StoredTabEvent,
	sanitizeEventsForRead,
	storedTabEventSchema,
	TabotDatabase,
} from "./events/db";
export {
	EVENT_TYPES,
	LIFECYCLE_KINDS,
	type LifecycleKind,
	POPUP_SOURCE,
	type TabEvent,
	type TabEventMetadata,
	type TabEventType,
	ValueToEventType,
} from "./events/events";
export {
	EventConflictError,
	EventValidationError,
	eventBytes,
	eventIdentity,
	type IngestAck,
	isTransientStorageError,
	MAX_EVENT_BYTES,
	normalizeEvent,
	orderEvents,
	PAGE_EVENT_TYPES,
	PAGE_PROTOCOL_VERSION,
	type PageEventType,
	storageErrorCode,
	UUID_PATTERN,
} from "./events/ingest";
export {
	getMeta,
	removeMeta,
	type TabMeta,
	tabMeta,
	updateMeta,
} from "./events/metadata";
export { logger } from "./lib/logger";
export {
	createEmptyStats,
	type PipelineStats,
	type ReadFailure,
	readFailure,
	type StatsSnapshot,
} from "./lib/protocol";
export {
	buildMemories,
	getMemories,
	getMemoriesBySignature,
	getMemoryById,
	MEMORY_THRESHOLDS,
	type Memory,
	type MemoryDomain,
} from "./memories/memories";
export {
	type NewPageNote,
	noteMatchesDomain,
	type PageNote,
	searchNoteRows,
	sessionForNote,
	validateNoteText,
} from "./notes/notes";
export {
	PAGE_MIN_INTERVAL_MS,
	PAGE_RESOURCE_DAILY_BYTES,
	PAGE_SITE_HOURLY_BYTES,
	pageObservationBudgetFailure,
	pageObservationSizeBytes,
} from "./pages/budget";
export {
	MAX_PAGE_OBSERVATION_BYTES,
	MAX_PAGE_SEGMENT_CHARS,
	MAX_PAGE_SEGMENTS,
	normalizePageObservation,
	PAGE_OBSERVATION_PROTOCOL_VERSION,
	PAGE_PRIVACY_POLICY_VERSION,
	type PageObservationTrigger,
	type StoredPageObservation,
	sanitizePageObservationForIngestion,
} from "./pages/observations";
export { canonicalPageUrl } from "./privacy/canonical-url";
export {
	sanitizeEventForIngestion,
	sanitizeUrlForIngestion,
	searchQueryFromUrl,
} from "./privacy/ingest";
export { piiRedactor } from "./privacy/pii-redactor";
export {
	PII_REDACTION_DEFAULT_ENABLED,
	sanitizeDerived,
} from "./privacy/sanitize";
export type {
	PiiFinding,
	PiiRedactionOptions,
	PiiRedactor,
	RedactionResult,
} from "./privacy/types";
export {
	type ActivitySearchResult,
	type HistorySearchCitation,
	type HistorySearchOptions,
	type HistorySearchResult,
	parseRecentSearchQuestion,
	projectActivitySearchResults,
	type SearchAvailability,
	safeRecallUrl,
	searchHistory,
} from "./recall/history-search";
export {
	buildLiveContext,
	getCurrentBrowserContext,
	getLiveInteractionIntensity,
	getLiveNavigationSequence,
	type LiveBrowserContext,
} from "./recall/live-context";
export {
	annotateTimelineCore,
	type ContextSearchResult,
	type ContextSummary,
	contextSignature,
	type DomainHistoryReport,
	findMemoryBySignature,
	findSimilarContexts,
	findSimilarContextsCore,
	findSimilarMemories,
	findSimilarMemoriesCore,
	getActivityBetween,
	getActivityTimeline,
	getActivityToday,
	getContextsWithDomain,
	getCurrentContext,
	getDomainHistory,
	getDomainsInContext,
	getMemoryHistoryForDomain,
	getPreviousContext,
	getRecentActivity,
	isAiReadyContext,
	isAiReadyEvidence,
	isDomainNovel,
	isSignatureRecurrent,
	jaccardIndex,
	type RecurrenceReport,
	readyContextsInRange,
	reportRecurrence,
	type SimilarContextResult,
	type SimilarMemoryResult,
	searchContextsCore,
	summarizeContext,
	summarizeContextCore,
	type TimelineEntry,
} from "./recall/retrieval";
export {
	type DomainParticipation,
	getRecentSessions,
	getSessionById,
	getSessions,
	SESSION_THRESHOLDS,
	type Session,
	sessionize,
	type TabParticipation,
} from "./sessions/sessions";
export {
	buildExportJsonl,
	type Derived,
	derive,
	EXPORT_THRESHOLDS,
	exportFilename,
	filterDerived,
	fmtIso,
} from "./share/export";
export {
	type AiTargetDef,
	activityMetricsPrompt,
	CLAUDE_CONNECTORS_URL,
	CLAUDE_MCP_SERVER_URL,
	CLI_TARGET_DEFS,
	type CliTargetDef,
	chatGptConnectPromptUrl,
	chatGptContextUrl,
	chatGptPromptUrl,
	claudePromptUrl,
	contextPrompt,
	memoryPrompt,
	recurringPatternsPrompt,
	resolveChatGptConnectUrl,
	sitePrompt,
	WEB_TARGET_DEFS,
	type WebTargetDef,
} from "./share/targets";
export {
	createTrackingClient,
	type TrackingMessage,
	type TrackingTransport,
} from "./tracking/tracking";
