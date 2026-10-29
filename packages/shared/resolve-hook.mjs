// packages/shared/resolve-hook.mjs
// Node preload hook: makes extension-less relative imports resolve for .ts files
// so the check scripts can run against the real production sources.
// Production files stay extension-less (repo convention + verbatimModuleSyntax);
// this hook only affects `node --import ./resolve-hook.mjs <check>.ts` runs.
// Run: node --import ./resolve-hook.mjs src/contexts.check.ts

import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith("./") || specifier.startsWith("../")) {
			for (const extension of [".ts", ".tsx"]) {
				try {
					return nextResolve(`${specifier}${extension}`, context);
				} catch {}
			}
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (
			url.endsWith(".ts") &&
			(url.includes("/node_modules/handwired/") || url.includes("/handwired@"))
		) {
			return {
				format: "module",
				source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
					compilerOptions: {
						module: ts.ModuleKind.ESNext,
						target: ts.ScriptTarget.ES2022,
					},
				}).outputText,
				shortCircuit: true,
			};
		}
		return nextLoad(url, context);
	},
});
