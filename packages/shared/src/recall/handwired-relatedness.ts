import {
	asWire,
	Circuit,
	type Wire,
} from "handwired/src/runtime/numeric-ui-core.ts";
import {
	RELATEDNESS_FEATURE_NAMES,
	RELATEDNESS_FEATURE_VERSION,
	type RelatednessFeatures,
} from "./relatedness";

export const HANDWIRED_COMMIT = "257856e3b221140acb4cc4460626b850c0bd4ff1";
export const HANDWIRED_MODEL_VERSION = 1;
const FEATURE_COUNT = RELATEDNESS_FEATURE_NAMES.length;
const HIDDEN_WIDTH = 8;
const PARAMETER_COUNT =
	HIDDEN_WIDTH * FEATURE_COUNT * 2 + HIDDEN_WIDTH * 2 + HIDDEN_WIDTH + 1;

export type RelatednessTrainingExample = {
	features: RelatednessFeatures;
	label: 0 | 1;
};
export type HandwiredRelatednessModel = {
	version: typeof HANDWIRED_MODEL_VERSION;
	featureVersion: typeof RELATEDNESS_FEATURE_VERSION;
	upstreamCommit: typeof HANDWIRED_COMMIT;
	weights: number[];
};

const buildCircuit = () => {
	const circuit = new Circuit(PARAMETER_COUNT + FEATURE_COUNT);
	const features = Array.from({ length: FEATURE_COUNT }, (_, index) =>
		circuit.source(PARAMETER_COUNT + index),
	);
	const leftWeights = 0;
	const leftBiases = HIDDEN_WIDTH * FEATURE_COUNT;
	const gateWeights = leftBiases + HIDDEN_WIDTH;
	const gateBiases = gateWeights + HIDDEN_WIDTH * FEATURE_COUNT;
	const outputWeights = gateBiases + HIDDEN_WIDTH;
	const outputBias = outputWeights + HIDDEN_WIDTH;
	const projectionTerms = (
		weightsStart: number,
		biasStart: number,
		row: number,
		inputs: Wire[],
	) => [
		[asWire(biasStart + row), 1] as const,
		...inputs.map(
			(input, column) =>
				[
					circuit.multiply(
						asWire(weightsStart + row * inputs.length + column),
						input,
					),
					1,
				] as const,
		),
	];
	const hidden = Array.from({ length: HIDDEN_WIDTH }, (_, row) =>
		circuit.reglu(
			projectionTerms(leftWeights, leftBiases, row, features),
			0,
			projectionTerms(gateWeights, gateBiases, row, features),
			0,
		),
	);
	const logit = circuit.affine([
		[asWire(outputBias), 1],
		...hidden.map(
			(wire, index) =>
				[circuit.multiply(asWire(outputWeights + index), wire), 1] as const,
		),
	]);
	return { circuit, logit };
};

const normalize = (features: RelatednessFeatures) => {
	if (
		features.length !== FEATURE_COUNT ||
		features.some((value) => !Number.isFinite(value) || value < 0)
	)
		throw new Error("invalid-relatedness-features");
	return features.map((value, index) =>
		index === 0 ? Math.min(value, 20) / 20 : Math.min(value, 1),
	);
};

const makeSource = (
	circuit: Circuit,
	model: HandwiredRelatednessModel,
	features: RelatednessFeatures,
) => {
	if (
		model.version !== HANDWIRED_MODEL_VERSION ||
		model.featureVersion !== RELATEDNESS_FEATURE_VERSION ||
		model.upstreamCommit !== HANDWIRED_COMMIT ||
		model.weights.length !== PARAMETER_COUNT ||
		model.weights.some((weight) => !Number.isFinite(weight))
	)
		throw new Error("invalid-handwired-relatedness-model");
	const source = new Float32Array(PARAMETER_COUNT + FEATURE_COUNT);
	source.set(model.weights);
	source.set(normalize(features), PARAMETER_COUNT);
	return source;
};

export const createRelatednessScorer = (model: HandwiredRelatednessModel) => {
	const { circuit, logit } = buildCircuit();
	const source = makeSource(circuit, model, Array(FEATURE_COUNT).fill(0));
	return (features: RelatednessFeatures) => {
		source.set(normalize(features), PARAMETER_COUNT);
		return circuit.evaluateReference(source)[logit]!;
	};
};

export const scoreRelatedness = (
	model: HandwiredRelatednessModel,
	features: RelatednessFeatures,
): number => createRelatednessScorer(model)(features);

const randomFor = (seed: number) => {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
		return state / 0x1_0000_0000;
	};
};

export const trainRelatednessModel = (
	examples: RelatednessTrainingExample[],
	{ epochs = 120, learningRate = 0.02, seed = 0x51_7a_9e } = {},
): HandwiredRelatednessModel => {
	if (
		!examples.length ||
		!Number.isInteger(epochs) ||
		epochs < 1 ||
		!Number.isFinite(learningRate) ||
		learningRate <= 0
	)
		throw new Error("invalid-handwired-training-options");
	for (const example of examples) {
		if (example.label !== 0 && example.label !== 1) {
			throw new Error("invalid-handwired-training-label");
		}
		normalize(example.features);
	}
	const { circuit, logit } = buildCircuit();
	const source = new Float32Array(PARAMETER_COUNT + FEATURE_COUNT);
	const random = randomFor(seed);
	const inputScale = Math.sqrt(2 / (FEATURE_COUNT + HIDDEN_WIDTH));
	for (let index = 0; index < PARAMETER_COUNT; index++) {
		source[index] = (random() * 2 - 1) * inputScale;
	}
	const leftBiases = HIDDEN_WIDTH * FEATURE_COUNT;
	const gateWeights = leftBiases + HIDDEN_WIDTH;
	const gateBiases = gateWeights + HIDDEN_WIDTH * FEATURE_COUNT;
	const outputWeights = gateBiases + HIDDEN_WIDTH;
	const outputBias = outputWeights + HIDDEN_WIDTH;
	for (let index = 0; index < HIDDEN_WIDTH; index++) {
		source[gateBiases + index] = 0.5;
	}
	for (let index = outputWeights; index <= outputBias; index++) {
		source[index] = (random() * 2 - 1) * 0.1;
	}
	const firstMoment = new Float32Array(PARAMETER_COUNT);
	const secondMoment = new Float32Array(PARAMETER_COUNT);
	let step = 0;
	for (let epoch = 0; epoch < epochs; epoch++) {
		for (const example of examples) {
			source.set(normalize(example.features), PARAMETER_COUNT);
			const values = circuit.evaluateReference(source);
			const prediction = 1 / (1 + Math.exp(-values[logit]!));
			const outputGradients = new Float32Array(values.length);
			outputGradients[logit] = prediction - example.label;
			const gradients = circuit.backpropagateReference(values, outputGradients);
			step++;
			const firstCorrection = 1 - 0.9 ** step;
			const secondCorrection = 1 - 0.999 ** step;
			for (let index = 0; index < PARAMETER_COUNT; index++) {
				const gradient = gradients[index]!;
				firstMoment[index] = 0.9 * firstMoment[index]! + 0.1 * gradient;
				secondMoment[index] =
					0.999 * secondMoment[index]! + 0.001 * gradient * gradient;
				const correctedFirst = firstMoment[index]! / firstCorrection;
				const correctedSecond = secondMoment[index]! / secondCorrection;
				source[index] = Math.max(
					-6,
					Math.min(
						6,
						source[index]! -
							(learningRate * correctedFirst) /
								(Math.sqrt(correctedSecond) + 1e-8),
					),
				);
			}
		}
	}
	return {
		version: HANDWIRED_MODEL_VERSION,
		featureVersion: RELATEDNESS_FEATURE_VERSION,
		upstreamCommit: HANDWIRED_COMMIT,
		weights: Array.from(source.slice(0, PARAMETER_COUNT)),
	};
};
