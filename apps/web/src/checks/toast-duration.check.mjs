import assert from "node:assert/strict";
import { toast } from "../components/alerts/ding-toaster.ts";

const getToast = (id) => toast.getState().toasts.find((item) => item.id === id);
const errorId = toast.error("A failed request", {
	action: { label: "Retry", onClick: () => undefined },
});
assert.equal(getToast(errorId)?.duration, 6_000);
toast.dismiss(errorId, { immediate: true });

const customId = toast.error("Keep this open", { duration: 0 });
assert.equal(getToast(customId)?.duration, 0);
toast.dismiss(customId, { immediate: true });

assert.equal(
	await toast.promise(Promise.resolve("ok"), {
		loading: "Saving",
		success: (value) => `Saved ${value}`,
		error: () => "Save failed",
	}),
	"ok",
);
const saved = toast.getState().toasts.find((item) => item.title === "Saved ok");
assert.equal(saved?.duration, 6_000);
if (saved) toast.dismiss(saved.id, { immediate: true });

const failed = toast.promise(Promise.reject(new Error("offline")), {
	loading: "Loading",
	success: "Loaded",
	error: (error) =>
		`Failed: ${error instanceof Error ? error.message : "unknown"}`,
});
await assert.rejects(failed, /offline/);
const failure = toast
	.getState()
	.toasts.find((item) => item.title === "Failed: offline");
assert.equal(failure?.duration, 6_000);
if (failure) toast.dismiss(failure.id, { immediate: true });

console.log(
	"Toast duration check passed: completed toasts auto-dismiss globally; explicit durations remain honored.",
);
