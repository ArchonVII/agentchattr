"use strict";

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Source: design spec Section 6 — line buffer flush timeout.
const FLUSH_TIMEOUT_MS = 500;

// Source: design spec Section 6 — max buffer size per terminal before forced flush.
const MAX_BUFFER_BYTES = 8192;

// Source: design spec Section 6 — dedup window for identical matches.
const DEDUP_WINDOW_MS = 2000;

// Source: design spec Section 6 — burst limit per terminal.
const BURST_LIMIT = 10;

// Source: design spec Section 6 — burst window duration.
const BURST_WINDOW_MS = 30000;

// Source: design spec Section 4 — snapshot ring buffer size.
const SNAPSHOT_MAX_LINES = 500;

// ANSI escape sequence regex — strips colours, cursor movements, etc.
// Source: well-known ANSI escape pattern (CSI sequences + OSC sequences).
const ANSI_REGEX = /\x1b(?:\[[0-9;]*[A-Za-z]|\][^\x07]*\x07|\[[0-9;]*m)/g;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripAnsi(str) {
  return str.replace(ANSI_REGEX, "");
}

/**
 * Ring buffer that stores the last N lines of ANSI-stripped text
 * for snapshot retrieval.
 */
class RingBuffer {
  constructor(capacity) {
    this._buf = new Array(capacity);
    this._capacity = capacity;
    this._writeIndex = 0;
    this._count = 0;
  }

  push(line) {
    this._buf[this._writeIndex] = line;
    this._writeIndex = (this._writeIndex + 1) % this._capacity;
    if (this._count < this._capacity) this._count++;
  }

  /** Return the last `n` lines in chronological order. */
  last(n) {
    const count = Math.min(n, this._count);
    const result = [];
    let readIndex =
      (this._writeIndex - count + this._capacity) % this._capacity;
    for (let i = 0; i < count; i++) {
      result.push(this._buf[readIndex]);
      readIndex = (readIndex + 1) % this._capacity;
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// WatcherEngine
// ---------------------------------------------------------------------------

class WatcherEngine {
  /**
   * @param {string} rulesPath - Absolute path to watcher-rules.json
   * @param {object} [options]
   * @param {number} [options.dedupWindowMs] - Dedup window in ms
   * @param {number} [options.burstLimit] - Max events per burst window
   * @param {number} [options.burstWindowMs] - Burst window duration in ms
   */
  constructor(rulesPath, options = {}) {
    this._rulesPath = rulesPath;
    this._dedupWindowMs = options.dedupWindowMs ?? DEDUP_WINDOW_MS;
    this._burstLimit = options.burstLimit ?? BURST_LIMIT;
    this._burstWindowMs = options.burstWindowMs ?? BURST_WINDOW_MS;

    // Per-terminal state
    this._lineBuffers = new Map(); // terminalId -> { partial: string, timer: timeout }
    this._contextBuffers = new Map(); // terminalId -> RingBuffer (last 5 lines for context)
    this._snapshotBuffers = new Map(); // terminalId -> RingBuffer (last 500 lines)
    this._dedupCache = new Map(); // key -> timestamp
    this._burstCounters = new Map(); // terminalId -> { count, windowStart }

    // Compiled rules
    this._rules = [];
    this._matchCallback = null;

    this._loadRules();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Register a callback for match events.
   * @param {function} callback - Called with (event) on each match
   */
  onMatch(callback) {
    this._matchCallback = callback;
  }

  /**
   * Feed raw PTY data for a terminal. Buffers partial lines and scans
   * completed lines against active rules.
   * @param {string} terminalId
   * @param {string} rawData
   * @param {object} terminalMeta - { name, agentName }
   */
  scan(terminalId, rawData, terminalMeta = {}) {
    const stripped = stripAnsi(rawData);
    let state = this._lineBuffers.get(terminalId);
    if (!state) {
      state = { partial: "", timer: null };
      this._lineBuffers.set(terminalId, state);
    }

    // Clear any pending flush timer since new data arrived
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }

    state.partial += stripped;

    // Extract complete lines
    const lines = state.partial.split(/\r?\n/);
    state.partial = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim().length > 0) {
        this._processLine(terminalId, line, terminalMeta);
      }
    }

    // Force flush if buffer is too large
    if (Buffer.byteLength(state.partial, "utf8") > MAX_BUFFER_BYTES) {
      if (state.partial.trim().length > 0) {
        this._processLine(terminalId, state.partial, terminalMeta);
      }
      state.partial = "";
    }

    // Set inactivity flush timer for partial data (handles prompts)
    if (state.partial.length > 0) {
      state.timer = setTimeout(() => {
        if (state.partial.trim().length > 0) {
          this._processLine(terminalId, state.partial, terminalMeta);
        }
        state.partial = "";
        state.timer = null;
      }, FLUSH_TIMEOUT_MS);
    }
  }

  /**
   * Get snapshot of recent terminal output (ANSI-stripped).
   * @param {string} terminalId
   * @param {number} [lineCount=50]
   * @returns {string[]}
   */
  getSnapshot(terminalId, lineCount = 50) {
    const buf = this._snapshotBuffers.get(terminalId);
    if (!buf) return [];
    return buf.last(lineCount);
  }

  /**
   * Get current rules (for settings UI).
   * @returns {object[]}
   */
  getRules() {
    return JSON.parse(JSON.stringify(this._rules));
  }

  /**
   * Update rules and persist to disk.
   * @param {object[]} rules
   */
  setRules(rules) {
    this._rules = rules;
    this._compileRules();
    this._persistRules();
  }

  /**
   * Clean up state for a closed terminal.
   * @param {string} terminalId
   */
  removeTerminal(terminalId) {
    const state = this._lineBuffers.get(terminalId);
    if (state && state.timer) clearTimeout(state.timer);
    this._lineBuffers.delete(terminalId);
    this._contextBuffers.delete(terminalId);
    this._snapshotBuffers.delete(terminalId);
    this._burstCounters.delete(terminalId);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  _loadRules() {
    // If the runtime rules file doesn't exist, seed from shipped defaults.
    if (!fs.existsSync(this._rulesPath)) {
      const defaultsPath = path.join(__dirname, "default-watcher-rules.json");
      try {
        // Ensure data/ directory exists
        const dir = path.dirname(this._rulesPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(defaultsPath, this._rulesPath);
      } catch (err) {
        console.warn(
          "WatcherEngine: failed to seed default rules:",
          err.message,
        );
      }
    }

    try {
      const raw = fs.readFileSync(this._rulesPath, "utf8");
      const data = JSON.parse(raw);
      this._rules = data.rules || [];
    } catch (err) {
      console.warn("WatcherEngine: failed to load rules:", err.message);
      this._rules = [];
    }
    this._compileRules();
  }

  _compileRules() {
    for (const rule of this._rules) {
      try {
        rule._compiled = new RegExp(rule.pattern, "i");
      } catch (err) {
        console.warn(
          `WatcherEngine: invalid regex for rule ${rule.id}:`,
          err.message,
        );
        rule._compiled = null;
      }
    }
  }

  _persistRules() {
    const output = this._rules.map((r) => {
      const { _compiled, ...clean } = r;
      return clean;
    });
    try {
      fs.writeFileSync(
        this._rulesPath,
        JSON.stringify({ rules: output }, null, 2),
        "utf8",
      );
    } catch (err) {
      console.warn("WatcherEngine: failed to persist rules:", err.message);
    }
  }

  _processLine(terminalId, line, terminalMeta) {
    // Add to snapshot buffer
    let snapBuf = this._snapshotBuffers.get(terminalId);
    if (!snapBuf) {
      snapBuf = new RingBuffer(SNAPSHOT_MAX_LINES);
      this._snapshotBuffers.set(terminalId, snapBuf);
    }
    snapBuf.push(line);

    // Add to context buffer (small rolling window for match context)
    let ctxBuf = this._contextBuffers.get(terminalId);
    if (!ctxBuf) {
      // Source: 5 lines of context around matches — reasonable default.
      ctxBuf = new RingBuffer(5);
      this._contextBuffers.set(terminalId, ctxBuf);
    }
    ctxBuf.push(line);

    // Scan against enabled rules (sorted by priority)
    if (!this._matchCallback) return;

    for (const rule of this._rules) {
      if (!rule.enabled || !rule._compiled) continue;

      const match = rule._compiled.exec(line);
      if (!match) continue;

      // Dedup check
      const dedupKey = `${terminalId}:${rule.id}:${this._hashString(line)}`;
      const now = Date.now();
      const lastSeen = this._dedupCache.get(dedupKey);
      if (lastSeen && now - lastSeen < this._dedupWindowMs) continue;
      this._dedupCache.set(dedupKey, now);

      // Burst check
      if (!this._checkBurst(terminalId)) continue;

      const event = {
        terminalId,
        terminalName: terminalMeta.name || terminalId,
        agentName: terminalMeta.agentName || null,
        ruleId: rule.id,
        category: rule.category,
        matchedText: line,
        contextLines: ctxBuf.last(5),
        timestamp: now,
      };

      this._matchCallback(event);

      // Only fire the first matching rule per line
      break;
    }

    // Prune stale dedup entries periodically
    if (Math.random() < 0.01) this._pruneDedup();
  }

  _checkBurst(terminalId) {
    const now = Date.now();
    let counter = this._burstCounters.get(terminalId);
    if (!counter || now - counter.windowStart > this._burstWindowMs) {
      counter = { count: 0, windowStart: now, overflowLogged: false };
      this._burstCounters.set(terminalId, counter);
    }
    counter.count++;

    if (counter.count > this._burstLimit) {
      // Log overflow once per window
      if (!counter.overflowLogged && this._matchCallback) {
        counter.overflowLogged = true;
        this._matchCallback({
          terminalId,
          terminalName: "",
          agentName: null,
          ruleId: "builtin-burst-overflow",
          category: "system",
          matchedText: `Rate limit reached — suppressing further events for ${Math.round(this._burstWindowMs / 1000)}s`,
          contextLines: [],
          timestamp: now,
        });
      }
      return false;
    }
    return true;
  }

  /** Simple string hash for dedup keys. */
  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      hash = ((hash << 5) - hash + ch) | 0;
    }
    return hash.toString(36);
  }

  _pruneDedup() {
    const now = Date.now();
    for (const [key, ts] of this._dedupCache) {
      if (now - ts > this._dedupWindowMs * 2) {
        this._dedupCache.delete(key);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { WatcherEngine, stripAnsi, RingBuffer };
