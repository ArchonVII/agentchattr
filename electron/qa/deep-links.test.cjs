const test = require("node:test");
const assert = require("node:assert/strict");

const { extractDeepLinkUrl, parseDeepLink } = require("../deep-links.js");

test("extractDeepLinkUrl returns the first deep-link argument", () => {
  assert.equal(
    extractDeepLinkUrl([
      "electron.exe",
      ".",
      "agentchattr://channel/reviews",
      "agentchattr://port/8300",
    ]),
    "agentchattr://channel/reviews",
  );
});

test("parseDeepLink recognises channel, agent, and port payloads", () => {
  assert.deepEqual(parseDeepLink("agentchattr://channel/reviews"), {
    type: "channel",
    value: "reviews",
  });
  assert.deepEqual(parseDeepLink("agentchattr://agent/codex"), {
    type: "agent",
    value: "codex",
  });
  assert.deepEqual(parseDeepLink("agentchattr://port/8300"), {
    type: "port",
    value: 8300,
  });
});

test("parseDeepLink rejects malformed or empty payloads", () => {
  assert.equal(parseDeepLink("https://example.com"), null);
  assert.equal(parseDeepLink("agentchattr://channel/"), null);
  assert.equal(parseDeepLink("agentchattr://port/not-a-number"), null);
});
