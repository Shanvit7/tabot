export const WORKFLOW_SCRIPT_LIMITS = {
	bytes: 8_192,
	steps: 25,
	origins: 8,
	inputs: 8,
} as const;

export type WorkflowScriptInput = {
	key: string;
	label: string;
	required: boolean;
};

type WorkflowScriptTarget = { role: string; name: string };

export type WorkflowScriptStep =
	| { type: "navigate"; url: string }
	| { type: "click"; origin: string; target: WorkflowScriptTarget }
	| { type: "fill"; origin: string; target: { label: string }; input: string }
	| {
			type: "verify";
			origin: string;
			target: WorkflowScriptTarget;
			condition: "visible";
	  };

export type WorkflowAutomationScript = {
	version: 1;
	name: string;
	description: string;
	trigger: "manual";
	origins: string[];
	inputs: WorkflowScriptInput[];
	steps: WorkflowScriptStep[];
};

export type WorkflowScriptDraft = {
	id: string;
	candidateId: string;
	savedAt: number;
	status: "draft";
	script: WorkflowAutomationScript;
};

export type WorkflowScriptSaveGrant = {
	token: string;
	candidateId: string;
	expiresAt: number;
	origins: string[];
	handoffDigest: string;
};

export type WorkflowScriptGrantRequest = {
	candidateId: string;
	origins: string[];
	sourceIds: string[];
	handoffDigest: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: string[]) =>
	Object.keys(value).every((key) => keys.includes(key));

const isText = (value: unknown, max: number, allowEmpty = false) =>
	typeof value === "string" &&
	value.length <= max &&
	(allowEmpty || value.trim().length > 0);

const isHttpsOrigin = (value: unknown): value is string => {
	if (typeof value !== "string" || value.length > 512) return false;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && url.origin === value;
	} catch {
		return false;
	}
};

const TARGET_ROLES = new Set([
	"button",
	"link",
	"checkbox",
	"radio",
	"textbox",
	"searchbox",
	"combobox",
	"heading",
	"status",
]);
const SENSITIVE_INPUT =
	/password|passcode|one[- ]?time code|\botp\b|secret|credential|credit card|card number|security code|\bcvv\b/i;
const isTarget = (value: unknown): value is WorkflowScriptTarget =>
	isRecord(value) &&
	hasOnlyKeys(value, ["role", "name"]) &&
	typeof value.role === "string" &&
	TARGET_ROLES.has(value.role) &&
	isText(value.name, 160);

const isStep = (
	value: unknown,
	origins: Set<string>,
	inputs: Set<string>,
): value is WorkflowScriptStep => {
	if (!isRecord(value)) return false;
	if (value.type === "navigate") {
		if (!hasOnlyKeys(value, ["type", "url"]) || typeof value.url !== "string")
			return false;
		try {
			const url = new URL(value.url);
			return (
				url.protocol === "https:" &&
				!url.username &&
				!url.password &&
				!url.search &&
				!url.hash &&
				origins.has(url.origin)
			);
		} catch {
			return false;
		}
	}
	const origin = value.origin;
	if (!isHttpsOrigin(origin) || !origins.has(origin) || !isRecord(value.target))
		return false;
	if (value.type === "click")
		return (
			hasOnlyKeys(value, ["type", "origin", "target"]) && isTarget(value.target)
		);
	if (value.type === "fill") {
		if (
			!hasOnlyKeys(value, ["type", "origin", "target", "input"]) ||
			!isRecord(value.target)
		)
			return false;
		const label = value.target.label;
		const input = value.input;
		return (
			hasOnlyKeys(value.target, ["label"]) &&
			isText(label, 160) &&
			typeof label === "string" &&
			!SENSITIVE_INPUT.test(label) &&
			typeof input === "string" &&
			inputs.has(input)
		);
	}
	if (value.type === "verify")
		return (
			hasOnlyKeys(value, ["type", "origin", "target", "condition"]) &&
			isTarget(value.target) &&
			value.condition === "visible"
		);
	return false;
};

export const isWorkflowAutomationScript = (
	value: unknown,
): value is WorkflowAutomationScript => {
	if (
		!isRecord(value) ||
		!hasOnlyKeys(value, [
			"version",
			"name",
			"description",
			"trigger",
			"origins",
			"inputs",
			"steps",
		]) ||
		value.version !== 1 ||
		!isText(value.name, 100) ||
		!isText(value.description, 500, true) ||
		value.trigger !== "manual" ||
		!Array.isArray(value.origins) ||
		value.origins.length < 1 ||
		value.origins.length > WORKFLOW_SCRIPT_LIMITS.origins ||
		!value.origins.every(isHttpsOrigin) ||
		new Set(value.origins).size !== value.origins.length ||
		!Array.isArray(value.inputs) ||
		value.inputs.length > WORKFLOW_SCRIPT_LIMITS.inputs ||
		!Array.isArray(value.steps) ||
		value.steps.length < 1 ||
		value.steps.length > WORKFLOW_SCRIPT_LIMITS.steps
	)
		return false;

	const origins = new Set(value.origins.filter(isHttpsOrigin));
	const inputKeys = new Set<string>();
	for (const input of value.inputs) {
		if (!isRecord(input)) return false;
		const key = input.key;
		const label = input.label;
		if (
			!hasOnlyKeys(input, ["key", "label", "required"]) ||
			typeof key !== "string" ||
			!/^[a-z][a-z0-9_]{0,31}$/.test(key) ||
			!isText(label, 120) ||
			typeof label !== "string" ||
			SENSITIVE_INPUT.test(label) ||
			typeof input.required !== "boolean" ||
			inputKeys.has(key)
		)
			return false;
		inputKeys.add(key);
	}
	if (!value.steps.every((step) => isStep(step, origins, inputKeys)))
		return false;
	try {
		return (
			new TextEncoder().encode(JSON.stringify(value)).byteLength <=
			WORKFLOW_SCRIPT_LIMITS.bytes
		);
	} catch {
		return false;
	}
};

export const isWorkflowScriptDraft = (
	value: unknown,
): value is WorkflowScriptDraft =>
	isRecord(value) &&
	typeof value.id === "string" &&
	value.id.length > 0 &&
	value.id.length <= 128 &&
	typeof value.candidateId === "string" &&
	/^handwired-v1-[a-f0-9]{8}$/.test(value.candidateId) &&
	typeof value.savedAt === "number" &&
	Number.isSafeInteger(value.savedAt) &&
	value.savedAt >= 0 &&
	value.status === "draft" &&
	isWorkflowAutomationScript(value.script);

export const isWorkflowScriptSaveGrant = (
	value: unknown,
): value is WorkflowScriptSaveGrant =>
	isRecord(value) &&
	typeof value.token === "string" &&
	/^[0-9a-f-]{36}$/i.test(value.token) &&
	typeof value.candidateId === "string" &&
	/^handwired-v1-[a-f0-9]{8}$/.test(value.candidateId) &&
	typeof value.expiresAt === "number" &&
	Number.isSafeInteger(value.expiresAt) &&
	value.expiresAt > Date.now() &&
	Array.isArray(value.origins) &&
	value.origins.length > 0 &&
	value.origins.length <= WORKFLOW_SCRIPT_LIMITS.origins &&
	value.origins.every(isHttpsOrigin) &&
	new Set(value.origins).size === value.origins.length &&
	typeof value.handoffDigest === "string" &&
	/^[a-f0-9]{64}$/.test(value.handoffDigest);
