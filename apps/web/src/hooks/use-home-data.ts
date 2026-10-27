import type { StatsSnapshot, StoredTabEvent } from "@tabot/shared";
import { useEffect, useState } from "react";
import { fetchEventCount, fetchEvents, fetchStats } from "~/lib/home-data";

export const useHomeData = () => {
	const [stats, setStats] = useState<StatsSnapshot | null>(null);
	const [events, setEvents] = useState<StoredTabEvent[] | null>(null);
	const [initialized, setInitialized] = useState(false);
	const [stale, setStale] = useState(false);
	const [statsUnavailable, setStatsUnavailable] = useState(false);

	useEffect(() => {
		let alive = true;
		const pollStats = async () => {
			if (document.hidden) return;
			const next = await fetchStats();
			if (!alive) return;
			setStatsUnavailable(next === null);
			if (next)
				setStats((current) =>
					current?.health === next.health ? current : next,
				);
		};
		let eventCount: number | null = null;
		let readingEvents = false;
		const pollEvents = async () => {
			if (document.hidden || readingEvents) return;
			readingEvents = true;
			try {
				const count = await fetchEventCount();
				if (!alive) return;
				setStale(count === null);
				if (count === null || count === eventCount) return;
				const next = await fetchEvents();
				if (!alive) return;
				setStale(next === null);
				if (next === null) return;
				// Event IDs are immutable; only a changed row count requires a full read.
				eventCount = next.length;
				setEvents(next);
			} finally {
				readingEvents = false;
			}
		};

		const onVisibilityChange = () => {
			if (!document.hidden) void Promise.all([pollStats(), pollEvents()]);
		};
		const initialize = async () => {
			await Promise.all([pollStats(), pollEvents()]);
			if (alive) setInitialized(true);
		};
		void initialize();
		document.addEventListener("visibilitychange", onVisibilityChange);
		const statsInterval = setInterval(pollStats, 1000);
		const eventsInterval = setInterval(pollEvents, 5000);
		return () => {
			alive = false;
			document.removeEventListener("visibilitychange", onVisibilityChange);
			clearInterval(statsInterval);
			clearInterval(eventsInterval);
		};
	}, []);

	const hasExtension = stats !== null || events !== null;
	return {
		events,
		hasExtension,
		degraded:
			stale ||
			statsUnavailable ||
			(stats !== null && stats.health !== "healthy"),
		initialized,
	};
};
