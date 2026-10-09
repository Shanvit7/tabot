import {
	type BrowserContext,
	isAiReadyEvidence,
	type Memory,
} from "@tabot/shared";

type ActivityEpisode = NonNullable<BrowserContext["episodes"]>[number];

export const isNotifiableEpisode = (episode: ActivityEpisode): boolean =>
	isAiReadyEvidence({
		duration: episode.duration,
		totalEventCount: episode.totalEventCount,
		domainCount: episode.domains.length,
		sessionCount: episode.sessionIds.length,
		totalInteractionCount: episode.totalInteractionCount,
	});

export const nextNotifiableMemory = (
	memories: Memory[],
	lastSeen: number,
	now = Date.now(),
): Memory | undefined =>
	memories
		.filter(
			(memory) =>
				memory.kind === "recurrent" &&
				memory.lastSeen > lastSeen &&
				memory.lastSeen <= now - 30 * 60_000 &&
				memory.lastSeen >= now - 24 * 3_600_000,
		)
		.sort((a, b) => b.lastSeen - a.lastSeen)[0];
