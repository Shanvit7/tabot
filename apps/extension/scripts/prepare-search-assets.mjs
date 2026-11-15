import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const root = resolve(".cache/semantic");
const modelId = "Xenova/multi-qa-MiniLM-L6-cos-v1";
const revision = "3c96c1df3fec9a98a5de76e80877c8bec18498f6";
const modelFiles = {
	"config.json":
		"3616e064a97f002d780a0fcb84a9f48cf88f48ce65cf86fc33dab9c28c4536b5",
	"special_tokens_map.json":
		"b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3",
	"tokenizer.json":
		"ba0b295093cc7b311a6df393d6912df56cf6fb2651fb21e02be72cdb0b095e3e",
	"tokenizer_config.json":
		"9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3",
	"onnx/model_quantized.onnx":
		"3da8d06414059630b9e6989c5877bae7d79c2dc5525070e2f36417c15bc07114",
};
const runtimeFiles = {
	"ort-wasm-simd-threaded.mjs":
		"43c25054b6b9ac000f786c65545ff83a45f871e0e310e8c2f4d48a363bb66db4",
	"ort-wasm-simd-threaded.wasm":
		"f061472c6e77d6d50d079aacdc0ff9b63fee287ddd2cbf46cf62438d3891de2b",
};

const sha256 = (content) => createHash("sha256").update(content).digest("hex");
const ensurePinnedFile = async (base, relativePath, expectedHash, url) => {
	const path = resolve(base, relativePath);
	try {
		if (sha256(await readFile(path)) === expectedHash) return;
	} catch {}
	await mkdir(dirname(path), { recursive: true });
	const response = await fetch(url);
	if (!response.ok)
		throw new Error(
			`search-asset-download-failed:${relativePath}:${response.status}`,
		);
	const content = Buffer.from(await response.arrayBuffer());
	if (sha256(content) !== expectedHash)
		throw new Error(`search-asset-checksum-failed:${relativePath}`);
	const temporary = `${path}.tmp`;
	await writeFile(temporary, content);
	await rename(temporary, path);
};

const modelBase = resolve(root, "models", modelId);
for (const [path, hash] of Object.entries(modelFiles)) {
	await ensurePinnedFile(
		modelBase,
		path,
		hash,
		`https://huggingface.co/${modelId}/resolve/${revision}/${path}?download=true`,
	);
}

const runtimeBase = resolve(root, "runtime");
const transformersPath = await realpath(
	resolve("node_modules/@huggingface/transformers"),
);
const require = createRequire(resolve(transformersPath, "package.json"));
const wasmBase = dirname(require.resolve("onnxruntime-web"));
for (const [path, hash] of Object.entries(runtimeFiles)) {
	const source = resolve(wasmBase, path);
	if (sha256(await readFile(source)) !== hash)
		throw new Error(`onnxruntime-wasm-version-mismatch:${path}`);
	const destination = resolve(runtimeBase, path);
	await mkdir(dirname(destination), { recursive: true });
	await writeFile(destination, await readFile(source));
}

console.log(`Prepared pinned local search model ${modelId}@${revision}`);
