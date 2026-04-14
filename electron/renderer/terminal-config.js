"use strict";

// Terminal Configuration — stores macros, commands, and theme presets.
// In a real app, this could be persisted via electron-store.

const DEFAULT_MACROS = [
  { label: "Git Status", command: "git status\n", color: "blue" },
  { label: "NPM Start", command: "npm start\n", color: "green" },
  { label: "Clear", command: "clear\n", color: "red" },
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

const THEME_PRESETS = {
  default: {
    background: "#12121e",
    foreground: "#e0e0e0",
    cursor: "#da7756",
  },
  cyberpunk: {
    background: "#000b1e",
    foreground: "#00ff9f",
    cursor: "#f0f",
  },
  matrix: {
    background: "#0d0208",
    foreground: "#00ff41",
    cursor: "#00ff41",
  },
  dracula: {
    background: "#282a36",
    foreground: "#f8f8f2",
    cursor: "#ff79c6",
  },
};

window.TerminalConfig = {
  macros: DEFAULT_MACROS,
  commands: DEFAULT_COMMANDS,
  themes: THEME_PRESETS,
  quickLaunch: {
    folders: [
      // "C:/Users/josep/path/to/repo-one",
      // "C:/Users/josep/path/to/repo-two",
    ],
  },
};
