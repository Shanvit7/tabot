import { useEffect, useRef, useState } from "react";
import { readActiveTrackingDuration } from "~/lib/history";

const SECOND_MS = 1_000;
const REFRESH_MS = 30_000;
const formatTwoDigits = (value: number) =>
	String(Math.floor(value)).padStart(2, "0");

export const TrackingDuration = ({ enabled }: { enabled: boolean }) => {
	const [elapsedMs, setElapsedMs] = useState(0);
	const [readStatus, setReadStatus] = useState<"loading" | "ready" | "error">(
		"loading",
	);
	const hasLoadedRef = useRef(false);
	const activeRef = useRef(false);

	useEffect(() => {
		let mounted = true;
		let refreshing = false;
		let lastRefreshAt = 0;
		activeRef.current = false;
		const refresh = () => {
			if (refreshing) return;
			refreshing = true;
			lastRefreshAt = performance.now();
			void readActiveTrackingDuration()
				.then(({ durationMs, active }) => {
					if (!mounted) return;
					setElapsedMs(durationMs);
					hasLoadedRef.current = true;
					setReadStatus("ready");
					activeRef.current = active;
				})
				.catch(() => {
					if (!mounted) return;
					activeRef.current = false;
					if (!hasLoadedRef.current) setReadStatus("error");
				})
				.finally(() => {
					refreshing = false;
				});
		};
		const refreshWhenVisible = () => {
			if (document.visibilityState === "visible") refresh();
		};
		refresh();
		const timer = window.setInterval(() => {
			if (enabled && activeRef.current)
				setElapsedMs((elapsed) => elapsed + SECOND_MS);
			if (performance.now() - lastRefreshAt >= REFRESH_MS) refresh();
		}, SECOND_MS);
		window.addEventListener("focus", refreshWhenVisible);
		document.addEventListener("visibilitychange", refreshWhenVisible);
		return () => {
			mounted = false;
			window.clearInterval(timer);
			window.removeEventListener("focus", refreshWhenVisible);
			document.removeEventListener("visibilitychange", refreshWhenVisible);
		};
	}, [enabled]);

	if (readStatus !== "ready")
		return (
			<p role="status" className="text-sm text-muted-foreground">
				{readStatus === "loading"
					? "Loading tracking time…"
					: "Tracking time unavailable"}
			</p>
		);

	const elapsedSeconds = Math.floor(elapsedMs / SECOND_MS);
	const hours = Math.floor(elapsedSeconds / 3_600);
	const minutes = Math.floor((elapsedSeconds % 3_600) / 60);
	const seconds = elapsedSeconds % 60;
	const unitClass =
		"text-base font-semibold tabular-nums leading-none text-foreground";
	return (
		<p
			role="timer"
			className="flex items-baseline gap-1.5 whitespace-nowrap text-sm"
		>
			<span className="text-xs text-muted-foreground">
				{enabled ? "Tracking for" : "Tracked for"}
			</span>
			<span className="flex items-baseline gap-1">
				<span className={unitClass}>{hours}</span>
				<span>h</span>
				<span className={unitClass}>{formatTwoDigits(minutes)}</span>
				<span>m</span>
				<span className={unitClass}>{formatTwoDigits(seconds)}</span>
				<span>s</span>
			</span>
		</p>
	);
};
