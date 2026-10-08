import type { StatsSnapshot, StoredTabEvent } from "@tabot/shared";
import { useEffect, useMemo, useState } from "react";
import { derive, fetchEvents, fetchStats } from "~/lib/home-data";

export const useHomeData = () => {
	const [stats, setStats] = useState<StatsSnapshot | null>(null);
	const [events, setEvents] = useState<StoredTabEvent[] | null>(null);
	const [initialized, setInitialized] = useState(false);

	useEffect(() => {
		let alive = true;
		const pollStats = async () => {
			const next = await fetchStats();
			if (alive && next) setStats(next);
		};
		const pollEvents = async () => {
			const next = await fetchEvents();
			if (alive && next !== null) setEvents(next);
		};

		const initialize = async () => {
			await Promise.all([pollStats(), pollEvents()]);
			if (alive) setInitialized(true);
		};
		void initialize();
		const statsInterval = setInterval(pollStats, 1000);
		const eventsInterval = setInterval(pollEvents, 5000);
		return () => {
			alive = false;
			clearInterval(statsInterval);
			clearInterval(eventsInterval);
		};
	}, []);

	const hasExtension = stats !== null || events !== null;
	return {
		derived: useMemo(() => (events ? derive(events) : null), [events]),
		events,
		hasExtension,
		// A failed read is not an empty history. Keep loading until a snapshot arrives.
		initialized: initialized && (!hasExtension || events !== null),
	};
};
