import {
	env,
	type FeatureExtractionPipeline,
	pipeline,
} from "@huggingface/transformers";

const MODEL = "Xenova/multi-qa-MiniLM-L6-cos-v1";
const DIMENSIONS = 384;
const createFeaturePipeline = pipeline as unknown as (
	task: "feature-extraction",
	model: string,
	options: { device: "wasm"; dtype: "q8" },
) => Promise<FeatureExtractionPipeline>;
let embedder: Promise<FeatureExtractionPipeline> | undefined;

const getEmbedder = () => {
	embedder ??= (async () => {
		env.allowLocalModels = true;
		env.allowRemoteModels = false;
		env.localModelPath = new URL("/models/", self.location.href).href;
		env.backends.onnx.wasm.wasmPaths = new URL(
			"/runtime/",
			self.location.href,
		).href;
		env.backends.onnx.wasm.numThreads = 1;
		return createFeaturePipeline("feature-extraction", MODEL, {
			device: "wasm",
			dtype: "q8",
		});
	})();
	return embedder;
};

let queue = Promise.resolve();

self.onmessage = (event: MessageEvent<{ id: number; text: string }>) => {
	queue = queue.then(async () => {
		const { id, text } = event.data;
		if (!Number.isSafeInteger(id)) return;
		if (typeof text !== "string" || !text.trim()) {
			self.postMessage({ id, error: "invalid-embedding-request" });
			return;
		}
		let extractor: FeatureExtractionPipeline;
		try {
			extractor = await getEmbedder();
		} catch {
			embedder = undefined;
			self.postMessage({ id, error: "model-load-failed" });
			return;
		}
		try {
			const result = await extractor(text, {
				pooling: "mean",
				normalize: true,
			});
			const vector = Array.from(result.data as Float32Array);
			if (
				vector.length !== DIMENSIONS ||
				vector.some((value) => !Number.isFinite(value))
			) {
				self.postMessage({ id, error: "embedding-invalid" });
				return;
			}
			self.postMessage({ id, vector });
		} catch {
			embedder = undefined;
			self.postMessage({ id, error: "embedding-inference-failed" });
		}
	});
};
