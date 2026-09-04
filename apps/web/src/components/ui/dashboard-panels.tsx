import { TAB, type Tab } from "~/lib/dashboard-tabs";

export const Panel = ({
	title,
	children,
	className = "",
}: {
	title: string;
	children: React.ReactNode;
	className?: string;
}) => (
	<div className={`border-hard shadow-hard-sm p-4 ${className}`}>
		<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">
			{title}
		</div>
		{children}
	</div>
);

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
					<span
						key={delay}
						className="loading-tab"
						style={{ animationDelay: `${delay}s` }}
					/>
				))}
			</div>
			<div className="font-mono text-xs uppercase tracking-widest">Loading</div>
		</div>
	</div>
);

export const TabBar = ({
	active,
	onChange,
}: {
	active: Tab;
	onChange: (t: Tab) => void;
}) => (
	<div className="flex flex-wrap gap-2 mb-6">
		{(Object.values(TAB) as Tab[]).map((t) => (
			<button
				key={t}
				type="button"
				onClick={() => onChange(t)}
				className={`font-mono text-xs uppercase tracking-wider border-2 px-3 py-1.5 ${
					active === t
						? "bg-lime text-black border-black"
						: "bg-white text-black border-black hover:bg-lime/20"
				}`}
			>
				{t}
			</button>
		))}
	</div>
);
