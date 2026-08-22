import type { StatsSnapshot } from "@tabot/shared";
import { createEmptyStats } from "@tabot/shared";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";

const BREAKDOWN: Array<{ key: keyof StatsSnapshot; label: string }> = [
	{ key: "tabCreated", label: "TAB_CREATED" },
	{ key: "tabActivated", label: "TAB_ACTIVATED" },
	{ key: "tabUpdated", label: "TAB_UPDATED" },
	{ key: "tabRemoved", label: "TAB_REMOVED" },
	{ key: "navigation", label: "NAVIGATION" },
	{ key: "pageVisible", label: "PAGE_VISIBLE" },
	{ key: "pageHidden", label: "PAGE_HIDDEN" },
	{ key: "scroll", label: "SCROLL" },
	{ key: "click", label: "CLICK" },
	{ key: "keyActivity", label: "KEY_ACTIVITY" },
];

const tryGetStats = (): Promise<StatsSnapshot | null> =>
	new Promise((resolve) => {
		const g = globalThis as unknown as {
			chrome?: { runtime?: { sendMessage?: (...args: unknown[]) => unknown } };
		};
		const send = g.chrome?.runtime?.sendMessage;
		if (!send) return resolve(null);
		try {
			const extId = (() => {
				try {
					return localStorage.getItem("tabot_extension_id") || undefined;
				} catch {
					return undefined;
				}
			})();
			const msg = { type: "GET_STATS" };
			const cb = (res: unknown) => resolve((res as StatsSnapshot) || null);
			if (extId)
				(send as (a: string, b: unknown, c: (r: unknown) => void) => void)(
					extId,
					msg,
					cb,
				);
			else (send as (a: unknown, b: (r: unknown) => void) => void)(msg, cb);
			setTimeout(() => resolve(null), 800);
		} catch {
			resolve(null);
		}
	});

const Home = () => {
	const [stats, setStats] = useState<StatsSnapshot | null>(null);
	const [dexieCount, setDexieCount] = useState<number | null>(null);
	const [extId, setExtId] = useState("");

	useEffect(() => {
		try {
			setExtId(localStorage.getItem("tabot_extension_id") || "");
		} catch {}
		let alive = true;
		const poll = async () => {
			const s = await tryGetStats();
			if (!alive) return;
			if (s) setStats(s);
			const g = globalThis as unknown as {
				chrome?: { runtime?: { sendMessage?: (...a: unknown[]) => unknown } };
			};
			const send = g.chrome?.runtime?.sendMessage;
			if (send) {
				try {
					const id = (() => {
						try {
							return localStorage.getItem("tabot_extension_id") || undefined;
						} catch {
							return undefined;
						}
					})();
					const cb = (r: unknown) => {
						const v = r as
							| { dexieCount?: number; rxdbCount?: number }
							| undefined;
						const n = v?.dexieCount ?? v?.rxdbCount;
						if (alive && typeof n === "number") setDexieCount(n);
					};
					if (id)
						(send as (a: string, b: unknown, c: (r: unknown) => void) => void)(
							id,
							{ type: "GET_COUNTS" },
							cb,
						);
					else
						(send as (a: unknown, b: (r: unknown) => void) => void)(
							{ type: "GET_COUNTS" },
							cb,
						);
				} catch {}
			}
		};
		poll();
		const t = setInterval(poll, 1000);
		return () => {
			alive = false;
			clearInterval(t);
		};
	}, []);

	const hasExtension = stats !== null;

	const formatAgo = (ts: number) => {
		if (!ts) return "never";
		const d = Math.round((Date.now() - ts) / 1000);
		if (d < 2) return "just now";
		if (d < 60) return `${d}s ago`;
		return `${Math.round(d / 60)}m ago`;
	};

	const s = stats ?? createEmptyStats(10_000);

	return (
		<div className="min-h-screen bg-black flex items-center justify-center p-4 md:p-8">
			<div className="bg-white border-hard shadow-hard-xl p-6 md:p-8 max-w-3xl w-full">
				<div className="flex items-center gap-4 mb-6">
					<img src="/logo.png" alt="Tabot" className="h-16 w-16 border-hard" />
					<div>
						<h1 className="text-3xl font-bold tracking-tight">Tabot</h1>
						<p className="font-mono text-sm text-muted-foreground">
							Browser Activity Pipeline
						</p>
					</div>
					<div className="ml-auto flex items-center gap-2 font-mono text-xs">
						<span
							className={`w-3 h-3 border-hard inline-block ${hasExtension ? "bg-lime" : "bg-zinc-300"}`}
						/>
						{hasExtension ? "Connected" : "No extension"}
					</div>
				</div>

				{!hasExtension && (
					<div className="border-hard bg-lime/20 p-4 mb-6 font-mono text-xs leading-relaxed">
						<div className="font-bold uppercase tracking-wider mb-1">
							Extension not detected
						</div>
						Install the Tabot extension and open this dashboard from{" "}
						<code className="bg-black text-lime px-1">chrome://extensions</code>{" "}
						(enable Developer mode → Load unpacked{" "}
						<code className="bg-black text-lime px-1">
							apps/extension/build/chrome-mv3-prod
						</code>
						). For local dev the manifest allows{" "}
						<code className="bg-black text-lime px-1">
							http://localhost:3000/*
						</code>{" "}
						via{" "}
						<code className="bg-black text-lime px-1">
							externally_connectable
						</code>{" "}
						— paste the extension ID below if needed.
						<div className="mt-3 flex gap-2">
							<input
								value={extId}
								onChange={(e) => setExtId(e.target.value)}
								placeholder="Extension ID (from chrome://extensions)"
								className="flex-1 border-hard px-3 py-2 font-mono text-xs bg-white"
							/>
							<Button
								size="sm"
								onClick={() => {
									try {
										localStorage.setItem("tabot_extension_id", extId.trim());
									} catch {}
								}}
							>
								Save
							</Button>
						</div>
					</div>
				)}

				<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
					<div className="border-hard shadow-hard-sm p-4">
						<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
							Events
						</div>
						<div className="font-bold text-2xl">
							{s.totalEvents.toLocaleString()}
						</div>
					</div>
					<div className="border-hard shadow-hard-sm p-4">
						<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
							Processed
						</div>
						<div className="font-bold text-2xl">
							{s.eventsProcessed.toLocaleString()}
						</div>
					</div>
					<div className="border-hard shadow-hard-sm p-4">
						<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
							Dropped
						</div>
						<div className="font-bold text-2xl">
							{s.droppedEvents.toLocaleString()}
						</div>
					</div>
					<div className="border-hard shadow-hard-sm p-4">
						<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
							Dexie (IndexedDB)
						</div>
						<div className="font-bold text-2xl">
							{dexieCount === null ? "—" : dexieCount.toLocaleString()}
						</div>
					</div>
				</div>

				<div className="border-hard shadow-hard-sm p-4 mb-6">
					<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">
						Breakdown
					</div>
					<div className="grid grid-cols-2 md:grid-cols-5 gap-2 font-mono text-xs">
						{BREAKDOWN.map((r) => (
							<div
								key={r.key}
								className="border-hard bg-zinc-50 px-2 py-2 flex flex-col"
							>
								<span className="text-[10px] uppercase tracking-wider text-muted-foreground">
									{r.label}
								</span>
								<span className="font-bold text-sm">
									{(s[r.key] as number).toLocaleString()}
								</span>
							</div>
						))}
					</div>
					<div className="mt-3 flex flex-wrap gap-3 font-mono text-xs text-muted-foreground">
						<span>
							Occupancy:{" "}
							<span className="font-bold text-black">
								{s.bufferOccupancy}/{s.bufferCapacity}
							</span>
						</span>
						<span>
							Peak:{" "}
							<span className="font-bold text-black">
								{s.peakBufferOccupancy.toLocaleString()}
							</span>
						</span>
						<span>
							Last event:{" "}
							<span className="font-bold text-black">
								{formatAgo(s.lastProcessedAt)}
							</span>
						</span>
					</div>
				</div>

				<div className="flex gap-3">
					<Button className="flex-1" onClick={() => window.location.reload()}>
						Refresh
					</Button>
					<Button
						variant="outline"
						className="flex-1"
						onClick={() => {
							const g = globalThis as unknown as {
								chrome?: {
									runtime?: { sendMessage?: (...a: unknown[]) => unknown };
								};
							};
							const send = g.chrome?.runtime?.sendMessage;
							if (!send) return;
							const id = (() => {
								try {
									return (
										localStorage.getItem("tabot_extension_id") || undefined
									);
								} catch {
									return undefined;
								}
							})();
							const msg = { type: "GENERATE_TEST_EVENTS", count: 10000 };
							const cb = () => {};
							if (id)
								(
									send as (
										a: string,
										b: unknown,
										c: (r: unknown) => void,
									) => void
								)(id, msg, cb);
							else
								(send as (a: unknown, b: (r: unknown) => void) => void)(
									msg,
									cb,
								);
						}}
					>
						Generate 10k test events
					</Button>
				</div>
			</div>
		</div>
	);
};

export const Route = createFileRoute("/")({
	component: Home,
});
