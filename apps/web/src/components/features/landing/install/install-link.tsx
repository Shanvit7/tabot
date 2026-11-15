import { useNavigate } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import {
	AnimatePresence,
	domAnimation,
	LazyMotion,
	m,
	useReducedMotion,
} from "motion/react";
import { toast } from "~/components/alerts/ding-toaster";
import {
	CHROME_LOGO_URL,
	CHROME_WEB_STORE_URL,
	LOGO_URL,
} from "~/lib/constants";
import { trackLandingAction } from "~/lib/telemetry";

const storeUrl = CHROME_WEB_STORE_URL;
const installClass =
	"landing-install group inline-flex min-h-14 w-[272px] items-center justify-center rounded-full bg-lime px-7 text-[15px] font-semibold text-work-ink transition-colors hover:bg-[#ace600] active:translate-y-px cursor-pointer";

const handleAddToChromeClick = () =>
	trackLandingAction({ name: "landing_add_to_chrome_clicked" });

const handleCopyStoreLink = async () => {
	if (!storeUrl) return;
	try {
		await navigator.clipboard.writeText(storeUrl);
		toast.success("Chrome Web Store link copied", {
			description: "Send it to your computer, then open it in Chrome.",
		});
	} catch {
		toast.error("Couldn’t copy link", {
			description: "Open this page on your computer and use Add to Chrome.",
		});
	}
};

type InstallLinkProps = { connected: boolean; mobile: boolean };

export const InstallLink = ({ connected, mobile }: InstallLinkProps) => {
	const navigate = useNavigate();
	const reduceMotion = useReducedMotion();
	const handleInstallClick = () => {
		if (connected && !mobile) {
			void navigate({ to: "/home" });
			return;
		}
		handleAddToChromeClick();
		if (mobile) {
			void handleCopyStoreLink();
			return;
		}
		if (storeUrl) window.open(storeUrl, "_blank", "noopener,noreferrer");
	};

	if (!storeUrl && (!connected || mobile))
		return (
			<span className="inline-flex min-h-14 items-center rounded-full bg-work-raised px-6 text-sm text-work-muted">
				Chrome Store link unavailable
			</span>
		);

	return (
		<button
			type="button"
			aria-label={
				mobile
					? "Copy store link"
					: connected
						? "Continue in Tabot"
						: "Add to Chrome"
			}
			onClick={handleInstallClick}
			className={installClass}
		>
			<LazyMotion features={domAnimation}>
				<AnimatePresence initial={false} mode="wait">
					<m.span
						key={mobile ? "copy" : connected ? "continue" : "install"}
						className="inline-flex items-center justify-center gap-3 whitespace-nowrap"
						initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
						transition={{
							duration: reduceMotion ? 0 : 0.18,
							ease: [0.22, 1, 0.36, 1],
						}}
					>
						{mobile ? (
							<>
								<Copy aria-hidden="true" className="size-4" />
								<span>Copy store link</span>
							</>
						) : connected ? (
							<>
								<img
									src={LOGO_URL}
									width="22"
									height="22"
									alt=""
									className="size-5.5 rounded-sm object-contain"
								/>
								<span>Continue in Tabot</span>
							</>
						) : (
							<>
								<img src={CHROME_LOGO_URL} width="22" height="22" alt="" />
								<span>Add to Chrome</span>
							</>
						)}
					</m.span>
				</AnimatePresence>
			</LazyMotion>
		</button>
	);
};
