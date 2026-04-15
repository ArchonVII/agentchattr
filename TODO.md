# TODO

- Visually verify the two-column ports lattice layout and user-port classification with real dev servers running.
- Decide whether the Windows desktop smoke coverage should remain local-only or move into CI.
- Add browser status/readback primitives if agents need more than open/dock/pop-out URL control.
- Consider adding port history timeline view (currently tracked in memory but not rendered).
- Smoke test terminal scanning and embedded terminals end-to-end in the Electron app.
- Implement AI-driven "Ghost Text" suggestions in the terminal based on agent history.
- Implement "Quick Look" side-panel "file-pane" for terminal file links (currently opens externally).
- Inject custom PowerShell prompt with agent status for deeper shell integration.
- Persist Quick Launch folders and custom macros to `electron-store` (currently in-memory only).
- Add ability to remove or reorder folders in the Quick Launch bar.
- Implement "AI Lens" for terminal output: auto-correction suggestions on non-zero exit codes.
