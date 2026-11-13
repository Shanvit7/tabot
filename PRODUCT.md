Tabot

Product purpose

Tabot turns activity in Chrome into a usable data layer for AI-assisted work. The aim is to help people use what they have been doing in their browser as context for their AI assistant, so they can get things done without repeatedly gathering links, copying information, and explaining their work from scratch.

Tabot is in early beta. The current product provides part of this foundation; the broader context and automation experience is the direction we are building toward, not a claim that everything already works.

Positioning

Tabot is the browser activity layer for your AI assistant.

Chrome history already helps people find pages. Tabot's intended value is not another search bar. It is making browser activity usable beyond the browser: collecting relevant evidence, organizing it into useful context, and making that context available to an assistant for work the user wants to do.

Search, notes, and excerpts are useful entry points and building blocks. They are not the whole product identity. The longer-term value is the connection between what someone does in Chrome and what their assistant can help them accomplish.

Privacy and local storage support this experience; they are not the primary product pitch. Tabot is not a privacy utility, employee-monitoring tool, or productivity scorecard.

Users and their problem

People whose work spans Chrome and an AI assistant, including office workers, finance and admin teams, operators, researchers, and founders.

Their work is scattered across pages, sites, documents, and browsing sessions. An assistant usually sees only what they manually bring into a conversation. The user has to rebuild context before the assistant can help. Tabot aims to reduce that repeated handoff and make browser activity a reusable input to their work.

The user is a person doing work, not a digital worker or AI agent. Write for non-technical people and explain value through tasks they recognize.

Product direction

Collect browser activity and relevant evidence. Organize it into contexts that people can inspect and use. Let users bring those contexts into their assistant to ask questions, continue work, and produce useful outputs. Build toward user-directed workflows and automations that reuse this data layer.

A context should connect relevant browsing evidence into something useful for a task, rather than expose a pile of raw events. An automation should use authorized context to help carry out a user-chosen workflow. These describe the intended experience, not a promise that the beta currently understands tasks or executes workflows.

Illustrative future uses include bringing research from several browsing sessions into a brief, preparing a handoff from reviewed material and notes, or reusing a recurring set of browser evidence in a repeatable workflow. Treat these as use cases to build and validate, not shipped features or proven outcomes.

Current beta

Built: the Chrome extension, searchable web dashboard, saved page notes and excerpts, and eight read-only ChatGPT tools. Users can find retained pages, review notes and excerpts locally, and connect ChatGPT to ask about supported browser activity or request saved notes.

The current dashboard supports search and review. The popup supports current-page notes and recording controls. These surfaces provide access to the underlying data; they do not define the ceiling of the product.

The beta does not provide a complete task-context workspace, assistant-driven browser actions, or an automation engine. Existing internal context derivation does not establish that the intended user-facing context experience is complete. ChatGPT is the current integration; broader assistant support is a direction, not an availability claim. Local search and review remain usable without connecting an assistant.

Priorities and success

Deepen the path from collected activity to useful context to assistant-assisted outcomes. Improve evidence quality and retrieval, make contexts understandable and reusable, and validate real workflows before expanding automation.

Judge features by whether they reduce manual context gathering or help someone complete meaningful work with their assistant. Finding a page is an enabling step, not the final measure of the product's value. More captured events, more dashboards, or a larger list of tools are not outcomes by themselves.

Messaging and terminology

Vision description: Tabot turns your browser activity into context your AI assistant can use to help you get work done.

Beta description: Tabot collects browser activity, lets you review saved pages and notes, and connects ChatGPT to supported activity and note results. We are building toward reusable contexts and user-directed automations.

Lead with the connection between browser activity and getting work done with an assistant. Explain the available beta honestly, then distinguish what is coming next. Do not reduce the product to browser recall or lead with privacy warnings and storage mechanics.

Contexts and automations are valid product concepts when their meaning is clear. Do not label raw events as contexts or imply that planned automations already run. Keep implementation terms such as embeddings and derivation out of everyday UI copy. Never present raw event counts as activities, actions, or visits. Do not claim complete capture, reliable task understanding, autonomous execution, or guaranteed answers without implemented and verified support.

This positioning supersedes the earlier privacy-led and browser-recall-only descriptions. It does not remove security, consent, or data-loss safeguards.

Technical foundation

React, TypeScript, TanStack Start, Tailwind CSS, and Plasmo. The Chrome extension and web dashboard share types and logic in a pnpm monorepo.

The dashboard reads the extension's local TalaDB database through validated messaging. An OAuth-secured Cloudflare MCP relay connects ChatGPT to the running extension over WebSocket and returns requested, filtered results. The relay stores connection and authorization state, not browser history or tool results.

Search uses local full-text and vector indexes, with a small, quantized embedding model running on-device in a separate worker. Keyword search remains available when embeddings are unavailable. Long result lists are virtualized. Chrome events are collected in batches of up to 128 and saved one batch at a time, with up to three attempts per automatic retry cycle for temporary write failures. These are implementation choices, not measured production-scale claims.

Current data and action boundaries

Browser history, notes, excerpts, indexes, and embeddings stay on-device. Authorized assistant requests return selected results, not the history database. Users can also explicitly export data.

Current activity and site results omit raw event rows, page titles, paths, and excerpt bodies. Requested note text and titles can leave the device after selected sensitive-pattern filtering. Automatic excerpts remain local. Filtering does not guarantee removal of every sensitive detail. Notes remain as written in local storage.

Tabot does not record typed input, form values, screenshots, or full-page snapshots. Browsing evidence is not proof of intent or productivity. Future automation must have explicit authorization and clear action boundaries; captured page content must never grant permission to act.

Status and evidence

Early beta, still in progress, with no production user or traffic numbers. Release is planned within a week of this positioning update; verify timing before using it in public copy. Do not invent customers, testimonials, benchmarks, completed workflows, or measured productivity gains.

Source of truth

This file guides product direction and content across the codebase: landing pages, onboarding, extension copy, dashboard, assistant setup, documentation, and future features. Lead with browser activity as a data layer for AI-assisted work. Keep the distinction between current beta capabilities and the longer-term vision explicit.

Use docs/system.md, docs/tech.md, docs/data-flow.md, and current code to establish implementation facts. Older recall-first messaging should not constrain the product direction; the new direction must not be used as proof that planned capabilities already exist.

GitHub: https://github.com/Shanvit7/tabot
