import { useCallback, useEffect, useRef, useState } from "react";
import { TrackingDuration } from "~/components/home/tracking-duration";
import { TrackingToggle } from "~/components/home/tracking-toggle";
import {
	readHistoryCounts,
	readTrackingState,
	setTrackingEnabled,
} from "~/lib/history";

export const TrackingControls = () => {
	const [trackingEnabled, setTrackingEnabledState] = useState<boolean | null>(
		null,
	);
	const trackingOperation = useRef(false);
	const [trackingBusy, setTrackingBusy] = useState(false);
	const [trackingError, setTrackingError] = useState("");
	const [firstEventTimestamp, setFirstEventTimestamp] = useState<number | null>(
		null,
	);
	const refreshTracking = useCallback(async () => {
		if (trackingOperation.current) return;
		trackingOperation.current = true;
		setTrackingBusy(true);
		setTrackingError("");
		try {
			setTrackingEnabledState(await readTrackingState());
		} catch {
			setTrackingEnabledState(null);
			setTrackingError("Could not read tracking status. Try again.");
		} finally {
			trackingOperation.current = false;
			setTrackingBusy(false);
		}
	}, []);
	useEffect(() => {
		let active = true;
		void readHistoryCounts()
			.then(({ firstEventTimestamp: timestamp }) => {
				if (active) setFirstEventTimestamp(timestamp);
			})
			.catch(() => undefined);
		return () => {
			active = false;
		};
	}, []);
	useEffect(() => {
		const refreshOnVisibility = () => {
			if (document.visibilityState === "visible") void refreshTracking();
		};
		void refreshTracking();
		window.addEventListener("focus", refreshTracking);
		document.addEventListener("visibilitychange", refreshOnVisibility);
		return () => {
			window.removeEventListener("focus", refreshTracking);
			document.removeEventListener("visibilitychange", refreshOnVisibility);
		};
	}, [refreshTracking]);
	const toggleTracking = async () => {
		if (trackingEnabled === null || trackingOperation.current) return;
		trackingOperation.current = true;
		setTrackingBusy(true);
		setTrackingError("");
		try {
			setTrackingEnabledState(await setTrackingEnabled(!trackingEnabled));
		} catch {
			setTrackingError("Could not update tracking. Try again.");
		} finally {
			trackingOperation.current = false;
			setTrackingBusy(false);
		}
	};
	return (
		<div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
			<TrackingToggle
				enabled={trackingEnabled}
				busy={trackingBusy}
				error={trackingError}
				onToggle={() => void toggleTracking()}
				onRetry={() => void refreshTracking()}
			/>
			{firstEventTimestamp !== null && trackingEnabled !== null && (
				<TrackingDuration
					firstEventTimestamp={firstEventTimestamp}
					enabled={trackingEnabled}
				/>
			)}
		</div>
	);
};
