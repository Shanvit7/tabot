# Claude directory plan for Tabot

## Recommendation

Publish Tabot's existing remote MCP server as a **Claude MCP connector** first. This is the Claude Directory equivalent of connecting Tabot to ChatGPT; it does not require a second MCP server or a Claude-specific fork. Consider a separate **plugin bundle** later only if we want to ship Tabot-specific skills or other Claude instructions alongside the connector.

## Current fit

- MCP endpoint is already remotely hosted over HTTPS: `https://tabot-mcp.shanvit7.workers.dev/mcp`.
- Server already has OAuth discovery, authorization-code + refresh-token grants, dynamic client registration, PKCE S256, and seven read-only tools.
- Tools already include titles and read-only annotations (`readOnlyHint: true`, `destructiveHint: false`), meeting the directory's basic tool metadata requirement.
- Browser data remains local; the relay forwards only requested, privacy-filtered derived context/aggregates. Preserve this boundary in listing, docs, and privacy policy.
- ChatGPT-specific setup and domain-verification routes exist. They are not sufficient evidence that Claude OAuth works; test Claude's OAuth client behavior against the existing flow before submission.

## Plan

### 1. Verify account and submission route

- **Submitting requires a paid Claude plan**: Pro, Max, Team, or Enterprise. Free accounts cannot submit. This is the submitter's account requirement, not evidence that every person who installs/uses a published connector must pay; check Claude's current product-plan limits separately before promising Free-tier availability.
- Team/Enterprise submitters need Owner or Directory permission.
- Open [Claude developer portal](https://claude.ai/directory/manage), select **Submit new → MCP connector**.
- Submit from the organization intended to own Tabot's listing.

### 2. Validate existing server with Claude

- Add the production endpoint as a custom connector in Claude and complete authorization in the same Claude account.
- Verify OAuth discovery, consent, callback, token exchange, refresh, revocation, and re-authorization. Confirm errors fail closed and no ChatGPT-only assumption blocks Claude.
- Call all seven tools and confirm schemas, titles, descriptions, and annotations render correctly:
  `search_context`, `get_recent_context`, `get_current_context`, `get_context`, `get_memory`, `get_activity_metrics`, `list_recurring_patterns`.
- Verify representative calls return derived context only; confirm raw events, page paths, query strings, credentials, and favicons do not leave the extension.
- Keep test data synthetic or non-sensitive. Never remove authentication to make review easier.

### 3. Prepare submission materials

- Public product documentation and setup guide, including extension installation/connection requirements.
- Public HTTPS privacy policy that accurately explains local event storage, data sent on authorized requests, relay/OAuth state, retention, third-party sharing, and support contact.
- Support contact, company name/site, icon, concise listing copy, categories, primary use cases, and data-handling answers.
- Reviewer test account and clear access instructions for a populated, safe-to-test setup. Confirm test data cannot expose personal browsing history.
- Confirm the deployed endpoint and its docs are production-ready. The portal asks for a universal server URL, tool inventory, listing details, use cases, company, authentication, data handling, and test instructions.

### 4. Submit as MCP connector

- Enter `https://tabot-mcp.shanvit7.workers.dev/mcp` as the universal URL.
- Select OAuth 2.0 using dynamic client registration if Claude's test succeeds; otherwise stop and resolve compatibility before choosing another auth mode.
- Provide the documentation/privacy URLs and listing details. Declare that tools read local-derived data and do not write browser data.
- Complete portal's **Test & launch** checklist and submit for review. Anthropic scans submissions; initial listings receive human review. Review timing is not guaranteed.

### 5. After approval

- Track status, server health, and per-tool usage in the developer portal; respond to review issues and maintain security/functionality.
- **No published review-time SLA.** The portal exposes status. MCP connectors are automatically scanned and, by default, listed as Community connectors; some submissions also receive human review. Don't promise a number of hours/days. Human review and any follow-up can extend time. After approval, the connector may still need an explicit **Publish** action.
- Update the connector listing and docs as endpoint/tool behavior changes. Re-test Claude OAuth and all tools after auth changes.
- Set `CHATGPT_MARKETPLACE_URL` only for ChatGPT's existing destination; do not reuse it for Claude. Add a separate Claude listing URL/config only if product UI needs a Claude-specific deep link.

## Optional plugin bundle

A plugin bundle is separate from the MCP connector and must come from a public GitHub repository. If we later add useful Claude-specific skills/instructions, submit the bundle separately and point it at the same MCP server; submit both from the same organization to pair listings. Do not create a bundle just to duplicate the connector. Claude directory skills are not standalone submissions.

## Gaps / go-no-go checks

- **OAuth compatibility is not live-tested in Claude yet.** Existing OAuth supports DCR, and the local production check now asserts Claude's documented discovery handshake: MCP `401` with `resource_metadata`, exact resource URL, authorization-server metadata, S256, and public-client DCR. Still test the production endpoint through Claude's custom connector before submission, including consent, refresh, revocation, and tool calls. Do not change production auth without local/dev validation and review.
- **Public privacy policy URL and reviewer access path** need confirmation before portal submission.
- **Claude-specific listing URL** is unknown until listing is created/published; avoid hard-coding an assumed URL.
- Keep ChatGPT functionality and production secrets isolated; no production deploy or credential rotation is part of this plan.

## Sources

- [Publish to the directory](https://claude.com/docs/directory/publish)
- [Track submission status and review timing](https://claude.com/docs/directory/submission-status)
- [Connectors directory](https://claude.com/docs/connectors/directory)
- [Submit a connector](https://claude.com/docs/connectors/building/submission)
- [Connector review criteria](https://claude.com/docs/connectors/building/review-criteria)
- [Authentication for connectors](https://claude.com/docs/connectors/building/authentication)
- [Tabot MCP relay notes](../apps/mcp-server/README.md)
