// Run: node apps/extension/scripts/copy-taladb-wasm.check.cjs
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { runInNewContext } = require("node:vm");
const source = readFileSync(`${__dirname}/copy-taladb-wasm.cjs`, "utf8");
const patch = (worker, mode) => {
	let written;
	const module = { exports: {} };
	runInNewContext(source, {
		module,
		process: { env: { NODE_ENV: mode } },
		require: (id) =>
			id === "node:fs"
				? {
						copyFileSync() {},
						cpSync() {},
						mkdirSync() {},
						rmSync() {},
						readdirSync: () => ["search-embedding.worker.test.js"],
						readFileSync: () => worker,
						writeFileSync: (_path, content) => {
							written = content;
						},
					}
				: require(id),
	});
	module.exports();
	return written;
};
for (const mode of ["development", "production"]) {
	assert.equal(
		patch(
			"Mn = async (e1)=>(await require(/*webpackIgnore:true*/ e1)).default",
			mode,
		),
		"Mn =async e1=>(await import(e1)).default",
	);
	assert.equal(
		patch("Mn=async e1=>(await loader(e1)).default", mode),
		"Mn=async e1=>(await import(e1)).default",
	);
	assert.throws(
		() => patch("Mn=async e1=>(await loader(other)).default", mode),
		/search-embedding-wasm-import-patch-missed/,
	);
	assert.throws(
		() => patch("unexpected bundle", mode),
		/search-embedding-wasm-import-patch-missed/,
	);
}
console.log(
	"Embedding WASM imports: dev/prod patched; unexpected bundles fail closed",
);
