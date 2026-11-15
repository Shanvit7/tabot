const {
	copyFileSync,
	cpSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} = require("node:fs");
const { resolve } = require("node:path");

module.exports = () => {
	const output =
		process.env.NODE_ENV === "production"
			? "chrome-mv3-prod"
			: "chrome-mv3-dev";
	const directory = resolve("build", output);
	mkdirSync(directory, { recursive: true });
	copyFileSync(
		"node_modules/@taladb/web/pkg/taladb_web_bg.wasm",
		resolve(directory, "taladb_web_bg.wasm"),
	);
	cpSync(".cache/semantic/models", resolve(directory, "models"), {
		recursive: true,
	});
	cpSync(".cache/semantic/runtime", resolve(directory, "runtime"), {
		recursive: true,
	});
	rmSync(resolve(directory, "runtime/ort-wasm-simd-threaded.jsep.mjs"), {
		force: true,
	});
	rmSync(resolve(directory, "runtime/ort-wasm-simd-threaded.jsep.wasm"), {
		force: true,
	});

	const workerFile = readdirSync(directory).find((file) =>
		file.startsWith("search-embedding.worker."),
	);
	if (!workerFile) throw new Error("search-embedding-worker-not-built");
	const workerPath = resolve(directory, workerFile);
	const worker = readFileSync(workerPath, "utf8");
	const parcelDynamicImport =
		/([A-Za-z_$][\w$]*)=async ([A-Za-z_$][\w$]*)=>\(await [A-Za-z_$][\w$]*\(\2\)\)\.default/;
	const patchedWorker = worker.replace(
		parcelDynamicImport,
		"$1=async $2=>(await import($2)).default",
	);
	if (patchedWorker === worker)
		throw new Error("search-embedding-wasm-import-patch-missed");
	writeFileSync(workerPath, patchedWorker);
};
