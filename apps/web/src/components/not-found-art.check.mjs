import assert from "node:assert/strict";
import { NOT_FOUND_GEOMETRY as art } from "./not-found-geometry.ts";

assert.ok(art.parts.length > 15 && art.parts.length < 30);
assert.ok(
	art.parts.every((part) => part.paths.fill && part.paths.shades.length === 4),
);
assert.ok(art.parts.some((part) => part.name === "sign.face"));
assert.ok(art.parts.some((part) => part.name === "trail"));
assert.ok(art.number.includes("matrix("));
console.log(
	"Static Anatomy wayfinder: layered 404 sign, trail, and shaded solids passed.",
);
