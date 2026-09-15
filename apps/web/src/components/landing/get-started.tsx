import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";

const chromeWebStoreUrl = import.meta.env.VITE_CHROME_WEB_STORE_URL?.trim();

interface ChromePort {
	disconnect?: () => void;
	onDisconnect?: (() => void) | null;
}

interface ExternalChrome {
	runtime?: {
		connect?: (name: string) => ChromePort;
		lastError?: string;
	};
}

// Externally-connectable handshake: chrome.runtime.connect succeeds only when
// the Tabot extension is installed and lists this origin in its manifest.
const isTabotInstalled = () =>
	new Promise<boolean>((resolve) => {
		const chrome = (globalThis as { chrome?: ExternalChrome }).chrome;
		if (!chrome?.runtime?.connect) {
			resolve(false);
			return;
		}
		try {
			const port = chrome.runtime.connect("tabot");
			const timer = setTimeout(() => {
				port.disconnect?.();
				resolve(true);
			}, 200);
			port.onDisconnect = () => {
				clearTimeout(timer);
				resolve(Boolean(chrome.runtime?.lastError) === false);
			};
		} catch {
			resolve(false);
		}
	});

export const GetStarted = () => {
	const [installed, setInstalled] = useState<boolean | null>(null);

	useEffect(() => {
		let disposed = false;
		isTabotInstalled().then((result) => {
			if (!disposed) {
				setInstalled(result);
			}
		});
		return () => {
			disposed = true;
		};
	}, []);

	return (
		<section
			className="border-y-2 border-black bg-lime px-6 py-20 text-black sm:px-10 sm:py-28 lg:px-14"
			id="get-started"
		>
			<div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-20">
				<div className="max-w-3xl">
					<h2 className="text-[clamp(2.75rem,5.5vw,5.5rem)] font-semibold leading-[0.88] tracking-[-0.03em] text-balance">
						Keep and share context. Lose{" "}
						<span className="inline-block bg-black px-[0.14em] text-lime shadow-hard-sm">
							less
						</span>{" "}
						momentum.
					</h2>
					<p className="mt-8 max-w-xl text-lg leading-8 text-[#244d39] sm:text-xl">
						Install Tabot, browse normally, then review your own activity from
						one local dashboard.
					</p>
				</div>
				<div className="max-w-sm border-2 border-black bg-[#f5f6f0] p-6 shadow-hard-lg sm:p-7">
					<p className="font-mono text-xs font-bold uppercase tracking-[0.12em]">
						Chrome extension
					</p>
					<p className="mt-4 text-xl font-semibold leading-tight tracking-[-0.03em]">
						Your browser activity stays on your device.
					</p>
					{installed ? (
						<Button asChild className="mt-7 w-full" variant="secondary">
							<a href="/dashboard">Open dashboard</a>
						</Button>
					) : chromeWebStoreUrl ? (
						<Button asChild className="mt-7 w-full" variant="secondary">
							<a href={chromeWebStoreUrl} rel="noopener" target="_blank">
								Add to Chrome
							</a>
						</Button>
					) : null}
				</div>
			</div>
		</section>
	);
};
