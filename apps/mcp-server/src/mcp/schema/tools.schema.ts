import { WORKFLOW_SCRIPT_LIMITS } from "@tabot/shared/automation-script";
import { z } from "zod";
import { MAX_QUERY_CHARS } from "../tools";

/** Input shape for `get_pending_workflow_handoff`. */
export const getPendingWorkflowHandoffInputSchema = {};

/** Input shape for `search_activity`. */
export const searchActivityInputSchema = {
	query: z.string().trim().min(1).max(MAX_QUERY_CHARS),
	limit: z.number().int().min(1).max(8).optional(),
	cursor: z
		.string()
		.regex(/^\d{1,16}:[1-9]\d{0,5}$/)
		.optional(),
};

export const searchNotesInputSchema = {
	query: z.string().trim().min(1).max(MAX_QUERY_CHARS),
	from: z.number().finite().min(0).optional(),
	to: z.number().finite().min(0).optional(),
	site: z.string().trim().min(1).max(253).optional(),
	limit: z.number().int().min(1).max(8).optional(),
	cursor: z
		.string()
		.regex(/^\d{1,16}:[1-9]\d{0,5}$/)
		.optional(),
};

export const getSiteNotesInputSchema = {
	site: z.string().trim().min(1).max(253),
};

const safeWorkflowOrigin = z
	.string()
	.url()
	.max(512)
	.refine((value) => {
		try {
			const url = new URL(value);
			return url.protocol === "https:" && url.origin === value;
		} catch {
			return false;
		}
	});
const workflowTargetSchema = z
	.object({
		role: z.enum([
			"button",
			"link",
			"checkbox",
			"radio",
			"textbox",
			"searchbox",
			"combobox",
			"heading",
			"status",
		]),
		name: z.string().trim().min(1).max(160),
	})
	.strict();
const workflowStepSchema = z.discriminatedUnion("type", [
	z
		.object({ type: z.literal("navigate"), url: z.string().url().max(2_048) })
		.strict(),
	z
		.object({
			type: z.literal("click"),
			origin: safeWorkflowOrigin,
			target: workflowTargetSchema,
		})
		.strict(),
	z
		.object({
			type: z.literal("fill"),
			origin: safeWorkflowOrigin,
			target: z.object({ label: z.string().trim().min(1).max(160) }).strict(),
			input: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
		})
		.strict(),
	z
		.object({
			type: z.literal("verify"),
			origin: safeWorkflowOrigin,
			target: workflowTargetSchema,
			condition: z.literal("visible"),
		})
		.strict(),
]);

export const saveWorkflowScriptInputSchema = {
	candidateId: z.string().regex(/^handwired-v1-[a-f0-9]{8}$/),
	grantToken: z.string().uuid(),
	handoffDigest: z.string().regex(/^[a-f0-9]{64}$/),
	script: z
		.object({
			version: z.literal(1),
			name: z.string().trim().min(1).max(100),
			description: z.string().max(500),
			trigger: z.literal("manual"),
			origins: z
				.array(safeWorkflowOrigin)
				.min(1)
				.max(WORKFLOW_SCRIPT_LIMITS.origins),
			inputs: z
				.array(
					z
						.object({
							key: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
							label: z.string().trim().min(1).max(120),
							required: z.boolean(),
						})
						.strict(),
				)
				.max(WORKFLOW_SCRIPT_LIMITS.inputs),
			steps: z
				.array(workflowStepSchema)
				.min(1)
				.max(WORKFLOW_SCRIPT_LIMITS.steps),
		})
		.strict(),
};

export const listSitesInputSchema = {
	query: z.string().trim().max(MAX_QUERY_CHARS).optional(),
	from: z.number().finite().min(0).optional(),
	to: z.number().finite().min(0).optional(),
	limit: z.number().int().min(1).max(8).optional(),
	cursor: z
		.string()
		.regex(/^\d{1,16}:[1-9]\d{0,5}$/)
		.optional(),
};
export const listSitePagesInputSchema = {
	...listSitesInputSchema,
	site: z.string().trim().min(1).max(253),
};

export const getPageNotesInputSchema = z
	.object({
		pageRef: z
			.string()
			.regex(/^[a-z0-9.%A-F-]{1,765}:[a-f0-9]{64}$/)
			.optional(),
		url: z
			.string()
			.url()
			.max(2_048)
			.refine((value) => {
				try {
					const url = new URL(value);
					return (
						["http:", "https:"].includes(url.protocol) &&
						!url.username &&
						!url.password
					);
				} catch {
					return false;
				}
			})
			.optional(),
		limit: z.number().int().min(1).max(8).optional(),
		cursor: z
			.string()
			.regex(/^\d{1,16}:[1-9]\d{0,5}$/)
			.optional(),
	})
	.refine(
		(input) => (input.url === undefined) !== (input.pageRef === undefined),
		{
			message: "Provide exactly one of url or pageRef.",
		},
	);

/** Input shape for `find_activity_matches`. */
export const findActivityMatchesInputSchema = {
	anchors: z
		.array(
			z.object({
				kind: z.enum(["event", "page"]),
				id: z.string().min(1).max(64),
			}),
		)
		.min(1)
		.max(8),
	limit: z.number().int().min(1).max(8).optional(),
	cursor: z
		.string()
		.regex(/^\d{1,16}:[1-9]\d{0,5}$/)
		.optional(),
	maxGapHours: z.number().int().min(1).max(720).optional(),
};
