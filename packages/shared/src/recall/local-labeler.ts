import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { mkdir, open, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import {
	basename,
	dirname,
	isAbsolute,
	relative,
	resolve,
	sep,
} from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import type { StoredTabEvent } from "../events/db";
import { searchHistory } from "./history-search";

export type EvidenceRelevance = "relevant" | "irrelevant" | "ambiguous";
export type PairRelation = "related" | "unrelated" | "ambiguous";
export type SourceLabel = { index: number; label: EvidenceRelevance };
export type PairLabel = { left: number; right: number; label: PairRelation };

export const parseCliArgs = (args: string[]) =>
	args[0] === "--" ? args.slice(1) : args;

const RAW_URL =
	/\b[a-z][a-z\d+.-]*:\S+|\b(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}(?:\/\S*)?|\b(?:localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:\/\S*)?/i;
export const queryContainsUrl = (query: string) => RAW_URL.test(query);
const isInside = (root: string, target: string) => {
	const path = relative(root, target);
	return (
		path === "" ||
		(path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path))
	);
};
export const resolveSafeLabelPath = async (
	repoRoot: string,
	requestedPath: string,
) => {
	const root = resolve(repoRoot);
	const requested = resolve(requestedPath);
	if (isInside(root, requested))
		throw new Error("labels-must-stay-outside-repository");
	await mkdir(dirname(requested), { recursive: true });
	const realRoot = await realpath(root);
	const realParent = await realpath(dirname(requested));
	const destination = resolve(realParent, basename(requested));
	if (isInside(realRoot, destination))
		throw new Error("labels-must-stay-outside-repository");
	return destination;
};
export const appendLocalLabelRecord = async (
	repoRoot: string,
	requestedPath: string,
	record: object,
) => {
	const root = await realpath(repoRoot);
	const path = await resolveSafeLabelPath(root, requestedPath);
	const file = await open(
		path,
		fsConstants.O_WRONLY |
			fsConstants.O_CREAT |
			fsConstants.O_APPEND |
			fsConstants.O_NOFOLLOW,
		0o600,
	);
	try {
		const actualPath = await realpath(path);
		const [opened, destination] = await Promise.all([
			file.stat(),
			stat(actualPath),
		]);
		if (
			isInside(root, actualPath) ||
			opened.dev !== destination.dev ||
			opened.ino !== destination.ino ||
			opened.nlink !== 1
		)
			throw new Error("labels-must-stay-outside-repository");
		await file.writeFile(`${JSON.stringify(record)}\n`, { encoding: "utf8" });
		await file.chmod(0o600);
	} finally {
		await file.close();
	}
};

const sourceLabel = (value: string): EvidenceRelevance => {
	if (value.toLowerCase() === "r") return "relevant";
	if (value.toLowerCase() === "i") return "irrelevant";
	return "ambiguous";
};
const pairLabel = (value: string): PairRelation => {
	if (value.toLowerCase() === "r") return "related";
	if (value.toLowerCase() === "u") return "unrelated";
	return "ambiguous";
};

export const parseSourceLabels = (
	input: string,
	count: number,
): SourceLabel[] => {
	if (!input.trim()) return [];
	const seen = new Set<number>();
	return input.split(",").map((part) => {
		const match = /^\s*(\d+)\s*=\s*([ria])\s*$/i.exec(part);
		const index = Number(match?.[1]);
		if (
			!match ||
			!Number.isInteger(index) ||
			index < 1 ||
			index > count ||
			seen.has(index)
		)
			throw new Error("invalid-source-labels");
		seen.add(index);
		return { index, label: sourceLabel(match[2] ?? "") };
	});
};

export const parsePairLabels = (input: string, count: number): PairLabel[] => {
	if (!input.trim()) return [];
	const seen = new Set<string>();
	return input.split(",").map((part) => {
		const match = /^\s*(\d+)\s*-\s*(\d+)\s*=\s*([rua])\s*$/i.exec(part);
		const left = Number(match?.[1]);
		const right = Number(match?.[2]);
		if (
			!match ||
			!Number.isInteger(left) ||
			!Number.isInteger(right) ||
			left < 1 ||
			right < 1 ||
			left > count ||
			right > count ||
			left === right
		)
			throw new Error("invalid-pair-labels");
		const key = [left, right].sort((a, b) => a - b).join("-");
		if (seen.has(key)) throw new Error("duplicate-pair-label");
		seen.add(key);
		return { left, right, label: pairLabel(match[3] ?? "") };
	});
};

export type LocalEvidenceExport = {
	events: StoredTabEvent[];
	redacted: boolean;
};
export const readEvidenceExport = async (
	path: string,
): Promise<LocalEvidenceExport> => {
	const content = await readFile(path, "utf8");
	const events: StoredTabEvent[] = [];
	let manifest: Record<string, unknown> | undefined;
	for (const [index, line] of content.split(/\r?\n/).entries()) {
		if (!line.trim()) continue;
		let row: Record<string, unknown>;
		try {
			row = JSON.parse(line) as Record<string, unknown>;
		} catch {
			throw new Error(`invalid-jsonl-line-${index + 1}`);
		}
		if (row.manifest && typeof row.manifest === "object") {
			manifest = row.manifest as Record<string, unknown>;
			continue;
		}
		if (row.record !== "event") continue;
		if (
			typeof row.id !== "string" ||
			typeof row.type !== "string" ||
			typeof row.timestamp !== "number" ||
			!Number.isFinite(row.timestamp) ||
			typeof row.tabId !== "number" ||
			typeof row.windowId !== "number"
		)
			throw new Error(`invalid-event-row-${index + 1}`);
		events.push({
			id: row.id,
			type: row.type as StoredTabEvent["type"],
			timestamp: row.timestamp,
			tabId: row.tabId,
			windowId: row.windowId,
			...(typeof row.url === "string" ? { url: row.url } : {}),
		});
	}
	if (manifest?.format !== "tabot-export" || manifest.version !== 1)
		throw new Error("unsupported-tabot-export");
	const privacy = manifest.privacy;
	const redacted =
		typeof privacy === "object" &&
		privacy !== null &&
		"redacted" in privacy &&
		privacy.redacted === true;
	return { events, redacted };
};

const main = async () => {
	const [exportPath, requestedOutputPath] = parseCliArgs(process.argv.slice(2));
	if (!exportPath || !stdin.isTTY) {
		console.error(
			"Usage: pnpm --filter @tabot/shared label:local -- <export.jsonl>",
		);
		process.exitCode = 2;
		return;
	}
	const outputPath = resolve(
		requestedOutputPath ??
			resolve(homedir(), ".tabot", "relatedness-labels.jsonl"),
	);
	const { events, redacted } = await readEvidenceExport(resolve(exportPath));
	if (!redacted)
		console.warn(
			"Export is marked unredacted; safe URL paths appear only in this local terminal.",
		);
	console.log(`Loaded ${events.length} event rows. Derived rows ignored.`);
	const rl = createInterface({ input: stdin, output: stdout });
	try {
		const query = (await rl.question("Task query (saved locally): ")).trim();
		if (!query || query.length > 240)
			throw new Error("query-must-be-1-to-240-chars");
		if (queryContainsUrl(query)) throw new Error("query-must-not-contain-urls");
		const generatedThreadId = randomUUID();
		const threadId =
			(
				await rl.question(`Thread ID (blank = new ${generatedThreadId}): `)
			).trim() || generatedThreadId;
		const splitInput =
			(
				await rl.question("Split [train/evaluation] (default evaluation): ")
			).trim() || "evaluation";
		if (splitInput !== "train" && splitInput !== "evaluation")
			throw new Error("invalid-split");
		const results = await searchHistory(events, [], query, { limit: 20 });
		if (!results.length) {
			console.log("No URL matches; nothing saved.");
			return;
		}
		const representativeIds = results.map(
			(result) => result.sources[0]?.id ?? "",
		);
		const eventById = new Map(events.map((event) => [event.id, event]));
		console.log(
			"\nCandidates (safe URL only; saved labels contain IDs, not URLs):",
		);
		results.forEach((result, index) => {
			const representative = result.sources[0];
			const event = representative
				? eventById.get(representative.id)
				: undefined;
			const url = new URL(result.url);
			console.log(
				`${index + 1}. ${event ? new Date(event.timestamp).toISOString() : "unknown time"} ` +
					`${url.host}${url.pathname} — ${event?.type ?? "unknown event"} — ${result.eventCount} events`,
			);
		});
		console.log(
			"\nEvidence labels: r=relevant, i=irrelevant, a=ambiguous; omit=unjudged.",
		);
		const evidenceInput = await rl.question("Labels (e.g. 1=r,2=i): ");
		const evidenceLabels = parseSourceLabels(evidenceInput, results.length);
		console.log(
			"Pair labels: r=related, u=unrelated, a=ambiguous; omit=unjudged.",
		);
		const pairInput = await rl.question("Pairs (e.g. 1-2=r,1-3=u): ");
		const pairLabels = parsePairLabels(pairInput, results.length);
		if (!evidenceLabels.length && !pairLabels.length) {
			console.log("No judgments entered; nothing saved.");
			return;
		}
		const judgedSources = evidenceLabels.map(({ index, label }) => ({
			sourceId: representativeIds[index - 1],
			label,
		}));
		const pairJudgments = pairLabels.map(({ left, right, label }) => ({
			leftId: representativeIds[left - 1],
			rightId: representativeIds[right - 1],
			label,
		}));
		if (
			judgedSources.some((item) => !item.sourceId) ||
			pairJudgments.some((item) => !item.leftId || !item.rightId)
		)
			throw new Error("candidate-missing-source-id");
		const record = {
			version: 1,
			threadId,
			split: splitInput,
			query,
			judgedSources,
			pairJudgments,
		};
		const repoRoot = resolve(import.meta.dirname, "../../../..");
		await appendLocalLabelRecord(repoRoot, outputPath, record);
		console.log(`Saved labels locally: ${outputPath}`);
	} finally {
		rl.close();
	}
};

if (process.argv[1]?.endsWith("local-labeler.ts"))
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : "labeler-failed");
		process.exitCode = 1;
	});
