export const searchResultKinds = [
	"Everything",
	"Sites",
	"Pages",
	"Notes",
] as const;

export type SearchResultKind = (typeof searchResultKinds)[number];
