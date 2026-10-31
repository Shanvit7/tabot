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
