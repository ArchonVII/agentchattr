# Web UI Decomposition Plan

> **For agentic workers:** Execute this in small PRs. Do not mix architecture setup, subsystem extraction, and UI framework adoption in the same change unless a step explicitly calls for it.

**Goal:** Reduce maintenance cost in the browser chat app by shrinking `static/chat.js`, removing inline DOM handlers from `static/index.html`, and replacing `window.*` bridges with explicit module boundaries before any broader component migration.

**Architecture:** Keep small platform-style modules in plain JavaScript (`core.js`, `store.js`, `chat-theme.js`, `repository.js`). Introduce an app-shell state boundary for shared browser state, move large stateful surfaces out of `chat.js` into owned modules, and only then adopt components for the highest-friction UI areas (timeline/composer, channels/sidebar, jobs).

**Tech Stack:** Existing browser app under `static/`, existing `Hub` and `Store` transition utilities, existing Python tests, optional React for later stateful UI surfaces only after the raw-JS boundaries are stable.

---

## File Map

### Keep as raw JS

| File | Responsibility |
|------|----------------|
| `static/core.js` | Event hub / pub-sub bridge |
| `static/store.js` | Minimal shared state/watch API |
| `static/chat-theme.js` | Theme token translation and CSS variable application |
| `static/repository.js` | Self-contained repository view panel |

### Primary decomposition targets

| File | Current problem |
|------|-----------------|
| `static/chat.js` | Owns app bootstrap, websocket flow, message rendering, roster/presence, help, sidebar controls, markdown, scrolling, and multiple `window.*` exports |
| `static/index.html` | Still contains many inline handlers that couple markup to globals |
| `static/channels.js` | Reads shared state through `window.*` and owns a high-interaction sidebar/tab surface |
| `static/jobs.js` | Large stateful panel with drag/drop, unread state, reply targeting, and conversation rendering |
| `static/launcher.js` | Reads app state through globals and mixes panel state with server I/O |
| `static/sessions.js` | Reads active channel/session state through globals and injects timeline actions |

### Planned supporting files

| File | Responsibility |
|------|----------------|
| `static/app-shell.js` | Shared browser state boundary and public app API for extracted modules |
| `static/chat-timeline.js` | Message list rendering, scroll anchor logic, message-specific event wiring |
| `static/chat-composer.js` | Input area, mentions, schedule popover, send flow, attachments, mic wiring |
| `static/presence.js` | Presence panel and runtime roster rendering |
| `static/ui-actions.js` | Central delegated DOM event handlers replacing inline `onclick`/`onchange` attributes |

---

## Phase 1 - Stabilise Boundaries

**Files:**
- Create: `static/app-shell.js`
- Modify: `static/chat.js`
- Modify: `static/index.html`

This phase replaces implicit global ownership with an explicit app boundary.

- [ ] Inventory all state and helper exports currently assigned onto `window` in `static/chat.js`.
- [ ] Create `static/app-shell.js` as the single read/write API for shared browser state such as active channel, agent config/status, channel metadata, rules, ports, and terminal data.
- [ ] Move bootstrap wiring in `static/chat.js` to consume `app-shell.js` instead of assigning new globals.
- [ ] Remove direct dependence on inline HTML handlers for migrated controls by registering delegated listeners from startup code.
- [ ] Preserve compatibility shims only where extracted modules still need them, and document each shim with a removal owner.

**Exit criteria:**
- `static/index.html` no longer requires inline handlers for the migrated controls in this phase.
- New shared state is readable through `app-shell.js` rather than ad hoc `window.*` access.

---

## Phase 2 - Split Timeline and Composer

**Files:**
- Create: `static/chat-timeline.js`
- Create: `static/chat-composer.js`
- Modify: `static/chat.js`
- Modify: `static/index.html`

This phase attacks the highest-risk concentration point first: the core chat surface.

- [ ] Extract message rendering and scroll behavior from `static/chat.js` into `static/chat-timeline.js`.
- [ ] Extract composer behavior from `static/chat.js` into `static/chat-composer.js`, including send flow, mentions, attachments, schedule popover, and voice toggle integration.
- [ ] Keep websocket message ingress in one place while routing render/update behavior into the new modules.
- [ ] Replace direct global invocations such as `window.appendMessage` and `window.scrollToBottom` with module APIs exposed through the app shell.
- [ ] Add targeted regression checks for timeline rendering and composer actions.

**Exit criteria:**
- `static/chat.js` no longer owns message rendering or composer behavior directly.
- Reviewer-visible `chat.js` line count drops materially after this phase.

---

## Phase 3 - Extract Presence, Help, and Sidebar Chrome

**Files:**
- Create: `static/presence.js`
- Modify: `static/chat.js`
- Modify: `static/index.html`

This phase removes secondary UI surfaces that still force `chat.js` to act like the page controller.

- [ ] Move roster rendering, runtime participant tracking integration, and sidebar collapse behavior into `static/presence.js`.
- [ ] Move help/tutorial toggles and supporting UI actions out of `chat.js`.
- [ ] Replace remaining sidebar-related global exports with module-local handlers wired through delegated events.
- [ ] Keep DOM IDs stable to avoid unnecessary CSS/test churn.

**Exit criteria:**
- `chat.js` no longer exports UI toggles for help or sidebars.
- Presence panel behavior is owned by its own module.

---

## Phase 4 - Decouple Existing Side Modules From Globals

**Files:**
- Modify: `static/channels.js`
- Modify: `static/jobs.js`
- Modify: `static/launcher.js`
- Modify: `static/sessions.js`
- Modify: `static/app-shell.js`

The extracted files already exist, but they still depend heavily on `window.*`.

- [ ] Refactor `channels.js` to read active channel, channel list, and project context through `app-shell.js`.
- [ ] Refactor `jobs.js` to consume explicit app APIs for agent config, markdown rendering, channel state, and sound helpers.
- [ ] Refactor `launcher.js` and `sessions.js` to use app-shell state and explicit helpers instead of ambient globals.
- [ ] Delete compatibility bridges that become unused after each subsystem is switched over.

**Exit criteria:**
- The module headers for `channels.js`, `jobs.js`, `launcher.js`, and `sessions.js` no longer need to document broad `Reads from window:` dependencies.

---

## Phase 5 - Introduce Components Only Where They Pay Off

**Files:**
- Target: timeline/composer first
- Next: channels/sidebar
- Then: jobs

Only start this phase once the raw-JS boundaries are already stable.

- [ ] Choose the component runtime for stateful surfaces only after Phases 1-4 have landed cleanly.
- [ ] Migrate the timeline/composer surface first because it has the highest rendering/state churn.
- [ ] Migrate channels/sidebar second because it is interactive but bounded.
- [ ] Migrate jobs third because it is large and stateful but already isolated as a panel.
- [ ] Leave `core.js`, `store.js`, `chat-theme.js`, and `repository.js` in plain JS unless they materially grow.

**Exit criteria:**
- Component adoption is incremental and does not reintroduce parallel state systems.

---

## Validation

- [ ] Run `pytest tests/test_room_sidebar_ui.py` after shell/sidebar-related changes.
- [ ] Keep existing browser-facing smoke checks passing for any touched subsystem.
- [ ] Add focused tests when a subsystem is extracted instead of relying only on manual verification.
- [ ] Measure `static/chat.js` line count after each phase and treat a flat count as a signal that the extraction boundary is weak.

---

## PR Sequence

1. `docs(ui): add web ui decomposition plan`
2. `ref(web): add app-shell boundary and remove first inline handlers`
3. `ref(chat): extract timeline and composer modules`
4. `ref(chat): extract presence and shell chrome`
5. `ref(channels): switch channels to app-shell`
6. `ref(jobs): switch jobs to app-shell`
7. `ref(launcher): switch launcher and sessions to app-shell`
8. `ref(web): remove obsolete globals and remaining compatibility bridges`

---

## Non-Goals

- Full Electron renderer rewrite
- Theme system rewrite
- Converting every browser utility to a framework component
- Replacing stable raw-JS panels that are already small and isolated
