import { Circuit } from "handwired/src/runtime/numeric-ui-core.ts";
import type { StoredTabEvent } from "../events/db";
import { canonicalPageUrl } from "../privacy/canonical-url";

export const BEHAVIOR_MODEL_SCHEMA = 2;
export const BEHAVIOR_MODEL_LIMITS = {
	buckets: 32,
	context: 2,
	events: 4_000,
	examples: 1_024,
	epochs: 8,
	// ponytail: one 30-minute foreground gap; make adaptive if unrelated paths merge.
	maxGapMs: 30 * 60 * 1000,
	learningRate: 0.05,
} as const;

export type NextSiteExample = {
	features: number[];
	contextOrigins: string[];
	target: number;
	origin: string;
	sourceIds: string[];
	startedAt: number;
	timestamp: number;
};
export type BehaviorCheckpoint = {
	schema: 2;
	weights: number[];
	bias: number[];
	trainedThrough: number;
	revision: string;
	sourceIds: string[];
};
export type BehaviorTraining = {
	checkpoint: BehaviorCheckpoint | null;
	examples: number;
	cancelled: boolean;
};
type PageEvent = { event: StoredTabEvent; origin: string; bucket: number };

const siteBucket = (origin: string): number => {
	let hash = 2166136261;
	for (let index = 0; index < origin.length; index++)
		hash = Math.imul(hash ^ origin.charCodeAt(index), 16777619);
	return (hash >>> 0) % BEHAVIOR_MODEL_LIMITS.buckets;
};

const siteVisit = (event: StoredTabEvent): PageEvent | null => {
	if (
		(event.type !== "NAVIGATION" && event.type !== "TAB_ACTIVATED") ||
		!Number.isFinite(event.timestamp) ||
		event.timestamp < 0
	)
		return null;
	try {
		const url = new URL(canonicalPageUrl(event.url ?? ""));
		if (url.protocol !== "https:" && url.protocol !== "http:") return null;
		return { event, origin: url.origin, bucket: siteBucket(url.origin) };
	} catch {
		return null;
	}
};

const normalizedPages = (events: StoredTabEvent[]) =>
	events
		.map(siteVisit)
		.filter((page): page is PageEvent => page !== null)
		.sort(
			(a, b) =>
				a.event.timestamp - b.event.timestamp ||
				(a.event.source?.sequence ?? 0) - (b.event.source?.sequence ?? 0) ||
				a.event.id.localeCompare(b.event.id),
		)
		.slice(-BEHAVIOR_MODEL_LIMITS.events);

/** Foreground visits form one timeline across tabs; hashed buckets are lossy, not anonymous. */
export const buildNextSiteExamples = (
	events: StoredTabEvent[],
): NextSiteExample[] => {
	const examples: NextSiteExample[] = [];
	const history: PageEvent[] = [];
	for (const page of normalizedPages(events)) {
		const previous = history.at(-1);
		if (
			previous &&
			page.event.timestamp - previous.event.timestamp >
				BEHAVIOR_MODEL_LIMITS.maxGapMs
		)
			history.length = 0;
		if (history.at(-1)?.origin === page.origin) {
			history[history.length - 1] = page;
			continue;
		}
		if (history.length) {
			const features = Array(
				BEHAVIOR_MODEL_LIMITS.buckets * BEHAVIOR_MODEL_LIMITS.context,
			).fill(0) as number[];
			for (
				let index = 0;
				index < Math.min(history.length, BEHAVIOR_MODEL_LIMITS.context);
				index++
			)
				features[
					index * BEHAVIOR_MODEL_LIMITS.buckets +
						history[history.length - 1 - index].bucket
				] = 1;
			const context = history.slice(-BEHAVIOR_MODEL_LIMITS.context);
			examples.push({
				features,
				contextOrigins: context.map(({ origin }) => origin),
				target: page.bucket,
				origin: page.origin,
				sourceIds: [...context.map(({ event }) => event.id), page.event.id],
				startedAt: context[0].event.timestamp,
				timestamp: page.event.timestamp,
			});
		}
		history.push(page);
		if (history.length > BEHAVIOR_MODEL_LIMITS.context) history.shift();
	}
	return examples
		.sort((a, b) => a.timestamp - b.timestamp)
		.slice(-BEHAVIOR_MODEL_LIMITS.examples);
};

const makeNetwork = () => {
	const { buckets, context } = BEHAVIOR_MODEL_LIMITS;
	const inputSize = buckets * context;
	const parameterOffset = inputSize;
	const biasOffset = parameterOffset + inputSize * buckets;
	const circuit = new Circuit(biasOffset + buckets);
	const inputs = Array.from({ length: inputSize }, (_, index) =>
		circuit.source(index),
	);
	const parameters = Array.from({ length: inputSize * buckets }, (_, index) =>
		circuit.source(parameterOffset + index),
	);
	const biases = Array.from({ length: buckets }, (_, index) =>
		circuit.source(biasOffset + index),
	);
	const outputs = Array.from({ length: buckets }, (_, output) => {
		const products = Array.from({ length: inputSize }, (_, input) =>
			circuit.multiply(inputs[input], parameters[output * inputSize + input]),
		);
		return circuit.affine([
			...products.map((wire) => [wire, 1] as const),
			[biases[output], 1],
		]);
	});
	return {
		circuit,
		inputSize,
		parameterOffset,
		biasOffset,
		outputs,
		sourceSize: biasOffset + buckets,
	};
};

const dataRevision = (pages: PageEvent[]) => {
	const input = [
		BEHAVIOR_MODEL_SCHEMA,
		BEHAVIOR_MODEL_LIMITS.buckets,
		BEHAVIOR_MODEL_LIMITS.context,
		BEHAVIOR_MODEL_LIMITS.events,
		BEHAVIOR_MODEL_LIMITS.examples,
		BEHAVIOR_MODEL_LIMITS.epochs,
		BEHAVIOR_MODEL_LIMITS.maxGapMs,
		BEHAVIOR_MODEL_LIMITS.learningRate,
		...pages.map(
			({ event, bucket }) => `${event.id}:${event.timestamp}:${bucket}`,
		),
	].join("|");
	const hash = (seed: number) => {
		let value = seed;
		for (let index = 0; index < input.length; index++)
			value = Math.imul(value ^ input.charCodeAt(index), 16777619);
		return (value >>> 0).toString(16).padStart(8, "0");
	};
	return `behavior-v${BEHAVIOR_MODEL_SCHEMA}-${hash(2166136261)}${hash(0x811c9dc5 ^ 0x9e3779b9)}`;
};

export const isBehaviorCheckpoint = (
	value: unknown,
): value is BehaviorCheckpoint =>
	Boolean(
		value &&
			typeof value === "object" &&
			(value as BehaviorCheckpoint).schema === BEHAVIOR_MODEL_SCHEMA &&
			Number.isFinite((value as BehaviorCheckpoint).trainedThrough) &&
			typeof (value as BehaviorCheckpoint).revision === "string" &&
			/^[a-z0-9-]{1,64}$/.test((value as BehaviorCheckpoint).revision) &&
			Array.isArray((value as BehaviorCheckpoint).sourceIds) &&
			(value as BehaviorCheckpoint).sourceIds.length > 0 &&
			(value as BehaviorCheckpoint).sourceIds.length <=
				BEHAVIOR_MODEL_LIMITS.events &&
			(value as BehaviorCheckpoint).sourceIds.every(
				(id) => typeof id === "string" && id.length > 0 && id.length <= 128,
			) &&
			new Set((value as BehaviorCheckpoint).sourceIds).size ===
				(value as BehaviorCheckpoint).sourceIds.length &&
			Array.isArray((value as BehaviorCheckpoint).weights) &&
			(value as BehaviorCheckpoint).weights.length ===
				BEHAVIOR_MODEL_LIMITS.buckets ** 2 * BEHAVIOR_MODEL_LIMITS.context &&
			(value as BehaviorCheckpoint).weights.every(Number.isFinite) &&
			Array.isArray((value as BehaviorCheckpoint).bias) &&
			(value as BehaviorCheckpoint).bias.length ===
				BEHAVIOR_MODEL_LIMITS.buckets &&
			(value as BehaviorCheckpoint).bias.every(Number.isFinite),
	);

const initialCheckpoint = (
	trainedThrough: number,
	pages: PageEvent[],
): BehaviorCheckpoint => {
	let state = 0x6d2b79f5;
	const random = () => {
		state = Math.imul(state ^ (state >>> 15), state | 1);
		state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
		return ((state ^ (state >>> 14)) >>> 0) / 0x100000000;
	};
	const weights = Array.from(
		{
			length:
				BEHAVIOR_MODEL_LIMITS.buckets ** 2 * BEHAVIOR_MODEL_LIMITS.context,
		},
		() => (random() * 2 - 1) * 0.02,
	);
	return {
		schema: BEHAVIOR_MODEL_SCHEMA,
		weights,
		bias: Array(BEHAVIOR_MODEL_LIMITS.buckets).fill(0),
		trainedThrough,
		revision: dataRevision(pages),
		sourceIds: [...new Set(pages.map(({ event }) => event.id))],
	};
};

const predict = (
	network: ReturnType<typeof makeNetwork>,
	checkpoint: BehaviorCheckpoint,
	features: number[],
) => {
	const source = new Float32Array(network.sourceSize);
	source.set(features);
	source.set(checkpoint.weights, network.parameterOffset);
	source.set(checkpoint.bias, network.biasOffset);
	const values = network.circuit.evaluateReference(source);
	let bestBucket = 0;
	for (let bucket = 1; bucket < network.outputs.length; bucket++)
		if (values[network.outputs[bucket]] > values[network.outputs[bestBucket]])
			bestBucket = bucket;
	return bestBucket;
};

/** Bind one validated checkpoint to the bundled Handwired circuit for local inference. */
export const createBehaviorPredictor = (
	checkpoint: BehaviorCheckpoint,
): ((features: number[]) => number) | null => {
	if (!isBehaviorCheckpoint(checkpoint)) return null;
	const network = makeNetwork();
	return (features) =>
		features.length === network.inputSize && features.every(Number.isFinite)
			? predict(network, checkpoint, features)
			: -1;
};

const trainEpoch = (
	network: ReturnType<typeof makeNetwork>,
	checkpoint: BehaviorCheckpoint,
	examples: NextSiteExample[],
) => {
	for (const example of examples) {
		const source = new Float32Array(network.sourceSize);
		source.set(example.features);
		source.set(checkpoint.weights, network.parameterOffset);
		source.set(checkpoint.bias, network.biasOffset);
		const values = network.circuit.evaluateReference(source);
		const outputGradients = new Float32Array(values.length);
		for (let bucket = 0; bucket < BEHAVIOR_MODEL_LIMITS.buckets; bucket++) {
			const error =
				values[network.outputs[bucket]] - Number(bucket === example.target);
			outputGradients[network.outputs[bucket]] =
				(error * 2) / BEHAVIOR_MODEL_LIMITS.buckets;
		}
		const gradients = network.circuit.backpropagateReference(
			values,
			outputGradients,
		);
		let squaredNorm = 0;
		for (
			let index = network.parameterOffset;
			index < network.sourceSize;
			index++
		)
			squaredNorm += gradients[index] ** 2;
		const scale = Math.min(1, 1 / Math.sqrt(squaredNorm || 1));
		for (let index = 0; index < checkpoint.weights.length; index++) {
			checkpoint.weights[index] -=
				BEHAVIOR_MODEL_LIMITS.learningRate *
				gradients[network.parameterOffset + index] *
				scale;
			if (!Number.isFinite(checkpoint.weights[index]))
				throw new Error("non-finite-behavior-weight");
		}
		for (let index = 0; index < checkpoint.bias.length; index++) {
			checkpoint.bias[index] -=
				BEHAVIOR_MODEL_LIMITS.learningRate *
				gradients[network.biasOffset + index] *
				scale;
			if (!Number.isFinite(checkpoint.bias[index]))
				throw new Error("non-finite-behavior-bias");
		}
	}
};

/** Rebuild a deterministic checkpoint from bounded retained observations. */
export const trainBehaviorCheckpoint = async (
	events: StoredTabEvent[],
	shouldCancel: () => boolean | Promise<boolean> = () => false,
): Promise<BehaviorTraining> => {
	const pages = normalizedPages(events);
	const examples = buildNextSiteExamples(events);
	if (examples.length < 4)
		return { checkpoint: null, examples: examples.length, cancelled: false };
	const network = makeNetwork();
	const checkpoint = initialCheckpoint(examples.at(-1)?.timestamp ?? 0, pages);
	for (let epoch = 0; epoch < BEHAVIOR_MODEL_LIMITS.epochs; epoch++) {
		trainEpoch(network, checkpoint, examples);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		if (await shouldCancel())
			return { checkpoint: null, examples: examples.length, cancelled: true };
	}
	return { checkpoint, examples: examples.length, cancelled: false };
};
