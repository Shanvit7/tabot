export type TrackingMessage =
	| { type: "GET_TRACKING" }
	| { type: "SET_TRACKING"; enabled: boolean };
export type TrackingTransport = (message: TrackingMessage) => Promise<unknown>;

export const createTrackingClient = (send: TrackingTransport) => ({
	read: async (): Promise<boolean> => {
		const response = await send({ type: "GET_TRACKING" });
		if (
			typeof response !== "object" ||
			response === null ||
			!("enabled" in response) ||
			typeof response.enabled !== "boolean"
		)
			throw new Error("tracking-status-unavailable");
		return response.enabled;
	},
	set: async (enabled: boolean): Promise<boolean> => {
		const response = await send({ type: "SET_TRACKING", enabled });
		if (
			typeof response !== "object" ||
			response === null ||
			!("enabled" in response) ||
			response.enabled !== enabled
		)
			throw new Error("tracking-update-failed");
		return response.enabled;
	},
});
