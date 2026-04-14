"use strict";

// Terminal presence bridge — forwards terminal data from the Electron
// renderer to the chat webview so the presence panel can render it.

function initTerminalPresence(chatWebview, electronAPI) {
  if (!electronAPI?.onTerminalData) return;

  electronAPI.onTerminalData((terminals) => {
    if (!chatWebview) return;

    // Inject the terminal data into the webview's global scope.
    // The chat.js renderChannelRoster() reads window._terminalData.
    const script = `
      (() => {
        try {
          window._terminalData = ${JSON.stringify(terminals)};
          if (typeof window.renderChannelRoster === 'function') {
            window.renderChannelRoster();
          }
        } catch (e) {
          console.warn('Terminal presence injection failed:', e);
        }
      })();
    `;

    try {
      chatWebview.executeJavaScript(script, true);
    } catch {
      // Webview may not be ready yet — non-fatal
    }
  });
}

window.TerminalPresence = { init: initTerminalPresence };
