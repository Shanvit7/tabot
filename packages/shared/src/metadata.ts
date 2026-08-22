// packages/shared/src/metadata.ts

export interface TabMeta {
	url?: string;
	title?: string;
	lastSeen: number;
}

export const tabMeta = new Map<number, TabMeta>();

export function updateMeta(tabId: number, patch: Partial<TabMeta>): void {
	const existing = tabMeta.get(tabId);
	tabMeta.set(tabId, {
		...existing,
		...patch,
		lastSeen: Date.now(),
	});
}

export function getMeta(tabId: number): TabMeta | undefined {
	return tabMeta.get(tabId);
}

export function removeMeta(tabId: number): void {
	tabMeta.delete(tabId);
}
