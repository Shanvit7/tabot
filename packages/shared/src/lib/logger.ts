type LogContext = Record<string, unknown>;

const tagged = (message: string, context?: LogContext) =>
	context ? ["[Tabot]", message, context] : ["[Tabot]", message];

export const logger = {
	debug: (message: string, context?: LogContext) =>
		console.debug(...tagged(message, context)),

	info: (message: string, context?: LogContext) =>
		console.info(...tagged(message, context)),

	warn: (message: string, context?: LogContext) =>
		console.warn(...tagged(message, context)),

	error: (message: string, context?: LogContext) =>
		console.error(...tagged(message, context)),
};
