import { Player, type PlayerRef } from "@remotion/player";
import { Maximize2, Pause, Play, ZoomIn, ZoomOut } from "lucide-react";
import {
	type Dispatch,
	type ReactNode,
	type RefObject,
	type SetStateAction,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import {
	layoutNetwork,
	type NetworkData,
	networkFocus,
} from "~/lib/network-graph-data";

const controlClass =
	"grid size-11 place-items-center rounded-md text-[#cfe4d4] hover:bg-[#243c2d] focus-visible:outline-2 focus-visible:outline-[#bfff00] disabled:opacity-40";
const lastFrame = 23;
const subscribeToMount = () => () => {};
const getMountedSnapshot = () => typeof window !== "undefined";
const getServerSnapshot = () => false;

// Only this wrapper subscribes to frames. Nodes and paths retain their React identity.
const GraphReveal = ({ children }: { children: ReactNode }) => {
	const frame = useCurrentFrame();
	return (
		<div
			className="h-full w-full"
			style={{
				opacity: interpolate(frame, [0, lastFrame], [0.65, 1], {
					extrapolateRight: "clamp",
				}),
				translate: `${interpolate(frame, [0, lastFrame], [8, 0], { easing: Easing.out(Easing.cubic), extrapolateRight: "clamp" })}px 0`,
			}}
		>
			{children}
		</div>
	);
};

type GraphSceneProps = {
	layout: ReturnType<typeof layoutNetwork>;
	selectedId: string | null;
	hits: Set<string> | null;
	focus: Set<string> | null;
	focusId: string | null;
	markerId: string;
	player: RefObject<PlayerRef | null>;
	setHoveredId: Dispatch<SetStateAction<string | null>>;
	onSelect: (id: string | null) => void;
};

const GraphScene = ({
	layout,
	selectedId,
	hits,
	focus,
	focusId,
	markerId,
	player,
	setHoveredId,
	onSelect,
}: GraphSceneProps) => {
	return (
		<div
			className="relative h-full w-full"
			onPointerLeave={() => setHoveredId(null)}
		>
			{layout.layered ? (
				<>
					<p className="absolute left-7 top-7 text-xs font-medium text-[#a9c6b1]">
						Places
					</p>
					<p className="absolute left-[272px] top-7 text-xs font-medium text-[#a9c6b1]">
						Browsing stretches
					</p>
					<p className="absolute left-[568px] top-7 text-xs font-medium text-[#a9c6b1]">
						Recurring patterns
					</p>
				</>
			) : (
				<p className="absolute left-7 top-7 text-xs text-[#a9c6b1]">
					Places you moved between · select one to follow its arrows
				</p>
			)}
			<svg
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 h-full w-full"
				viewBox={`0 0 ${layout.width} ${layout.height}`}
			>
				<defs>
					<marker
						id={markerId}
						markerWidth="8"
						markerHeight="8"
						refX="7"
						refY="4"
						orient="auto"
						markerUnits="userSpaceOnUse"
					>
						<path d="M 0 0 L 8 4 L 0 8 Z" className="fill-[#a9c6b1]" />
					</marker>
				</defs>
				{layout.edges.map((edge) => {
					// ponytail: dense maps show incident edges on focus; add edge bundling only if an all-links overview is needed.
					const lit = focusId
						? edge.source === focusId || edge.target === focusId
						: layout.edges.length <= 80;
					if (
						!lit ||
						(hits && !hits.has(edge.source) && !hits.has(edge.target))
					)
						return null;
					return (
						<path
							key={edge.key}
							d={edge.path}
							fill="none"
							className={focusId ? "stroke-[#a9c6b1]" : "stroke-[#43634f]"}
							strokeWidth={Math.min(3, edge.size ?? 1)}
							markerEnd={edge.directed ? `url(#${markerId})` : undefined}
						/>
					);
				})}
			</svg>
			{layout.nodes.map((node) => {
				const active = selectedId === node.id;
				const lit =
					(!hits || hits.has(node.id)) && (!focus || focus.has(node.id));
				return (
					<button
						key={node.id}
						type="button"
						data-node-id={node.id}
						aria-pressed={active}
						disabled={Boolean(hits && !hits.has(node.id))}
						aria-label={`${node.kind === "context" ? "Browsing stretch: " : ""}${node.label}`}
						title={node.label}
						onPointerEnter={() => setHoveredId(node.id)}
						onPointerLeave={() => setHoveredId(null)}
						onFocus={() => {
							player.current?.pause();
							setHoveredId(node.id);
						}}
						onBlur={() => setHoveredId(null)}
						onClick={() => onSelect(active ? null : node.id)}
						className={`absolute flex h-11 items-center gap-2 rounded-lg border text-left ${node.kind === "context" ? "px-2 text-xs" : "px-3 text-sm"} focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bfff00] ${active ? "border-[#bfff00] bg-[#243c2d] text-[#e8f3e8]" : "border-[#43634f] bg-[#101d15] text-[#cfe4d4] hover:border-[#bfff00] hover:bg-[#243c2d]"} ${lit ? "opacity-100" : "opacity-40"}`}
						style={{ left: node.x, top: node.y, width: node.width }}
					>
						{node.kind !== "context" && (
							<span
								aria-hidden="true"
								className={`relative grid size-5 shrink-0 place-items-center overflow-hidden ${node.kind === "memory" ? "rounded-sm" : "rounded-full"}`}
								style={{ backgroundColor: node.color }}
							>
								{node.image && (
									<img
										src={node.image}
										alt=""
										loading="lazy"
										draggable={false}
										className="size-5 object-contain"
										onError={(event) => {
											event.currentTarget.hidden = true;
										}}
									/>
								)}
							</span>
						)}
						<span className="truncate">{node.label}</span>
					</button>
				);
			})}
		</div>
	);
};

type GraphToolbarProps = {
	data: NetworkData;
	layout: ReturnType<typeof layoutNetwork>;
	viewport: RefObject<HTMLElement | null>;
	player: RefObject<PlayerRef | null>;
	zoom: number;
	setZoom: Dispatch<SetStateAction<number>>;
	running: boolean;
	mounted: boolean;
	reducedMotion: boolean;
};

const GraphToolbar = ({
	data,
	layout,
	viewport,
	player,
	zoom,
	setZoom,
	running,
	mounted,
	reducedMotion,
}: GraphToolbarProps) => (
	<div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#243c2d] px-3 py-2">
		<p className="text-sm font-medium">
			Browsing map{" "}
			<span className="ml-2 text-xs font-normal text-[#a9c6b1]">
				{Math.round(zoom * 100)}%
			</span>
		</p>
		<div className="flex gap-1">
			<button
				type="button"
				className={controlClass}
				disabled={!mounted || reducedMotion || !data.nodes.length}
				title={
					reducedMotion
						? "Motion disabled by system preference"
						: "Replay reveal"
				}
				aria-label={running ? "Pause graph animation" : "Replay graph reveal"}
				onClick={() => {
					if (running) {
						player.current?.pause();
						return;
					}
					if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
					if ((player.current?.getCurrentFrame() ?? lastFrame) >= lastFrame)
						player.current?.seekTo(0);
					player.current?.play();
				}}
			>
				{running ? (
					<Pause size={16} aria-hidden="true" />
				) : (
					<Play size={16} aria-hidden="true" />
				)}
			</button>
			<button
				type="button"
				className={controlClass}
				disabled={zoom >= 1.5}
				onClick={() => setZoom((value) => Math.min(1.5, value + 0.15))}
				aria-label="Zoom in"
			>
				<ZoomIn size={16} aria-hidden="true" />
			</button>
			<button
				type="button"
				className={controlClass}
				disabled={zoom <= 0.4}
				onClick={() => setZoom((value) => Math.max(0.4, value - 0.15))}
				aria-label="Zoom out"
			>
				<ZoomOut size={16} aria-hidden="true" />
			</button>
			<button
				type="button"
				className={controlClass}
				onClick={() => {
					setZoom(
						Math.min(
							1,
							(viewport.current?.clientWidth ?? layout.width) / layout.width,
						),
					);
					viewport.current?.scrollTo(0, 0);
				}}
				aria-label="Fit graph"
			>
				<Maximize2 size={16} aria-hidden="true" />
			</button>
		</div>
	</div>
);

type GraphViewportProps = {
	data: NetworkData;
	layout: ReturnType<typeof layoutNetwork>;
	zoom: number;
	mounted: boolean;
	viewport: RefObject<HTMLElement | null>;
	player: RefObject<PlayerRef | null>;
	drag: RefObject<{ x: number; y: number; left: number; top: number } | null>;
	inputProps: { children: ReactNode };
	scene: ReactNode;
	onSelect: (id: string | null) => void;
};

const GraphViewport = ({
	data,
	layout,
	zoom,
	mounted,
	viewport,
	player,
	drag,
	inputProps,
	scene,
	onSelect,
}: GraphViewportProps) => (
	<section
		ref={viewport}
		aria-label="Scrollable graph. Use arrow keys to pan."
		// biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need a focusable scroll container.
		tabIndex={0}
		className="h-[400px] overflow-auto overscroll-contain [scrollbar-color:#6f9c81_#101d15] sm:h-[480px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#bfff00]"
		onKeyDown={(event) => {
			if (event.key === "Escape") onSelect(null);
		}}
		onPointerDown={(event) => {
			player.current?.pause();
			if (
				event.pointerType !== "mouse" ||
				event.button !== 0 ||
				(event.target as HTMLElement).closest("button")
			)
				return;
			drag.current = {
				x: event.clientX,
				y: event.clientY,
				left: event.currentTarget.scrollLeft,
				top: event.currentTarget.scrollTop,
			};
			event.currentTarget.setPointerCapture(event.pointerId);
		}}
		onPointerMove={(event) => {
			if (drag.current)
				event.currentTarget.scrollTo(
					drag.current.left + drag.current.x - event.clientX,
					drag.current.top + drag.current.y - event.clientY,
				);
		}}
		onPointerUp={(event) => {
			drag.current = null;
			if (event.currentTarget.hasPointerCapture(event.pointerId))
				event.currentTarget.releasePointerCapture(event.pointerId);
		}}
		onPointerCancel={() => {
			drag.current = null;
		}}
	>
		{data.nodes.length ? (
			<div
				className="relative"
				style={{ width: layout.width * zoom, height: layout.height * zoom }}
			>
				<div
					className="absolute left-0 top-0 origin-top-left"
					style={{
						width: layout.width,
						height: layout.height,
						scale: zoom,
					}}
				>
					{mounted ? (
						<Player
							ref={player}
							component={GraphReveal}
							inputProps={inputProps}
							compositionWidth={layout.width}
							compositionHeight={layout.height}
							durationInFrames={lastFrame + 1}
							fps={30}
							controls={false}
							initiallyMuted
							clickToPlay={false}
							doubleClickToFullscreen={false}
							spaceKeyToPlayOrPause={false}
							moveToBeginningWhenEnded={false}
							initialFrame={lastFrame}
							acknowledgeRemotionLicense
							style={{ width: layout.width }}
							errorFallback={() => scene}
						/>
					) : (
						scene
					)}
				</div>
			</div>
		) : (
			<p
				role="status"
				className="grid h-full place-items-center px-6 text-sm text-[#a9c6b1]"
			>
				No browsing in this map yet.
			</p>
		)}
	</section>
);

type GraphFooterProps = {
	selectId: string;
	selectedId: string | null;
	data: NetworkData;
	hits: Set<string> | null;
	layout: ReturnType<typeof layoutNetwork>;
	focusId: string | null;
	onSelect: (id: string | null) => void;
};

const GraphFooter = ({
	selectId,
	selectedId,
	data,
	hits,
	layout,
	focusId,
	onSelect,
}: GraphFooterProps) => (
	<div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#243c2d] p-3 text-xs text-[#a9c6b1]">
		<label htmlFor={selectId} className="sr-only">
			Select a graph node
		</label>
		<select
			id={selectId}
			value={selectedId ?? ""}
			onChange={(event) => onSelect(event.target.value || null)}
			className="min-h-11 max-w-full rounded-md border border-[#43634f] bg-[#101d15] px-3 text-sm text-[#cfe4d4] focus-visible:outline-2 focus-visible:outline-[#bfff00]"
		>
			<option value="">
				{hits?.size === 0
					? "No matching places or patterns"
					: "Explore your browsing…"}
			</option>
			{data.nodes
				.filter((node) => !hits || hits.has(node.id))
				.map((node) => (
					<option key={node.id} value={node.id}>
						{node.label}
					</option>
				))}
		</select>
		<p role="status">
			{hits ? `${hits.size} matches · ` : ""}
			{layout.edges.length > 80 && !focusId
				? "Select a place or stretch to see connections"
				: "Select to trace connections"}{" "}
			· Scroll or drag to explore
		</p>
	</div>
);

export const NetworkGraph = ({
	data,
	selectedId,
	hits = null,
	onSelect,
	label,
}: {
	data: NetworkData;
	selectedId: string | null;
	hits?: Set<string> | null;
	onSelect: (id: string | null) => void;
	label: string;
}) => {
	const viewport = useRef<HTMLElement>(null);
	const player = useRef<PlayerRef>(null);
	const drag = useRef<{
		x: number;
		y: number;
		left: number;
		top: number;
	} | null>(null);
	const mounted = useSyncExternalStore(
		subscribeToMount,
		getMountedSnapshot,
		getServerSnapshot,
	);
	const [running, setRunning] = useState(false);
	const [reducedMotion, setReducedMotion] = useState(true);
	const [zoom, setZoom] = useState(1);
	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const markerId = useId();
	const selectId = useId();
	const hasNodes = data.nodes.length > 0;
	const layout = useMemo(() => layoutNetwork(data), [data]);
	const focusId = selectedId ?? hoveredId;
	const focus = useMemo(() => networkFocus(data, focusId), [data, focusId]);

	useEffect(() => {
		if (!hasNodes) return;
		const element = viewport.current;
		const motion = matchMedia("(prefers-reduced-motion: reduce)");
		const stop = () => player.current?.pause();
		const respectMotion = () => {
			setReducedMotion(motion.matches);
			if (!motion.matches) return;
			stop();
			player.current?.seekTo(lastFrame);
		};
		respectMotion();
		const hidden = () => {
			if (document.hidden) stop();
		};
		const observer = new IntersectionObserver(([entry]) => {
			if (!entry.isIntersecting) stop();
		});
		if (element) observer.observe(element);
		const onPlay = () => setRunning(true);
		const onPause = () => setRunning(false);
		player.current?.addEventListener("play", onPlay);
		player.current?.addEventListener("pause", onPause);
		player.current?.addEventListener("ended", onPause);
		motion.addEventListener("change", respectMotion);
		document.addEventListener("visibilitychange", hidden);
		// Start settled. Replay is explicit: no CPU work while reading the map.
		player.current?.seekTo(lastFrame);
		const current = player.current;
		return () => {
			observer.disconnect();
			current?.removeEventListener("play", onPlay);
			current?.removeEventListener("pause", onPause);
			current?.removeEventListener("ended", onPause);
			motion.removeEventListener("change", respectMotion);
			document.removeEventListener("visibilitychange", hidden);
		};
	}, [hasNodes]);

	useEffect(() => {
		player.current?.pause();
		player.current?.seekTo(lastFrame);
		const element = viewport.current;
		const id = selectedId ?? (hits ? hits.values().next().value : null);
		const node = layout.nodes.find((node) => node.id === id);
		if (!element || !node) return;
		element.scrollTo({
			left: Math.max(
				0,
				(node.x + node.width / 2) * zoom - element.clientWidth / 2,
			),
			top: Math.max(0, (node.y + 22) * zoom - element.clientHeight / 2),
		});
	}, [layout, selectedId, hits, zoom]);

	const scene = useMemo(
		() => (
			<GraphScene
				layout={layout}
				selectedId={selectedId}
				hits={hits}
				focus={focus}
				focusId={focusId}
				markerId={markerId}
				player={player}
				setHoveredId={setHoveredId}
				onSelect={onSelect}
			/>
		),
		[layout, selectedId, hits, focus, focusId, markerId, onSelect],
	);
	const inputProps = useMemo(() => ({ children: scene }), [scene]);

	return (
		<fieldset
			aria-label={label}
			className="relative m-0 min-w-0 overflow-hidden rounded-lg border border-[#2f4738] bg-[#0b1710] p-0 text-[#cfe4d4]"
			data-testid="network-graph"
			data-layout-running={running}
		>
			<GraphToolbar
				data={data}
				layout={layout}
				viewport={viewport}
				player={player}
				zoom={zoom}
				setZoom={setZoom}
				running={running}
				mounted={mounted}
				reducedMotion={reducedMotion}
			/>
			<GraphViewport
				data={data}
				layout={layout}
				zoom={zoom}
				mounted={mounted}
				viewport={viewport}
				player={player}
				drag={drag}
				inputProps={inputProps}
				scene={scene}
				onSelect={onSelect}
			/>
			<GraphFooter
				selectId={selectId}
				selectedId={selectedId}
				data={data}
				hits={hits}
				layout={layout}
				focusId={focusId}
				onSelect={onSelect}
			/>
		</fieldset>
	);
};
