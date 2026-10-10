import { type Derived, isAiReadyContext } from "@tabot/shared";

export const popupSummary = (
	derived: Derived,
	lastViewed: number | null,
	now = Date.now(),
) => {
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	const recent = derived.contexts
		.filter((context) => context.endTimestamp >= now - 24 * 60 * 60_000)
		.toSorted((a, b) => b.endTimestamp - a.endTimestamp);
	const ready = recent.filter(isAiReadyContext);
	const updated =
		lastViewed === null
			? []
			: derived.contexts
					.filter(
						(context) =>
							context.endTimestamp > lastViewed &&
							context.endTimestamp <= now &&
							isAiReadyContext(context),
					)
					.toSorted((a, b) => b.endTimestamp - a.endTimestamp);
	const featured = updated[0] ?? ready[0] ?? recent[0] ?? null;
	const sessions = derived.sessions.filter(
		(session) => session.endTimestamp >= today.getTime(),
	);
	const patterns = derived.memories.filter(
		(memory) => memory.kind === "recurrent",
	);
	const favicons = new Map<string, string>();
	for (const event of derived.events) {
		if (!event.url || !event.favicon) continue;
		try {
			favicons.set(new URL(event.url).origin, event.favicon);
		} catch {
			// Malformed legacy URLs must not block the popup.
		}
	}
	return {
		favicons,
		featured,
		ready: !!featured && isAiReadyContext(featured),
		recent: recent.filter((context) => context.id !== featured?.id).slice(0, 2),
		updated: updated.length,
		sessions: sessions.length,
		patterns: patterns.length,
	};
};

export type PopupSummary = ReturnType<typeof popupSummary>;

// Unknown/offline status must never be presented as disconnected.
export const parseAssistantConnection = (response: unknown): boolean | null =>
	response &&
	typeof response === "object" &&
	"connected" in response &&
	typeof response.connected === "boolean"
		? response.connected
		: null;

// Show site identity only, never page paths, credentials, or query strings.
export const siteLabel = (domain: string): string => {
	try {
		const url = new URL(domain.includes("://") ? domain : `https://${domain}`);
		if (url.protocol === "chrome-extension:") return "Extension page";
		if (url.protocol === "chrome:") return "Chrome page";
		if (!["http:", "https:"].includes(url.protocol)) return "Local page";
		return url.hostname.replace(/^www\./, "");
	} catch {
		return "Local page";
	}
};

// Match dashboard graphs: captured tab icon first, same-origin fallback only.
export const siteFavicon = (
	domain: string,
	favicons: Map<string, string>,
): string | undefined => {
	try {
		const site = new URL(domain.includes("://") ? domain : `https://${domain}`);
		if (!["http:", "https:"].includes(site.protocol)) return undefined;
		const captured = favicons.get(site.origin);
		if (captured && URL.canParse(captured)) {
			const icon = new URL(captured);
			if (
				(!icon.username &&
					!icon.password &&
					["http:", "https:"].includes(icon.protocol)) ||
				captured.startsWith("data:image/")
			)
				return captured;
		}
		return `${site.origin}/favicon.ico`;
	} catch {
		return undefined;
	}
};

export const contextDuration = (ms: number): string => {
	const minutes = Math.floor(Math.max(0, ms) / 60_000);
	if (minutes < 1) return "<1 min";
	return minutes < 60
		? `${minutes} min`
		: `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

export const contextHomeUrl = (home: string, contextId?: string): string => {
	const url = new URL(home);
	if (contextId) url.searchParams.set("context", contextId);
	return url.href;
};
