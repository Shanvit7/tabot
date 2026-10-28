// Recurrence map for memories: patterns as rows, days as columns.
// Dependency-free so node --experimental-strip-types can run the check.

// The slice of Memory the map needs. A real Memory satisfies it structurally.
export type MemoryInput = {
	id: string;
	firstSeen: number;
	lastSeen: number;
	occurrences: Array<{ startTimestamp: number }>;
	fingerprint: {
		orderedOrigins: string[];
		domains: Array<{ domain: string; weight: number }>;
	};
};

export type MemoryRow = {
	id: string;
	index: number;
	// Ordered origins of the pattern (the A → B → C shape), deduped, capped.
	origins: string[];
	// One slot per map.axis day: how many occurrences started that day.
	days: number[];
	occurrenceCount: number;
	lastSeen: number;
};

export type MemoryMap = {
	axis: number[]; // local midnight ms, oldest → newest, length AXIS_DAYS
	rows: MemoryRow[];
};

export const AXIS_DAYS = 28;
export const MIN_AXIS_DAYS = 7;
export const MAX_ROWS = 12;
export const ORIGIN_CAP = 5;

export const dayStartOf = (timestamp: number): number => {
	const date = new Date(timestamp);
	date.setHours(0, 0, 0, 0);
	return date.getTime();
};

export const buildMemoryMap = (
	memories: MemoryInput[],
	now = Date.now(),
): MemoryMap => {
	const rows = memories.slice(0, MAX_ROWS);
	// Window the map on the data's own span (min 7 days, capped) so the dots
	// fill the grid instead of clustering in the last few columns.
	const end = rows.length
		? dayStartOf(Math.max(...rows.map((memory) => memory.lastSeen)))
		: dayStartOf(now);
	const begin = rows.length
		? dayStartOf(Math.min(...rows.map((memory) => memory.firstSeen)))
		: end;
	const spanned = Math.round((end - begin) / 86_400_000) + 1;
	const length = Math.min(AXIS_DAYS, Math.max(MIN_AXIS_DAYS, spanned));
	const axis = Array.from(
		{ length },
		(_, index) => end - (length - 1 - index) * 86_400_000,
	);
	const startKey = axis[0];
	const slotOf = (timestamp: number) => {
		const day = dayStartOf(timestamp);
		const slot = Math.round((day - startKey) / 86_400_000);
		return slot >= 0 && slot < axis.length ? slot : -1;
	};
	return {
		axis,
		rows: rows.map((memory, index) => {
			const days = axis.map(() => 0);
			for (const occurrence of memory.occurrences) {
				const slot = slotOf(occurrence.startTimestamp);
				if (slot >= 0) days[slot] += 1;
			}
			const origins = [
				...new Set((memory.fingerprint.orderedOrigins ?? []).filter(Boolean)),
			].slice(0, ORIGIN_CAP);
			return {
				id: memory.id,
				index,
				origins: origins.length
					? origins
					: memory.fingerprint.domains
							.slice(0, ORIGIN_CAP)
							.map((entry) => entry.domain),
				days,
				occurrenceCount: memory.occurrences.length,
				lastSeen: memory.lastSeen,
			};
		}),
	};
};
