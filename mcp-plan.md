# Tabot v0.2.0 --- MCP / ChatGPT Integration Implementation Plan

## Objective

Build the first ChatGPT integration for Tabot.

Target architecture:

``` text
ChatGPT
   │ MCP over HTTPS
   ▼
Tabot MCP / Relay Server
   │ ephemeral request routing
   ▼
Tabot Chrome Extension
   │
   ▼
Local Tabot data
```

Core principle:

> The extension owns the user's browser context. The Hono server owns
> connection/auth/routing. ChatGPT owns the reasoning.

The relay must not become a browser-history database.

## 1. Scope

Current version: `v0.1.3`

Target version: `v0.2.0`

### In scope

-   Hono + TypeScript MCP/relay server
-   MCP endpoint for ChatGPT
-   ChatGPT-facing Tabot tools
-   Extension ↔ relay connection
-   Installation identity
-   One-click same-browser ChatGPT OAuth ↔ installation binding and durable
    OAuth state
-   Ephemeral routing from MCP requests to the correct extension
-   Local execution of context queries inside the extension
-   Sanitized results returned to ChatGPT
-   Local-first data ownership
-   Health/observability endpoints
-   Monorepo integration
-   Local development flow
-   Deployment-ready configuration

### Out of scope

Do not implement:

-   additional AI providers
-   native desktop applications
-   Node installation for end users
-   local native MCP server
-   OpenAI Secure MCP Tunnel
-   cross-device connection, pairing codes, or QR handoffs
-   centralized browser-history storage
-   centralized browser-history embeddings
-   full Tabot user-account system
-   custom MCP UI/iframe experience
-   Kubernetes
-   unnecessary database infrastructure
-   rewriting the existing telemetry/context pipeline

## 2. Monorepo Architecture

First inspect the existing monorepo before making structural changes.

Expected high-level structure:

``` text
tabot/
├── apps/
│   ├── web/                  # existing TanStack Start app
│   ├── extension/            # existing Plasmo extension
│   └── mcp-server/           # NEW
│
├── packages/
│   ├── shared/               # existing shared types/utilities
│   ├── context/              # existing/appropriate context logic
│   ├── privacy/              # existing privacy/sanitization logic
│   └── mcp/                  # optional shared MCP definitions
│
└── pnpm-workspace.yaml
```

Do not blindly create every directory above. Reuse existing package
boundaries where appropriate.

The MCP server must be independently deployable.

## 3. Server Technology

Use:

-   Hono
-   TypeScript
-   current official MCP TypeScript SDK
-   WebSocket support for extension ↔ relay communication
-   HTTPS MCP transport for ChatGPT ↔ relay

Do not use Express, NestJS, Fastify, or a large backend framework.

## 4. Server Responsibilities

### A. MCP endpoint

Expose a production endpoint conceptually at:

``` text
https://mcp.tabot.ai/mcp
```

Make the URL configurable.

Use the current MCP TypeScript SDK rather than manually implementing MCP
JSON-RPC.

### B. Authentication / authorization

Establish a secure mapping:

``` text
ChatGPT authorization
        ↓
Tabot installation
```

Do not treat an installation ID as an authentication credential.

Do not accept an arbitrary client-supplied installation ID as sufficient
authorization.

Use the current MCP/OAuth authorization model appropriate for a remote
MCP server.

ChatGPT is the OAuth client. It retains its access/refresh tokens; Tabot does
not sign the user into ChatGPT or receive their ChatGPT account identity.
ChatGPT's existing login is not an identity assertion that Tabot can use to
select a Chrome installation. Tabot must therefore bind each grant to an
installation that proves possession of its server-issued credential.

The normal flow is one-click, same-browser authorization — not typed pairing:

```text
ChatGPT Connect Tabot CTA
      ↓ OAuth redirect
https://mcp.tabot.ai/authorize
      ↓ browser-extension bridge
installed Tabot extension proves one-time authorization transaction
      ↓
Tabot binds grant to that installation and redirects back to ChatGPT
```

The authorization page starts a short-lived, single-use transaction bound to
the OAuth `state`, PKCE request, OAuth client, and redirect URI. It asks the
installed extension to approve that transaction through
`chrome.runtime.sendMessage`; the page never receives the long-lived
installation credential. The extension sends the server a credential-authenticated
proof for that transaction. Tabot issues an authorization code only after that
proof succeeds.

The released extension must have a stable extension ID and allow external
messages only from `https://mcp.tabot.ai/*`. Development uses an explicitly
configured local origin and development extension ID. Verify the web-page
sender origin, transaction expiry, nonce, and one-time use; fail closed if any
are absent or mismatched.

Connection is supported only when ChatGPT OAuth completes in a Chrome profile
where Tabot is installed. If the extension cannot be reached, authorization
fails with clear instructions to install or enable Tabot in that Chrome profile.
Do not offer a pairing code, QR handoff, account login, or cross-device path.

The relay persists only OAuth client registrations, one-time authorization
codes, hashed access/refresh tokens, and short-lived authorization transactions
in a Durable Object. It never persists browser context.

If production OAuth cannot be completed in the first pass, build the
interfaces and development mechanism cleanly and document the remaining
production work. Do not fake security with installation IDs.

### C. Extension relay

The extension establishes an outbound persistent connection:

``` text
Chrome extension
      │ WebSocket
      ▼
mcp.tabot.ai
```

The relay maintains ephemeral presence:

``` text
installationId → active extension connection
```

An MCP invocation becomes:

``` text
ChatGPT
   ↓
MCP server
   ↓
authenticated installation
   ↓
active extension connection
   ↓
local Tabot query
   ↓
sanitized result
   ↓
MCP server
   ↓
ChatGPT
```

Do not persist returned browsing context.

## 5. Installation Identity

Register a cryptographically random opaque installation ID and a long-lived
installation credential during first extension startup.

Requirements:

-   stored together in `chrome.storage.local`
-   stable across service-worker and Chrome restarts
-   not derived from email, name, username, Chrome profile, or browsing data
-   installation ID never used as a bearer credential; relay and browser-bridge
    proof require its server-issued credential
-   long-lived installation credential is never returned to an authorization
    page or exposed to page JavaScript
-   reconnect reads saved credentials and is silent; it never starts OAuth
    during normal Chrome startup

The extension only creates new credentials when storage is absent (new install
or user-cleared extension data). Credential revocation/expiry is an explicit
reconnect failure, not a reason to silently bind a new installation.

## 6. Extension ↔ Relay Protocol

Use WebSocket initially.

The protocol must provide:

-   request correlation IDs
-   authentication
-   timeout handling
-   reconnect support
-   graceful disconnect
-   malformed-message handling
-   bounded payloads

Conceptual messages:

``` json
{
  "type": "request",
  "requestId": "...",
  "method": "search_context",
  "params": {
    "query": "MCP architecture"
  }
}
```

Response:

``` json
{
  "type": "response",
  "requestId": "...",
  "result": {}
}
```

Error:

``` json
{
  "type": "response",
  "requestId": "...",
  "error": {
    "code": "...",
    "message": "..."
  }
}
```

The exact wire format may be improved during implementation.

## 7. MCP Tools

Start with four tools.

### `search_context`

Search locally-derived Tabot browser context.

Input:

``` text
query: string
```

Use cases include researching, working on, or exploring a topic.

### `get_recent_context`

Retrieve recent useful contexts.

Input:

``` text
hours: number
```

Apply sensible bounds.

### `get_current_context`

Return the current/most recent meaningful browser context.

Do not return large raw telemetry.

### `get_memory`

Retrieve a specific memory and supporting derived evidence.

Input:

``` text
id: string
```

## 8. MCP Tool Descriptions

Tool descriptions must clearly explain:

-   Tabot provides locally-derived browser context
-   when the tool should be used
-   that results represent observed browser activity and derived context
-   that inferred intent must not be treated as confirmed fact

Example:

``` text
Search the user's locally-derived Tabot browser context.

Use this when the user asks about what they recently
researched, worked on, browsed, or explored across Chrome.

Results represent observed browser activity and derived
context. Do not treat inferred intent as confirmed fact.
```

## 9. Extension-Side Execution

The MCP server must not duplicate Tabot's context logic.

The extension executes context queries against existing local data:

``` text
search_context(query)
      ↓
existing local context/memory search
      ↓
privacy sanitization
      ↓
structured response
```

Reuse existing:

-   activity data
-   session data
-   context data
-   memory data
-   privacy/sanitization code
-   schemas/types

Do not create a second context-generation implementation.

## 10. Privacy Boundary

The AI-facing path must pass through the existing privacy/sanitization
layer:

``` text
Local Tabot data
      ↓
query
      ↓
derived result
      ↓
sanitize
      ↓
MCP response
```

Never dump the raw local database into MCP.

Preserve existing PII redaction behavior.

Ensure sensitive URL components such as authentication/session/query
data are not unnecessarily exposed through MCP.

Do not introduce generic name/username redaction as part of this
implementation.

## 11. Data Returned to ChatGPT

Prefer structured, concise context.

Example:

``` json
{
  "contexts": [
    {
      "id": "ctx_123",
      "title": "AI browser context research",
      "durationMinutes": 42,
      "activityCount": 18,
      "sites": ["github.com", "chatgpt.com"],
      "summary": "Researching browser context and MCP integration."
    }
  ]
}
```

Expose enough evidence for reasoning without returning the entire event
history.

Prefer:

-   timestamps
-   durations
-   sites/domains
-   context IDs
-   memory IDs
-   supporting activity references

Avoid unnecessary:

-   full URLs
-   tracking parameters
-   raw event payloads
-   duplicate telemetry

## 12. Relay State

Use Cloudflare Durable Objects instead of a process-local connection map.

Conceptually:

```text
installationId
      ↓
TabotInstallationDO
      ↓
WebSocket → extension
```

Each installation Durable Object owns one live extension connection. A separate
single auth Durable Object persistently stores only OAuth and installation-binding
metadata: registered clients, authorization codes, hashed access/refresh tokens,
and short-lived browser-bridge transactions.

Use WebSocket Hibernation where appropriate so idle connections do not unnecessarily consume compute.

Do not use Postgres or Redis for browser-context storage. Durable Object
persistence is allowed only for the small auth/connection records above, never
browser context or MCP tool results.

## 13. Timeouts and Failure Handling

Handle:

### Extension offline

Return a clear MCP error:

``` text
Tabot extension is currently offline.
Open Chrome with Tabot enabled and try again.
```

Do not hang indefinitely.

### Extension timeout

Use a bounded request timeout.

### Disconnect during request

Return a clean error.

### Relay restart

Extension reconnects automatically.

### Concurrent requests

Use request IDs and correlation.

Never allow one installation's request to resolve against another
installation.

## 14. Extension Reconnection

Automatically reconnect after:

-   initial startup
-   service-worker restart
-   network interruption
-   relay restart
-   temporary connection failure

Read the installation credential from `chrome.storage.local` on each
service-worker start. Do not ask the user to sign in or connect again merely
because Chrome or the service worker restarted. OAuth authorization through the
browser bridge is required only for first connection, explicit revocation,
cleared/reinstalled extension data, or an expired authorization grant.

Use exponential backoff with reasonable limits.

Expose connection state to the popup/dashboard where useful.

## 15. Local Development

Support local development with a local Hono server and the Plasmo
extension.

The production MCP URL must be configurable and must not be hardcoded
into the extension.

Document the exact development commands.

## 16. Production Deployment

Target:

```text
Hono
  ↓
Cloudflare Worker
  ↓
Durable Objects
```

Production domain:

```text
mcp.tabot.ai
```

Use Wrangler for local development and deployment.

The Worker should be independently deployable from the TanStack Start site.

No Docker or Cloud Run is required.

### Cloudflare configuration

The implementation should define:
- Worker entrypoint
- Durable Object binding
- migrations for the Durable Object class
- environment variables/secrets
- production route/custom domain

Prefer the minimum Cloudflare resources necessary.

Start on the Workers Free plan where possible. If usage or requirements exceed the free allocation, move to the paid Workers plan; do not redesign the architecture.

## 17. Domain

Target:

``` text
mcp.tabot.ai
```

Do not assume DNS already exists.

Document required DNS configuration.

Keep:

``` text
tabot.ai
```

and:

``` text
mcp.tabot.ai
```

as separate deployment concerns.

## 18. Logging / Privacy

Never log browser-history payloads.

Do not log:

-   raw URLs
-   page titles containing user content
-   activity sequences
-   memory text
-   full MCP tool responses
-   query contents unless explicitly required and appropriately
    protected

Operational logs can contain:

``` text
requestId
pseudonymous installation identifier
tool name
latency
status
connection state
error code
```

## 19. Security Requirements

Enforce:

1.  MCP authentication.
2.  Installation authorization.
3.  Request-to-installation binding.
4.  No cross-installation data access.
5.  Installation IDs alone cannot authorize access.
6.  TLS in production.
7.  Bounded request/response sizes.
8.  Request timeouts.
9.  Safe WebSocket lifecycle handling.
10. Browser bridge accepts only a server-created, short-lived, single-use
    transaction proof from the declared Tabot extension and `mcp.tabot.ai`.
11. Durable auth records contain only OAuth/installation-binding metadata,
    never browser context or MCP tool results.
12. No browser-context persistence in relay memory beyond active
    requests/connections.
13. No sensitive data in logs.

Fail closed on ambiguous authentication.

## 20. Implementation Order

### Phase 1 --- Repository inspection

Before writing code:

-   inspect monorepo
-   inspect package manager/workspaces
-   inspect Plasmo architecture
-   inspect local data access
-   inspect privacy/sanitization utilities
-   inspect shared schemas
-   inspect build/deployment conventions

Do not introduce duplicate abstractions.

### Phase 2 --- Durable identity and authorization

Create the Hono Worker plus installation and auth Durable Objects.

Implement:

``` text
GET /health
installation registration and persistent extension credential
OAuth discovery, authorization-code + PKCE flow, token refresh and revocation
short-lived authorization transaction and extension browser bridge
```

Prove a normal same-Chrome OAuth connection binds automatically through the
extension, without typing a code. Prove a normal Chrome/service-worker restart
reconnects with the saved credential and does not show an OAuth screen.

### Phase 3 --- Extension connection

Implement extension → relay WebSocket connection:

-   credential-authenticated connection establishment
-   reconnect from `chrome.storage.local`
-   heartbeat/presence
-   request/response correlation

### Phase 4 --- First tool

Implement only:

``` text
search_context
```

Prove:

``` text
ChatGPT
 ↓
MCP
 ↓
relay
 ↓
extension
 ↓
local Tabot context search
 ↓
privacy sanitization
 ↓
relay
 ↓
ChatGPT
```

Do not build the remaining tools until this works.

### Phase 5 --- Remaining tools

Add:

``` text
get_recent_context
get_current_context
get_memory
```

### Phase 6 --- Authorization verification

Verify that the authenticated ChatGPT connection maps to the installation
selected by the same-browser extension bridge, survives normal Chrome restarts
without user interaction, and cannot access another installation. Verify that
authorization fails when Tabot is unavailable in the Chrome profile.

### Phase 7 --- Production deployment

Deploy the Worker + Durable Objects through Wrangler.

Configure:

``` text
mcp.tabot.ai
```

### Phase 8 --- ChatGPT testing

Test realistic prompts:

``` text
What have I been working on today?

What was I researching about MCP?

What do you know about the Tabot project from my recent browsing?

What were the main threads I explored this morning?

What should I continue researching based on what I was doing?
```

Verify appropriate tool selection and isolation.

## 21. Acceptance Criteria

### Server

-   Hono Worker runs locally.
-   MCP endpoint is reachable over HTTPS in production.
-   MCP tools are discoverable.
-   `/health` works.
-   Worker deploys independently.

### Extension

-   Stable installation ID and credential in `chrome.storage.local`.
-   Authenticated relay connection.
-   Automatic reconnect without an OAuth prompt after Chrome/service-worker restart.
-   Receives MCP-originated requests.
-   Executes requests against local Tabot data.

### MCP

ChatGPT can invoke:

``` text
search_context
get_recent_context
get_current_context
get_memory
```

### Privacy

-   MCP responses pass through intended sanitization.
-   Raw telemetry is not dumped into ChatGPT.
-   Relay does not persist browser history.
-   Logs do not expose browsing content.

### Isolation

-   Installation A cannot access Installation B.
-   Invalid/expired authorization cannot access context.
-   Installation IDs alone cannot authorize access.

### User experience

The user should not need:

-   Node.js
-   terminal
-   Tabot account
-   repeated sign-in when opening Chrome
-   manual MCP config files
-   knowledge of MCP

Target same-browser experience:

``` text
Install Tabot in Chrome
      ↓
In ChatGPT, click Connect Tabot
      ↓
ChatGPT opens Tabot OAuth consent page
      ↓
Installed extension is detected and proves selected installation
      ↓
Click Allow once
      ↓
ChatGPT connected; Chrome reconnects silently on future launches
```

No typed code, Tabot account, terminal, or manual MCP configuration. If Tabot
is unavailable in the Chrome profile completing OAuth, show install/enable
instructions and do not offer a cross-device connection path.

## 22. Definition of Done

The first major milestone is not a polished ChatGPT UI.

It is this verified path:

``` text
User's Chrome
      ↓
Tabot extension
      ↓
local context
      ↓
authenticated relay
      ↓
MCP
      ↓
ChatGPT
```

If a user can click Connect Tabot in ChatGPT, approve the detected local
extension once without entering a code, then ask:

> "What have I been researching recently?"

and ChatGPT retrieves relevant local Tabot context through MCP without a
manual export, the fundamental `v0.2.0` architecture is proven.

Only after this works should implementation expand into richer onboarding,
dashboard CTAs, notifications, and ChatGPT UX. Cross-device connection is out
of scope for this milestone.
