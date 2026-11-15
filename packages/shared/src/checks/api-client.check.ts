import assert from "node:assert/strict";
import { ApiError, apiClient } from "../api/client";

const originalFetch = globalThis.fetch;
try {
	let captured: RequestInit | undefined;
	globalThis.fetch = async (_input, init) => {
		captured = init;
		return Response.json({ ok: true });
	};
	assert.deepEqual(await apiClient.post("https://example.test", { value: 1 }), {
		ok: true,
	});
	assert.equal(captured?.method, "POST");
	assert.equal(captured?.body, '{"value":1}');
	assert.equal(
		new Headers(captured?.headers).get("content-type"),
		"application/json",
	);

	globalThis.fetch = async () =>
		Response.json({ message: "denied" }, { status: 403 });
	await assert.rejects(
		apiClient.get("https://example.test"),
		(error: unknown) =>
			error instanceof ApiError &&
			error.status === 403 &&
			error.message === "denied",
	);

	globalThis.fetch = async () => new Response("offline", { status: 503 });
	assert.equal((await apiClient.request("https://example.test")).status, 503);
} finally {
	globalThis.fetch = originalFetch;
}
