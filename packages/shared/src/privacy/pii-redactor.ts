// packages/shared/src/privacy/pii-redactor.ts
// Tabot's PII boundary. Wraps the OpenRedaction adapter with the two contracts
// the pipeline depends on: logging never sees the source text, and a failure
// never hands back unredacted text (callers abort the export instead).
import { logger } from "../lib/logger";
import { detectPii } from "./openredaction";
import type { PiiRedactor, RedactionResult } from "./types";

export const piiRedactor: PiiRedactor = {
	async redact(input: string): Promise<RedactionResult> {
		try {
			const { redacted, findings } = await detectPii(input);
			return { original: input, redacted, findings };
		} catch (err) {
			// Never log the source string — it is the PII we failed to strip.
			logger.warn("pii redaction failed", {
				error: err instanceof Error ? err.message : String(err),
			});
			throw err;
		}
	},
};
