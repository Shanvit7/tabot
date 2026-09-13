// packages/shared/src/checks/sw-real.report.ts
// Phase 2 Step 11 — REAL-trace validation harness.
//
// Extracts a trace dump from the running extension (chrome://extensions →
// inspect service worker → console):
//   chrome.runtime.sendMessage({type:"GET_EVENTS"}, e =>
//     console.log(JSON.stringify(e)))
// Save the output as trace.json (an event array), then run:
//   pnpm --filter @tabot/shared run swRealReport
//
// Runs the REAL pipeline twice on the SAME real trace:
//   Phase 1: SW telemetry stripped  (the baseline model)
//   Phase 2: SW telemetry present   (focus presence + graph evidence)
// and emits a comparison object (trace.json + report.json) for external
// review — e.g. a human or ChatGPT acting as OBSERVER on real usage data.
//
// Run: node --import ./resolve-hook.mjs src/checks/sw-real.report.ts [path]

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
	type ActivityAnchor,
	buildActivityAnchors,
	buildActivityGraph,
	extractActivityEpisodes,
} from "../activities/activity-graph";
import {
	deriveMeaningfulEvents,
	deriveTransitions,
} from "../activities/meaningful-events";
import { applyFocusContinuity } from "../activities/sw-graph";
import { buildContexts } from "../contexts/contexts";
import type { StoredTabEvent } from "../events/db";
import { buildMemories } from "../memories/memories";
import { sessionize } from "../sessions/sessions";

const tracePath = process.argv[2] ?? path.resolve(process.cwd(), "trace.json");
const raw = readFileSync(tracePath, "utf8");
const rows = JSON.parse(raw) as StoredTabEvent[];

const stripSw = (r: StoredTabEvent[]) =>
	r.filter((e) => !String(e.type).startsWith("SW_"));

const profile = (name: string, input: StoredTabEvent[]) => {
	const sessions = sessionize(input);
	const anchors = buildActivityAnchors(sessions) as ActivityAnchor[];
	const graph = buildActivityGraph(anchors);
	const episodes = extractActivityEpisodes(anchors, graph);
	const transitions = deriveTransitions(deriveMeaningfulEvents(input));
	const contexts = buildContexts(sessions, transitions);
	const memories = buildMemories(
		contexts,
		Math.max(...input.map((e) => e.timestamp)) + 60_000,
	);
	return {
		name,
		events: input.length,
		sessions: sessions.length,
		sessionsDetailed: sessions.map((s) => ({
			start: s.startTimestamp,
			end: s.endTimestamp,
			events: s.eventCount,
			domains: s.domains.map((d) => `${d.domain}:${d.eventCount}`),
		})),
		anchors: anchors.length,
		graphEdges: graph.reduceEdges((n) => n + 1, 0),
		episodes: episodes.length,
		episodesDetailed: episodes.map((e) => ({
			domains: e.domains,
			primaryDomain: e.primaryDomain,
			duration: e.duration,
			events: e.totalEventCount,
			interactions: e.totalInteractionCount,
			boundaries: (e.boundaries ?? []).map((b) => ({
				left: b.leftAnchorId,
				right: b.rightAnchorId,
				score: +b.boundaryScore.toFixed(3),
				decision: b.decision,
				reasons: b.reasons,
			})),
		})),
		contexts: contexts.length,
		contextsDetailed: contexts.map((c) => {
			const ctx = c as unknown as {
				domains?: Array<{ domain: string; eventCount: number }>;
				startTimestamp?: number;
				endTimestamp?: number;
			};
			return {
				domains: (ctx.domains ?? []).map((d) => `${d.domain}:${d.eventCount}`),
				start: ctx.startTimestamp ?? null,
				end: ctx.endTimestamp ?? null,
			};
		}),
		memories: memories.length,
		memoriesDetailed: memories.map((m) => ({
			confidence: +m.confidence.toFixed(3),
		})),
	};
};

const p1 = profile("phase1-no-sw", stripSw(rows));
const p2rows = rows;
const p2 = profile("phase2-with-sw", p2rows);

const p2graphState = () => {
	const sessions = sessionize(p2rows);
	const anchors = buildActivityAnchors(sessions) as ActivityAnchor[];
	const graph = buildActivityGraph(anchors);
	const strengthened = applyFocusContinuity(graph, p2rows);
	return strengthened;
};

const report = {
	trace: {
		file: tracePath,
		totalEvents: rows.length,
		swEvents: rows.filter((e) => String(e.type).startsWith("SW_")).length,
		eventTypes: Object.entries(
			rows.reduce<Record<string, number>>((acc, e) => {
				acc[e.type] = (acc[e.type] ?? 0) + 1;
				return acc;
			}, {}),
		).sort((a, b) => b[1] - a[1]),
	},
	phase1: p1,
	phase2: p2,
	swEvidence: { focusContinuityEdgesStrengthened: p2graphState() },
	deltas: {
		sessions: p2.sessions - p1.sessions,
		episodes: p2.episodes - p1.episodes,
		graphEdges: p2.graphEdges - p1.graphEdges,
		contexts: p2.contexts - p1.contexts,
		memories: p2.memories - p1.memories,
	},
};

// readable summary
console.log(
	`trace: ${report.trace.totalEvents} events (${report.trace.swEvents} SW)`,
);
for (const [t, n] of report.trace.eventTypes) console.log(`  ${t}: ${n}`);
console.log(
	`\nPhase 1 (no SW): sessions=${p1.sessions} anchors=${p1.anchors} edges=${p1.graphEdges} episodes=${p1.episodes} contexts=${p1.contexts} memories=${p1.memories}`,
);
console.log(
	`Phase 2 (SW)  : sessions=${p2.sessions} anchors=${p2.anchors} edges=${p2.graphEdges} episodes=${p2.episodes} contexts=${p2.contexts} memories=${p2.memories}`,
);
console.log(
	`evidence     : ${report.swEvidence.focusContinuityEdgesStrengthened} edge(s) strengthened`,
);
console.log(`deltas       : ${JSON.stringify(report.deltas)}`);
console.log(`\nepisode boundaries (phase 2):`);
for (const ep of p2.episodesDetailed)
	for (const b of ep.boundaries)
		console.log(
			`  ${b.left}->${b.right} score=${b.score} ${b.decision} [${b.reasons.join(", ")}]`,
		);

const out = path.resolve(process.cwd(), "report.json");
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`\nwritten: ${out}`);
