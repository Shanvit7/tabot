// apps/web/src/shims/node-module.ts
// Browser stand-in for Node's `node:module`, aliased in rsbuild.config.ts.
// @openredaction/core (bundled into Home via @tabot/shared) builds a
// createRequire eagerly to lazily load its optional `compromise` NER detector.
// Tabot uses library patterns only (see packages/shared/src/privacy/sensitive-data.ts),
// so a throwing require is enough — the library catches it.
export const createRequire = () => () => {
	throw new Error("createRequire is not available in the browser");
};
