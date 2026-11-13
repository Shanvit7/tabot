export class ApiError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
		this.name = "ApiError";
	}
}

const request = async (url: string, init?: RequestInit): Promise<Response> => {
	const headers = new Headers(init?.headers);
	if (!headers.has("Content-Type"))
		headers.set("Content-Type", "application/json");
	return fetch(url, { ...init, headers });
};

const json = async <T>(url: string, init?: RequestInit): Promise<T> => {
	const response = await request(url, init);
	if (!response.ok) {
		const body = await response.text().catch(() => response.statusText);
		let message = body;
		try {
			message = (JSON.parse(body) as { message?: string }).message ?? body;
		} catch {
			// Keep non-JSON server error text.
		}
		throw new ApiError(response.status, message || response.statusText);
	}
	if (response.status === 204) return undefined as T;
	return response.json() as Promise<T>;
};

export const apiClient = {
	request,
	get: <T>(url: string, init?: RequestInit) => json<T>(url, init),
	post: <T>(url: string, body?: unknown, init?: RequestInit) =>
		json<T>(url, {
			...init,
			method: "POST",
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
};
