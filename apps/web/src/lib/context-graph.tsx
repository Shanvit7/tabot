import type { BrowserContext, Memory } from "@tabot/shared";
import {
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import type { ForceGraphMethods } from "react-force-graph-2d";
import { ContextDetail } from "~/components/context-graph/context-detail";
import { Hint } from "~/components/context-graph/hint";
import { MemoryDetail } from "~/components/context-graph/memory-detail";
import { SiteDetail } from "~/components/context-graph/site-detail";
import {
	GraphCanvas,
	type PositionedLink,
	type PositionedNode,
} from "~/lib/context-graph-canvas";
import {
	type GraphLimits,
	type GraphNode,
	graphData,
	matchesQuery,
	type SessionSummary,
} from "~/lib/context-graph-data";

const subscribeToNothing = () => () => {};

export const ContextGraph = ({
	contexts,
	sessions,
	memories,
	limits,
	favicons,
	initialSelectedId,
	assistantConnected,
	query = "",
}: {
	contexts: BrowserContext[];
	sessions: SessionSummary[];
	memories: Memory[];
	limits?: GraphLimits;
	favicons?: Map<string, string>;
	initialSelectedId?: string;
	assistantConnected: boolean;
	query?: string;
}) => {
	const [selectedId, setSelectedId] = useState<string | null>(
		initialSelectedId ?? null,
	);
	const [hoverId, setHoverId] = useState<string | null>(null);
	// Canvas needs a browser; the server render draws the empty shell.
	const mounted = useSyncExternalStore(
		subscribeToNothing,
		() => true,
		() => false,
	);

	const graph = useMemo(
		() => graphData(contexts, memories, limits, favicons, initialSelectedId),
		[contexts, memories, limits, favicons, initialSelectedId],
	);
	const searching = query.trim().length > 1;
	const hits = useMemo(
		() =>
			searching
				? new Set(
						graph.nodes.flatMap((node) =>
							matchesQuery(node, query) ? [node.id] : [],
						),
					)
				: null,
		[graph, query, searching],
	);
	// Big windows get a quieter map: fewer labels, weaker spread, no link traffic.
	const dense = graph.nodes.length > 40;
	const byId = useMemo(
		() =>
			new Map<string, GraphNode>(graph.nodes.map((node) => [node.id, node])),
		[graph],
	);
	// Whatever is open has to stay on the map: a selection the search rules out is
	// simply not shown, so no panel outlives the query that hid its dot.
	const selected = useMemo(() => {
		if (!selectedId) return null;
		if (hits && !hits.has(selectedId)) return null;
		return byId.get(selectedId) ?? null;
	}, [selectedId, hits, byId]);
	const hoverRef = useRef<string | null>(null);
	// The ring follows the panel, so a search that hides a dot hides its ring too.
	const selectedRef = useRef<string | null>(null);
	useEffect(() => {
		selectedRef.current = selected?.id ?? null;
	}, [selected]);

	// Wide ranges use a fixed spiral instead of physics: hundreds of nodes on a
	// force layout clump into islands with strays that wreck the framing, while a
	// spiral keeps every stretch findable and the map readable at a glance.
	const layout = useMemo(() => {
		if (!dense) return null;
		const positions = new Map<string, { x: number; y: number }>();
		const stretches = graph.nodes
			.filter((node) => node.kind === "context")
			.toSorted((a, b) => a.context.endTimestamp - b.context.endTimestamp);
		stretches.forEach((node, index) => {
			const angle = index * 2.399963;
			const radius = 24 + 26 * Math.sqrt(index);
			positions.set(node.id, {
				x: Math.cos(angle) * radius,
				y: Math.sin(angle) * radius,
			});
		});
		const parked = new Map<string, { x: number; y: number }[]>();
		for (const edge of graph.edges) {
			const point = positions.get(edge.source);
			if (!point) continue;
			const group = parked.get(edge.target);
			if (group) group.push(point);
			else parked.set(edge.target, [point]);
		}
		for (const [id, points] of parked) {
			positions.set(id, {
				x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
				y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
			});
		}
		return positions;
	}, [graph, dense]);

	// Stable identity: react-force-graph rebuilds the whole simulation on every
	// new graphData object, so hovering must not recreate it.
	const forceData = useMemo(() => {
		const nodes = graph.nodes as unknown as PositionedNode[];
		if (layout)
			for (const node of nodes) {
				const point = layout.get(node.id);
				if (!point) continue;
				node.fx = point.x;
				node.fy = point.y;
			}
		return { nodes, links: graph.edges as unknown as PositionedLink[] };
	}, [graph, layout]);

	// Nodes connected to whatever is selected stay bright; everything else recedes.
	const focus = useMemo(() => {
		if (!selectedId) return null;
		const ids = new Set([selectedId]);
		for (const edge of graph.edges) {
			if (edge.source === selectedId) ids.add(edge.target);
			if (edge.target === selectedId) ids.add(edge.source);
		}
		return ids;
	}, [graph, selectedId]);

	const sizeRef = useRef<HTMLDivElement | null>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const el = sizeRef.current;
		if (!el) return;
		const observer = new ResizeObserver(() => setWidth(el.clientWidth));
		observer.observe(el);
		setWidth(el.clientWidth);
		return () => observer.disconnect();
	}, []);

	const fg = useRef<
		ForceGraphMethods<PositionedNode, PositionedLink> | undefined
	>(undefined);
	useEffect(() => {
		if (!mounted || !width || !forceData.nodes.length) return;
		// Fixed spiral: nothing to settle, so frame it straight away.
		if (layout) {
			const timer = setTimeout(() => fg.current?.zoomToFit(300, 20), 250);
			return () => clearTimeout(timer);
		}
		// Scale the layout with the canvas so the map fills it instead of huddling in
		// the middle of a wide panel.
		fg.current?.d3Force("charge")?.strength(-Math.max(240, width * 0.55));
		fg.current?.d3Force("link")?.distance(Math.max(70, width * 0.14));
		// The layout has to finish settling first, otherwise the fit frames a graph
		// that is still expanding and the cluster ends up tiny in the middle.
		const timer = setTimeout(() => fg.current?.zoomToFit(500, 24), 1800);
		return () => clearTimeout(timer);
	}, [forceData, layout, mounted, width]);

	// Searching also moves the camera: the view flies to whatever matched, and
	// returns to the whole map when the box is cleared.
	useEffect(() => {
		if (!mounted || !width || !forceData.nodes.length) return;
		const timer = setTimeout(() => {
			if (!hits) fg.current?.zoomToFit(700, 24);
			else if (hits.size) fg.current?.zoomToFit(700, 60, (n) => hits.has(n.id));
		}, 320);
		return () => clearTimeout(timer);
	}, [hits, mounted, width, forceData]);

	// Search animates instead of snapping: each dot eases towards "found" or
	// "faded" every frame, so the map visibly reshapes around what you typed.
	const presence = useRef(new Map<string, number>());

	const detailFor = (node: GraphNode) =>
		node.kind === "context" ? (
			<ContextDetail
				node={node}
				sessions={sessions}
				memories={memories}
				contexts={contexts}
				assistantConnected={assistantConnected}
				onClose={() => setSelectedId(null)}
			/>
		) : node.kind === "site" ? (
			<SiteDetail
				node={node}
				contexts={contexts}
				assistantConnected={assistantConnected}
				onClose={() => setSelectedId(null)}
			/>
		) : (
			<MemoryDetail
				memory={node.memory}
				assistantConnected={assistantConnected}
				onClose={() => setSelectedId(null)}
			/>
		);

	return (
		<div className="flex flex-col gap-5 lg:flex-row">
			<div
				ref={sizeRef}
				className="relative min-w-0 flex-1 overflow-hidden rounded-lg"
				data-testid="context-map-canvas"
			>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,rgba(111,156,129,0.16),transparent_60%)]"
				/>
				{mounted && width > 0 && (
					<GraphCanvas
						fgRef={fg}
						width={width}
						data={forceData}
						dense={dense}
						hits={hits}
						focus={focus}
						presence={presence}
						selectedRef={selectedRef}
						hoverRef={hoverRef}
						hovering={hoverId !== null}
						onHover={(id) => {
							hoverRef.current = id;
							setHoverId(id);
						}}
						onSelect={setSelectedId}
					/>
				)}
			</div>
			<aside className="min-w-0 lg:w-80 lg:shrink-0" aria-live="polite">
				{selected && mounted ? detailFor(selected) : <Hint />}
			</aside>
		</div>
	);
};
