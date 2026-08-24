export const Section = ({
	label,
	title,
	children,
}: {
	label: string;
	title: string;
	children: React.ReactNode;
}) => (
	<section className="border-hard bg-white p-8 md:p-12 shadow-hard-sm">
		<p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
			{label}
		</p>
		<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mt-3 [text-wrap:balance]">
			{title}
		</h2>
		<div className="mt-6">{children}</div>
	</section>
);
