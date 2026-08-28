export const TAB = {
	OVERVIEW: "overview",
	ACTIVITY: "activity",
	MEMORIES: "memories",
	EXPORT: "export",
} as const;

export type Tab = (typeof TAB)[keyof typeof TAB];
