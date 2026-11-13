export const ExtensionBridgeArt = () => (
	<div
		role="img"
		aria-label="Example: Tabot switched off in Chrome extensions."
		className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-work-line bg-work-surface"
	>
		<div className="flex items-center gap-4 border-b border-work-line bg-work-raised px-5 py-4">
			<div className="flex shrink-0 gap-1.5">
				<span className="size-2 rounded-full bg-work-muted/40" />
				<span className="size-2 rounded-full bg-work-muted/40" />
				<span className="size-2 rounded-full bg-work-muted/40" />
			</div>
			<div className="min-w-0 flex-1 rounded-md bg-work-canvas px-3 py-1.5 font-mono text-xs text-work-muted">
				chrome://extensions
			</div>
		</div>
		<div className="px-6 pt-8 pb-10 sm:px-8 sm:pt-10 sm:pb-12">
			<p className="mb-5 text-base font-medium text-work-ink">Extensions</p>
			<div className="overflow-hidden rounded-xl border border-work-line bg-work-canvas">
				<div className="flex items-center gap-4 p-5 sm:p-6">
					<img
						src={`${import.meta.env.BASE_URL}logo.png`}
						alt=""
						width={48}
						height={48}
						className="size-12 shrink-0 object-contain"
					/>
					<div>
						<p className="text-lg font-semibold text-work-ink">Tabot</p>
						<p className="mt-0.5 text-sm text-work-muted">Browser extension</p>
					</div>
				</div>
				<div className="flex items-center justify-between border-t border-work-line px-5 py-4 sm:px-6">
					<span className="text-sm text-work-muted">Off</span>
					<span className="flex h-6 w-11 items-center rounded-full bg-work-line p-0.5">
						<span className="size-5 rounded-full bg-work-canvas" />
					</span>
				</div>
			</div>
		</div>
	</div>
);
