import { LiteOpenRedaction } from "@openredaction/core/lite";
import { logger } from "../lib/logger";

// CREDIT_CARD covers debit/credit card PANs; the library has no Indian tax-PAN pattern.
const SENSITIVE_PATTERN_TYPES = [
	"AWS_ACCESS_KEY",
	"AWS_SECRET_KEY",
	"BEARER_TOKEN",
	"COOKIE_SESSION",
	"CREDIT_CARD",
	"CVV",
	"CVV_CODE",
	"CARD_EXPIRY",
	"CARD_TRACK1_DATA",
	"CARD_TRACK2_DATA",
	"DATABASE_CONNECTION",
	"DOCKER_AUTH",
	"GENERIC_API_KEY",
	"GENERIC_SECRET",
	"GITHUB_TOKEN",
	"GCP_SERVICE_ACCOUNT",
	"BANK_ACCOUNT_UK",
	"SORT_CODE_UK",
	"ROUTING_NUMBER_US",
	"CLABE",
	"BSB_AU",
	"SWIFT_BIC",
	"UK_BANK_ACCOUNT_IBAN",
	"UK_SORT_CODE_ACCOUNT",
	"WIRE_TRANSFER_REF",
	"WIRE_TRANSFER_DETAILS",
	"DD_MANDATE",
	"CHEQUE_NUMBER",
	"INVESTMENT_ACCOUNT",
	"TRADING_ACCOUNT",
	"LOAN_ACCOUNT",
	"TRANSACTION_ID",
	"PAYMENT_CUSTOMER_ID",
	"PAYMENT_REFERENCE",
	"STATEMENT_REF",
	"STANDING_ORDER_REF",
	"MERCHANT_ID",
	"TERMINAL_ID",
	"SUBSCRIPTION_ID",
	"STOCK_TRADE",
	"ISIN",
	"CUSIP",
	"SEDOL",
	"LEI",
	"TAX_ID",
	"VAT_NUMBER",
	"UTR_UK",
	"COMPANY_NUMBER_UK",
	"ITIN",
	"GERMAN_TAX_ID",
	"AUSTRALIAN_TFN",
	"INDIAN_AADHAAR",
	"GOOGLE_API_KEY",
	"HEROKU_API_KEY",
	"JWT_TOKEN",
	"KUBERNETES_SECRET",
	"MAILGUN_API_KEY",
	"NPM_TOKEN",
	"OAUTH_CLIENT_SECRET",
	"OAUTH_TOKEN",
	"OPENAI_API_KEY",
	"PAYMENT_TOKEN",
	"PRIVATE_KEY",
	"PYPI_TOKEN",
	"SENDGRID_API_KEY",
	"SESSION_ID",
	"SLACK_TOKEN",
	"SLACK_WEBHOOK",
	"SSH_PRIVATE_KEY",
	"STRIPE_API_KEY",
	"TWILIO_API_KEY",
	"URL_WITH_AUTH",
	"IBAN",
];

export interface SensitiveDataFinding {
	type: string;
	start: number;
	end: number;
	confidence?: number;
}

export interface SensitiveDataRedactionResult {
	redacted: string;
	findings: SensitiveDataFinding[];
}

export interface SensitiveDataRedactor {
	redact(input: string): Promise<SensitiveDataRedactionResult>;
}

let detector: LiteOpenRedaction | null = null;

const getDetector = (): LiteOpenRedaction => {
	detector ??= new LiteOpenRedaction({
		patterns: SENSITIVE_PATTERN_TYPES,
		redactionMode: "placeholder",
		deterministic: true,
		enableFalsePositiveFilter: false,
		enableCache: false,
	});
	return detector;
};

/** Redact recognized credentials and financial secrets locally, without retaining their values. */
export const sensitiveDataRedactor: SensitiveDataRedactor = {
	async redact(input): Promise<SensitiveDataRedactionResult> {
		try {
			const result = await getDetector().detect(input);
			return {
				redacted: result.redacted,
				findings: result.detections.map((detection) => ({
					type: detection.type,
					start: detection.position[0],
					end: detection.position[1],
					confidence: detection.confidence,
				})),
			};
		} catch (error) {
			logger.warn("sensitive-data redaction failed", {
				code: error instanceof Error ? error.name : "unknown",
			});
			throw error;
		}
	},
};
