/* static/repository.js */

'use strict';

const Repository = (() => {
  let currentPath = '';
  let isActive = false;
  let editedFiles = new Map(); // path -> { agent, time, color }

  function init() {
    const viewChatBtn = document.getElementById('view-chat-btn');
    const viewRepoBtn = document.getElementById('view-repo-btn');
    const refreshBtn = document.getElementById('refresh-repo-btn');
    const spawnBtn = document.getElementById('spawn-agent-repo-btn');

    if (viewChatBtn) viewChatBtn.onclick = () => showView('chat');
    if (viewRepoBtn) viewRepoBtn.onclick = () => showView('repo');
    if (refreshBtn) refreshBtn.onclick = refreshRepo;
    if (spawnBtn) spawnBtn.onclick = spawnAgent;

    // Listen for agent messages to detect file edits
    Hub.on('message', (msg) => {
      if (msg.type === 'message' && msg.data) {
          const m = msg.data;
          if (m.type === 'chat' && m.sender !== 'user') {
            detectFileEdit(m);
          }
      }
    });

    // Listen for status updates to refresh agent list
    Hub.on('status', () => {
        if (isActive) renderActiveAgents();
    });

    // Initial fetch of settings to get default path
    fetchSettings();
  }

  async function fetchSettings() {
      try {
          const res = await fetch('/api/settings');
          if (res.ok) {
              const settings = await res.json();
              currentPath = settings.default_cwd || '.';
          }
      } catch (err) {
          console.error('Failed to fetch settings:', err);
      }
  }

  function showView(view) {
    const chatBtn = document.getElementById('view-chat-btn');
    const repoBtn = document.getElementById('view-repo-btn');
    const timeline = document.getElementById('timeline');
    const presence = document.getElementById('presence-panel');
    const repoScreen = document.getElementById('repository-screen');

    if (view === 'repo') {
      isActive = true;
      chatBtn.classList.remove('active');
      repoBtn.classList.add('active');
      timeline.classList.add('hidden');
      if (presence) presence.classList.add('hidden');
      repoScreen.classList.remove('hidden');
      
      refreshRepo();
    } else {
      isActive = false;
      chatBtn.classList.add('active');
      repoBtn.classList.remove('active');
      timeline.classList.remove('hidden');
      if (presence) presence.classList.remove('hidden');
      repoScreen.classList.add('hidden');
    }
  }

  async function refreshRepo() {
    if (!currentPath) await fetchSettings();
    if (!currentPath) return;
    
    document.getElementById('repo-path').textContent = currentPath;

    try {
      const [statusRes, filesRes] = await Promise.all([
        fetch(`/api/repo/status?path=${encodeURIComponent(currentPath)}`),
        fetch(`/api/repo/files?path=${encodeURIComponent(currentPath)}`)
      ]);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        renderStatus(statusData);
      } else {
        const errData = await statusRes.json();
        renderStatus({ error: errData.error || 'Failed to get status' });
      }

      if (filesRes.ok) {
        const filesData = await filesRes.json();
        renderTree(filesData);
      }
      
      renderActiveAgents();
    } catch (err) {
      console.error('Failed to refresh repo:', err);
    }
  }

  function renderStatus(data) {
    const branchLabel = document.getElementById('repo-branch-name');
    const commitsList = document.getElementById('repo-commits-list');
    const statusList = document.getElementById('repo-status-list');

    if (data.error) {
        branchLabel.textContent = 'None';
        commitsList.innerHTML = `<div style="color: var(--text-dim); font-size: 12px;">${data.error}</div>`;
        statusList.innerHTML = '';
        return;
    }

    branchLabel.textContent = data.branch || 'main';
    commitsList.innerHTML = '';
    data.commits.forEach(c => {
      const item = document.createElement('div');
      item.className = 'commit-item';
      item.innerHTML = `
        <div class="commit-meta">
          <span class="commit-hash">${c.hash}</span>
          <span class="commit-date">${c.date}</span>
        </div>
        <div class="commit-subject">${c.subject}</div>
        <div class="commit-author" style="font-size: 10px; color: var(--text-dim)">${c.author}</div>
      `;
      commitsList.appendChild(item);
    });

    const statusList = document.getElementById('repo-status-list');
    statusList.innerHTML = '';
    data.status.forEach(line => {
      const div = document.createElement('div');
      div.className = 'status-line';
      if (line.startsWith('M')) div.classList.add('modified');
      if (line.startsWith('A')) div.classList.add('added');
      if (line.startsWith('D')) div.classList.add('deleted');
      div.textContent = line;
      statusList.appendChild(div);
    });
  }

  function renderTree(node, container = null) {
    if (!container) {
      container = document.getElementById('repo-tree');
      container.innerHTML = '';
    }

    const nodeEl = document.createElement('div');
    nodeEl.className = `tree-node ${node.type}`;
    nodeEl.dataset.path = node.rel_path;
    
    // Icon
    const icon = document.createElement('span');
    icon.className = 'node-icon';
    if (node.type === 'directory') {
      icon.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 3A1.75 1.75 0 000 4.75v6.5C0 12.216.784 13 1.75 13h12.5A1.75 1.75 0 0016 11.25v-5.5A1.75 1.75 0 0014.25 4h-5.91l-1-1H1.75z"/></svg>';
    } else {
      icon.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.75 0h6.586a.25.25 0 01.177.073l3.414 3.414a.25.25 0 01.073.177v10.586A1.75 1.75 0 0112.25 16h-8.5A1.75 1.75 0 012 14.25V1.75A1.75 1.75 0 013.75 0z"/></svg>';
    }
    nodeEl.appendChild(icon);

    const name = document.createElement('span');
    name.textContent = node.name;
    nodeEl.appendChild(name);

    // Check if this file was recently edited
    if (editedFiles.has(node.rel_path)) {
      const editInfo = editedFiles.get(node.rel_path);
      const age = Date.now() - editInfo.time;
      if (age < 60000) { // Highlight for 1 minute
        nodeEl.classList.add('being-edited');
        nodeEl.style.setProperty('--agent-color', editInfo.color || 'var(--accent)');
        if (age > 5000) {
            nodeEl.classList.add('was-edited');
        }
      }
    }

    container.appendChild(nodeEl);

    if (node.children && node.children.length > 0) {
      const childrenCont = document.createElement('div');
      childrenCont.className = 'tree-children';
      node.children.forEach(child => renderTree(child, childrenCont));
      container.appendChild(childrenCont);
      
      nodeEl.onclick = (e) => {
          e.stopPropagation();
          childrenCont.classList.toggle('hidden');
      };
    }
  }

  function renderActiveAgents() {
    const list = document.getElementById('repo-agents-list');
    list.innerHTML = '';
    
    // Get agents from window globals
    const config = window.agentConfig || {};
    const status = window.agentStatus || {};
    
    Object.keys(status).forEach(name => {
      const s = status[name];
      if (!s.available) return; // Only show active ones
      
      const cfg = config[name] || { color: s.color || '#888' };
      const card = document.createElement('div');
      card.className = 'repo-agent-card';
      card.style.setProperty('--agent-color', cfg.color);
      card.innerHTML = `
        <div class="repo-agent-name">${name}</div>
        <div class="repo-agent-task">${s.busy ? 'Working...' : 'Available'}</div>
      `;
      list.appendChild(card);
    });
  }

  function spawnAgent() {
    // Attempt to open the launcher panel
    // We can simulate a click on the "Spawn Agent" button in the sidebar if needed
    // Or call the launcher logic if exposed.
    const launcherBtn = document.getElementById('open-launcher-btn');
    if (launcherBtn) {
        launcherBtn.click();
        // We might want to pre-fill the CWD in the launcher UI
        // This would require modifying launcher.js to support passing context
    } else {
        alert('Launcher not available');
    }
  }

  function detectFileEdit(msg) {
    const text = msg.text || '';
    
    // Heuristic: look for file names in backticks
    const fileRegex = /`?([\w\-\.\/]+\.(py|js|html|css|json|md|txt|sh|bat))`?/g;
    let match;
    while ((match = fileRegex.exec(text)) !== null) {
      const filePath = match[1];
      const agentConfig = window.agentConfig || {};
      const agentColor = agentConfig[msg.sender] ? agentConfig[msg.sender].color : null;
      
      editedFiles.set(filePath, {
        agent: msg.sender,
        color: agentColor,
        time: Date.now()
      });
      
      if (isActive) {
          const node = document.querySelector(`.tree-node[data-path="${filePath}"]`);
          if (node) {
              node.classList.add('being-edited');
              node.style.setProperty('--agent-color', agentColor || 'var(--accent)');
              setTimeout(() => {
                  node.classList.add('was-edited');
              }, 5000);
          }
      }
    }
  }

  return { init, showView };
})();

window.addEventListener('DOMContentLoaded', Repository.init);
