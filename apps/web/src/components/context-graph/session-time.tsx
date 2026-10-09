import { useEffect, useState } from "react";
import {
	formatSessionTimeLocal,
	formatSessionTimeUTC,
} from "~/components/context-graph/session-time-format";

export const SessionTime = ({
	timestamp,
	day,
}: {
	timestamp: number;
	day: number;
}) => {
	const [label, setLabel] = useState(() =>
		formatSessionTimeUTC(timestamp, day),
	);
	useEffect(() => {
		setLabel(formatSessionTimeLocal(timestamp, day));
	}, [timestamp, day]);
	return <time dateTime={new Date(timestamp).toISOString()}>{label}</time>;
};
