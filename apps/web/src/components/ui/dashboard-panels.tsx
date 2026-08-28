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
