import {
	isWorkflowScriptSaveGrant,
	type WorkflowScriptSaveGrant,
} from "./automation-script";
import type { WorkflowCandidate } from "./discovery";

export type WorkflowHandoffPayload = {
	candidateId: string;
	sites: string[];
	occurrences: number;
	modelMatches: number;
	firstAt: number;
	lastAt: number;
	evidenceType: "site-navigation-only";
};

export type WorkflowHandoff = {
	payload: WorkflowHandoffPayload;
	grant: WorkflowScriptSaveGrant;
};

export type WorkflowHandoffRequest = {
	payload: WorkflowHandoffPayload;
	sourceIds: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isHttpsOrigin = (value: unknown): value is string => {
	if (typeof value !== "string" || value.length > 512) return false;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && url.origin === value;
	} catch {
		return false;
	}
};

export const buildWorkflowHandoff = (
	candidate: WorkflowCandidate,
): WorkflowHandoffPayload => ({
	candidateId: candidate.id,
	sites: candidate.steps.map((step) => step.origin),
	occurrences: candidate.occurrences.length,
	modelMatches: candidate.modelMatches,
	firstAt: candidate.firstAt,
	lastAt: candidate.lastAt,
	evidenceType: "site-navigation-only",
});

export const isWorkflowHandoffPayload = (
	value: unknown,
): value is WorkflowHandoffPayload => {
	if (
		!isRecord(value) ||
		Object.keys(value).some(
			(key) =>
				![
					"candidateId",
					"sites",
					"occurrences",
					"modelMatches",
					"firstAt",
					"lastAt",
					"evidenceType",
				].includes(key),
		) ||
		typeof value.candidateId !== "string" ||
		!/^handwired-v1-[a-f0-9]{8}$/.test(value.candidateId) ||
		!Array.isArray(value.sites) ||
		value.sites.length < 1 ||
		value.sites.length > 8 ||
		!value.sites.every(isHttpsOrigin) ||
		!Number.isSafeInteger(value.occurrences) ||
		(value.occurrences as number) < 2 ||
		(value.occurrences as number) > 8 ||
		!Number.isSafeInteger(value.modelMatches) ||
		(value.modelMatches as number) < 1 ||
		(value.modelMatches as number) > 4_000 ||
		typeof value.firstAt !== "number" ||
		!Number.isFinite(value.firstAt) ||
		value.firstAt < 0 ||
		typeof value.lastAt !== "number" ||
		!Number.isFinite(value.lastAt) ||
		(value.lastAt as number) < (value.firstAt as number) ||
		value.evidenceType !== "site-navigation-only"
	)
		return false;
	return true;
};

export const workflowHandoffDigest = async (
	payload: WorkflowHandoffPayload,
): Promise<string> => {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(JSON.stringify(payload)),
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
};

export const isWorkflowHandoff = (value: unknown): value is WorkflowHandoff => {
	if (
		!isRecord(value) ||
		Object.keys(value).some((key) => key !== "payload" && key !== "grant")
	)
		return false;
	const { payload, grant } = value;
	if (!isWorkflowHandoffPayload(payload) || !isWorkflowScriptSaveGrant(grant))
		return false;
	const origins = [...new Set(payload.sites)];
	return (
		grant.candidateId === payload.candidateId &&
		grant.origins.length === origins.length &&
		grant.origins.every((origin, index) => origin === origins[index])
	);
};
