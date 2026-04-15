"use strict";

const MAX_QUICK_LAUNCH_FOLDERS = 5;

function normaliseFolderList(folders) {
  if (!Array.isArray(folders)) return [];

  const seen = new Set();
  const result = [];

  for (const folder of folders) {
    if (typeof folder !== "string") continue;
    const trimmed = folder.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= MAX_QUICK_LAUNCH_FOLDERS) break;
  }

  return result;
}

function normaliseQuickLaunchState(state) {
  const folders = normaliseFolderList(state?.folders);
  const selectedFolder =
    typeof state?.selectedFolder === "string" &&
    folders.includes(state.selectedFolder)
      ? state.selectedFolder
      : (folders[0] ?? null);

  return {
    folders,
    selectedFolder,
  };
}

function addQuickLaunchFolder(state, folder) {
  const normalisedState = normaliseQuickLaunchState(state);
  if (typeof folder !== "string" || !folder.trim()) {
    return normalisedState;
  }

  const trimmedFolder = folder.trim();
  const folders = normalisedState.folders.includes(trimmedFolder)
    ? normalisedState.folders
    : [...normalisedState.folders, trimmedFolder].slice(
        0,
        MAX_QUICK_LAUNCH_FOLDERS,
      );

  return normaliseQuickLaunchState({
    folders,
    selectedFolder: trimmedFolder,
  });
}

module.exports = {
  MAX_QUICK_LAUNCH_FOLDERS,
  addQuickLaunchFolder,
  normaliseQuickLaunchState,
};
