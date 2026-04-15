const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_QUICK_LAUNCH_FOLDERS,
  addQuickLaunchFolder,
  normaliseQuickLaunchState,
} = require("../renderer/quick-launch-state.js");

test("normaliseQuickLaunchState dedupes folders, caps the list, and fixes selection", () => {
  const state = normaliseQuickLaunchState({
    folders: [
      "C:/repo-one",
      "C:/repo-two",
      "C:/repo-one",
      "",
      "C:/repo-three",
      "C:/repo-four",
      "C:/repo-five",
      "C:/repo-six",
    ],
    selectedFolder: "C:/missing",
  });

  assert.equal(MAX_QUICK_LAUNCH_FOLDERS, 5);
  assert.deepEqual(state.folders, [
    "C:/repo-one",
    "C:/repo-two",
    "C:/repo-three",
    "C:/repo-four",
    "C:/repo-five",
  ]);
  assert.equal(state.selectedFolder, "C:/repo-one");
});

test("addQuickLaunchFolder selects a new folder and ignores duplicate additions", () => {
  const initialState = normaliseQuickLaunchState({
    folders: ["C:/repo-one", "C:/repo-two"],
    selectedFolder: "C:/repo-one",
  });

  const withNewFolder = addQuickLaunchFolder(initialState, "C:/repo-three");
  assert.deepEqual(withNewFolder.folders, [
    "C:/repo-one",
    "C:/repo-two",
    "C:/repo-three",
  ]);
  assert.equal(withNewFolder.selectedFolder, "C:/repo-three");

  const withDuplicate = addQuickLaunchFolder(withNewFolder, "C:/repo-two");
  assert.deepEqual(withDuplicate.folders, withNewFolder.folders);
  assert.equal(withDuplicate.selectedFolder, "C:/repo-two");
});
