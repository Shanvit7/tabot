import { CircleHelp, LoaderCircle, Pause, Play } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "~/components/ui/tooltip";

export const TrackingToggle = ({
	enabled,
	busy,
	error,
	onToggle,
	onRetry,
}: {
	enabled: boolean | null;
	busy: boolean;
	error: string;
	onToggle: () => void;
	onRetry: () => void;
}) => {
	const label =
		enabled === null
			? busy
				? "Checking tracking status"
				: "Tracking status unavailable"
			: enabled
				? "Pause tracking"
				: "Start tracking";
	return (
		<>
			<TooltipProvider delayDuration={350}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-lg"
							className="size-11 rounded-full"
							disabled={busy || enabled === null}
							aria-label={label}
							aria-busy={busy}
							onClick={onToggle}
						>
							{busy ? (
								<LoaderCircle
									aria-hidden="true"
									className="motion-safe:animate-spin"
								/>
							) : enabled === null ? (
								<CircleHelp aria-hidden="true" />
							) : enabled ? (
								<Pause aria-hidden="true" />
							) : (
								<Play aria-hidden="true" />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>{error || label}</TooltipContent>
				</Tooltip>
			</TooltipProvider>
			{enabled === null && error && !busy && (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					aria-label="Retry tracking status"
					onClick={onRetry}
				>
					Retry
				</Button>
			)}
			{error && (
				<span role="alert" className="sr-only">
					{error}
				</span>
			)}
		</>
	);
};
