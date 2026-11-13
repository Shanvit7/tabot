export const MatchedText = ({
	text,
	terms,
}: {
	text: string;
	terms: string[];
}) => {
	const normalizedTerms = new Set(
		terms.map((term) => term.normalize("NFKC").toLowerCase()),
	);
	return (
		<>
			{[...text.matchAll(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu)].map((match) =>
				normalizedTerms.has(match[0].normalize("NFKC").toLowerCase()) ? (
					<mark
						key={match.index}
						className="rounded-sm bg-primary/35 text-foreground"
					>
						{match[0]}
					</mark>
				) : (
					match[0]
				),
			)}
		</>
	);
};
