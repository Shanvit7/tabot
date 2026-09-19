import type { StatsSnapshot, StoredTabEvent } from "@tabot/shared";
import { useEffect, useMemo, useState } from "react";
import { derive, fetchEvents, fetchStats } from "~/lib/dashboard-data";

export const useDashboardData = () => {
	const [stats, setStats] = useState<StatsSnapshot | null>(null);
	const [events, setEvents] = useState<StoredTabEvent[] | null>(null);
	const [initialized, setInitialized] = useState(false);

	useEffect(() => {
		let alive = true;
		let firstDone = false;
		const markFirst = () => {
			if (firstDone) return;
			firstDone = true;
			if (alive) setInitialized(true);
		};
		const pollStats = async () => {
			const next = await fetchStats();
			if (alive && next) setStats(next);
			markFirst();
		};
		const pollEvents = async () => {
			const next = await fetchEvents();
			if (alive && next && next.length > 0) setEvents(next);
			markFirst();
		};

		pollStats();
		pollEvents();
		const statsInterval = setInterval(pollStats, 1000);
		const eventsInterval = setInterval(pollEvents, 5000);
		return () => {
			alive = false;
			clearInterval(statsInterval);
			clearInterval(eventsInterval);
		};
	}, []);

	return {
		derived: useMemo(() => (events ? derive(events) : null), [events]),
		events,
		hasExtension: stats !== null,
		initialized,
	};
};
