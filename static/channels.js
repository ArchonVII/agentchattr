// channels.js -- Channel tabs, switching, filtering, CRUD
// Extracted from chat.js PR 4.  Reads shared state via window.* bridges.

'use strict';

// ---------------------------------------------------------------------------
// State (local to channels)
// ---------------------------------------------------------------------------

const _channelScrollMsg = {};  // channel name -> message ID at top of viewport
const _ROOM_COLLAPSE_KEY = 'agentchattr-room-collapsed';
const _projectContext = {
    cwd: '',
    repo: '',
    branch: '',
    worktree: '',
    loading: false,
    loaded: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _getTopVisibleMsgId() {
    const scroll = document.getElementById('timeline');
    const container = document.getElementById('messages');
    if (!scroll || !container) return null;
    const rect = scroll.getBoundingClientRect();
    for (const el of container.children) {
        if (el.style.display === 'none' || !el.dataset.id) continue;
        const elRect = el.getBoundingClientRect();
        if (elRect.bottom > rect.top) return el.dataset.id;
    }
    return null;
}

function _isRoomCollapsed() {
    return localStorage.getItem(_ROOM_COLLAPSE_KEY) === '1';
}

function _setRoomCollapsed(collapsed) {
    localStorage.setItem(_ROOM_COLLAPSE_KEY, collapsed ? '1' : '0');
}

function _getRoomTitle() {
    const el = document.getElementById('room-title');
    const text = el ? el.textContent.trim() : '';
    return text || document.title || 'Current project';
}

function _getRoomMeta() {
    const subtitle = document.getElementById('room-subtitle');
    const summary = subtitle ? subtitle.textContent.trim() : '';
    const channelCount = window.channelList.length;
    const countLabel = channelCount === 1 ? '1 channel' : `${channelCount} channels`;
    return summary ? `${countLabel} · ${summary}` : `${countLabel} · Current project`;
}

function _getProjectCwd() {
    if (_projectContext.cwd) return _projectContext.cwd;
    if (window.Repository && typeof window.Repository.getCurrentPath === 'function') {
        const repoPath = window.Repository.getCurrentPath();
        if (repoPath) return repoPath;
    }
    return '';
}

function _getProjectName() {
    const cwd = _getProjectCwd();
    if (_projectContext.repo) return _projectContext.repo;
    if (cwd && typeof getPathLeaf === 'function') return getPathLeaf(cwd);
    return _getRoomTitle();
}

function _getProjectMeta() {
    const taskCount = window.channelList.length;
    const taskLabel = taskCount === 1 ? '1 task room' : `${taskCount} task rooms`;
    const parts = [taskLabel];
    if (_projectContext.branch) parts.push(`branch ${_projectContext.branch}`);
    return parts.join(' · ');
}

function _updateSidebarHeading() {
    const heading = document.querySelector('.room-sidebar-label');
    const copy = document.querySelector('.room-sidebar-copy');
    if (heading) heading.textContent = 'Projects';
    if (copy) {
        copy.textContent = _projectContext.cwd
            ? 'Folder-backed projects and task rooms'
            : 'Project folders and task rooms';
    }
}

async function _ensureProjectContext(force = false) {
    if (_projectContext.loading) return;
    if (_projectContext.loaded && !force) return;

    _projectContext.loading = true;
    try {
        let cwd =
            (window.Repository && typeof window.Repository.getCurrentPath === 'function'
                ? window.Repository.getCurrentPath()
                : '') || '';

        if (!cwd) {
            const settingsRes = await fetch('/api/settings');
            if (settingsRes.ok) {
                const settings = await settingsRes.json();
                cwd = settings.default_cwd || '.';
            }
        }

        _projectContext.cwd = cwd || '.';

        const repoRes = await fetch(`/api/repo/status?path=${encodeURIComponent(_projectContext.cwd)}`);
        if (repoRes.ok) {
            const repoData = await repoRes.json();
            _projectContext.repo = repoData.repo || '';
            _projectContext.branch = repoData.branch || '';
            _projectContext.worktree = repoData.worktree || '';
        } else {
            _projectContext.repo = '';
            _projectContext.branch = '';
            _projectContext.worktree = '';
        }
    } catch (err) {
        console.error('Failed to load project context:', err);
    } finally {
        _projectContext.loaded = true;
        _projectContext.loading = false;
        _updateSidebarHeading();
        renderRoomSidebar();
    }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderChannelTabs() {
    const container = document.getElementById('channel-tabs');
    if (!container) return;

    // Preserve inline create input if it exists
    const existingCreate = container.querySelector('.channel-inline-create');
    container.innerHTML = '';

    for (const name of window.channelList) {
        const tab = document.createElement('button');
        tab.className = 'channel-tab' + (name === window.activeChannel ? ' active' : '');
        tab.dataset.channel = name;

        const label = document.createElement('span');
        label.className = 'channel-tab-label';
        label.textContent = '# ' + name;
        tab.appendChild(label);

        const unread = window.channelUnread[name] || 0;
        if (unread > 0 && name !== window.activeChannel) {
            const dot = document.createElement('span');
            dot.className = 'channel-unread-dot';
            dot.textContent = unread > 99 ? '99+' : unread;
            tab.appendChild(dot);
        }

        // Edit + delete icons for non-general tabs (visible on hover via CSS)
        if (name !== 'general') {
            const actions = document.createElement('span');
            actions.className = 'channel-tab-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'ch-edit-btn';
            editBtn.title = 'Rename';
            editBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
            editBtn.onclick = (e) => { e.stopPropagation(); showChannelRenameDialog(name); };
            actions.appendChild(editBtn);

            const delBtn = document.createElement('button');
            delBtn.className = 'ch-delete-btn';
            delBtn.title = 'Delete';
            delBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3h4v1M5 4v8.5h6V4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            delBtn.onclick = (e) => { e.stopPropagation(); deleteChannel(name); };
            actions.appendChild(delBtn);

            tab.appendChild(actions);
        }

        tab.onclick = (e) => {
            if (e.target.closest('.channel-tab-actions')) return;
            if (name === window.activeChannel) {
                // Second click on active tab -- toggle edit controls
                tab.classList.toggle('editing');
            } else {
                // Clear any editing state, switch channel
                document.querySelectorAll('.channel-tab.editing').forEach(t => t.classList.remove('editing'));
                switchChannel(name);
            }
        };

        container.appendChild(tab);
    }

    // Re-append inline create if it was open
    if (existingCreate) {
        container.appendChild(existingCreate);
    }

    // Update add button disabled state
    const addBtn = document.getElementById('channel-add-btn');
    if (addBtn) {
        addBtn.classList.toggle('disabled', window.channelList.length >= 8);
    }

    renderRoomSidebar();
}

function renderRoomSidebar() {
    const container = document.getElementById('room-list');
    if (!container) return;

    _updateSidebarHeading();
    if (!_projectContext.loaded && !_projectContext.loading) {
        void _ensureProjectContext();
    }

    container.innerHTML = '';

    const collapsed = _isRoomCollapsed();
    const room = document.createElement('section');
    room.className = 'room-nav-item' + (collapsed ? '' : ' expanded');
    room.dataset.projectFolder = _getProjectCwd() || '.';

    const toggle = document.createElement('button');
    toggle.className = 'room-nav-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.title = _getProjectCwd() || 'Current project folder';
    toggle.onclick = () => {
        _setRoomCollapsed(!collapsed);
        renderRoomSidebar();
    };

    const icon = document.createElement('span');
    icon.className = 'room-nav-icon';
    icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 4.5A1.5 1.5 0 014 3h2.2c.4 0 .7.15.97.42l.41.41c.19.19.45.3.72.3H12A1.5 1.5 0 0113.5 5.6v5.9A1.5 1.5 0 0112 13H4a1.5 1.5 0 01-1.5-1.5v-7z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
    toggle.appendChild(icon);

    const details = document.createElement('span');
    details.className = 'room-nav-details';

    const label = document.createElement('span');
    label.className = 'room-nav-label';
    label.textContent = _getProjectName();
    details.appendChild(label);

    const meta = document.createElement('span');
    meta.className = 'room-nav-meta';
    meta.textContent = _getProjectMeta();
    details.appendChild(meta);

    const path = document.createElement('span');
    path.className = 'room-nav-path';
    path.textContent = _getProjectCwd() || '.';
    details.appendChild(path);

    toggle.appendChild(details);

    const caret = document.createElement('span');
    caret.className = 'room-nav-caret';
    caret.textContent = '›';
    toggle.appendChild(caret);

    room.appendChild(toggle);

    const channelList = document.createElement('div');
    channelList.id = 'room-channel-list';
    channelList.hidden = collapsed;

    for (const name of window.channelList) {
        const btn = document.createElement('button');
        btn.className = 'room-channel-item' + (name === window.activeChannel ? ' active' : '');
        btn.type = 'button';
        btn.dataset.channel = name;
        btn.setAttribute('aria-current', name === window.activeChannel ? 'page' : 'false');
        btn.onclick = () => switchChannel(name);

        const info = document.createElement('span');
        info.className = 'room-channel-info';

        const hash = document.createElement('span');
        hash.className = 'room-channel-hash';
        hash.textContent = '#';
        info.appendChild(hash);

        const text = document.createElement('span');
        text.className = 'room-channel-label-text';
        text.textContent = name;
        info.appendChild(text);

        btn.appendChild(info);

        const unread = window.channelUnread[name] || 0;
        if (unread > 0 && name !== window.activeChannel) {
            const badge = document.createElement('span');
            badge.className = 'room-channel-unread';
            badge.textContent = unread > 99 ? '99+' : unread;
            btn.appendChild(badge);
        }

        channelList.appendChild(btn);
    }

    const addChannel = document.createElement('button');
    addChannel.className = 'room-channel-item room-channel-add';
    addChannel.type = 'button';
    addChannel.onclick = () => showChannelCreateDialog();
    addChannel.innerHTML = '<span class="room-channel-info"><span class="room-channel-hash">+</span><span class="room-channel-label-text">Add task room</span></span>';
    channelList.appendChild(addChannel);

    room.appendChild(channelList);
    container.appendChild(room);
}

// ---------------------------------------------------------------------------
// Switch / filter
// ---------------------------------------------------------------------------

function switchChannel(name) {
    if (name === window.activeChannel) return;
    // Save top-visible message ID for current channel
    const topId = _getTopVisibleMsgId();
    if (topId) _channelScrollMsg[window.activeChannel] = topId;
    window._setActiveChannel(name);
    window.channelUnread[name] = 0;
    localStorage.setItem('agentchattr-channel', name);
    filterMessagesByChannel();
    renderChannelTabs();
    Store.set('activeChannel', name);
    // Restore: scroll to saved message, or bottom if none saved
    const savedId = _channelScrollMsg[name];
    if (savedId) {
        const el = document.querySelector(`.message[data-id="${savedId}"]`);
        if (el) { el.scrollIntoView({ block: 'start' }); return; }
    }
    window.scrollToBottom();
}

function filterMessagesByChannel() {
    const container = document.getElementById('messages');
    if (!container) return;

    for (const el of container.children) {
        const ch = el.dataset.channel || 'general';
        el.style.display = ch === window.activeChannel ? '' : 'none';
    }

    if (window.renderChannelRoster) {
        window.renderChannelRoster();
    }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

function showChannelCreateDialog() {
    if (window.channelList.length >= 8) return;
    const tabs = document.getElementById('channel-tabs');
    // Remove existing inline create if any
    tabs.querySelector('.channel-inline-create')?.remove();

    // Hide the + button while creating
    const addBtn = document.getElementById('channel-add-btn');
    if (addBtn) addBtn.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = 'channel-inline-create';

    const prefix = document.createElement('span');
    prefix.className = 'channel-input-prefix';
    prefix.textContent = '#';
    wrapper.appendChild(prefix);

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 20;
    input.placeholder = 'channel-name';
    wrapper.appendChild(input);

    const cleanup = () => { wrapper.remove(); if (addBtn) addBtn.style.display = ''; };

    const confirm = document.createElement('button');
    confirm.className = 'confirm-btn';
    confirm.innerHTML = '&#10003;';
    confirm.title = 'Create';
    confirm.onclick = () => { _submitInlineCreate(input, wrapper); if (addBtn) addBtn.style.display = ''; };
    wrapper.appendChild(confirm);

    const cancel = document.createElement('button');
    cancel.className = 'cancel-btn';
    cancel.innerHTML = '&#10005;';
    cancel.title = 'Cancel';
    cancel.onclick = cleanup;
    wrapper.appendChild(cancel);

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); _submitInlineCreate(input, wrapper); if (addBtn) addBtn.style.display = ''; }
        if (e.key === 'Escape') cleanup();
    });
    input.addEventListener('input', () => {
        input.value = input.value.toLowerCase().replace(/[^a-z0-9\-]/g, '');
    });

    tabs.appendChild(wrapper);
    input.focus();
}

function _submitInlineCreate(input, wrapper) {
    const name = input.value.trim().toLowerCase();
    if (!name || !/^[a-z0-9][a-z0-9\-]{0,19}$/.test(name)) return;
    if (window.channelList.includes(name)) { input.focus(); return; }
    window._setPendingChannelSwitch(name);
    window.ws.send(JSON.stringify({ type: 'channel_create', name }));
    wrapper.remove();
}

// ---------------------------------------------------------------------------
// Rename
// ---------------------------------------------------------------------------

function showChannelRenameDialog(oldName) {
    const tabs = document.getElementById('channel-tabs');
    tabs.querySelector('.channel-inline-create')?.remove();

    // Find the tab being renamed so we can insert the input in its place
    const targetTab = tabs.querySelector(`.channel-tab[data-channel="${oldName}"]`);

    const wrapper = document.createElement('div');
    wrapper.className = 'channel-inline-create';

    const prefix = document.createElement('span');
    prefix.className = 'channel-input-prefix';
    prefix.textContent = '#';
    wrapper.appendChild(prefix);

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 20;
    input.value = oldName;
    wrapper.appendChild(input);

    const cleanup = () => {
        wrapper.remove();
        if (targetTab) targetTab.style.display = '';
    };

    const confirm = document.createElement('button');
    confirm.className = 'confirm-btn';
    confirm.innerHTML = '&#10003;';
    confirm.title = 'Rename';
    confirm.onclick = () => {
        const newName = input.value.trim().toLowerCase();
        if (!newName || !/^[a-z0-9][a-z0-9\-]{0,19}$/.test(newName)) return;
        if (newName !== oldName) {
            window.ws.send(JSON.stringify({ type: 'channel_rename', old_name: oldName, new_name: newName }));
            if (window.activeChannel === oldName) {
                window._setActiveChannel(newName);
                localStorage.setItem('agentchattr-channel', newName);
                Store.set('activeChannel', newName);
            }
        }
        cleanup();
    };
    wrapper.appendChild(confirm);

    const cancel = document.createElement('button');
    cancel.className = 'cancel-btn';
    cancel.innerHTML = '&#10005;';
    cancel.title = 'Cancel';
    cancel.onclick = cleanup;
    wrapper.appendChild(cancel);

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); confirm.click(); }
        if (e.key === 'Escape') cleanup();
    });
    input.addEventListener('input', () => {
        input.value = input.value.toLowerCase().replace(/[^a-z0-9\-]/g, '');
    });

    // Insert inline next to the tab, hide the original tab
    if (targetTab) {
        targetTab.style.display = 'none';
        targetTab.insertAdjacentElement('afterend', wrapper);
    } else {
        tabs.appendChild(wrapper);
    }
    input.select();
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

function deleteChannel(name) {
    if (name === 'general') return;
    const tab = document.querySelector(`.channel-tab[data-channel="${name}"]`);
    if (!tab || tab.classList.contains('confirm-delete')) return;

    const label = tab.querySelector('.channel-tab-label');
    const actions = tab.querySelector('.channel-tab-actions');
    const originalText = label.textContent;
    const originalOnclick = tab.onclick;

    tab.classList.add('confirm-delete');
    tab.classList.remove('editing');
    label.textContent = `delete #${name}?`;
    if (actions) actions.style.display = 'none';

    const confirmBar = document.createElement('span');
    confirmBar.className = 'channel-delete-confirm';

    const tickBtn = document.createElement('button');
    tickBtn.className = 'ch-confirm-yes';
    tickBtn.title = 'Confirm delete';
    tickBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.5 3.5 6.5-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const crossBtn = document.createElement('button');
    crossBtn.className = 'ch-confirm-no';
    crossBtn.title = 'Cancel';
    crossBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

    confirmBar.appendChild(tickBtn);
    confirmBar.appendChild(crossBtn);
    tab.appendChild(confirmBar);

    const revert = () => {
        tab.classList.remove('confirm-delete');
        label.textContent = originalText;
        if (actions) actions.style.display = '';
        confirmBar.remove();
        tab.onclick = originalOnclick;
        document.removeEventListener('click', outsideClick);
    };

    tickBtn.onclick = (e) => {
        e.stopPropagation();
        revert();
        window.ws.send(JSON.stringify({ type: 'channel_delete', name }));
        if (window.activeChannel === name) switchChannel('general');
    };

    crossBtn.onclick = (e) => {
        e.stopPropagation();
        revert();
    };

    tab.onclick = (e) => { e.stopPropagation(); };

    const outsideClick = (e) => {
        if (!tab.contains(e.target)) revert();
    };
    setTimeout(() => document.addEventListener('click', outsideClick), 0);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function _channelsInit() {
    void _ensureProjectContext();
    renderChannelTabs();
    filterMessagesByChannel();
}

// ---------------------------------------------------------------------------
// Window exports (for inline onclick in index.html and chat.js callers)
// ---------------------------------------------------------------------------

window.showChannelCreateDialog = showChannelCreateDialog;
window.switchChannel = switchChannel;
window.filterMessagesByChannel = filterMessagesByChannel;
window.renderChannelTabs = renderChannelTabs;
window.renderRoomSidebar = renderRoomSidebar;
window.refreshProjectContext = () => _ensureProjectContext(true);
window.deleteChannel = deleteChannel;
window.showChannelRenameDialog = showChannelRenameDialog;
window.Channels = { init: _channelsInit };

window.addEventListener('project-context-changed', (event) => {
    const detail = event.detail || {};
    _projectContext.cwd = detail.cwd || _projectContext.cwd;
    _projectContext.repo = detail.repo || _projectContext.repo;
    _projectContext.branch = detail.branch || _projectContext.branch;
    _projectContext.worktree = detail.worktree || _projectContext.worktree;
    _projectContext.loaded = true;
    _projectContext.loading = false;
    _updateSidebarHeading();
    renderRoomSidebar();
});
