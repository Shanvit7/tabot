const styles = `
@font-face{font-family:"Clash Grotesk";src:url("/fonts/clash-grotesk-var.woff2") format("woff2");font-style:normal;font-weight:200 700;font-display:swap}
@font-face{font-family:"Clash Display";src:url("/fonts/clash-display-600.woff2") format("woff2");font-style:normal;font-weight:600;font-display:swap}
:root{color-scheme:light;font-family:"Clash Grotesk",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#15251b;background:#fff;font-synthesis:none;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}
body{min-height:100vh;min-height:100svh;margin:0;display:grid;place-items:start center;padding:max(2rem,env(safe-area-inset-top)) max(1.25rem,env(safe-area-inset-right)) max(2rem,env(safe-area-inset-bottom)) max(1.25rem,env(safe-area-inset-left))}
main{width:min(100%,44rem);max-width:100%;min-width:0;overflow-wrap:anywhere;padding:clamp(1rem,4vw,2rem);background:#fff}
.brand{display:inline-flex;align-items:center;gap:.6rem;margin-bottom:1.5rem;font-size:1rem;font-weight:700;letter-spacing:-.02em}
.brand-mark{display:block;width:2rem;height:2rem;object-fit:contain}
h1{margin:0;font-family:"Clash Display","Clash Grotesk",system-ui,sans-serif;font-size:clamp(1.5rem,4vw,2rem);font-weight:600;line-height:1.15;letter-spacing:-.03em;overflow-wrap:anywhere}
.client{color:#476151}
.description{max-width:60ch;margin:.75rem 0 0;font-size:.9375rem;line-height:1.55;color:#476151}
.connection-route{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,.8fr) auto minmax(0,1fr);align-items:center;gap:.5rem;margin:1.5rem 0 0;padding:1rem;border:1px solid #d2ddd2;border-radius:.875rem;background:#f5f8f4}
.route-step{display:flex;min-width:0;flex-direction:column;align-items:center;gap:.5rem;color:#15251b;font-size:.75rem;font-weight:600;line-height:1.35;text-align:center;overflow-wrap:anywhere}
.route-symbol{display:grid;width:2.5rem;height:2.5rem;place-items:center;border-radius:.75rem;background:#fff;color:#15251b}
.route-symbol svg{width:1.25rem;height:1.25rem;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.route-symbol .brand-mark{width:2.5rem;height:2.5rem}
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
.cta-title{font-size:1rem;font-weight:650;line-height:1.25}
.cta-arrow{flex-shrink:0;width:1.125rem;height:1.125rem;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.consent-policy{margin:0;color:#476151;font-size:.875rem;line-height:1.5}
.policy-link{display:inline-flex;align-items:center;min-height:1.5rem;color:#15251b;font-weight:600;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:3px}
.policy-link:hover{text-decoration-color:#476151}
.policy-link:focus-visible{outline:2px solid #15251b;outline-offset:3px;border-radius:2px}
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
:root{--canvas:#f5f6f0;--surface:#fff;--soft:#f5f8f4;--ink:#15251b;--muted:#476151;--line:#d2ddd2}
body{place-items:center;background:radial-gradient(ellipse at 50% 0%,#e9f4d6 0,transparent 42%),var(--canvas);padding-block:max(2rem,env(safe-area-inset-top)) max(2rem,env(safe-area-inset-bottom))}
main{width:min(100%,64rem);padding:clamp(1.25rem,3vw,2rem);border:1px solid var(--line);border-radius:1.5rem;background:var(--surface);box-shadow:0 24px 70px rgb(21 37 27 / 8%)}
.brand{margin-bottom:1.75rem}
.brand-mark{border-radius:.75rem}
h1{max-width:28ch;font-size:clamp(2rem,6vw,2.75rem);line-height:1.06;letter-spacing:-.045em}
.client{color:var(--muted)}
.description{max-width:45ch;margin-top:1rem;font-size:1rem;line-height:1.6}
.connection-route{gap:.75rem;margin-top:2rem;padding:1.25rem;border-color:var(--line);border-radius:1rem;background:var(--soft)}
.route-step{gap:.625rem;font-size:.8125rem}
.route-symbol{width:2.75rem;height:2.75rem;border:1px solid var(--line);border-radius:.875rem}
.route-symbol .brand-mark{width:2.75rem;height:2.75rem;border:0;border-radius:.875rem}
.route-arrow{width:1.125rem;height:1.125rem}
.privacy{margin-top:2rem;padding-top:1.5rem;border-color:var(--line)}
.privacy h2{margin-bottom:1rem;font-size:1.125rem}
.privacy-row{gap:.75rem;padding:1rem;border:1px solid var(--line);border-radius:.875rem;background:var(--surface);font-size:.9375rem;line-height:1.55;color:var(--ink)}
.privacy-row+.privacy-row{margin-top:.625rem;padding-top:1rem;border-top:1px solid var(--line)}
.privacy-mark{display:grid;width:1.5rem;height:1.5rem;place-items:center;border-radius:50%;background:var(--soft)}
.privacy-mark.good{color:#315b25}
.privacy-mark.no{color:#5b3825}
.privacy-mark svg{width:1rem;height:1rem}
.privacy .privacy-note{margin-top:1rem;padding:1rem;border:1px solid var(--line);border-radius:.875rem;background:var(--soft);font-size:.875rem}
.privacy .privacy-footer{margin-top:1rem;padding-top:1rem;font-size:.875rem}
form{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:.75rem 1rem;margin-top:1.75rem}
button{gap:1rem;width:auto;max-width:100%;min-height:3.25rem;margin:0;padding:.875rem 1.25rem;border-radius:.75rem;font-size:1rem;touch-action:manipulation}
@media(max-width:34rem){form{grid-template-columns:minmax(0,1fr)}button{width:100%}.consent-policy{text-align:center}}
button:hover:not(:disabled){border-color:#a8e600;background:#a8e600}
#status{grid-column:1/-1;margin:0;font-size:.875rem}
#status:empty{display:none}
.card-footer{margin-top:1.5rem;padding-top:1rem;font-size:.875rem}
@media(max-width:34rem){body{place-items:start center;padding-right:max(1rem,env(safe-area-inset-right));padding-left:max(1rem,env(safe-area-inset-left))}main{padding:1.25rem;border-radius:1.125rem}.connection-route{gap:.35rem;padding:.875rem}.route-step{font-size:.6875rem}.route-symbol,.route-symbol .brand-mark{width:2.375rem;height:2.375rem}.route-arrow{width:.875rem;height:.875rem}}
@media(min-width:48rem){
body{padding-block:max(.75rem,env(safe-area-inset-top)) max(.75rem,env(safe-area-inset-bottom))}
main{padding:1.25rem}
.brand{margin-bottom:.75rem}
h1{max-width:none;font-size:clamp(2rem,3.8vw,2.5rem);line-height:1.05}
.description{max-width:none;margin-top:.5rem}
.connection-route{gap:.625rem;margin-top:1rem;padding:.75rem}
.route-step{flex-direction:row;justify-content:center;gap:.625rem}
.route-symbol{flex-shrink:0}
.route-symbol,.route-symbol .brand-mark{width:2.5rem;height:2.5rem}
.privacy{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.625rem .75rem;margin-top:1rem;padding-top:.75rem}
.privacy h2{grid-column:1/-1;margin:0 0 .25rem}
.privacy-row{align-self:stretch;gap:.5rem;padding:.75rem}
.privacy-row+.privacy-row{margin-top:0;padding-top:.75rem}
.privacy .privacy-note,.privacy .privacy-footer{margin:0;padding:.75rem}
.privacy .privacy-footer{border:0}
form{margin:1rem 0 0}
button{min-height:3.25rem}
.card-footer{margin-top:.75rem;padding-top:.5rem}
.contact-link{min-height:1.5rem}
}
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
			<main aria-labelledby="consent-heading">
				<div class="brand">
					<img
						class="brand-mark"
						src="/logo.png"
						alt=""
						width="32"
						height="32"
					/>
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
							<img
								class="brand-mark"
								src="/logo.png"
								alt=""
								width="40"
								height="40"
							/>
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
							<strong>Shared on request:</strong> selected results may include
							site names, timestamps, counts, and match terms. Requested saved
							notes can include selected-pattern-redacted titles and text.
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
							<strong>Stays on this device:</strong> full browsing history and
							raw events. A URL supplied as the legacy note-lookup selector is
							sent with that request. Screenshots, typed text, and form values
							are never captured.
						</p>
					</div>
					<p class="privacy-note">
						<strong>
							Selected sensitive patterns are filtered before sharing:
						</strong>{" "}
						requested note text and titles may have credentials, tokens,
						payment-card numbers, and selected financial identifiers filtered.
						Detection is not exhaustive; other sensitive details, site names,
						and timing may remain visible.{" "}
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
					<p id="consent-policy" class="consent-policy">
						Before connecting, review our{" "}
						<a
							class="policy-link"
							href="https://shanvit7.github.io/tabot/privacy/"
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Privacy Policy (opens in a new tab)"
						>
							Privacy Policy
						</a>
						.
					</p>
					<button id="connect" type="button" aria-describedby="consent-policy">
						<span class="cta-title">Connect to {clientName}</span>
						<svg class="cta-arrow" viewBox="0 0 24 24" aria-hidden="true">
							<path d="M5 12h14m-6-6 6 6-6 6" />
						</svg>
					</button>
					<p id="status" role="status" aria-live="polite"></p>
				</form>
				<footer class="card-footer">
					Privacy questions or feedback?{" "}
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
