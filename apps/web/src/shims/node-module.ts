// apps/web/src/shims/node-module.ts
// Browser stand-in for Node's `node:module`, aliased in vite.config.ts.
// @openredaction/core (bundled into the dashboard via @tabot/shared) builds a
// createRequire eagerly to lazily load its optional `compromise` NER detector.
// Tabot never enables NER (see packages/shared/src/privacy/openredaction.ts), so
// a throwing require is enough — the library catches it.
export const createRequire = () => () => {
	throw new Error("createRequire is not available in the browser");
};
