(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BrowserPaneState = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createBrowserPaneState() {
    return {
      visible: false,
      url: "",
      requestedBy: "",
    };
  }

  function normaliseBrowserUrl(urlString) {
    if (typeof urlString !== "string" || !urlString.trim()) {
      return null;
    }

    try {
      const parsed = new URL(urlString);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return null;
      }
      return parsed.toString();
    } catch (_error) {
      return null;
    }
  }

  function normaliseBrowserTarget(target) {
    if (target === undefined || target === null || target === "") {
      return "docked";
    }
    if (target === "docked" || target === "window") {
      return target;
    }
    return null;
  }

  function reduceBrowserCommand(state, payload) {
    const current = state || createBrowserPaneState();
    const target = normaliseBrowserTarget(payload?.target);
    const url = normaliseBrowserUrl(payload?.url || "");

    if (!target || !url || payload?.command !== "browser_open") {
      return {
        state: current,
        effect: null,
        error: "invalid_command",
      };
    }

    if (target === "window") {
      return {
        state: current,
        effect: { type: "popout", url },
        error: null,
      };
    }

    return {
      state: {
        visible: true,
        url,
        requestedBy: typeof payload?.requested_by === "string" ? payload.requested_by : "",
      },
      effect: null,
      error: null,
    };
  }

  function popoutBrowserPane(state) {
    const current = state || createBrowserPaneState();
    if (!current.url) {
      return { state: current, effect: null };
    }
    return {
      state: current,
      effect: { type: "popout", url: current.url },
    };
  }

  function closeBrowserPane(state) {
    const current = state || createBrowserPaneState();
    return {
      visible: false,
      url: current.url || "",
      requestedBy: current.requestedBy || "",
    };
  }

  return {
    createBrowserPaneState,
    normaliseBrowserTarget,
    reduceBrowserCommand,
    popoutBrowserPane,
    closeBrowserPane,
  };
});
