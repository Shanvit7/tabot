import assert from "node:assert/strict";

const originalWorker = globalThis.Worker;

class MockWorker {
	static instances: MockWorker[] = [];
	onmessage?: (event: MessageEvent) => void;
	onerror?: (event: ErrorEvent) => void;
	messages: { id: number; text: string }[] = [];
	terminated = false;

	constructor() {
		MockWorker.instances.push(this);
	}

	postMessage(message: { id: number; text: string }) {
		this.messages.push(message);
	}

	terminate() {
		this.terminated = true;
	}
}

Object.defineProperty(globalThis, "Worker", {
	configurable: true,
	value: MockWorker,
	writable: true,
});

try {
	const { embedSearchText } = await import("./search-embedding.ts");
	const result = embedSearchText("local query");
	const worker = MockWorker.instances[0];
	assert.ok(worker);
	assert.deepEqual(worker.messages[0]?.text, "local query");
	worker.onmessage?.({
		data: { id: worker.messages[0]?.id, vector: [0.25, 0.75] },
	} as MessageEvent);
	assert.deepEqual(await result, [0.25, 0.75]);

	const failed = embedSearchText("failed query");
	worker.onmessage?.({
		data: { id: worker.messages[1]?.id, error: "model-unavailable" },
	} as MessageEvent);
	await assert.rejects(failed, /model-unavailable/);
	console.log("search-embedding: worker request and failure handling passed");
} finally {
	Object.defineProperty(globalThis, "Worker", {
		configurable: true,
		value: originalWorker,
		writable: true,
	});
}
