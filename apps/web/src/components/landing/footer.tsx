export const Footer = () => (
	<footer className="border-hard bg-lime px-6 py-8">
		<div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
			<div>
				<p className="font-bold text-lg">TABOT</p>
				<p className="font-mono text-xs text-muted-foreground">
					Your browser, with a memory.
				</p>
			</div>
			<div className="font-mono text-xs text-muted-foreground text-center md:text-right">
				An open, local-first context layer for browser activity.
				<br />
				Local-first. Open source. Yours to keep.
			</div>
		</div>
	</footer>
);
