import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

registerHooks({
	load(url, context, nextLoad) {
		if (!url.endsWith(".tsx")) return nextLoad(url, context);
		return {
			format: "module",
			source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
				compilerOptions: {
					jsx: ts.JsxEmit.ReactJSX,
					jsxImportSource: "hono/jsx",
					module: ts.ModuleKind.ESNext,
					target: ts.ScriptTarget.ES2024,
				},
			}).outputText,
			shortCircuit: true,
		};
	},
});
