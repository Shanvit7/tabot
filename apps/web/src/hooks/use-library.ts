import type { LibraryRequest, LibraryResponse } from "@tabot/shared/library";
import { useCallback, useEffect, useRef, useState } from "react";
import { messageOf } from "~/components/features/home/search/utils";
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
	const nextOffset = useRef(0);
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
				nextOffset.current =
					offset +
					response.sites.length +
					response.pages.length +
					response.notes.length;
				setData((previous) => {
					const existing =
						offset === 0 ? { sites: [], pages: [], notes: [] } : previous;
					const sites = [
						...new Map(
							[...existing.sites, ...response.sites].map((row) => [
								row.site,
								row,
							]),
						).values(),
					];
					const pages = [
						...new Map(
							[...existing.pages, ...response.pages].map((row) => [
								row.url,
								row,
							]),
						).values(),
					];
					const notes = [
						...new Map(
							[...existing.notes, ...response.notes].map((row) => [
								row.id,
								row,
							]),
						).values(),
					];
					const progressed =
						sites.length + pages.length + notes.length >
						existing.sites.length +
							existing.pages.length +
							existing.notes.length;
					return {
						...response,
						sites,
						pages,
						notes,
						hasMore: response.hasMore && progressed,
					};
				});
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
	const retryRequest = useCallback(() => setRetry((value) => value + 1), []);
	return {
		data,
		setData,
		loading,
		error,
		retry: retryRequest,
		loadMore: () => {
			if (!loading && !error && data.hasMore) setOffset(nextOffset.current);
		},
	};
};
