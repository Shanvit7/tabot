// Synthetic browser retrieval probe. No extension data, production DB, or repo dependencies changed.
// Run: node scripts/check-taladb-retrieval.mjs [output.json]
// Needs agent-browser, network access, and Node with registerHooks/TypeScript stripping support.
// Downloads DB/runtime/model assets; synthetic documents and queries stay in local Chrome.
import "../packages/shared/resolve-hook.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const { searchContextsCore } = await import(
	new URL("../packages/shared/src/recall/retrieval.ts", import.meta.url)
);
const revision = "751bff37182d3f1213fa05d7196b954e230abad9";
// Labels and corpus fixed before executing retrieval; no weights/threshold tuning.
const records = [
	[
		"refresh",
		"developer.example",
		"/security/refresh-tokens",
		"When an access token expires, exchange the refresh credential to keep the user signed in without asking for a password again.",
	],
	[
		"pkce",
		"developer.example",
		"/security/pkce",
		"Protect an intercepted authorization code using a random verifier and its SHA256 challenge.",
	],
	[
		"atomic",
		"browser.example",
		"/storage/indexeddb-transactions",
		"Write the event and deduplication identity in one atomic transaction. A failed batch must leave no partially saved records.",
	],
	[
		"quota",
		"browser.example",
		"/storage/quota-exceeded",
		"When browser disk space is exhausted, writes can throw QuotaExceededError. Preserve pending data and let the user free storage.",
	],
	[
		"batching",
		"scheduler.example",
		"/pacer/batching",
		"Collect rapid browser events for 25 milliseconds and persist at most 128 rows together through one serial writer.",
	],
	[
		"cleanup",
		"react.example",
		"/hooks/useeffect-cleanup",
		"Return a cleanup callback from the effect to remove event listeners and cancel timers when a component unmounts.",
	],
	[
		"semantic",
		"search.example",
		"/semantic/embeddings",
		"Represent passages as vectors so paraphrases with different words can retrieve the same idea using cosine similarity.",
	],
	[
		"bm25",
		"search.example",
		"/full-text/bm25",
		"An inverted index ranks rare exact words using term frequency and document length. Good for identifiers that semantic search may miss.",
	],
	[
		"wasm",
		"chrome.example",
		"/extensions/wasm-csp",
		"Package WebAssembly locally and permit wasm-unsafe-eval in extension_pages. Do not load executable extension code from a remote CDN.",
	],
	[
		"refund-old",
		"shop.example",
		"/policies/refunds-2024",
		"Refund policy: customers can return purchases within fourteen days for their money back. Policy year 2024.",
	],
	[
		"refund-new",
		"shop.example",
		"/policies/refunds-2026",
		"Refund policy: customers can return purchases within thirty days for their money back. Policy year 2026.",
	],
	[
		"invoice",
		"stripe.example",
		"/billing/invoices",
		"Download the PDF receipt for a paid subscription from the billing portal. Invoice INV-1042 belongs to the annual plan.",
	],
	[
		"opaque-error",
		"bugs.example",
		"/issues/opaque-481",
		"ERR_TABOT_042 means a held batch failed to persist. Keep captured events in memory until the user explicitly retries the write.",
	],
	[
		"css",
		"design.example",
		"/layout/grid",
		"Use CSS grid with minmax columns to make cards wrap responsively on narrow screens.",
	],
	[
		"cookie",
		"developer.example",
		"/security/cookies",
		"Set Secure HttpOnly SameSite cookies to reduce session theft and cross-site request forgery.",
	],
	[
		"backup",
		"browser.example",
		"/storage/export",
		"Export sanitized JSONL for sharing. This excludes page observations and replay source metadata; it is not a complete database backup.",
	],
	[
		"cache",
		"network.example",
		"/http/cache-control",
		"ETag and If-None-Match allow an HTTP client to revalidate a cached response without downloading the body again.",
	],
	[
		"retry",
		"network.example",
		"/http/retry",
		"Retry transient server failures with exponential backoff and jitter. Respect Retry-After when rate limited.",
	],
	[
		"password",
		"developer.example",
		"/security/password-reset",
		"Send a short-lived one-time email link when a user forgets their password and cannot sign in.",
	],
	[
		"worker",
		"chrome.example",
		"/extensions/service-worker",
		"Manifest V3 background workers may stop between events. Persist state before suspension rather than relying on in-memory variables.",
	],
];
const docs = records.map(([id, domain, path, excerpt], index) => ({
	id,
	domain,
	url: `https://${domain}${path}`,
	excerpt,
	timestamp:
		id === "refund-old" ? Date.UTC(2024, 0, 1) : Date.UTC(2026, 9, 1, 0, index),
}));
const queries = [
	["exact", "pkce", ["pkce"]],
	["exact", "bm25", ["bm25"]],
	["exact", "ERR_TABOT_042", ["opaque-error"]],
	["exact", "INV-1042", ["invoice"]],
	[
		"paraphrase",
		"keep me signed in after my access credential expires",
		["refresh"],
	],
	[
		"paraphrase",
		"avoid saving half a group of records when one write fails",
		["atomic"],
	],
	[
		"paraphrase",
		"what to do when the browser runs out of disk space",
		["quota"],
	],
	["paraphrase", "remove listeners when a component disappears", ["cleanup"]],
	[
		"paraphrase",
		"find the same idea even when the wording is different",
		["semantic"],
	],
	[
		"paraphrase",
		"where can I get a PDF receipt for my subscription",
		["invoice"],
	],
	[
		"paraphrase",
		"collect bursts of tab activity and save them together",
		["batching"],
	],
	[
		"paraphrase",
		"background process can stop so memory is not safe",
		["worker"],
	],
	[
		"filtered",
		"save records together without a partial write",
		["atomic"],
		{ domain: "browser.example" },
	],
	[
		"filtered",
		"how long can I return a purchase for my money back",
		["refund-new"],
		{ after: Date.UTC(2026, 0, 1) },
	],
	["no-answer", "sushi restaurants in Kyoto", []],
	["no-answer", "winner of the 1998 football world cup", []],
].map(([kind, query, relevant, scope = {}]) => ({
	kind,
	query,
	relevant,
	scope,
}));

const eligible = (doc, scope) =>
	(!scope.domain || doc.domain === scope.domain) &&
	(!scope.after || doc.timestamp >= scope.after);
const toContext = (doc, enriched) => ({
	id: doc.id,
	primaryDomain: doc.domain,
	domains: [{ domain: doc.domain }],
	sequence: enriched ? [doc.url, doc.excerpt] : [doc.url],
	startTimestamp: doc.timestamp,
});
const baseline = queries.map(({ query, scope }) =>
	Object.fromEntries(
		[false, true].map((enriched) => [
			enriched ? "matcherEnriched" : "currentMetadata",
			searchContextsCore(
				docs
					.filter((doc) => eligible(doc, scope))
					.map((doc) => toContext(doc, enriched)),
				query,
				3,
			).map(({ context }) => context.id),
		]),
	),
);

// This function is served as a module and runs in Chrome, not Node.
const browserProbe = async () => {
	const { openDB, deriveDocId } = await import("taladb");
	const { docs, queries, baseline, revision } = await (
		await fetch("/fixture")
	).json();
	const start = performance.now();
	const db = await openDB("tabot-retrieval-probe", {
		persist: true,
		durability: { flush_every_write: true },
	});
	try {
		const storage = await db.storageInfo();
		if (storage.storage !== "opfs" || !storage.durableWrites)
			throw new Error(`Expected durable OPFS: ${JSON.stringify(storage)}`);
		document.body.textContent = "Loading local embedding model…";
		const { pipeline, env } = await import(
			"https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js"
		);
		env.allowLocalModels = false;
		env.backends.onnx.wasm.numThreads = 1;
		const embed = await pipeline(
			"feature-extraction",
			"Xenova/all-MiniLM-L6-v2",
			{
				device: "wasm",
				dtype: "q8",
				revision,
			},
		);
		const modelReadyMs = performance.now() - start;
		const text = (doc, enriched) =>
			[
				doc.domain,
				doc.domain,
				doc.url,
				...(enriched ? [doc.excerpt] : []),
			].join(" ");
		const rowIds = (hits) => hits.map(({ document }) => document.id);
		const collections = {};
		for (const enriched of [false, true]) {
			const name = enriched ? "enriched" : "metadata";
			const col = db.collection(name);
			const vectors = (
				await embed(
					docs.map((doc) => text(doc, enriched)),
					{ pooling: "mean", normalize: true },
				)
			).tolist();
			await col.insertMany(
				docs.map((doc, index) => ({
					...doc,
					_id: deriveDocId(name, doc.id),
					text: text(doc, enriched),
					embedding: vectors[index],
				})),
			);
			await col.createFtsIndex("text");
			await col.createVectorIndex("embedding", {
				dimensions: 384,
				metric: "cosine",
				indexType: "flat",
			});
			collections[name] = col;
		}
		await db.flush();
		const rows = [];
		for (const [index, query] of queries.entries()) {
			const qStart = performance.now();
			const vector = (
				await embed(query.query, { pooling: "mean", normalize: true })
			).tolist()[0];
			const embeddingMs = performance.now() - qStart;
			const filter = {
				...(query.scope.domain ? { domain: query.scope.domain } : {}),
				...(query.scope.after
					? { timestamp: { $gte: query.scope.after } }
					: {}),
			};
			const methods = { ...baseline[index] };
			for (const [name, col] of Object.entries(collections)) {
				methods[`bm25_${name}`] = rowIds(
					await col.searchText("text", query.query, 3, filter),
				);
				methods[`vector_${name}`] = rowIds(
					(await col.searchVectors("embedding", vector, 3, filter)).hits,
				);
				methods[`hybrid_${name}`] = rowIds(
					await col.hybridSearch(
						{ textField: "text", text: query.query },
						{ vectorField: "embedding", vector },
						3,
						filter,
					),
				);
			}
			rows.push({ ...query, embeddingMs, methods });
		}
		const network = performance
			.getEntriesByType("resource")
			.filter(({ name }) => !name.startsWith(location.origin))
			.map(({ name }) => name);
		return {
			storage,
			modelReadyMs,
			totalMs: performance.now() - start,
			userAgent: navigator.userAgent,
			rows,
			network,
		};
	} finally {
		await db.close();
	}
};

const directory = await mkdtemp(join(tmpdir(), "tabot-taladb-retrieval-"));
const session = `tabot-retrieval-${process.pid}`;
let timer;
let server;
try {
	await exec("npm", [
		"install",
		"--prefix",
		directory,
		"--no-package-lock",
		"--ignore-scripts",
		"--no-audit",
		"--no-fund",
		"taladb@0.12.1",
		"@taladb/web@0.12.1",
	]);
	let finish;
	let fail;
	const completed = new Promise((resolve, reject) => {
		finish = resolve;
		fail = reject;
	});
	timer = setTimeout(
		() => fail(new Error("Browser retrieval probe exceeded 5 minutes")),
		300_000,
	);
	server = createServer(async (req, res) => {
		res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
		res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
		try {
			const path = new URL(req.url, "http://localhost").pathname;
			if (path === "/result" && req.method === "POST") {
				const chunks = [];
				for await (const chunk of req) chunks.push(chunk);
				const result = JSON.parse(Buffer.concat(chunks).toString());
				res.end("ok");
				if (result.error) fail(new Error(result.error));
				else finish(result);
			} else if (path === "/") {
				res.setHeader("Content-Type", "text/html");
				res.end(
					'<!doctype html><title>Tabot retrieval probe</title><p>Synthetic data only. Running…</p><script type="importmap">{"imports":{"taladb":"/node_modules/taladb/dist/index.browser.mjs"}}</script><script type="module" src="/run.js"></script>',
				);
			} else if (path === "/fixture") {
				res.setHeader("Content-Type", "application/json");
				res.end(JSON.stringify({ docs, queries, baseline, revision }));
			} else if (path === "/run.js") {
				res.setHeader("Content-Type", "text/javascript");
				res.end(
					`(${browserProbe.toString()})().catch(error => ({error: error.stack})).then(result => { document.body.textContent = JSON.stringify(result); return fetch('/result', {method: 'POST', body: JSON.stringify(result)}); });`,
				);
			} else if (path.startsWith("/node_modules/")) {
				// TalaDB's unbundled worker URL is relative to its client module.
				const asset = path.replace(
					"/node_modules/taladb/dist/@taladb/web/",
					"/node_modules/@taladb/web/",
				);
				const file = resolve(directory, `.${asset}`);
				if (!file.startsWith(`${directory}/node_modules/`))
					throw new Error("Invalid asset path");
				res.setHeader(
					"Content-Type",
					extname(file) === ".wasm" ? "application/wasm" : "text/javascript",
				);
				res.end(await readFile(file));
			} else {
				res.writeHead(404).end();
			}
		} catch (error) {
			res.writeHead(500).end(error.message);
		}
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	await exec("agent-browser", [
		"--session",
		session,
		"open",
		`http://127.0.0.1:${server.address().port}`,
	]);
	const result = await completed;
	const methods = Object.keys(baseline[0]).concat([
		"bm25_metadata",
		"vector_metadata",
		"hybrid_metadata",
		"bm25_enriched",
		"vector_enriched",
		"hybrid_enriched",
	]);
	// Structural checks, not claims that semantic ranking must beat this fixture.
	assert.equal(result.rows.length, queries.length);
	for (const row of result.rows)
		for (const ids of Object.values(row.methods)) {
			assert.ok(ids.length <= 3);
			assert.equal(new Set(ids).size, ids.length);
			for (const id of ids)
				assert.ok(
					docs.some((doc) => doc.id === id && eligible(doc, row.scope)),
					`Filter leak: ${id}`,
				);
		}
	const metrics = (rows, method) => {
		const ranks = rows.map(
			(row) =>
				row.methods[method].findIndex((id) => row.relevant.includes(id)) + 1,
		);
		return {
			queries: rows.length,
			top1: ranks.filter((rank) => rank === 1).length / rows.length,
			recallAt3: ranks.filter(Boolean).length / rows.length,
			mrrAt3:
				ranks.reduce((sum, rank) => sum + (rank ? 1 / rank : 0), 0) /
				rows.length,
		};
	};
	const groups = ["all-answerable", "exact", "paraphrase", "filtered"];
	const summary = Object.fromEntries(
		groups.map((group) => [
			group,
			Object.fromEntries(
				methods.map((method) => [
					method,
					metrics(
						result.rows.filter((row) =>
							group === "all-answerable"
								? row.relevant.length
								: row.kind === group,
						),
						method,
					),
				]),
			),
		]),
	);
	const report = {
		generatedAt: new Date().toISOString(),
		taladbVersion: "0.12.1",
		transformersVersion: "3.8.1",
		model: "Xenova/all-MiniLM-L6-v2",
		revision,
		dtype: "q8",
		documents: docs.length,
		topK: 3,
		nodeVersion: process.version,
		noAnswerSuggestions: Object.fromEntries(
			methods.map((method) => [
				method,
				result.rows.filter(
					(row) => !row.relevant.length && row.methods[method].length > 0,
				).length,
			]),
		),
		noAnswerQueries: result.rows.filter((row) => !row.relevant.length).length,
		limits:
			"Synthetic smoke test, single relevant document per answerable query; not user-quality evidence. Flat exact vectors; defaults, no tuning. No-answer rows excluded from recall/MRR; inspect false suggestions separately. Persistent OPFS tested, but no restart/crash/ACK or MV3 testing.",
		...result,
		summary,
	};
	const output =
		process.argv[2] ??
		new URL("../docs/taladb-retrieval-results.json", import.meta.url);
	await writeFile(output, `${JSON.stringify(report, null, "\t")}\n`);
	console.table(summary["all-answerable"]);
	console.log(`Report: ${output}; OPFS confirmed; filter checks passed.`);
} finally {
	clearTimeout(timer);
	await exec("agent-browser", ["--session", session, "close"]).catch(() => {});
	if (server) await new Promise((resolve) => server.close(resolve));
	await rm(directory, { recursive: true, force: true });
}
