import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createCallable, type PropsWithCall } from "react-call";

type Props = Record<string, never>;
type Response = boolean;
type ConfirmProps = PropsWithCall<Props, Response, Record<string, never>>;

const PurgeDataConfirmContent = ({ call }: ConfirmProps) => {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const [opened, setOpened] = useState(false);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		const previousFocus = document.activeElement;
		dialog.showModal();
		dialog.focus();
		const frame = requestAnimationFrame(() => setOpened(true));
		return () => {
			cancelAnimationFrame(frame);
			if (dialog.open) dialog.close();
			if (previousFocus instanceof HTMLElement) previousFocus.focus();
		};
	}, []);

	return (
		<dialog
			ref={dialogRef}
			role="alertdialog"
			aria-labelledby="purge-data-title"
			aria-describedby="purge-data-description"
			tabIndex={-1}
			onCancel={(event) => {
				event.preventDefault();
				call.end(false);
			}}
			className="fixed inset-0 m-0 grid h-full w-full max-h-none max-w-none place-items-center border-0 bg-transparent px-4 py-6 [&::backdrop]:bg-work-ink/45 [&::backdrop]:backdrop-blur-sm"
		>
			<section
				className={`w-full max-w-sm rounded-xl border border-work-line bg-work-canvas text-work-ink shadow-xl shadow-work-ink/20 outline-none motion-safe:transition-[transform,opacity] motion-safe:duration-250 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${call.ended ? "translate-y-1 scale-[0.99] opacity-0" : opened ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.98] opacity-0"}`}
			>
				<div className="p-5 sm:p-6">
					<div className="flex items-center gap-3">
						<div className="grid size-9 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
							<AlertTriangle aria-hidden="true" className="size-4.5" />
						</div>
						<h2
							id="purge-data-title"
							className="font-display text-xl leading-tight"
						>
							Delete stored data?
						</h2>
					</div>
					<p
						id="purge-data-description"
						className="mt-4 text-sm leading-6 text-work-muted"
					>
						Browsing activity, page captures, and saved notes on this device
						will be permanently deleted. Tracking can collect new data
						afterward.
					</p>
					<div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<button
							type="button"
							onClick={() => call.end(false)}
							className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-work-line px-4 text-sm font-semibold text-work-ink transition-colors hover:bg-work-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
						>
							Keep my data
						</button>
						<button
							type="button"
							onClick={() => call.end(true)}
							className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
						>
							Delete data
						</button>
					</div>
				</div>
			</section>
		</dialog>
	);
};

export const PurgeDataConfirm = createCallable<
	Props,
	Response,
	Record<string, never>
>(PurgeDataConfirmContent, 250);
