/**
 * RemoteX - Requests Controller (Incoming and Outgoing)
 */

document.addEventListener('DOMContentLoaded', async () => {
  if (!auth.requireAuth()) return;
  UI.setupMobileSidebar();

  const user = auth.getUser();
  const sidebarName = document.getElementById('sidebar-name');
  const sidebarRemoteId = document.getElementById('sidebar-remote-id');
  const sidebarAvatar = document.getElementById('sidebar-avatar');
  const headerAvatar = document.getElementById('header-avatar');
  const logoutBtn = document.getElementById('logout-btn');
  const refreshBtn = document.getElementById('refresh-requests-btn');

  const incomingContainer = document.getElementById('incoming-requests-list');
  const outgoingContainer = document.getElementById('outgoing-requests-list');
  const incomingCountBadge = document.getElementById('incoming-count');
  const outgoingCountBadge = document.getElementById('outgoing-count');
  const sidebarCounter = document.getElementById('sidebar-request-counter');

  // Populate sidebar user details
  if (user) {
    const displayName = user.name || 'Operator';
    const remoteId = user.remote_id || 'Unknown';
    const initials = displayName
      .split(' ')
      .map(part => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || 'RX';

    if (sidebarName) sidebarName.textContent = displayName;
    if (sidebarRemoteId) sidebarRemoteId.textContent = remoteId;
    if (sidebarAvatar) sidebarAvatar.textContent = initials;
    if (headerAvatar) headerAvatar.textContent = initials;
  }

  // Logout handler
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const confirmLogout = await UI.confirm({
        title: 'Sign Out',
        message: 'Are you sure you want to sign out?',
        confirmText: 'Sign Out'
      });
      if (confirmLogout) auth.logout();
    });
  }

  // Tab switching
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');

      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  // Load Incoming Requests
  async function loadIncomingRequests() {
    if (!incomingContainer) return;

    try {
      const res = await api.getPendingRequests();
      const requests = res.pending_requests || [];

      if (incomingCountBadge) incomingCountBadge.textContent = requests.length;
      if (sidebarCounter) {
        if (requests.length > 0) {
          sidebarCounter.textContent = requests.length;
          sidebarCounter.style.display = 'inline-block';
        } else {
          sidebarCounter.style.display = 'none';
        }
      }

      if (requests.length === 0) {
        incomingContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div class="empty-state-title">No Incoming Requests</div>
            <div class="empty-state-desc">You currently have no pending inbound connection requests from remote participants.</div>
          </div>
        `;
        return;
      }

      incomingContainer.innerHTML = requests.map(req => `
        <div class="request-item-card" id="inc-req-${req.request_id}">
          <div class="request-item-main">
            <div class="request-avatar">
              ${escapeHtml((req.from_name || 'U').charAt(0).toUpperCase())}
            </div>
            <div>
              <div class="request-meta-title">
                <span>${escapeHtml(req.from_name || 'Unknown Operator')}</span>
                <span class="badge badge-warning">Awaiting Approval</span>
              </div>
              <div class="request-meta-details">
                <span>Remote ID: <span class="request-id-badge">${escapeHtml(req.from_remote_id)}</span></span>
                <span>•</span>
                <span>Requested: ${UI.formatDate(req.created_at)}</span>
              </div>
            </div>
          </div>
          <div class="request-actions">
            <button type="button" class="btn btn-secondary btn-sm reject-req-btn" data-id="${req.request_id}">
              Decline
            </button>
            <button type="button" class="btn btn-primary btn-sm accept-req-btn" data-id="${req.request_id}" data-remote="${escapeHtml(req.from_remote_id)}">
              Accept & Start Session
            </button>
          </div>
        </div>
      `).join('');

      incomingContainer.querySelectorAll('.accept-req-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const reqId = btn.getAttribute('data-id');
          const remoteId = btn.getAttribute('data-remote');
          await handleRespond(reqId, true, remoteId, btn);
        });
      });

      incomingContainer.querySelectorAll('.reject-req-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const reqId = btn.getAttribute('data-id');
          await handleRespond(reqId, false, '', btn);
        });
      });

    } catch (err) {
      console.error('Failed to load incoming requests:', err);
      incomingContainer.innerHTML = `
        <div style="color:var(--danger); padding:1rem;">Failed to load incoming requests: ${escapeHtml(err.message)}</div>
      `;
    }
  }

  // Handle Respond
  async function handleRespond(requestId, accept, remoteId, btnEl) {
    try {
      UI.setButtonLoading(btnEl, true);
      const res = await api.respondConnection(requestId, accept);

      if (accept) {
        UI.showToast('Connection accepted! Entering session...', 'success');
        if (res.session_id) {
          localStorage.setItem(CONFIG.STORAGE_KEYS.ACTIVE_SESSION, res.session_id);
          localStorage.setItem(CONFIG.STORAGE_KEYS.ACTIVE_TARGET, remoteId);
          setTimeout(() => {
            window.location.href = `session.html?session_id=${encodeURIComponent(res.session_id)}`;
          }, 600);
        }
      } else {
        UI.showToast('Connection request rejected', 'info');
      }

      await loadIncomingRequests();
    } catch (err) {
      console.error('Error responding to request:', err);
      UI.showToast(err.message || 'Error processing request', 'error');
    } finally {
      UI.setButtonLoading(btnEl, false);
    }
  }

  // Load Outgoing Requests
  async function loadOutgoingRequests() {
    if (!outgoingContainer) return;

    try {
      const res = await api.getSentRequests();
      const requests = res.sent_requests || [];

      if (outgoingCountBadge) outgoingCountBadge.textContent = requests.length;

      if (requests.length === 0) {
        outgoingContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </div>
            <div class="empty-state-title">No Outgoing Requests</div>
            <div class="empty-state-desc">You have not sent any connection requests recently. Use the dashboard to connect with another user.</div>
          </div>
        `;
        return;
      }

      outgoingContainer.innerHTML = requests.map(req => {
        const status = req.status || 'pending';
        let badgeClass = 'badge-warning';
        let badgeText = 'Pending Approval';

        if (status === 'accepted') {
          badgeClass = 'badge-success';
          badgeText = 'Accepted';
        } else if (status === 'rejected') {
          badgeClass = 'badge-danger';
          badgeText = 'Rejected';
        }

        return `
          <div class="request-item-card">
            <div class="request-item-main">
              <div class="request-avatar outgoing">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </div>
              <div>
                <div class="request-meta-title">
                  <span>Target: <span class="request-id-badge">${escapeHtml(req.to_remote_id)}</span></span>
                  <span class="badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="request-meta-details">
                  <span>Sent: ${UI.formatDate(req.created_at)}</span>
                  ${req.responded_at ? `<span>• Responded: ${UI.formatDate(req.responded_at)}</span>` : ''}
                </div>
              </div>
            </div>
            <div class="request-actions">
              ${status === 'accepted' ? `
                <a href="dashboard.html" class="btn btn-secondary btn-sm">
                  View Sessions
                </a>
              ` : `
                <span style="font-size:0.8125rem; color:var(--text-muted);">
                  ${status === 'pending' ? 'Awaiting response' : 'Request concluded'}
                </span>
              `}
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      console.error('Failed to load outgoing requests:', err);
      outgoingContainer.innerHTML = `
        <div style="color:var(--danger); padding:1rem;">Failed to load outgoing requests: ${escapeHtml(err.message)}</div>
      `;
    }
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      await loadIncomingRequests();
      await loadOutgoingRequests();
      UI.showToast('Requests refreshed', 'info', '', 1500);
    });
  }

  // WebSocket real-time updates
  if (window.websocketService) {
    window.websocketService.on('connection_request', () => {
      loadIncomingRequests();
    });

    window.websocketService.on('connection_response', () => {
      loadOutgoingRequests();
    });
  }

  // Initial loads
  await loadIncomingRequests();
  await loadOutgoingRequests();
});
