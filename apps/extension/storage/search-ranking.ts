const RRF_K = 60;

export const fuseCandidateUrls = (
	rankedUrlLists: readonly (readonly string[])[],
) => {
	const scores = new Map<string, { score: number; order: number }>();
	let order = 0;

	for (const urls of rankedUrlLists) {
		const seen = new Set<string>();
		let rank = 0;
		for (const url of urls) {
			if (!url || seen.has(url)) continue;
			seen.add(url);
			rank++;
			const candidate = scores.get(url) ?? { score: 0, order: order++ };
			candidate.score += 1 / (RRF_K + rank);
			scores.set(url, candidate);
		}
	}

	return [...scores.entries()]
		.sort(
			([, left], [, right]) =>
				right.score - left.score || left.order - right.order,
		)
		.map(([url]) => url);
};

// Vector-only hits (no BM25 match) must clear a higher cosine bar once BM25 has literal matches:
// brand/term queries then keep exact hits and drop topical noise (real data: noise 0.25-0.35, literal >=0.36).
// Conceptual/abbreviation queries with no literal match keep the lower bar for recall.
export const SEARCH_MIN_COSINE = 0.25;
export const SEARCH_MIN_COSINE_WITH_LEXICAL = 0.35;

export const admitSemanticHit = (
	hit: { textRank: number | null },
	cosine: number | undefined,
	lexicalMatches: number,
) =>
	hit.textRank !== null ||
	(cosine ?? -1) >=
		(lexicalMatches > 0 ? SEARCH_MIN_COSINE_WITH_LEXICAL : SEARCH_MIN_COSINE);
