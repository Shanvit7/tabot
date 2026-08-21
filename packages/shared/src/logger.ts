type LogContext = Record<string, unknown>;

export const logger = {
	debug(message: string, context?: LogContext) {
		console.debug("[Tabot]", message, context);
	},

	info(message: string, context?: LogContext) {
		console.info("[Tabot]", message, context);
	},

	warn(message: string, context?: LogContext) {
		console.warn("[Tabot]", message, context);
	},

	error(message: string, context?: LogContext) {
		console.error("[Tabot]", message, context);
	},
};
