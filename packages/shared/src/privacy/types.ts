// packages/shared/src/privacy/types.ts
// Tabot-owned PII types — deliberately NOT @openredaction/core's. A finding
// carries the pattern type and span but never the matched value, so redaction
// metadata can never leak the PII it removed (see openredaction.ts).

export interface PiiFinding {
	/** Pattern type, e.g. "EMAIL", "PHONE_UK_MOBILE". Never the matched value. */
	type: string;
	start: number;
	end: number;
	confidence?: number;
}

export interface RedactionResult {
	original: string;
	redacted: string;
	findings: PiiFinding[];
}

export interface PiiRedactor {
	redact(input: string): Promise<RedactionResult>;
}

export interface PiiRedactionOptions {
	/** Explicit switch for the privacy boundary. Defaults to true. */
	piiRedactionEnabled?: boolean;
}
