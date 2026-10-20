import type {
	ActivityFlow,
	FlowLink,
	FlowNode,
} from "~/lib/activity-flow-data";

export type GardenSite = Pick<
	FlowNode,
	"id" | "label" | "activeMs" | "lastSeen"
>;
export type GardenTransition = FlowLink & { label: string; timeId: string };
export type GardenTime = { id: string; label: string; lastAt: number };

export const buildSignalGarden = (
	flow: ActivityFlow,
	limit = 8,
	now = Date.now(),
) => {
	const sites: GardenSite[] = flow.nodes.slice(0, limit);
	const ids = new Set(sites.map((site) => site.id));
	const transitions: GardenTransition[] = flow.links
		.filter((link) => ids.has(link.source) && ids.has(link.target))
		.slice(0, limit)
		.map((link) => {
			const day = new Date(link.lastAt);
			day.setHours(0, 0, 0, 0);
			return {
				...link,
				label: `${sites.find((site) => site.id === link.source)?.label} → ${sites.find((site) => site.id === link.target)?.label}`,
				timeId: String(day.getTime()),
			};
		});
	const days = [...new Set(transitions.map((link) => link.timeId))].toSorted(
		(a, b) => Number(b) - Number(a),
	);
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);
	const recentDays = days.slice(0, 2);
	const times: GardenTime[] = recentDays.map((day) => ({
		id: day,
		label:
			Number(day) === today.getTime()
				? "Today"
				: Number(day) === yesterday.getTime()
					? "Yesterday"
					: new Date(Number(day)).toLocaleDateString(),
		lastAt: Math.max(
			...transitions
				.filter((link) => link.timeId === day)
				.map((link) => link.lastAt),
		),
	}));
	const earlier = transitions.filter(
		(link) => !recentDays.includes(link.timeId),
	);
	if (earlier.length)
		times.push({
			id: "earlier",
			label: "Earlier",
			lastAt: Math.max(...earlier.map((link) => link.lastAt)),
		});
	return { sites, transitions, times };
};
