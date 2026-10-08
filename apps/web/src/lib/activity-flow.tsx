import { activityMetricsPrompt, chatGptPromptUrl } from "@tabot/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ForceGraphMethods } from "react-force-graph-2d";
import ForceGraph2D from "react-force-graph-2d";
import {
	type ActivityFlow,
	connectedTo,
	type FlowLink,
	type FlowNode,
} from "~/lib/activity-flow-data";
import { faviconImage } from "~/lib/context-graph-data";
import { PlaceCard } from "~/lib/place-card";
import { plural, timeLabel } from "~/lib/place-format";
import { Leaderboard } from "~/lib/place-leaderboard";

type CanvasNode = FlowNode & { x?: number; y?: number };
type CanvasLink = Omit<FlowLink, "source" | "target"> & {
	source: string | CanvasNode;
	target: string | CanvasNode;
};

const INK = "#e8f3e8";
const SITE = "#6f9c81";
const ACCENT = "#bfff00";
const LINK = "110,170,135";

const idOf = (end: string | CanvasNode): string =>
	typeof end === "string" ? end : end.id;

// A place's real favicon needs enough pixels to be recognisable.
const radiusOf = (node: CanvasNode) =>
	Math.min(18, Math.max(5.5, Math.sqrt(Math.max(1, node.events)) * 2.2));

export const ActivityFlowGraph = ({
	flow,
	assistantConnected,
}: {
	flow: ActivityFlow;
	assistantConnected: boolean;
}) => {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const sizeRef = useRef<HTMLDivElement | null>(null);
	const [width, setWidth] = useState(0);

	useEffect(() => {
		const element = sizeRef.current;
		if (!element) return;
		const observer = new ResizeObserver(() => setWidth(element.clientWidth));
		observer.observe(element);
		setWidth(element.clientWidth);
		return () => observer.disconnect();
	}, []);

	// Stable identity: the layout must not restart when selection changes.
	const data = useMemo(
		() => ({
			nodes: flow.nodes.map((node) => ({ ...node }) as CanvasNode),
			links: flow.links.map((link) => ({ ...link }) as CanvasLink),
		}),
		[flow],
	);

	const topIds = useMemo(
		() => new Set(flow.nodes.slice(0, 5).map((node) => node.id)),
		[flow],
	);
	const focus = useMemo(() => {
		if (!selectedId || !flow.nodes.some((node) => node.id === selectedId))
			return null;
		const ids = new Set([selectedId]);
		for (const link of flow.links) {
			if (link.source === selectedId) ids.add(link.target);
			if (link.target === selectedId) ids.add(link.source);
		}
		return ids;
	}, [flow, selectedId]);

	const fg = useRef<ForceGraphMethods<CanvasNode, CanvasLink> | undefined>(
		undefined,
	);
	useEffect(() => {
		if (!width || !data.nodes.length) return;
		fg.current?.d3Force("charge")?.strength(-Math.max(220, width * 0.5));
		fg.current?.d3Force("link")?.distance(Math.max(60, width * 0.12));
		const timer = setTimeout(() => fg.current?.zoomToFit(500, 40), 900);
		return () => clearTimeout(timer);
	}, [data, width]);

	const selected = selectedId
		? (flow.nodes.find((node) => node.id === selectedId) ?? null)
		: null;
	const connections = selected ? connectedTo(flow, selected.id) : [];

	// Hand-painted nodes: the place's real favicon where we have it, a weighted
	// dot otherwise. d3AlphaMin 0 keeps the engine ticking so a favicon that
	// finishes loading after the layout settles still fades in.
	const paintNode = (
		node: CanvasNode,
		ctx: CanvasRenderingContext2D,
		scale: number,
	) => {
		if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
		const x = node.x as number;
		const y = node.y as number;
		const active = node.id === selectedId;
		const lit = !focus || focus.has(node.id);
		const r = radiusOf(node);
		const icon = lit ? faviconImage(node.favicon) : null;
		if (icon) {
			const size = r * 2;
			ctx.save();
			ctx.globalAlpha = lit ? 1 : 0.16;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fillStyle = "#0b1310";
			ctx.fill();
			if (typeof ctx.roundRect === "function") {
				ctx.beginPath();
				ctx.roundRect(x - r, y - r, size, size, r * 0.45);
				ctx.clip();
			}
			ctx.drawImage(icon, x - r, y - r, size, size);
			ctx.restore();
		} else {
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fillStyle = active
				? ACCENT
				: lit
					? topIds.has(node.id)
						? INK
						: SITE
					: "rgba(111,156,129,0.14)";
			ctx.fill();
		}
		if (active) {
			ctx.save();
			ctx.setLineDash([3.5 / scale, 3.5 / scale]);
			ctx.lineDashOffset = -((performance.now() / 45) % (7 / scale));
			ctx.strokeStyle = ACCENT;
			ctx.lineWidth = 1.6 / scale;
			ctx.beginPath();
			ctx.arc(x, y, r + 6 / scale, 0, Math.PI * 2);
			ctx.stroke();
			ctx.restore();
		}
		if (!active && !topIds.has(node.id)) return;
		ctx.font = `${(active ? 12 : 10.5) / scale}px ui-sans-serif, system-ui, sans-serif`;
		ctx.textAlign = "center";
		ctx.textBaseline = "bottom";
		ctx.fillStyle = lit ? "rgba(169,198,177,0.95)" : "rgba(169,198,177,0.3)";
		ctx.fillText(node.label, x, y - r - 5 / scale);
	};

	return (
		<div className="flex flex-col gap-5 lg:flex-row">
			<div
				ref={sizeRef}
				role="img"
				aria-label={`Flow graph: ${flow.nodes.length} places you visited and ${flow.links.length} moves between them. Each dot is a place; thicker lines mean more moves.`}
				className="relative min-w-0 flex-1 overflow-hidden rounded-lg"
			>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,rgba(111,156,129,0.16),transparent_60%)]"
				/>
				{width > 0 && (
					<ForceGraph2D<CanvasNode, CanvasLink>
						ref={fg}
						width={width}
						height={420}
						graphData={data}
						backgroundColor="rgba(0,0,0,0)"
						nodeRelSize={4}
						nodeVal={(node) => Math.max(1, node.events)}
						nodeCanvasObject={paintNode}
						nodePointerAreaPaint={(node, color, ctx, scale) => {
							if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
							ctx.fillStyle = color;
							ctx.beginPath();
							ctx.arc(
								node.x as number,
								node.y as number,
								radiusOf(node) + 6 / scale,
								0,
								Math.PI * 2,
							);
							ctx.fill();
						}}
						nodeLabel={(node) =>
							`${node.label} · ${timeLabel(node.activeMs)} · ${plural(node.visits, "visit")}`
						}
						linkColor={(link) => {
							const source = idOf(link.source);
							const target = idOf(link.target);
							if (focus && !(focus.has(source) && focus.has(target)))
								return `rgba(${LINK},0.06)`;
							return `rgba(${LINK},${selectedId ? 0.45 : 0.26})`;
						}}
						linkWidth={(link) => 1 + Math.min(4, link.count / 3)}
						linkDirectionalParticles={(link) => Math.min(4, link.count)}
						linkDirectionalParticleWidth={2}
						linkDirectionalParticleSpeed={0.004}
						linkDirectionalParticleColor={() => ACCENT}
						onNodeClick={(node) => setSelectedId(node.id)}
						onBackgroundClick={() => setSelectedId(null)}
						d3AlphaMin={0}
						d3AlphaDecay={0.06}
						d3VelocityDecay={0.5}
					/>
				)}
				<p className="pointer-events-none absolute bottom-3 left-4 text-[11px] text-[#6f8f78]">
					Drag to explore · scroll to zoom · click a place
				</p>
			</div>
			<aside className="lg:w-72 lg:shrink-0">
				<label className="mb-3 block text-sm text-[#a9c6b1]">
					Explore a place
					<select
						value={selected?.id ?? ""}
						onChange={(event) => setSelectedId(event.target.value || null)}
						className="mt-2 min-h-11 w-full rounded-lg border border-[#2f4738] bg-[#101c16] px-3 text-sm text-[#e8f3e8]"
					>
						<option value="">Overview</option>
						{flow.nodes.map((node) => (
							<option key={node.id} value={node.id}>
								{node.label} — {node.id}
							</option>
						))}
					</select>
				</label>
				<div aria-live="polite">
					{selected ? (
						<PlaceCard
							node={selected}
							rank={flow.nodes.findIndex((node) => node.id === selected.id) + 1}
							total={flow.nodes.length}
							totalMs={flow.totalMs}
							activeDays={flow.stats.activeDays}
							connections={connections}
							assistantHref={chatGptPromptUrl(
								activityMetricsPrompt(flow.from, flow.to, selected.id),
							)}
							assistantConnected={assistantConnected}
						/>
					) : (
						<Leaderboard
							nodes={flow.nodes.slice(0, 5)}
							totalMs={flow.totalMs}
							onPick={setSelectedId}
						/>
					)}
				</div>
			</aside>
		</div>
	);
};
