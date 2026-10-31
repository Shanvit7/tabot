const styles = `
@font-face{font-family:"Clash Grotesk";src:url("/fonts/clash-grotesk-var.woff2") format("woff2");font-style:normal;font-weight:200 700;font-display:swap}
@font-face{font-family:"Clash Display";src:url("/fonts/clash-display-600.woff2") format("woff2");font-style:normal;font-weight:600;font-display:swap}
:root{color-scheme:light;font-family:"Clash Grotesk",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#15251b;background:#fff;font-synthesis:none;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}
body{min-height:100vh;min-height:100svh;margin:0;display:grid;place-items:start center;padding:max(2rem,env(safe-area-inset-top)) max(1.25rem,env(safe-area-inset-right)) max(2rem,env(safe-area-inset-bottom)) max(1.25rem,env(safe-area-inset-left))}
main{width:min(100%,44rem);max-width:100%;min-width:0;overflow-wrap:anywhere;padding:clamp(1rem,4vw,2rem);background:#fff}
.brand{display:inline-flex;align-items:center;gap:.6rem;margin-bottom:1.5rem;font-size:1rem;font-weight:700;letter-spacing:-.02em}
.brand-mark{display:grid;width:2rem;height:2rem;place-items:center;border-radius:.65rem;background:#bfff00;color:#15251b;font-size:1rem;font-weight:800}
h1{margin:0;font-family:"Clash Display","Clash Grotesk",system-ui,sans-serif;font-size:clamp(1.5rem,4vw,2rem);font-weight:600;line-height:1.15;letter-spacing:-.03em;overflow-wrap:anywhere}
.client{color:#476151}
.description{max-width:60ch;margin:.75rem 0 0;font-size:.9375rem;line-height:1.55;color:#476151}
.connection-route{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,.8fr) auto minmax(0,1fr);align-items:center;gap:.5rem;margin:1.5rem 0 0;padding:1rem;border:1px solid #d2ddd2;border-radius:.875rem;background:#f5f8f4}
.route-step{display:flex;min-width:0;flex-direction:column;align-items:center;gap:.5rem;color:#15251b;font-size:.75rem;font-weight:600;line-height:1.35;text-align:center;overflow-wrap:anywhere}
.route-symbol{display:grid;width:2.5rem;height:2.5rem;place-items:center;border-radius:.75rem;background:#fff;color:#15251b}
.route-symbol svg{width:1.25rem;height:1.25rem;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.route-symbol .brand-mark{width:2.5rem;height:2.5rem;border-radius:.75rem}
.route-step.tabot .route-symbol{background:#bfff00}
.route-arrow{width:1rem;height:1rem;fill:none;stroke:#476151;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.privacy{margin:1.5rem 0 0;padding:1rem 0 0;border-top:1px solid #d2ddd2}
.privacy h2{margin:0 0 .75rem;font-size:1rem;line-height:1.35;letter-spacing:-.02em}
.privacy-row{display:grid;grid-template-columns:1.1rem minmax(0,1fr);gap:.65rem;align-items:start;font-size:.875rem;line-height:1.5;color:#476151}
.privacy-row+.privacy-row{margin-top:.75rem;padding-top:.75rem;border-top:1px solid #d2ddd2}
.privacy-mark svg{display:block;width:1rem;height:1rem;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.privacy-mark.good{color:#315b25}
.privacy-mark.no{color:#5b3825}
.privacy p{margin:0}
.privacy-note{margin-top:1rem;padding-top:.75rem;border-top:1px solid #d2ddd2;font-size:.8125rem;line-height:1.5;color:#476151}
.privacy-note .privacy-link{color:#15251b;font-weight:600;text-decoration:underline;text-decoration-color:#bfff00;text-decoration-thickness:2px;text-underline-offset:3px}
.privacy-note .privacy-link:focus-visible{outline:2px solid #15251b;outline-offset:3px;border-radius:2px}
.privacy-footer{margin:1rem 0 0;padding-top:.75rem;border-top:1px solid #d2ddd2;font-size:.8125rem;line-height:1.5;color:#476151}
form{margin-top:1.25rem}
button{display:flex;align-items:center;justify-content:center;width:min(100%,24rem);min-height:3.25rem;margin-inline:auto;padding:.75rem 1rem;border:1px solid #bfff00;border-radius:.75rem;background:#bfff00;color:#15251b;font-family:inherit;text-align:center;cursor:pointer;transition:background-color 140ms ease,border-color 140ms ease,transform 140ms ease}
.cta-copy{display:grid;width:100%;gap:.2rem;text-align:center}
.cta-title{font-size:.9375rem;font-weight:650;line-height:1.25}
.cta-hint{font-size:.75rem;font-weight:500;line-height:1.4;color:#263b2e}
button:hover:not(:disabled){border-color:#a8e600;background:#a8e600}
button:active:not(:disabled){transform:translateY(1px)}
button:focus-visible{outline:3px solid #15251b;outline-offset:3px}
button:disabled{cursor:wait;opacity:.65}
#status{min-height:1.4em;margin:.65rem 0 0;font-size:.8125rem;line-height:1.45;color:#476151}
#status[data-state="error"]{color:#a02d2d}
.card-footer{margin-top:1.25rem;padding-top:.75rem;border-top:1px solid #d2ddd2;text-align:center;font-size:.8125rem;line-height:1.5;color:#476151}
.contact-link{display:inline-flex;min-height:2.75rem;align-items:center;padding-inline:.2rem;color:#15251b;font-weight:600;text-decoration:underline;text-decoration-color:#bfff00;text-decoration-thickness:2px;text-underline-offset:3px}
.contact-link:hover{color:#476151}
.contact-link:focus-visible{outline:2px solid #15251b;outline-offset:2px;border-radius:2px}
::selection{background:#bfff00;color:#15251b}
@media(max-width:22rem){body{padding-top:max(1rem,env(safe-area-inset-top));padding-right:max(.75rem,env(safe-area-inset-right));padding-left:max(.75rem,env(safe-area-inset-left))}main{width:100%;min-width:0;padding:.75rem}.connection-route{gap:.3rem;padding:.75rem}.route-step{font-size:.6875rem}.route-symbol,.route-symbol .brand-mark{width:2.25rem;height:2.25rem}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition-duration:.01ms!important}}
`;

const script = `
const body = document.body;
const button = document.getElementById("connect");
const status = document.getElementById("status");
const form = document.getElementById("authorize");
const fail = (message) => {
  button.disabled = false;
  status.dataset.state = "error";
  status.textContent = message;
};
button.addEventListener("click", () => {
  const runtime = globalThis.chrome && globalThis.chrome.runtime;
  if (!runtime || !runtime.sendMessage) {
    fail("Tabot is not available in this Chrome profile. Install or enable Tabot, then try again.");
    return;
  }
  button.disabled = true;
  status.dataset.state = "connecting";
  status.textContent = "Connecting Tabot…";
  runtime.sendMessage(body.dataset.extensionId, {
    type: "TABOT_APPROVE_AUTHORIZATION",
    transactionId: body.dataset.transactionId,
  }, (response) => {
    if (runtime.lastError || !response || response.ok !== true) {
      fail("Tabot could not connect in this Chrome profile. Enable Tabot, then try again.");
      return;
    }
    form.requestSubmit();
  });
});
`;

export const consentPage = ({
	clientName,
	extensionId,
	transactionId,
}: {
	clientName: string;
	extensionId: string;
	transactionId: string;
}) => (
	<html lang="en">
		<head>
			<meta charSet="utf-8" />
			<meta
				name="viewport"
				content="width=device-width,initial-scale=1,viewport-fit=cover"
			/>
			<meta name="theme-color" content="#f5f8f4" />
			<title>Connect Tabot</title>
			<style dangerouslySetInnerHTML={{ __html: styles }} />
		</head>
		<body data-extension-id={extensionId} data-transaction-id={transactionId}>
			<main aria-labelledby="consent-heading">
				<div class="brand">
					<span class="brand-mark" aria-hidden="true">
						T
					</span>
					<span>tabot</span>
				</div>
				<h1 id="consent-heading">
					Connect Tabot <span class="client">to {clientName}</span>
				</h1>
				<p class="description">
					Let {clientName} request selected activity from this profile when you
					ask.
				</p>
				<div
					class="connection-route"
					role="img"
					aria-label={`This Chrome profile connects through Tabot to ${clientName}`}
				>
					<div class="route-step">
						<span class="route-symbol" aria-hidden="true">
							<svg viewBox="0 0 24 24">
								<title>Chrome profile</title>
								<rect x="3" y="4" width="18" height="16" rx="1" />
								<path d="M3 8h18M7 6h.01M10 6h.01" />
							</svg>
						</span>
						<span>This profile</span>
					</div>
					<svg class="route-arrow" viewBox="0 0 16 16" aria-hidden="true">
						<path d="M2 8h11m-4-4 4 4-4 4" />
					</svg>
					<div class="route-step tabot">
						<span class="route-symbol" aria-hidden="true">
							<span class="brand-mark">T</span>
						</span>
						<span>Tabot MCP</span>
					</div>
					<svg class="route-arrow" viewBox="0 0 16 16" aria-hidden="true">
						<path d="M2 8h11m-4-4 4 4-4 4" />
					</svg>
					<div class="route-step">
						<span class="route-symbol" aria-hidden="true">
							<svg viewBox="0 0 24 24">
								<title>Chat conversation</title>
								<path d="M4 5h16v12H9l-5 3z" />
							</svg>
						</span>
						<span>{clientName}</span>
					</div>
				</div>
				<section class="privacy" aria-labelledby="privacy-heading">
					<h2 id="privacy-heading">Privacy, at a glance</h2>
					<div class="privacy-row">
						<span class="privacy-mark good" aria-hidden="true">
							<svg viewBox="0 0 16 16" fill="none">
								<title>Included</title>
								<path d="m3 8 3.2 3.2L13 4.5" />
							</svg>
						</span>
						<p>
							<strong>Shared on request:</strong> selected activity and saved
							notes may include site names, timestamps, page titles, and short
							redacted previews.
						</p>
					</div>
					<div class="privacy-row">
						<span class="privacy-mark no" aria-hidden="true">
							<svg viewBox="0 0 16 16" fill="none">
								<title>Not included</title>
								<path d="m4 4 8 8M12 4l-8 8" />
							</svg>
						</span>
						<p>
							<strong>Stays on this device:</strong> full browsing history, full
							page paths, and raw events. Screenshots, typed text, and form
							values are never captured.
						</p>
					</div>
					<p class="privacy-note">
						<strong>We hide:</strong> email addresses, phone numbers, card
						numbers, and IBANs in shared text/URLs. Other identifiers may remain
						visible, as do site names and timing.{" "}
						<a
							class="privacy-link"
							href="https://shanvit7.github.io/tabot/privacy/#when-you-connect-chatgpt"
							target="_blank"
							rel="noopener noreferrer"
						>
							Read how ChatGPT connects
						</a>
						.
					</p>
					<p class="privacy-footer">
						Tabot stores connection details, not browsing history or tool
						results. Only selected results reach {clientName} when you ask.
					</p>
				</section>
				<form id="authorize" method="post" action="/authorize">
					<input type="hidden" name="transaction" value={transactionId} />
					<button id="connect" type="button">
						<span class="cta-copy">
							<span class="cta-title">Connect to {clientName}</span>
							<span class="cta-hint">Share activity when you ask</span>
						</span>
					</button>
					<p id="status" role="status" aria-live="polite"></p>
				</form>
				<footer class="card-footer">
					In case of any privacy concerns or feedback, please feel free to reach
					out to{" "}
					<a
						class="contact-link"
						href="mailto:shanvit7@gmail.com?subject=Tabot%20privacy%20concern%20or%20feedback"
					>
						shanvit7@gmail.com
					</a>
					.
				</footer>
			</main>
			<script dangerouslySetInnerHTML={{ __html: script }} />
		</body>
	</html>
);
