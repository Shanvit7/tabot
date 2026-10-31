import assert from "node:assert/strict";
import { selectVisibleContentRoot } from "./visible-excerpts";

const element = (name: string) => ({ name }) as unknown as Element;
const article = element("article");
const roleMain = element("role-main");
const main = element("main");
const body = element("body") as HTMLElement;
const documentFor = (matches: Record<string, Element | null>): Document =>
	({
		body,
		querySelector: (selector: string) => matches[selector] ?? null,
	}) as unknown as Document;

assert.equal(
	selectVisibleContentRoot(
		documentFor({
			"main article": article,
			article,
			"[role='main']": roleMain,
			main,
		}),
	),
	article,
	"prefer article within main over site navigation",
);
assert.equal(
	selectVisibleContentRoot(documentFor({ "[role='main']": roleMain, main })),
	roleMain,
	"fall back to explicit accessible main content",
);
assert.equal(
	selectVisibleContentRoot(documentFor({ main })),
	main,
	"fall back to main element",
);
assert.equal(
	selectVisibleContentRoot(documentFor({})),
	body,
	"use body on pages without a semantic content root",
);
console.log("visible-excerpts: content-root selection passed");
