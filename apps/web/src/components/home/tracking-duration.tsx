import { useEffect, useState } from "react";
import Counter from "~/../components/animata/text/counter";

const SECOND_MS = 1_000;
const formatTwoDigits = (value: number) =>
	String(Math.floor(value)).padStart(2, "0");
export const TrackingDuration = ({
	firstEventTimestamp,
	enabled,
}: {
	firstEventTimestamp: number;
	enabled: boolean;
}) => {
	// ponytail: pause-adjusted within this view; lifetime totals need persisted tracking intervals.
	const [elapsedMs, setElapsedMs] = useState(() =>
		Math.max(0, Date.now() - firstEventTimestamp),
	);
	useEffect(() => {
		if (!enabled) return;
		let lastTick = Date.now();
		const timer = window.setInterval(() => {
			const now = Date.now();
			const delta = now - lastTick;
			lastTick = now;
			setElapsedMs((elapsed) => elapsed + delta);
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
				{enabled ? "Tracking for" : "Tracking paused at"}
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
