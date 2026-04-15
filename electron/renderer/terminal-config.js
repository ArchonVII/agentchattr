"use strict";

// Terminal Configuration — stores macros, commands, and quick launch settings.
// Theme presets now live in terminal-themes.js.
// In a real app, this could be persisted via electron-store.

const DEFAULT_MACROS = [
  { label: "Git Status", command: "git status\n", color: "blue" },
  { label: "NPM Start", command: "npm start\n", color: "green" },
  { label: "Clear", command: "clear\n", color: "red" },
  {
    label: "TUI Dashboard",
    command: "cd C:\\AI\\JAgentchattr; npx tsx tui/dashboard.jsx\n",
    color: "blue",
  },
];

const DEFAULT_COMMANDS = [
  {
    category: "CLI Skills",
    items: [
      { name: "Code Review", cmd: "/code-review\n" },
      { name: "Skill Scan", cmd: "/skill-scan\n" },
      { name: "PR Writer", cmd: "/pr-writer\n" },
    ],
  },
  {
    category: "Git",
    items: [
      { name: "Push to Main", cmd: "git push origin main\n" },
      { name: "Fetch & Rebase", cmd: "git fetch && git rebase\n" },
      { name: "Log Graph", cmd: "git log --oneline --graph --all\n" },
    ],
  },
];

window.TerminalConfig = {
  macros: DEFAULT_MACROS,
  commands: DEFAULT_COMMANDS,
  quickLaunch: {
    folders: [
      // "C:/Users/josep/path/to/repo-one",
      // "C:/Users/josep/path/to/repo-two",
    ],
  },
};
