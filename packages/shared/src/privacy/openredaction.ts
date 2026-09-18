// packages/shared/src/privacy/openredaction.ts
// The ONLY module in Tabot that imports @openredaction/core (adapter boundary).
// Everything else talks to PiiRedactor. Detection is fully local: no network,
// no cloud API, no LLM.
//
// Two OpenRedaction 1.1.5 behaviours shape this config (both verified against
// the published package):
//  1. `enableFalsePositiveFilter` defaults ON and suppresses EMAIL detections on
//     reserved domains — john@example.com is never redacted with it on.
//  2. The full 571-pattern set false-positives on ordinary browser strings
//     ("GitHub - microsoft/TypeScript" → XBOX_GAMERTAG ×3), so browser
//     telemetry runs a narrow allowlist instead.
// ponytail: widen PATTERN_TYPES when a real leak is observed — no policy
// framework, no per-domain rules until then.
import { LiteOpenRedaction } from "@openredaction/core/lite";
import type { PiiFinding } from "./types";

const PATTERN_TYPES = [
	"EMAIL",
	"PHONE_INTERNATIONAL",
	"PHONE_US",
	"PHONE_UK",
	"PHONE_UK_MOBILE",
	"CREDIT_CARD",
	"IBAN",
];

let detector: LiteOpenRedaction | null = null;

// Construction compiles ~600 regexes — build once and reuse across every
// export rather than per field.
const getDetector = (): LiteOpenRedaction => {
	detector ??= new LiteOpenRedaction({
		patterns: PATTERN_TYPES,
		redactionMode: "placeholder", // typed placeholders, not deletion
		deterministic: true, // same value → same placeholder across an export
		enableFalsePositiveFilter: false, // see note 1
		enableCache: true, // repeated values (common in URLs) hit the cache
	});
	return detector;
};

export interface DetectedPii {
	redacted: string;
	findings: PiiFinding[];
}

/** Detect + redact one string. The matched value is dropped at this boundary. */
export const detectPii = async (input: string): Promise<DetectedPii> => {
	const result = await getDetector().detect(input);
	return {
		redacted: result.redacted,
		findings: result.detections.map((d) => ({
			type: d.type,
			start: d.position[0],
			end: d.position[1],
			confidence: d.confidence,
		})),
	};
};
