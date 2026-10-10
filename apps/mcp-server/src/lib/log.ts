/** Metadata only. Never pass URLs, headers, credentials, tool inputs or results. */
export const logEvent = (
	event: string,
	fields: {
		requestId?: string;
		route?: string;
		tool?: string;
		status?: number;
		durationMs?: number;
		outcome?: "ok" | "error";
		code?: string;
		count?: number;
	} = {},
): void => {
	console.log(JSON.stringify({ event, ...fields }));
};
