import {
	type BrowserContext,
	chatGptContextUrl,
	isAiReadyContext,
	type Memory,
} from "@tabot/shared";
import type { ReactNode } from "react";
import {
	ago,
	contextTitle,
	type GraphNode,
	humanDuration,
	memoryTitle,
	prettySite,
} from "~/lib/context-graph-data";

export const Hint = () => (
	<div className="rounded-lg border border-[#2f4738] bg-[#101d15] p-5 text-sm leading-6 text-[#8fae95]">
		<p className="text-[#cfe4d4]">
			Every dot is something Tabot watched you do — a stretch of browsing, a
			place you landed, a habit that came back.
		</p>
		<p className="mt-3">
			Click any one of them and Tabot explains what it noticed. Nothing here is
			a guess about why you did it.
		</p>
	</div>
);

const Kicker = ({ children }: { children: ReactNode }) => (
	<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#bfff00]">
		{children}
	</p>
);

const Panel = ({
	kicker,
	title,
	onClose,
	children,
}: {
	kicker: string;
	title: string;
	onClose: () => void;
	children: ReactNode;
}) => (
	<div className="rounded-lg border border-[#2f4738] bg-[#101d15] p-5">
		<div className="flex items-start justify-between gap-3">
			<div className="min-w-0">
				<Kicker>{kicker}</Kicker>
				<h3 className="mt-1 break-words text-xl font-semibold text-[#f2f8f2]">
					{title}
				</h3>
			</div>
			<button
				type="button"
				onClick={onClose}
				className="-mr-1 -mt-1 rounded px-2 py-1 text-lg leading-none text-[#8fae95] hover:text-[#e8f3e8]"
				aria-label="Close details"
			>
				×
			</button>
		</div>
		{children}
	</div>
);

const Remark = ({ children }: { children: ReactNode }) => (
	<p className="mt-3 rounded-md border-l-2 border-[#bfff00] bg-[#16271c] px-3 py-2 text-sm leading-6 text-[#dff0e2]">
		{children}
	</p>
);

const Places = ({
	items,
}: {
	items: Array<{ key: string; name: string; note: string }>;
}) => (
	<>
		<p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f8f78]">
			Where you went
		</p>
		<ul className="mt-2 space-y-1.5">
			{items.map((item) => (
				<li
					key={item.key}
					className="flex items-baseline justify-between gap-3 text-sm"
				>
					<span className="truncate text-[#e8f3e8]">{item.name}</span>
					<span className="shrink-0 text-xs text-[#7d9c86]">{item.note}</span>
				</li>
			))}
		</ul>
	</>
);

const clock = (ms: number) =>
	new Date(ms).toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});

export const ContextDetail = ({
	node,
	memories,
	contexts,
	onClose,
}: {
	node: Extract<GraphNode, { kind: "context" }>;
	memories: Memory[];
	contexts: BrowserContext[];
	onClose: () => void;
}) => {
	const { context } = node;
	const ready =
		isAiReadyContext(context) &&
		context.endTimestamp <= Date.now() - 30 * 60_000;
	const sites = context.domains
		.toSorted((a, b) => (b.eventCount ?? 0) - (a.eventCount ?? 0))
		// Browser chrome (new tab, extension pages) is not somewhere the user chose
		// to go; it stays in the map but never in the "where you went" list.
		.filter((site) => !/^(chrome|chrome-extension):\/\//.test(site.domain));
	const shared = node.sharedPlaces;
	const pattern = memories.find(
		(memory) =>
			memory.kind === "recurrent" && memory.contextIds.includes(context.id),
	);
	const first = contexts.reduce(
		(min, item) => Math.min(min, item.startTimestamp),
		context.startTimestamp,
	);
	const seenCount = new Map<string, number>();
	for (const item of contexts)
		for (const entry of item.domains)
			seenCount.set(entry.domain, (seenCount.get(entry.domain) ?? 0) + 1);
	const seenBefore = new Set<string>();
	for (const [domain, count] of seenCount)
		if (count > 1) seenBefore.add(domain);
	const opener =
		clock(context.startTimestamp) === clock(context.endTimestamp)
			? `ending at ${clock(context.endTimestamp)}`
			: `from ${clock(context.startTimestamp)} to ${clock(context.endTimestamp)}`;

	return (
		<Panel
			kicker="A stretch of browsing"
			title={contextTitle(context)}
			onClose={onClose}
		>
			<p className="mt-2 text-sm leading-6 text-[#cfe4d4]">
				{humanDuration(context.duration)} across {node.places} place
				{node.places === 1 ? "" : "s"}, {opener}.
			</p>
			<Remark>
				{shared === 0
					? "Nothing here has come back yet — this one looks like a one-off."
					: shared === node.places
						? "Every place here shows up in another context of yours."
						: `${shared} of these ${node.places} places show up in your other contexts.`}
			</Remark>
			<Places
				items={sites.slice(0, 6).map((site) => ({
					key: site.domain,
					name: prettySite(site.domain),
					note: seenBefore.has(site.domain)
						? "you've been here before"
						: "first time",
				}))}
			/>
			{pattern && (
				<p className="mt-4 text-sm text-[#8fae95]">
					Part of the pattern{" "}
					<span className="text-[#bfff00]">{memoryTitle(pattern)}</span>
				</p>
			)}
			{context.startTimestamp === first && (
				<p className="mt-4 text-xs text-[#6f8f78]">
					Earliest context Tabot still holds.
				</p>
			)}
			{ready ? (
				<a
					href={chatGptContextUrl(context.id)}
					target="_blank"
					rel="noopener noreferrer"
					className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#bfff00] px-4 text-sm font-semibold text-[#15251b] hover:bg-[#d0ff4d]"
				>
					Ask ChatGPT about this ↗
				</a>
			) : (
				<p className="mt-4 text-xs text-[#7d9c86]">
					Tabot needs more activity here before this can be shared.
				</p>
			)}
			<SharingId id={context.id} />
		</Panel>
	);
};

export const SiteDetail = ({
	node,
	contexts,
	onClose,
}: {
	node: Extract<GraphNode, { kind: "site" }>;
	contexts: BrowserContext[];
	onClose: () => void;
}) => {
	const now = Date.now();
	const byId = new Map(contexts.map((context) => [context.id, context]));
	const times = node.contextIds
		.flatMap((id) => {
			const stamp = byId.get(id)?.endTimestamp;
			return typeof stamp === "number" ? [stamp] : [];
		})
		.toSorted((a, b) => b - a);
	return (
		<Panel
			kicker="A place you visit"
			title={prettySite(node.domain)}
			onClose={onClose}
		>
			<p className="mt-2 text-sm leading-6 text-[#cfe4d4]">
				{node.contextCount === 1
					? "It showed up once in the contexts on screen."
					: `It showed up in ${node.contextCount} of the contexts on screen.`}
			</p>
			<Remark>
				{node.contextCount >= 3
					? "A regular stop. This is one of the places your days keep returning to."
					: node.contextCount === 2
						? "You came back here once — worth watching whether it becomes a habit."
						: "Only once so far. Not enough evidence to call it a habit."}
			</Remark>
			{times.length > 0 && (
				<>
					<p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f8f78]">
						Seen around
					</p>
					<ul className="mt-2 space-y-1.5">
						{times.slice(0, 6).map((stamp) => (
							<li
								key={stamp}
								className="flex items-baseline justify-between gap-3 text-sm"
							>
								<span className="text-[#e8f3e8]">{clock(stamp)}</span>
								<span className="text-xs text-[#7d9c86]">
									{ago(now - stamp)}
								</span>
							</li>
						))}
					</ul>
				</>
			)}
			{node.lastSeen > 0 && (
				<p className="mt-4 text-xs text-[#6f8f78]">
					Last seen {ago(now - node.lastSeen)}.
				</p>
			)}
		</Panel>
	);
};

export const MemoryDetail = ({
	memory,
	onClose,
}: {
	memory: Memory;
	onClose: () => void;
}) => {
	const domains = (memory.fingerprint?.domains ?? []).toSorted(
		(a, b) => b.weight - a.weight,
	);
	const total = domains.reduce((sum, entry) => sum + entry.weight, 0) || 1;
	const now = Date.now();
	return (
		<Panel
			kicker="A pattern you repeat"
			title={memoryTitle(memory)}
			onClose={onClose}
		>
			<p className="mt-2 text-sm leading-6 text-[#cfe4d4]">
				{memory.observation}
			</p>
			<Remark>
				{`Seen ${memory.occurrences?.length ?? memory.contextCount} times, most recently ${ago(now - memory.lastSeen)}. ${
					memory.confidence >= 0.75
						? "Tabot is confident about this one."
						: memory.confidence >= 0.5
							? "Tabot is fairly sure about this one."
							: "Early hint — more evidence would firm this up."
				}`}
			</Remark>
			{domains.length > 0 && (
				<>
					<p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f8f78]">
						Where it happens
					</p>
					<ul className="mt-2 space-y-1.5">
						{domains.slice(0, 6).map((entry) => (
							<li
								key={entry.domain}
								className="flex items-baseline justify-between gap-3 text-sm"
							>
								<span className="truncate text-[#e8f3e8]">
									{prettySite(entry.domain)}
								</span>
								<span className="shrink-0 text-xs text-[#7d9c86]">
									{Math.round((entry.weight / total) * 100)}% of the time
								</span>
							</li>
						))}
					</ul>
				</>
			)}
		</Panel>
	);
};

const SharingId = ({ id }: { id: string }) => (
	<details className="mt-4">
		<summary className="cursor-pointer text-xs text-[#6f8f78]">
			Sharing ID
		</summary>
		<p className="mt-2 break-all font-mono text-[11px] leading-5 text-[#5c7a65]">
			{id}
		</p>
	</details>
);
