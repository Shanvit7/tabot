// packages/shared/resolve-hook.mjs
// Node preload hook: makes extension-less relative imports resolve for .ts files
// so the check scripts can run against the real production sources.
// Production files stay extension-less (repo convention + verbatimModuleSyntax);
// this hook only affects `node --import ./resolve-hook.mjs <check>.ts` runs.
// Run: node --import ./resolve-hook.mjs src/contexts.check.ts

import { registerHooks } from "node:module";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith("./") || specifier.startsWith("../")) {
			try {
				return nextResolve(`${specifier}.ts`, context);
			} catch {}
		}
		return nextResolve(specifier, context);
	},
});
