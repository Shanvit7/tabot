import {
	buildContexts,
	buildMemories,
	deriveMeaningfulEvents,
	deriveTransitions,
	type StoredTabEvent,
	sessionize,
} from "@tabot/shared";

export type ActivityTrail = {
	id: string;
	day: number;
	start: number;
	end: number;
	duration: number;
	stops: { id: string; origin: string; at: number }[];
};
export type ActivitySwitch = {
	id: string;
	source: string;
	target: string;
	at: number;
};

export const TRAILS_PER_MAP = 6;
export const STOPS_PER_MAP = 8;
export const trailWindow = (
	stops: { id: string; origin: string; at: number }[],
	cursor: number,
) => {
	const start =
		Math.floor(Math.max(0, cursor - 1) / (STOPS_PER_MAP - 1)) *
		(STOPS_PER_MAP - 1);
	return { start, stops: stops.slice(start, start + STOPS_PER_MAP) };
};

// Derive from local immutable events; session boundaries prevent false transitions.
export const buildActivityExplorer = (
	events: StoredTabEvent[],
	from: number,
	to: number,
) => {
	const selected = events.filter(
		(event) => event.timestamp >= from && event.timestamp < to,
	);
	const sessions = sessionize(selected);
	const trails: ActivityTrail[] = sessions
		.map((session) => {
			const stops: ActivityTrail["stops"] = [];
			for (const event of deriveMeaningfulEvents(session.eventSequence)) {
				const origin = event.ref?.origin;
				if (
					origin &&
					/^https?:\/\//.test(origin) &&
					stops.at(-1)?.origin !== origin
				) {
					stops.push({ id: event.id, origin, at: event.timestamp });
				}
			}
			const day = new Date(session.startTimestamp);
			day.setHours(0, 0, 0, 0);
			return {
				id: session.id,
				day: day.getTime(),
				start: session.startTimestamp,
				end: session.endTimestamp,
				duration: session.duration,
				stops,
			};
		})
		.filter((trail) => trail.stops.length);
	const transitions = sessions.flatMap((session) =>
		deriveTransitions(deriveMeaningfulEvents(session.eventSequence)),
	);
	const timeline: ActivitySwitch[] = transitions
		.flatMap((transition) =>
			transition.from.origin === transition.to.origin
				? []
				: transition.occurrences.map((occurrence) => ({
						id: `${transition.from.origin}:${transition.to.origin}:${occurrence.toTs}`,
						source: transition.from.origin,
						target: transition.to.origin,
						at: occurrence.toTs,
					})),
		)
		.sort((a, b) => a.at - b.at);
	const activities = buildContexts(sessions, transitions);
	const patterns = buildMemories(activities, to).filter(
		(memory) => memory.kind === "recurrent",
	);
	return { trails, timeline, patterns };
};
