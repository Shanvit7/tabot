type Pending = {
	resolve: (vector: number[]) => void;
	reject: (error: Error) => void;
};

let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<number, Pending>();

const failPending = (error: Error) => {
	for (const item of pending.values()) item.reject(error);
	pending.clear();
	worker?.terminate();
	worker = undefined;
};

const getWorker = () => {
	if (worker) return worker;
	worker = new Worker(
		new URL("./search-embedding.worker.ts", import.meta.url),
		{
			type: "module",
		},
	);
	worker.onmessage = (
		event: MessageEvent<{ id: number; vector?: number[]; error?: string }>,
	) => {
		const item = pending.get(event.data.id);
		if (!item) return;
		pending.delete(event.data.id);
		if (event.data.vector) item.resolve(event.data.vector);
		else item.reject(new Error(event.data.error ?? "embedding-unavailable"));
	};
	worker.onerror = () => failPending(new Error("embedding-worker-failed"));
	return worker;
};

export const embedSearchText = (text: string): Promise<number[]> => {
	if (pending.size >= 16) return Promise.reject(new Error("embedding-busy"));
	const id = ++sequence;
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		try {
			getWorker().postMessage({ id, text });
		} catch (error) {
			pending.delete(id);
			reject(
				error instanceof Error ? error : new Error("embedding-worker-failed"),
			);
		}
	});
};
