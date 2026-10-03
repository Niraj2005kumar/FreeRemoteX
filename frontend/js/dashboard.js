/**
 * RemoteX - Dashboard Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Enforce authentication
  if (!auth.requireAuth()) return;

  // Setup mobile navigation toggle
  UI.setupMobileSidebar();

  // Elements
  const welcomeHeading = document.getElementById('welcome-heading');
  const userRemoteIdText = document.getElementById('user-remote-id-text');
  const copyRemoteIdBtn = document.getElementById('copy-remote-id-btn');

  const sidebarAvatar = document.getElementById('sidebar-avatar');
  const headerAvatar = document.getElementById('header-avatar');
  const sidebarName = document.getElementById('sidebar-name');
  const sidebarRemoteId = document.getElementById('sidebar-remote-id');
  const logoutBtn = document.getElementById('logout-btn');

  const quickConnectForm = document.getElementById('quick-connect-form');
  const targetRemoteIdInput = document.getElementById('target-remote-id');
  const connectBtn = document.getElementById('connect-btn');

  const pendingRequestsContainer = document.getElementById('pending-requests-list');
  const recentSessionsContainer = document.getElementById('recent-sessions-list');
  const refreshSessionsBtn = document.getElementById('refresh-sessions-btn');
  const sidebarCounter = document.getElementById('sidebar-request-counter');

  let currentUser = auth.getUser();

  // Initialize or fetch current user profile
  async function loadUserProfile() {
    try {
      const profile = await api.getProfile();
      currentUser = profile;
      auth.setUser(profile);
      renderUserUI(profile);
    } catch (err) {
      console.warn('Failed to refresh user profile:', err);
      if (currentUser) {
        renderUserUI(currentUser);
      }
    }
  }

  function renderUserUI(user) {
    if (!user) return;
    const displayName = user.name || 'Operator';
    const remoteId = user.remote_id || 'Unknown';
    const initials = displayName
      .split(' ')
      .map(part => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || 'RX';

    if (welcomeHeading) welcomeHeading.textContent = `Welcome, ${displayName}`;
    if (userRemoteIdText) userRemoteIdText.textContent = remoteId;
    if (sidebarName) sidebarName.textContent = displayName;
    if (sidebarRemoteId) sidebarRemoteId.textContent = remoteId;
    if (sidebarAvatar) sidebarAvatar.textContent = initials;
    if (headerAvatar) headerAvatar.textContent = initials;
  }

  // Copy Remote ID to clipboard
  if (copyRemoteIdBtn) {
    copyRemoteIdBtn.addEventListener('click', () => {
      const id = userRemoteIdText.textContent.trim();
      if (id && id !== 'Loading...') {
        UI.copyToClipboard(id, `Remote ID ${id} copied!`);
      }
    });
  }

  // Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const confirmLogout = await UI.confirm({
        title: 'Sign Out',
        message: 'Are you sure you want to sign out of RemoteX?',
        confirmText: 'Sign Out',
        isDestructive: false
      });
      if (confirmLogout) {
        auth.logout();
      }
    });
  }

  // Quick Connect to another user
  if (quickConnectForm) {
    quickConnectForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const targetId = targetRemoteIdInput.value.trim().toUpperCase();

      if (!targetId) {
        UI.showToast('Please enter a valid Remote ID', 'error');
        return;
      }

      if (currentUser && currentUser.remote_id && targetId === currentUser.remote_id.toUpperCase()) {
        UI.showToast('You cannot connect to your own Remote ID', 'warning');
        return;
      }

      try {
        UI.setButtonLoading(connectBtn, true, 'Requesting...');
        const res = await api.sendConnectionRequest(targetId);
        UI.showToast(`Connection request sent to ${targetId}. Waiting for approval.`, 'success', 'Request Sent');
        targetRemoteIdInput.value = '';
      } catch (err) {
        console.error('Connection request error:', err);
        UI.showToast(err.message || 'Failed to send connection request', 'error');
      } finally {
        UI.setButtonLoading(connectBtn, false);
      }
    });
  }

  // Load Pending Requests
  async function loadPendingRequests() {
    if (!pendingRequestsContainer) return;

    try {
      const res = await api.getPendingRequests();
      const requests = res.pending_requests || [];

      // Update sidebar counter
      if (sidebarCounter) {
        if (requests.length > 0) {
          sidebarCounter.textContent = requests.length;
          sidebarCounter.style.display = 'inline-block';
        } else {
          sidebarCounter.style.display = 'none';
        }
      }

      if (requests.length === 0) {
        pendingRequestsContainer.innerHTML = `
          <div class="empty-state" style="padding:1.5rem 1rem;">
            <div class="empty-state-icon" style="width:40px; height:40px; margin-bottom:0.5rem;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div class="empty-state-title" style="font-size:0.95rem;">No Pending Requests</div>
            <div class="empty-state-desc" style="font-size:0.8125rem;">When other RemoteX users request a connection with your Remote ID, they will appear here.</div>
          </div>
        `;
        return;
      }

      pendingRequestsContainer.innerHTML = requests.map(req => `
        <div class="list-item" id="req-card-${req.request_id}">
          <div class="list-item-main">
            <div class="list-item-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div>
              <div class="list-item-title">${escapeHtml(req.from_name || 'Anonymous User')}</div>
              <div class="list-item-subtitle" style="font-family:var(--font-mono);">${escapeHtml(req.from_remote_id)} • ${UI.formatDate(req.created_at)}</div>
            </div>
          </div>
          <div class="list-item-actions">
            <button type="button" class="btn btn-secondary btn-sm reject-request-btn" data-id="${req.request_id}">
              Reject
            </button>
            <button type="button" class="btn btn-primary btn-sm accept-request-btn" data-id="${req.request_id}" data-remote="${escapeHtml(req.from_remote_id)}">
              Accept
            </button>
          </div>
        </div>
      `).join('');

      // Attach button listeners
      pendingRequestsContainer.querySelectorAll('.accept-request-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const reqId = btn.getAttribute('data-id');
          const targetRemote = btn.getAttribute('data-remote');
          await handleRespondRequest(reqId, true, targetRemote, btn);
        });
      });

      pendingRequestsContainer.querySelectorAll('.reject-request-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const reqId = btn.getAttribute('data-id');
          await handleRespondRequest(reqId, false, '', btn);
        });
      });

    } catch (err) {
      console.error('Failed to load pending requests:', err);
      pendingRequestsContainer.innerHTML = `
        <div style="font-size:0.8125rem; color:var(--danger); padding:0.75rem;">
          Failed to load pending requests: ${escapeHtml(err.message)}
        </div>
      `;
    }
  }

  // Handle responding to requests
  async function handleRespondRequest(requestId, accept, targetRemote, btnEl) {
    try {
      UI.setButtonLoading(btnEl, true);
      const res = await api.respondConnection(requestId, accept);

      if (accept) {
        UI.showToast('Connection accepted! Establishing session...', 'success');
        if (res.session_id) {
          localStorage.setItem(CONFIG.STORAGE_KEYS.ACTIVE_SESSION, res.session_id);
          localStorage.setItem(CONFIG.STORAGE_KEYS.ACTIVE_TARGET, targetRemote);
          setTimeout(() => {
            window.location.href = `session.html?session_id=${encodeURIComponent(res.session_id)}`;
          }, 800);
        }
      } else {
        UI.showToast('Connection request rejected', 'info');
      }

      await loadPendingRequests();
      await loadRecentSessions();
    } catch (err) {
      console.error('Respond request error:', err);
      UI.showToast(err.message || 'Failed to respond to request', 'error');
    } finally {
      UI.setButtonLoading(btnEl, false);
    }
  }

  // Load Recent Sessions
  async function loadRecentSessions() {
    if (!recentSessionsContainer) return;

    try {
      const res = await api.getMySessions();
      const sessions = res.sessions || [];

      if (sessions.length === 0) {
        recentSessionsContainer.innerHTML = `
          <div class="empty-state" style="padding:1.5rem 1rem;">
            <div class="empty-state-icon" style="width:40px; height:40px; margin-bottom:0.5rem;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </div>
            <div class="empty-state-title" style="font-size:0.95rem;">No Sessions Recorded</div>
            <div class="empty-state-desc" style="font-size:0.8125rem;">Active or historical support sessions will be shown here.</div>
          </div>
        `;
        return;
      }

      recentSessionsContainer.innerHTML = sessions.slice(0, 5).map(s => {
        const otherId = (currentUser && s.user_a_remote_id === currentUser.remote_id)
          ? s.user_b_remote_id
          : s.user_a_remote_id;
        const isActive = s.status === 'active';

        return `
          <div class="list-item">
            <div class="list-item-main">
              <div class="list-item-icon" style="color: ${isActive ? 'var(--success)' : 'var(--text-muted)'};">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              </div>
              <div>
                <div class="list-item-title" style="display:flex; align-items:center; gap:0.5rem;">
                  <span>${escapeHtml(s.session_id)}</span>
                  <span class="badge ${isActive ? 'badge-success' : 'badge-neutral'}">
                    ${isActive ? 'Active' : 'Ended'}
                  </span>
                </div>
                <div class="list-item-subtitle">
                  With: <strong style="color:var(--text-primary); font-family:var(--font-mono);">${escapeHtml(otherId)}</strong> • ${UI.formatDate(s.created_at)}
                </div>
              </div>
            </div>
            <div class="list-item-actions">
              ${isActive ? `
                <a href="session.html?session_id=${encodeURIComponent(s.session_id)}" class="btn btn-primary btn-sm">
                  Join Workspace
                </a>
              ` : `
                <span style="font-size:0.75rem; color:var(--text-muted);">Concluded</span>
              `}
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('Failed to load recent sessions:', err);
      recentSessionsContainer.innerHTML = `
        <div style="font-size:0.8125rem; color:var(--danger); padding:0.75rem;">
          Failed to load sessions: ${escapeHtml(err.message)}
        </div>
      `;
    }
  }

  if (refreshSessionsBtn) {
    refreshSessionsBtn.addEventListener('click', loadRecentSessions);
  }

  // Subscribe to real-time events on WebSocket
  if (window.websocketService) {
    window.websocketService.on('connection_request', () => {
      loadPendingRequests();
    });

    window.websocketService.on('connection_response', () => {
      loadRecentSessions();
    });

    window.websocketService.on('session_created', (data) => {
      loadRecentSessions();
      loadPendingRequests();
    });

    window.websocketService.on('session_ended', () => {
      loadRecentSessions();
    });
  }

  // Initial load
  await loadUserProfile();
  await loadPendingRequests();
  await loadRecentSessions();
});
