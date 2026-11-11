import { useEffect, useRef, useState } from "react";
import Counter from "~/../components/animata/text/counter";
import { readActiveTrackingDuration } from "~/lib/history";

const SECOND_MS = 1_000;
const REFRESH_MS = 30_000;
const formatTwoDigits = (value: number) =>
	String(Math.floor(value)).padStart(2, "0");

export const TrackingDuration = ({ enabled }: { enabled: boolean }) => {
	const [elapsedMs, setElapsedMs] = useState(0);
	const [active, setActive] = useState(false);
	const activeRef = useRef(active);
	useEffect(() => {
		activeRef.current = active;
	}, [active]);
	useEffect(() => {
		let ticksSinceRefresh = REFRESH_MS / SECOND_MS;
		const refresh = () => {
			ticksSinceRefresh = 0;
			void readActiveTrackingDuration()
				.then(({ durationMs, active: isActive }) => {
					setElapsedMs(durationMs);
					setActive(isActive);
				})
				.catch(() => setActive(false));
		};
		refresh();
		const timer = window.setInterval(() => {
			if (enabled && activeRef.current)
				setElapsedMs((elapsed) => elapsed + SECOND_MS);
			ticksSinceRefresh += 1;
			if (ticksSinceRefresh >= REFRESH_MS / SECOND_MS) refresh();
		}, SECOND_MS);
		return () => window.clearInterval(timer);
	}, [enabled]);
	const elapsedSeconds = Math.floor(elapsedMs / SECOND_MS);
	const hours = Math.floor(elapsedSeconds / 3_600);
	const minutes = Math.floor((elapsedSeconds % 3_600) / 60);
	const seconds = elapsedSeconds % 60;
	const unitClass =
		"text-base font-semibold tabular-nums leading-none text-foreground";
	return (
		<p className="flex items-baseline gap-1.5 whitespace-nowrap text-sm">
			<span className="text-xs text-muted-foreground">
				{enabled ? "Tracking for" : "Tracked for"}
			</span>
			<span className="flex items-baseline gap-1">
				<Counter targetValue={hours} className={unitClass} />
				<span>h</span>
				<Counter
					format={formatTwoDigits}
					targetValue={minutes}
					className={unitClass}
				/>
				<span>m</span>
				<Counter
					format={formatTwoDigits}
					targetValue={seconds}
					className={unitClass}
				/>
				<span>s</span>
			</span>
		</p>
	);
};
