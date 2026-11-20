import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
	defaultParseSearch,
	defaultStringifySearch,
} from "@tanstack/react-router";
import ts from "typescript";
import { validateHomeSearch } from "../components/features/home/search/home-search-params.ts";

assert.deepEqual(
	validateHomeSearch({ q: "research", category: "Pages", period: "week" }),
	{ q: "research", category: "Pages", period: "week" },
);
assert.deepEqual(
	validateHomeSearch({
		q: "x".repeat(250),
		category: "invalid",
		period: "invalid",
	}),
	{ q: "x".repeat(240), category: "Everything", period: "today" },
);
assert.deepEqual(validateHomeSearch({ kind: "Notes" }), {
	q: undefined,
	category: "Notes",
	period: "today",
});
const module = { exports: {} };
runInNewContext(
	ts.transpileModule(
		readFileSync(new URL("../router.tsx", import.meta.url), "utf8"),
		{
			compilerOptions: { module: ts.ModuleKind.CommonJS },
		},
	).outputText,
	{
		module,
		exports: module.exports,
		URLSearchParams,
		require: (id) =>
			id === "@tanstack/react-router"
				? { defaultParseSearch, createRouter: (options) => options }
				: { routeTree: {} },
	},
);
const { parseSearch } = module.exports.getRouter();
for (const text of [
	"123",
	"true",
	"false",
	"0",
	"123456789012345678901234567890",
	"1e3",
	"a&b#c",
]) {
	assert.equal(
		validateHomeSearch(parseSearch(`?q=${encodeURIComponent(text)}`)).q,
		text,
	);
	assert.equal(
		validateHomeSearch(parseSearch(defaultStringifySearch({ q: text }))).q,
		text,
	);
}
for (const value of [[], {}, null])
	assert.equal(validateHomeSearch({ q: value }).q, undefined);
console.log(
	"Home URL state: category/legacy links, bounded scalars and lossless numeric/boolean queries passed",
);
