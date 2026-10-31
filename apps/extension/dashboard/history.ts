import { safeRecallUrl, type TabotDatabase, UUID_PATTERN } from "@tabot/shared";
import {
	type DashboardHistoryResponse,
	type DashboardPagePreview,
	isDashboardPagePreview,
	isRecord,
} from "@tabot/shared/dashboard";
import { isDashboardSender } from "./sender";

type HistoryReader = Pick<
	TabotDatabase,
	"searchHistory" | "getSearchStatus" | "getPageObservation"
>;

export const readDashboardHistory = async (
	message: unknown,
	senderUrl: string | undefined,
	getDb: () => Promise<HistoryReader>,
): Promise<DashboardHistoryResponse> => {
	if (!isDashboardSender(senderUrl))
		return { ok: false, code: "unauthorized-sender" };
	if (!isRecord(message)) return { ok: false, code: "invalid-request" };
	const search = message.type === "SEARCH_HISTORY";
	if (search) {
		if (
			typeof message.query !== "string" ||
			!message.query.trim() ||
			message.query.length > 240 ||
			(message.limit !== undefined &&
				(typeof message.limit !== "number" ||
					!Number.isInteger(message.limit) ||
					message.limit < 1 ||
					message.limit > 20)) ||
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
		if (search) {
			const results = await db.searchHistory(message.query as string, {
				from: message.from as number | undefined,
				to: message.to as number | undefined,
				origin: message.origin as string | undefined,
				limit: (message.limit as number | undefined) ?? 20,
			});
			return { results, searchStatus: await db.getSearchStatus() };
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
			code: search ? "search-unavailable" : "preview-unavailable",
		};
	}
};
