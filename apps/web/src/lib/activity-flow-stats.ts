// Pure, dependency-free activity stats — testable by node (see activity-flow.check.mjs).
// Samples are already inside the chosen period; `now` anchors the streak + week.

export interface RefSample {
	origin: string;
	timestamp: number;
}

// A run stays one focus stretch while the cursor keeps landing on the same
// origin within this gap. Mirrors the session inactivity threshold (5 min).
const FOCUS_GAP_MS = 5 * 60 * 1000;
const STREAK_LOOKBACK_DAYS = 366;

export const dayKeyOf = (timestamp: number): string => {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

export interface WeekDay {
	label: string;
	key: string;
	active: boolean;
	events: number;
}

export interface ActivityStats {
	activeDays: number;
	streakDays: number;
	distinctSites: number;
	returningSites: number;
	focusMs: number;
	focusOrigin: string;
	busiestHour: number | null;
	busiestHourEvents: number;
	week: WeekDay[];
}

export interface PlaceStats {
	activeMs: number; // estimated time spent: gap to the next event, capped
	visits: number; // separate stretches (leave and come back = 2 visits)
	days: number; // distinct days visited
}

// Time on a place = time until the next event anywhere, capped at the idle
// gap so walking away from the laptop doesn't inflate it. An estimate.
export const computePlaceStats = (
	samples: RefSample[],
): Map<string, PlaceStats> => {
	const ordered = samples.toSorted((a, b) => a.timestamp - b.timestamp);
	const out = new Map<string, PlaceStats>();
	const dayKeys = new Map<string, Set<string>>();
	for (let i = 0; i < ordered.length; i++) {
		const { origin, timestamp } = ordered[i];
		const next = ordered[i + 1];
		const prev = ordered[i - 1];
		const stats = out.get(origin) ?? { activeMs: 0, visits: 0, days: 0 };
		if (next)
			stats.activeMs += Math.min(next.timestamp - timestamp, FOCUS_GAP_MS);
		if (
			!prev ||
			prev.origin !== origin ||
			timestamp - prev.timestamp > FOCUS_GAP_MS
		)
			stats.visits++;
		const days = dayKeys.get(origin) ?? new Set<string>();
		days.add(dayKeyOf(timestamp));
		dayKeys.set(origin, days);
		stats.days = days.size;
		out.set(origin, stats);
	}
	return out;
};

export const computeActivityStats = (
	samples: RefSample[],
	now: number = Date.now(),
): ActivityStats => {
	const perDay = new Map<string, number>();
	const perOriginDays = new Map<string, Set<string>>();
	const perHour = new Map<number, number>();

	for (const sample of samples) {
		const key = dayKeyOf(sample.timestamp);
		perDay.set(key, (perDay.get(key) ?? 0) + 1);
		let days = perOriginDays.get(sample.origin);
		if (!days) {
			days = new Set();
			perOriginDays.set(sample.origin, days);
		}
		days.add(key);
		const hour = new Date(sample.timestamp).getHours();
		perHour.set(hour, (perHour.get(hour) ?? 0) + 1);
	}

	// Streak: consecutive active days ending today. Miss today → no streak.
	let streakDays = 0;
	const cursor = new Date(now);
	cursor.setHours(0, 0, 0, 0);
	for (let i = 0; i < STREAK_LOOKBACK_DAYS; i++) {
		if (!perDay.has(dayKeyOf(cursor.getTime()))) break;
		streakDays++;
		cursor.setDate(cursor.getDate() - 1);
	}

	// Longest single-origin run: same origin, gaps under FOCUS_GAP_MS.
	const ordered = samples.toSorted((a, b) => a.timestamp - b.timestamp);
	let focusMs = 0;
	let focusOrigin = "";
	let runStart = 0;
	let runEnd = 0;
	let runOrigin = "";
	for (let i = 0; i < ordered.length; i++) {
		const sample = ordered[i];
		const continues =
			i > 0 &&
			sample.origin === runOrigin &&
			sample.timestamp - runEnd <= FOCUS_GAP_MS;
		if (continues) {
			runEnd = sample.timestamp;
		} else {
			if (runEnd - runStart > focusMs) {
				focusMs = runEnd - runStart;
				focusOrigin = runOrigin;
			}
			runStart = sample.timestamp;
			runEnd = sample.timestamp;
			runOrigin = sample.origin;
		}
	}
	if (runEnd - runStart > focusMs) {
		focusMs = runEnd - runStart;
		focusOrigin = runOrigin;
	}

	let busiestHour: number | null = null;
	let busiestHourEvents = 0;
	for (const [hour, events] of perHour) {
		if (events > busiestHourEvents) {
			busiestHourEvents = events;
			busiestHour = hour;
		}
	}

	let returningSites = 0;
	for (const days of perOriginDays.values())
		if (days.size >= 2) returningSites++;

	// Last 7 days, oldest first, ending today.
	const week: WeekDay[] = [];
	for (let i = 6; i >= 0; i--) {
		const day = new Date(now);
		day.setHours(0, 0, 0, 0);
		day.setDate(day.getDate() - i);
		const key = dayKeyOf(day.getTime());
		week.push({
			key,
			label: day
				.toLocaleDateString(undefined, { weekday: "short" })
				.slice(0, 2),
			active: perDay.has(key),
			events: perDay.get(key) ?? 0,
		});
	}

	return {
		activeDays: perDay.size,
		streakDays,
		distinctSites: perOriginDays.size,
		returningSites,
		focusMs,
		focusOrigin,
		busiestHour,
		busiestHourEvents,
		week,
	};
};
