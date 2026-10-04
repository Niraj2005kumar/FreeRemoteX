/**
 * RemoteX - Session Workspace Master Controller
 * Orchestrates WebRTC, Permissions Matrix, Chat, File Transfer, Translation, and Remote Control
 */

document.addEventListener('DOMContentLoaded', async () => {
  if (!auth.requireAuth()) return;

  const currentUser = auth.getUser();

  // Extract Session ID from URL or Storage
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session_id') || localStorage.getItem(CONFIG.STORAGE_KEYS.ACTIVE_SESSION);

  if (!sessionId) {
    UI.showToast('No active session specified. Returning to dashboard.', 'warning');
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 1200);
    return;
  }

  // Cache active session ID
  localStorage.setItem(CONFIG.STORAGE_KEYS.ACTIVE_SESSION, sessionId);

  // Header Elements
  const peerNameEl = document.getElementById('session-peer-name');
  const peerRemoteIdEl = document.getElementById('session-peer-remote-id');
  const sessionIdDisplay = document.getElementById('session-id-display');
  const sessionStatusBadge = document.getElementById('session-status-badge');
  const endSessionBtn = document.getElementById('end-session-btn');
  const webrtcStatusText = document.getElementById('webrtc-status-text');

  // Media Buttons
  const toggleScreenBtn = document.getElementById('btn-toggle-screen');
  const toggleVideoBtn = document.getElementById('btn-toggle-video');
  const toggleVoiceBtn = document.getElementById('btn-toggle-voice');

  // Video & Screen elements
  const remoteVideo = document.getElementById('remote-stream-video');
  const localVideo = document.getElementById('local-preview-video');
  const screenPlaceholder = document.getElementById('screen-placeholder');
  const placeholderRequestScreenBtn = document.getElementById('placeholder-request-screen-btn');
  const streamResolutionText = document.getElementById('stream-resolution-text');

  // Permissions Container
  const permissionsContainer = document.getElementById('permissions-list-container');
  const refreshPermissionsBtn = document.getElementById('refresh-permissions-btn');

  // Gate Request Buttons
  const gateRequestChatBtn = document.getElementById('gate-request-chat-btn');
  const gateRequestFileBtn = document.getElementById('gate-request-file-btn');
  const gateRequestTransBtn = document.getElementById('gate-request-trans-btn');

  let sessionData = null;
  let peerRemoteId = null;
  let permissionsManager = null;
  let webrtcService = null;
  let chatController = null;
  let fileController = null;
  let translationController = null;
  let remoteControlService = null;

  // Click to copy session ID
  if (sessionIdDisplay) {
    sessionIdDisplay.addEventListener('click', () => {
      UI.copyToClipboard(sessionId, `Session ID ${sessionId} copied!`);
    });
  }

  // Load Session Data
  try {
    sessionData = await api.getSession(sessionId);

    if (sessionData.status === 'ended') {
      UI.showToast('This session has already ended.', 'info');
      if (sessionStatusBadge) {
        sessionStatusBadge.className = 'badge badge-neutral';
        sessionStatusBadge.innerHTML = '<span>Ended</span>';
      }
    }

    // Determine target/other participant remote ID
    peerRemoteId = (currentUser && sessionData.user_a_remote_id === currentUser.remote_id)
      ? sessionData.user_b_remote_id
      : sessionData.user_a_remote_id;

    // Update Header UI
    if (peerRemoteIdEl) peerRemoteIdEl.textContent = peerRemoteId;
    if (sessionIdDisplay) sessionIdDisplay.querySelector('span').textContent = sessionId;

    // Try fetching peer display name
    try {
      const peerProfile = await api.getUserByRemoteId(peerRemoteId);
      if (peerProfile && peerNameEl) {
        peerNameEl.textContent = peerProfile.name || peerRemoteId;
      }
    } catch (e) {
      if (peerNameEl) peerNameEl.textContent = `Remote User (${peerRemoteId})`;
    }

  } catch (err) {
    console.error('Failed to load session details:', err);
    UI.showToast(err.message || 'Session not found or inaccessible', 'error');
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 1500);
    return;
  }

  // Initialize Permissions Manager
  permissionsManager = new PermissionsManager(sessionId, currentUser.remote_id, peerRemoteId);

  // Initialize Subsystems
  webrtcService = new WebRTCService(sessionId, currentUser.remote_id, peerRemoteId, permissionsManager);
  chatController = new ChatController(sessionId, currentUser.remote_id, permissionsManager);
  fileController = new FileTransferController(sessionId, currentUser.remote_id, permissionsManager);
  translationController = new TranslationController(sessionId, currentUser.remote_id, permissionsManager);
  remoteControlService = new RemoteControlService(sessionId, permissionsManager);

  // Setup WebRTC Callbacks
  webrtcService.onRemoteStreamCallback = (stream) => {
    if (stream && stream.active) {
      remoteVideo.srcObject = stream;
      remoteVideo.classList.add('active');
      if (screenPlaceholder) screenPlaceholder.style.display = 'none';
      remoteVideo.play().catch((error) => {
        console.warn('[WebRTC] Remote video autoplay was blocked:', error);
        UI.showToast('Remote media is connected. Click the video to start playback.', 'info', 'Playback Needs a Click');
      });

      const tracks = stream.getVideoTracks();
      if (tracks.length > 0) {
        const settings = tracks[0].getSettings();
        if (streamResolutionText) {
          streamResolutionText.textContent = `${settings.width || 1920}x${settings.height || 1080} Live`;
        }
      }
    } else {
      remoteVideo.srcObject = null;
      remoteVideo.classList.remove('active');
      if (screenPlaceholder) screenPlaceholder.style.display = 'flex';
      if (streamResolutionText) streamResolutionText.textContent = 'Stream Inactive';
    }
  };

  webrtcService.onLocalStreamCallback = (stream) => {
    if (stream && stream.active) {
      localVideo.srcObject = stream;
      localVideo.classList.add('active');
    } else {
      localVideo.srcObject = null;
      localVideo.classList.remove('active');
    }
  };

  webrtcService.onStatusChangeCallback = (state) => {
    if (webrtcStatusText) {
      webrtcStatusText.textContent = `WebRTC: ${state}`;
    }

    const activeFeature = webrtcService.activeFeature;
    [
      [toggleScreenBtn, 'screen'],
      [toggleVideoBtn, 'video'],
      [toggleVoiceBtn, 'voice'],
    ].forEach(([button, feature]) => {
      if (!button) return;
      button.classList.toggle('btn-accent', activeFeature === feature);
      button.classList.toggle('btn-secondary', activeFeature !== feature);
    });
  };

  if (remoteVideo) {
    remoteVideo.addEventListener('click', () => {
      remoteVideo.play().catch((error) => {
        console.error('[WebRTC] Remote video playback failed:', error);
        UI.showToast('Could not play the remote media stream. Check browser playback permissions.', 'error');
      });
    });
  }

  // Wire Header Media Buttons
  if (toggleScreenBtn) {
    toggleScreenBtn.addEventListener('click', async () => {
      if (webrtcService.localStream && webrtcService.activeFeature === 'screen') {
        webrtcService.stop();
        toggleScreenBtn.classList.remove('btn-accent');
        toggleScreenBtn.classList.add('btn-secondary');
        UI.showToast('Screen sharing stopped', 'info');
      } else {
        const success = await webrtcService.start('screen');
        if (success) {
          toggleScreenBtn.classList.remove('btn-secondary');
          toggleScreenBtn.classList.add('btn-accent');
        }
      }
    });
  }

  if (toggleVideoBtn) {
    toggleVideoBtn.addEventListener('click', async () => {
      if (webrtcService.localStream && webrtcService.activeFeature === 'video') {
        webrtcService.stop();
        toggleVideoBtn.classList.remove('btn-accent');
        toggleVideoBtn.classList.add('btn-secondary');
        UI.showToast('Camera feed stopped', 'info');
      } else {
        const success = await webrtcService.start('video');
        if (success) {
          toggleVideoBtn.classList.remove('btn-secondary');
          toggleVideoBtn.classList.add('btn-accent');
        }
      }
    });
  }

  if (toggleVoiceBtn) {
    toggleVoiceBtn.addEventListener('click', async () => {
      if (webrtcService.localStream && webrtcService.activeFeature === 'voice') {
        webrtcService.stop();
        toggleVoiceBtn.classList.remove('btn-accent');
        toggleVoiceBtn.classList.add('btn-secondary');
        UI.showToast('Microphone muted', 'info');
      } else {
        const success = await webrtcService.start('voice');
        if (success) {
          toggleVoiceBtn.classList.remove('btn-secondary');
          toggleVoiceBtn.classList.add('btn-accent');
        }
      }
    });
  }

  // Quick gate request handlers
  if (placeholderRequestScreenBtn) {
    placeholderRequestScreenBtn.addEventListener('click', async () => {
      if (permissionsManager.isAllowed('screen')) {
        const success = await webrtcService.start('screen');
        if (success && toggleScreenBtn) {
          toggleScreenBtn.classList.remove('btn-secondary');
          toggleScreenBtn.classList.add('btn-accent');
        }
        return;
      }

      const screenState = permissionsManager.getFeatureState('screen');
      if (screenState === 'PENDING' || screenState === 'INCOMING_PENDING') {
        UI.showToast('Screen permission is already pending. Wait for the other participant to respond.', 'info');
        return;
      }

      try {
        await permissionsManager.request('screen');
      } catch (error) {
        console.error('[WebRTC] Screen permission request failed:', error);
      }
    });
  }
  if (gateRequestChatBtn) {
    gateRequestChatBtn.addEventListener('click', () => permissionsManager.request('chat'));
  }
  if (gateRequestFileBtn) {
    gateRequestFileBtn.addEventListener('click', () => permissionsManager.request('file_transfer'));
  }
  if (gateRequestTransBtn) {
    gateRequestTransBtn.addEventListener('click', () => permissionsManager.request('translation'));
  }

  // Render Permissions Matrix UI
  function renderPermissionsMatrix(states) {
    if (!permissionsContainer) return;

    const featureIcons = {
      video: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`,
      voice: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>`,
      screen: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
      chat: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
      mouse: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="7"/><line x1="12" y1="6" x2="12" y2="10"/></svg>`,
      keyboard: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6.01" y2="8"/><line x1="10" y1="8" x2="10.01" y2="8"/><line x1="14" y1="8" x2="14.01" y2="8"/><line x1="18" y1="8" x2="18.01" y2="8"/><line x1="6" y1="12" x2="6.01" y2="12"/><line x1="18" y1="12" x2="18.01" y2="12"/><line x1="8" y1="16" x2="16" y2="16"/></svg>`,
      file_transfer: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
      translation: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`
    };

    permissionsContainer.innerHTML = permissionsManager.features.map(f => {
      const info = states[f] || {};
      const state = info.state || 'REQUEST';
      const meta = info.meta || {};

      let stateBadge = '';
      let actionButtons = '';

      switch (state) {
        case 'ALLOWED':
          stateBadge = `<span class="badge badge-success">Allowed</span>`;
          actionButtons = `
            <button type="button" class="btn btn-danger-outline btn-sm perm-revoke-btn" data-feature="${f}">
              Revoke
            </button>
          `;
          break;

        case 'PENDING':
          stateBadge = `<span class="badge badge-warning">Pending</span>`;
          actionButtons = `
            <button type="button" class="btn btn-secondary btn-sm disabled" disabled>
              Waiting...
            </button>
          `;
          break;

        case 'INCOMING_PENDING':
          stateBadge = `<span class="badge badge-warning">Peer Requested</span>`;
          actionButtons = `
            <button type="button" class="btn btn-secondary btn-sm perm-deny-btn" data-feature="${f}">Deny</button>
            <button type="button" class="btn btn-primary btn-sm perm-approve-btn" data-feature="${f}">Grant</button>
          `;
          break;

        case 'REJECTED':
          stateBadge = `<span class="badge badge-danger">Denied</span>`;
          actionButtons = `
            <button type="button" class="btn btn-secondary btn-sm perm-request-btn" data-feature="${f}">
              Request
            </button>
          `;
          break;

        case 'REVOKED':
          stateBadge = `<span class="badge badge-neutral">Revoked</span>`;
          actionButtons = `
            <button type="button" class="btn btn-secondary btn-sm perm-request-btn" data-feature="${f}">
              Request
            </button>
          `;
          break;

        default: // 'REQUEST'
          stateBadge = `<span class="badge badge-neutral">Not Granted</span>`;
          actionButtons = `
            <button type="button" class="btn btn-secondary btn-sm perm-request-btn" data-feature="${f}">
              Request
            </button>
          `;
          break;
      }

      return `
        <div class="permission-feature-row ${state.toLowerCase()}" id="perm-row-${f}">
          <div class="perm-feature-info">
            <div class="perm-icon-wrapper">${featureIcons[f] || ''}</div>
            <div>
              <div class="perm-feature-name">${escapeHtml(meta.label || f)}</div>
              <div class="perm-feature-desc">${stateBadge}</div>
            </div>
          </div>
          <div class="perm-actions-group">
            ${actionButtons}
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners for permission actions
    permissionsContainer.querySelectorAll('.perm-request-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const feature = btn.getAttribute('data-feature');
        UI.setButtonLoading(btn, true);
        try {
          await permissionsManager.request(feature);
        } finally {
          UI.setButtonLoading(btn, false);
        }
      });
    });

    permissionsContainer.querySelectorAll('.perm-approve-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const feature = btn.getAttribute('data-feature');
        UI.setButtonLoading(btn, true);
        try {
          await permissionsManager.respond(feature, true);
        } finally {
          UI.setButtonLoading(btn, false);
        }
      });
    });

    permissionsContainer.querySelectorAll('.perm-deny-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const feature = btn.getAttribute('data-feature');
        UI.setButtonLoading(btn, true);
        try {
          await permissionsManager.respond(feature, false);
        } finally {
          UI.setButtonLoading(btn, false);
        }
      });
    });

    permissionsContainer.querySelectorAll('.perm-revoke-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const feature = btn.getAttribute('data-feature');
        const confirmRevoke = await UI.confirm({
          title: `Revoke ${metaName(feature)} Permission?`,
          message: `Are you sure you want to revoke '${metaName(feature)}' permission immediately? Access will cease instantaneously.`,
          confirmText: 'Revoke Access',
          isDestructive: true
        });
        if (confirmRevoke) {
          UI.setButtonLoading(btn, true);
          try {
            await permissionsManager.revoke(feature);
          } finally {
            UI.setButtonLoading(btn, false);
          }
        }
      });
    });
  }

  function metaName(f) {
    return permissionsManager.meta[f]?.label || f;
  }

  // Subscribe to permission changes to keep UI reactive
  permissionsManager.subscribe((states) => {
    renderPermissionsMatrix(states);

    if (placeholderRequestScreenBtn) {
      const screenState = states.screen?.state;
      const isAllowed = states.screen?.allowed === true;
      placeholderRequestScreenBtn.textContent = isAllowed
        ? 'Start Screen Share'
        : screenState === 'PENDING' || screenState === 'INCOMING_PENDING'
          ? 'Screen Permission Pending'
          : 'Request Screen Permission';
      placeholderRequestScreenBtn.disabled =
        screenState === 'PENDING' || screenState === 'INCOMING_PENDING';
    }

    if (
      webrtcService.activeFeature &&
      states[webrtcService.activeFeature]?.allowed !== true
    ) {
      webrtcService.stop();
    }
  });

  if (refreshPermissionsBtn) {
    refreshPermissionsBtn.addEventListener('click', async () => {
      await permissionsManager.fetchStatus();
      UI.showToast('Permissions refreshed from server', 'info', '', 1200);
    });
  }

  // Bottom Tools Tab Switching
  const toolTabBtns = document.querySelectorAll('.tool-tab-btn');
  const toolPanes = document.querySelectorAll('.tool-pane');
  const chatClearBtn = document.getElementById('chat-clear-btn');

  toolTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetPaneId = btn.getAttribute('data-tool');

      toolTabBtns.forEach(b => b.classList.remove('active'));
      toolPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const pane = document.getElementById(targetPaneId);
      if (pane) pane.classList.add('active');

      if (chatClearBtn) {
        chatClearBtn.style.display = targetPaneId === 'chat-pane' ? 'inline-flex' : 'none';
      }
    });
  });

  // End Session Action
  if (endSessionBtn) {
    endSessionBtn.addEventListener('click', async () => {
      const confirmed = await UI.confirm({
        title: 'End Remote Session?',
        message: 'Terminating this session will immediately revoke all feature permissions, close WebRTC data pipelines, and conclude communication for both participants.',
        confirmText: 'End Session',
        isDestructive: true
      });

      if (confirmed) {
        try {
          UI.setButtonLoading(endSessionBtn, true, 'Ending...');
          webrtcService.stop();
          await api.endSession(sessionId);
          localStorage.removeItem(CONFIG.STORAGE_KEYS.ACTIVE_SESSION);
          UI.showToast('Session ended successfully', 'info');
          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 800);
        } catch (err) {
          console.error('End session error:', err);
          UI.showToast(err.message || 'Failed to end session', 'error');
        } finally {
          UI.setButtonLoading(endSessionBtn, false);
        }
      }
    });
  }

  // Handle remote session termination over WebSocket
  if (window.websocketService) {
    window.websocketService.on('session_ended', (msg) => {
      if (msg.session_id === sessionId) {
        webrtcService.stop();
        localStorage.removeItem(CONFIG.STORAGE_KEYS.ACTIVE_SESSION);
        UI.showToast('The remote session was ended by a participant.', 'warning', 'Session Ended');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 1500);
      }
    });
  }

  // Initial Permission Fetch
  await permissionsManager.fetchStatus();
});
