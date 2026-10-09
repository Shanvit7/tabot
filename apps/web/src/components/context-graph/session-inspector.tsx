import type { ReactElement } from "react";
import { createCallable } from "react-call";
import { SessionRecap } from "~/components/context-graph/session-recap";
import type { SessionSummary } from "~/lib/context-graph-data";

const SessionInspectorCallable = createCallable<
	{ session: SessionSummary },
	void
>(({ session, call }) =>
	call.ended ? null : <SessionRecap session={session} onClose={call.end} />,
);

type SessionInspectorComponent = (() => ReactElement) & {
	upsert: typeof SessionInspectorCallable.upsert;
};

export const SessionInspector = (() => (
	<SessionInspectorCallable />
)) as SessionInspectorComponent;
SessionInspector.upsert = SessionInspectorCallable.upsert;
