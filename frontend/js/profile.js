/**
 * RemoteX - Profile Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  if (!auth.requireAuth()) return;
  UI.setupMobileSidebar();

  const profileAvatar = document.getElementById('profile-avatar');
  const profileName = document.getElementById('profile-name');
  const profileEmail = document.getElementById('profile-email');
  const profileRemoteId = document.getElementById('profile-remote-id');
  const copyBtn = document.getElementById('profile-copy-id-btn');
  const sidebarLogoutBtn = document.getElementById('sidebar-logout-btn');
  const logoutMainBtn = document.getElementById('logout-main-btn');
  const sessionsList = document.getElementById('profile-sessions-list');
  const refreshHistoryBtn = document.getElementById('refresh-history-btn');

  let currentUser = auth.getUser();

  async function loadProfile() {
    try {
      const data = await api.getProfile();
      currentUser = data;
      auth.setUser(data);
      renderProfileUI(data);
    } catch (err) {
      console.warn('Failed to load profile from API:', err);
      if (currentUser) {
        renderProfileUI(currentUser);
      }
    }
  }

  function renderProfileUI(user) {
    if (!user) return;
    const name = user.name || 'Remote Operator';
    const email = user.email || 'N/A';
    const remoteId = user.remote_id || 'Unknown';
    const initials = name
      .split(' ')
      .map(p => p[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || 'RX';

    if (profileAvatar) profileAvatar.textContent = initials;
    if (profileName) profileName.textContent = name;
    if (profileEmail) profileEmail.textContent = email;
    if (profileRemoteId) profileRemoteId.textContent = remoteId;
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const id = profileRemoteId.textContent.trim();
      if (id && !id.includes('•')) {
        UI.copyToClipboard(id, `Remote ID ${id} copied!`);
      }
    });
  }

  async function handleLogout() {
    const confirm = await UI.confirm({
      title: 'Sign Out',
      message: 'Are you sure you want to end your authentication session and sign out?',
      confirmText: 'Sign Out',
      isDestructive: true
    });
    if (confirm) {
      auth.logout();
    }
  }

  if (sidebarLogoutBtn) sidebarLogoutBtn.addEventListener('click', handleLogout);
  if (logoutMainBtn) logoutMainBtn.addEventListener('click', handleLogout);

  async function loadSessionsHistory() {
    if (!sessionsList) return;

    try {
      const res = await api.getMySessions();
      const sessions = res.sessions || [];

      if (sessions.length === 0) {
        sessionsList.innerHTML = `
          <div class="empty-state" style="padding:1.5rem 1rem;">
            <div class="empty-state-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </div>
            <div class="empty-state-title">No Session History</div>
            <div class="empty-state-desc">You have not participated in any remote sessions yet.</div>
          </div>
        `;
        return;
      }

      sessionsList.innerHTML = sessions.map(s => {
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
                  Participant: <span style="font-family:var(--font-mono); color:var(--text-primary);">${escapeHtml(otherId)}</span> • Created: ${UI.formatDate(s.created_at)}
                  ${s.ended_at ? ` • Ended: ${UI.formatDate(s.ended_at)}` : ''}
                </div>
              </div>
            </div>
            <div>
              ${isActive ? `
                <a href="session.html?session_id=${encodeURIComponent(s.session_id)}" class="btn btn-primary btn-sm">
                  Re-join Session
                </a>
              ` : `
                <span class="badge badge-neutral">Concluded</span>
              `}
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('Failed to load session history:', err);
      sessionsList.innerHTML = `
        <div style="color:var(--danger); padding:1rem;">Failed to load session history: ${escapeHtml(err.message)}</div>
      `;
    }
  }

  if (refreshHistoryBtn) {
    refreshHistoryBtn.addEventListener('click', loadSessionsHistory);
  }

  await loadProfile();
  await loadSessionsHistory();
});
