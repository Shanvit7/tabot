import { ArrowUpRight, Check, LockKeyhole, X } from "lucide-react";

export const PrivacyFirst = () => (
	<section
		id="privacy-first"
		className="border-b-2 border-black bg-black px-5 py-12 text-white sm:px-10 sm:py-16 lg:px-14"
	>
		<div className="mx-auto max-w-6xl">
			<div className="grid items-start gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
				<div>
					<LockKeyhole aria-hidden="true" className="mb-4 size-6 text-lime" />
					<h2 className="max-w-lg text-[clamp(2rem,3.5vw,2.25rem)] font-semibold leading-[1.15] tracking-[-0.02em]">
						Your activity stays{" "}
						<span className="box-decoration-clone bg-lime px-1 text-black">
							yours
						</span>
						.
					</h2>
					<p className="mt-4 max-w-lg text-lg leading-8 text-white/80">
						Browsing history stays on this device. When you ask ChatGPT, it
						requests selected activity details from your extension. Tabot’s
						online connection service passes requests and results; it does not
						store browsing history or tool results.
					</p>
					<a
						href={`${import.meta.env.BASE_URL}privacy`}
						className="mt-4 inline-flex min-h-11 items-center gap-2 text-base font-medium text-lime underline decoration-2 underline-offset-4"
					>
						Read the privacy policy{" "}
						<ArrowUpRight aria-hidden="true" className="size-4" />
					</a>
				</div>
				<div className="border-2 border-white bg-landing-paper p-5 text-black sm:p-6">
					<div className="flex gap-3">
						<Check aria-hidden="true" className="mt-1 size-4 shrink-0" />
						<div>
							<h3 className="text-lg font-semibold">A record of activity</h3>
							<p className="mt-2 text-lg leading-8 text-landing-muted">
								Sites visited, when you visited, tab changes, and interaction
								signals such as clicks and scrolling.
							</p>
						</div>
					</div>
					<div className="mt-6 flex gap-3 border-t-2 border-black pt-6">
						<X aria-hidden="true" className="mt-1 size-4 shrink-0" />
						<div>
							<h3 className="text-lg font-semibold">
								No page contents or typed text
							</h3>
							<p className="mt-2 text-lg leading-8 text-landing-muted">
								No page contents, screenshots, typed text, or form values are
								captured.
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>
);
