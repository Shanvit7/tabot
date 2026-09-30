export const Loading = () => (
	<main
		className="min-h-screen bg-white px-4 pt-24 text-[#15251B]"
		role="status"
		aria-live="polite"
	>
		<div className="mx-auto max-w-[1160px]">
			<img
				src={`${import.meta.env.BASE_URL}logo.png`}
				alt=""
				className="size-10 rounded-md"
			/>
			<p className="mt-8 text-xl font-semibold">Loading your local activity…</p>
			<div aria-hidden="true" className="mt-8 max-w-[720px] space-y-4">
				<div className="h-12 rounded-lg bg-[#F5F8F4]" />
				<div className="h-20 rounded-lg bg-[#F5F8F4]" />
				<div className="h-20 rounded-lg bg-[#F5F8F4]" />
			</div>
		</div>
	</main>
);
