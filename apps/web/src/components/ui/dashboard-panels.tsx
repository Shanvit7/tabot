export const Empty = ({ text }: { text: string }) => (
	<div className="font-mono text-xs text-muted-foreground py-6 text-center">
		{text}
	</div>
);

export const Loading = () => (
	<div
		className="min-h-screen bg-black flex items-center justify-center p-4"
		role="status"
		aria-live="polite"
	>
		<div className="bg-white border-hard shadow-hard-xl p-8 flex flex-col items-center gap-6">
			<img
				src={`${import.meta.env.BASE_URL}logo.png`}
				alt="Tabot"
				className="size-16 border-hard"
			/>
			<div className="flex items-end gap-2" aria-hidden="true">
				{[0, 0.16, 0.32, 0.48, 0.64].map((delay) => (
					<span key={delay} className="loading-tab" />
				))}
			</div>
			<div className="font-mono text-xs uppercase tracking-widest">Loading</div>
		</div>
	</div>
);
