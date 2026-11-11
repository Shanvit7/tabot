import type { LibraryRequest, LibraryResponse } from "@tabot/shared/library";
import { useEffect, useState } from "react";
import { messageOf } from "~/components/home/reading-desk-utils";
import { browseRetainedLibrary } from "~/lib/history";

// Callers key their view by scope so a new query/site starts with a fresh cursor.
export const useLibrary = (request: LibraryRequest) => {
	const [data, setData] = useState<LibraryResponse>({
		sites: [],
		pages: [],
		notes: [],
		total: 0,
		hasMore: false,
	});
	const [offset, setOffset] = useState(0);
	const [retry, setRetry] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const requestKey = JSON.stringify(request);
	// biome-ignore lint/correctness/useExhaustiveDependencies: retry explicitly repeats the same request.
	useEffect(() => {
		let active = true;
		setLoading(true);
		setError("");
		void browseRetainedLibrary({ ...JSON.parse(requestKey), offset })
			.then((response) => {
				if (!active) return;
				setData((previous) =>
					offset === 0
						? response
						: {
								...response,
								sites: [...previous.sites, ...response.sites],
								pages: [...previous.pages, ...response.pages],
								notes: [...previous.notes, ...response.notes],
							},
				);
				setLoading(false);
			})
			.catch((reason: unknown) => {
				if (!active) return;
				setError(messageOf(reason));
				setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [requestKey, offset, retry]);
	return {
		data,
		setData,
		loading,
		error,
		retry: () => setRetry((value) => value + 1),
		loadMore: () => {
			if (!loading && !error && data.hasMore)
				setOffset(data.sites.length + data.pages.length + data.notes.length);
		},
	};
};
