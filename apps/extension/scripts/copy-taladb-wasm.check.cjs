// Run: node apps/extension/scripts/copy-taladb-wasm.check.cjs
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { runInNewContext } = require("node:vm");
const source = readFileSync(`${__dirname}/copy-taladb-wasm.cjs`, "utf8");
const patch = (worker, mode) => {
	let written;
	let manifest;
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
						readFileSync: (path) =>
							path.endsWith("manifest.json")
								? JSON.stringify({
										externally_connectable: {
											matches: [
												"http://localhost/*",
												"https://tabot.example/*",
											],
										},
										content_scripts: [
											{
												matches: [
													"http://localhost/*",
													"https://tabot.example/*",
												],
											},
										],
										content_security_policy: {
											extension_pages:
												"script-src 'self' http://localhost:*; connect-src 'self' http://localhost:*; object-src 'self'",
										},
									})
								: worker,
						writeFileSync: (path, content) => {
							if (path.endsWith("manifest.json"))
								manifest = JSON.parse(content);
							else written = content;
						},
					}
				: require(id),
	});
	module.exports();
	return { worker: written, manifest };
};
for (const mode of ["development", "production"]) {
	const patched = patch(
		"Mn = async (e1)=>(await require(/*webpackIgnore:true*/ e1)).default",
		mode,
	);
	assert.equal(patched.worker, "Mn =async e1=>(await import(e1)).default");
	if (mode === "production") {
		assert.deepEqual(patched.manifest.externally_connectable.matches, [
			"https://tabot.example/*",
		]);
		assert.deepEqual(patched.manifest.content_scripts[0].matches, [
			"https://tabot.example/*",
		]);
		assert.equal(JSON.stringify(patched.manifest).includes("localhost"), false);
	}
	assert.equal(
		patch("Mn=async e1=>(await loader(e1)).default", mode).worker,
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
