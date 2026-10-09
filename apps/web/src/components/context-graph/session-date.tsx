import { useEffect, useState } from "react";
import {
	formatSessionDateLocal,
	formatSessionDateUTC,
} from "~/components/context-graph/session-time-format";

export const SessionDate = ({ timestamp }: { timestamp: number }) => {
	const [label, setLabel] = useState(() => formatSessionDateUTC(timestamp));
	useEffect(() => {
		setLabel(formatSessionDateLocal(timestamp));
	}, [timestamp]);
	return <time dateTime={new Date(timestamp).toISOString()}>{label}</time>;
};
