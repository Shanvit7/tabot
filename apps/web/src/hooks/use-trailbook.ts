import { useCallback, useEffect, useRef, useState } from "react";
import {
	EMPTY_TRAILBOOK,
	parseTrailbook,
	TRAILBOOK_KEY,
	type Trailbook,
	toggleSavedTrail,
} from "~/lib/trailbook";

export const useTrailbook = () => {
	const [book, setBook] = useState(EMPTY_TRAILBOOK);
	const [ready, setReady] = useState(false);
	const [storageError, setStorageError] = useState<"read" | "write" | null>(
		null,
	);
	const current = useRef(EMPTY_TRAILBOOK);
	const writable = useRef(false);

	useEffect(() => {
		const read = () => {
			try {
				const next = parseTrailbook(window.localStorage.getItem(TRAILBOOK_KEY));
				if (!next) throw new Error("Unreadable trail collection");
				current.current = next;
				setBook(next);
				writable.current = true;
				setStorageError(null);
			} catch {
				writable.current = false;
				setStorageError("read");
			}
			setReady(true);
		};
		read();
		const onStorage = (event: StorageEvent) => {
			if (
				event.storageArea === window.localStorage &&
				(event.key === TRAILBOOK_KEY || event.key === null)
			)
				read();
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, []);

	const commit = useCallback((update: (previous: Trailbook) => Trailbook) => {
		if (!writable.current) return null;
		const next = update(current.current);
		if (next === current.current) return next;
		current.current = next;
		setBook(next);
		try {
			window.localStorage.setItem(TRAILBOOK_KEY, JSON.stringify(next));
			setStorageError(null);
		} catch {
			// Keep the interaction useful, but never claim a failed write survived reload.
			setStorageError("write");
		}
		return next;
	}, []);

	const mark = useCallback(
		(step: "viewed" | "followed") => {
			commit((previous) =>
				previous[step] ? previous : { ...previous, [step]: true },
			);
		},
		[commit],
	);
	const toggle = useCallback(
		(id: string) => commit((previous) => toggleSavedTrail(previous, id)),
		[commit],
	);
	return { book, ready, storageError, mark, toggle };
};
