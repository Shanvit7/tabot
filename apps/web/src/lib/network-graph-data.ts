export type NetworkNode = {
	id: string;
	label: string;
	color: string;
	kind?: "site" | "context" | "memory";
	image?: string;
};
export type NetworkEdge = {
	source: string;
	target: string;
	size?: number;
	directed?: boolean;
};
export type NetworkData = { nodes: NetworkNode[]; edges: NetworkEdge[] };

// Fixed lanes replace iterative physics. Input order (and chronology) stays intact.
export const layoutNetwork = (data: NetworkData) => {
	const layered = data.nodes.some(
		(node) => node.kind === "context" || node.kind === "memory",
	);
	const groups = layered
		? [
				data.nodes.filter((node) => !node.kind || node.kind === "site"),
				data.nodes.filter((node) => node.kind === "context"),
				data.nodes.filter((node) => node.kind === "memory"),
			]
		: [data.nodes];
	const nodes = groups.flatMap((group, lane) =>
		group.map((node, index) => ({
			...node,
			x: layered
				? [28, 272, 568][lane] + (lane === 1 ? (index % 3) * 88 : 0)
				: 28 + (index % 3) * 244,
			y: 76 + Math.floor(index / (layered ? (lane === 1 ? 3 : 1) : 3)) * 60,
			width: node.kind === "context" ? 72 : 184,
		})),
	);
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const edges = data.edges.flatMap((edge, index) => {
		const source = byId.get(edge.source);
		const target = byId.get(edge.target);
		if (!source || !target || source === target) return [];
		const sx = source.x + source.width / 2;
		const sy = source.y + 22;
		const tx = target.x + target.width / 2;
		const ty = target.y + 22;
		// Opposite moves bend to opposite sides; arrowheads stop outside the target.
		const distance = Math.hypot(tx - sx, ty - sy);
		const dx = (tx - sx) / distance;
		const dy = (ty - sy) / distance;
		const inset = Math.min(
			(target.width / 2 + 6) / Math.max(Math.abs(dx), 0.001),
			28 / Math.max(Math.abs(dy), 0.001),
		);
		return [
			{
				...edge,
				key: `${edge.source}:${edge.target}:${index}`,
				path: `M ${sx} ${sy} Q ${(sx + tx) / 2 - dy * 32} ${(sy + ty) / 2 + dx * 32} ${tx - dx * inset} ${ty - dy * inset}`,
			},
		];
	});
	return {
		nodes,
		edges,
		width: 780,
		height: Math.max(400, ...nodes.map((node) => node.y + 80)),
		layered,
	};
};

export const networkFocus = (data: NetworkData, id: string | null) => {
	if (!id) return null;
	const ids = new Set([id]);
	for (const edge of data.edges) {
		if (edge.source === id) ids.add(edge.target);
		if (edge.target === id) ids.add(edge.source);
	}
	return ids;
};
