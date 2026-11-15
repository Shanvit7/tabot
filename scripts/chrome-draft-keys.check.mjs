import assert from "node:assert/strict";
import { test } from "node:test";
import { chromeDraftKeys } from "./chrome-draft-keys.mjs";

test("Chrome upload stays draft-only regardless of secret settings; other stores are excluded", () => {
	for (const uploadOnly of [undefined, false, true]) {
		const secret = JSON.stringify({
			chrome: {
				clientId: "synthetic-client",
				refreshToken: "synthetic-token",
				uploadOnly,
			},
			firefox: { uploadOnly: false },
		});
		assert.deepEqual(JSON.parse(chromeDraftKeys(secret)), {
			chrome: {
				clientId: "synthetic-client",
				refreshToken: "synthetic-token",
				uploadOnly: true,
			},
		});
	}
	for (const invalid of [
		"not-json",
		"null",
		"{}",
		'{"chrome":null}',
		'{"chrome":[]}',
	]) {
		assert.throws(() => chromeDraftKeys(invalid));
	}
});
