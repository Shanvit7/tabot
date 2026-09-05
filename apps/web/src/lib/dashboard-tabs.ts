export const TAB = {
	OVERVIEW: "overview",
	ACTIVITY: "activity",
	MEMORIES: "memories",
	SHARE_CONTEXT: "share-context",
} as const;

export type Tab = (typeof TAB)[keyof typeof TAB];
