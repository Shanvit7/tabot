const styles = `
:root{color-scheme:light;font-family:"IBM Plex Sans",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#101510;background:#f5f6f0;font-synthesis:none;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}
body{min-height:100vh;min-height:100svh;margin:0;display:grid;place-items:start center;padding:max(1.25rem,env(safe-area-inset-top)) max(1.25rem,env(safe-area-inset-right)) max(1.25rem,env(safe-area-inset-bottom)) max(1.25rem,env(safe-area-inset-left))}
main{width:min(100%,52rem);max-width:100%;min-width:0;overflow-wrap:anywhere;background:#fff;border:2px solid #101510;box-shadow:6px 6px 0 #101510;padding:clamp(.875rem,2.5vw,1.25rem)}
.brand{display:inline-flex;align-items:center;gap:.5rem;margin-bottom:1.25rem;font-size:1rem;font-weight:700;letter-spacing:-.03em}
.brand-mark{width:.8rem;height:.8rem;background:#bfff00;border:1px solid #101510}
.eyebrow{margin:0 0 .65rem;font:600 .7rem/1.3 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#40584a}
h1{margin:0;font-size:clamp(1.125rem,3vw,1.5rem);line-height:1.15;letter-spacing:-.03em;overflow-wrap:anywhere}
.client{color:#40584a}
.description{margin:.85rem 0 0;font-size:.8125rem;line-height:1.5;color:#263329}
.connection-route{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,.8fr) auto minmax(0,1fr);align-items:center;gap:.4rem;margin:1.25rem 0 0;padding:.75rem;border:1px solid #c5d0c2;background:#f5f6f0}
.route-step{display:flex;min-width:0;flex-direction:column;align-items:center;gap:.4rem;color:#263329;font-size:.65rem;font-weight:600;line-height:1.25;text-align:center;overflow-wrap:anywhere}
.route-symbol{display:grid;width:2rem;height:2rem;place-items:center;border:1px solid #101510;background:#fff}
.route-symbol svg{width:1.2rem;height:1.2rem;fill:none;stroke:#101510;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.route-symbol .brand-mark{display:block}
.route-step.tabot .route-symbol{background:#bfff00}
.route-arrow{width:.9rem;height:.9rem;fill:none;stroke:#40584a;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.privacy{margin:.9rem 0 0;padding:.8rem;background:#eef4ea;border:1px solid #101510}
.privacy h2{margin:0 0 .65rem;font-size:.85rem;line-height:1.3;letter-spacing:-.02em}
.privacy-row{display:grid;grid-template-columns:1.1rem 1fr;gap:.5rem;align-items:start;font-size:.75rem;line-height:1.4}
.privacy-row+.privacy-row{margin-top:.6rem;padding-top:.6rem;border-top:1px solid #c5d0c2}
.privacy-mark svg{display:block;width:1rem;height:1rem;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.privacy-mark.good{color:#315b25}
.privacy-mark.no{color:#5b3825}
.privacy p{margin:0}
.privacy-note{margin-top:.65rem;padding-top:.6rem;border-top:1px solid #c5d0c2;font-size:.7rem;line-height:1.4;color:#263329}
.privacy-footer{margin:.6rem 0 0;font-size:.7rem;line-height:1.4;color:#40584a;font-weight:700;padding-top:.5rem;text-align:center}
form{margin-top:1rem}
button{display:flex;align-items:center;justify-content:center;width:min(100%,22rem);min-height:3.5rem;margin-inline:auto;padding:.75rem 1rem;border:2px solid #bfff00;background:#101510;color:#bfff00;font-family:inherit;text-align:center;cursor:pointer;box-shadow:4px 4px 0 #bfff00;transition:transform 140ms ease,box-shadow 140ms ease}
.cta-copy{display:grid;width:100%;gap:.2rem;text-align:center}
.cta-title{font-size:.8rem;font-weight:700;line-height:1.2}
.cta-hint{font-size:.65rem;font-weight:500;line-height:1.3;color:#eef4ea}
.cta-prompt{margin:0 0 .6rem;text-align:center;font-size:.75rem;font-weight:600;line-height:1.4;color:#40584a}
button:hover:not(:disabled){transform:translate(-2px,-2px);box-shadow:6px 6px 0 #101510}
button:active:not(:disabled){transform:translate(2px,2px);box-shadow:2px 2px 0 #101510}
button:focus-visible{outline:3px solid #101510;outline-offset:4px}
button:disabled{cursor:wait;opacity:.7}
#status{min-height:1.4em;margin:.65rem 0 0;font-size:.7rem;line-height:1.4;color:#40584a}
#status[data-state="error"]{color:#a12622}
.card-footer{margin-top:.85rem;padding-top:.65rem;border-top:1px solid #c5d0c2;text-align:center;font-size:.7rem;line-height:1.4;color:#40584a}
.contact-link{display:inline-flex;min-height:2.75rem;align-items:center;padding-inline:.2rem;color:#101510;font-weight:600;text-decoration:underline;text-decoration-color:#bfff00;text-decoration-thickness:2px;text-underline-offset:3px}
.contact-link:hover{color:#40584a}
.contact-link:focus-visible{outline:2px solid #101510;outline-offset:2px}
::selection{background:#bfff00;color:#101510}
@media(max-width:22rem){body{padding-top:max(.75rem,env(safe-area-inset-top));padding-right:max(.75rem,env(safe-area-inset-right));padding-left:max(.75rem,env(safe-area-inset-left));place-items:start center}main{width:100%;min-width:0;padding:.75rem;box-shadow:4px 4px 0 #101510}.privacy{padding:.65rem}.privacy-row{grid-template-columns:1rem minmax(0,1fr);gap:.45rem}}
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
			<meta name="theme-color" content="#f5f6f0" />
			<title>Connect Tabot</title>
			<style dangerouslySetInnerHTML={{ __html: styles }} />
		</head>
		<body data-extension-id={extensionId} data-transaction-id={transactionId}>
			<main>
				<div class="brand">
					<span class="brand-mark" aria-hidden="true"></span>
					<span>tabot</span>
				</div>
				<p class="eyebrow">Chrome profile connection</p>
				<h1>
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
							<span class="brand-mark"></span>
						</span>
						<span>Tabot Plugin / MCP</span>
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
				<form id="authorize" method="post" action="/authorize">
					<input type="hidden" name="transaction" value={transactionId} />
					<p class="cta-prompt">Get started, by clicking below</p>
					<button id="connect" type="button">
						<span class="cta-copy">
							<span class="cta-title">Connect to {clientName}</span>
							<span class="cta-hint">Share activity when you ask</span>
						</span>
					</button>
				</form>
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
							<strong>Shared on request:</strong> selected activity summaries,
							sites/timing, patterns, metrics.
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
							<strong>Never captured:</strong> page content, screenshots, typed
							text, or form values. Raw data stays on-device.
						</p>
					</div>
					<p class="privacy-note">
						<strong>PII redaction:</strong> emails, phones, cards, and IBANs in
						shared text/URLs are redacted. Other identifiers may slip through;
						site names/timing stay visible.
					</p>
					<p class="privacy-footer">
						This Plugin / MCP passes requests or results; stores no history or
						tool results.
					</p>
				</section>
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
