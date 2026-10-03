/**
 * RemoteX - Permissions Governance Manager
 * Principle: "No Permission = No Access"
 * Enforces independent per-feature consent states: REQUEST, PENDING, ALLOWED, REJECTED, REVOKED
 */

class PermissionsManager {
  constructor(sessionId, currentRemoteId, otherRemoteId) {
    this.sessionId = sessionId;
    this.currentRemoteId = currentRemoteId;
    this.otherRemoteId = otherRemoteId;

    this.features = [
      'video',
      'voice',
      'screen',
      'chat',
      'mouse',
      'keyboard',
      'file_transfer',
      'translation'
    ];

    // Feature metadata for display
    this.meta = {
      video: { label: 'Video Call', icon: 'video', desc: 'Peer-to-peer live camera feed' },
      voice: { label: 'Voice Audio', icon: 'mic', desc: 'Real-time two-way audio stream' },
      screen: { label: 'Screen Share', icon: 'screen', desc: 'Display desktop capture stream' },
      chat: { label: 'Encrypted Chat', icon: 'chat', desc: 'In-session encrypted messaging' },
      mouse: { label: 'Mouse Control', icon: 'mouse', desc: 'Remote pointer navigation & clicks' },
      keyboard: { label: 'Keyboard Input', icon: 'keyboard', desc: 'Remote keystroke commands' },
      file_transfer: { label: 'File Transfer', icon: 'file', desc: 'Governed document & file uploads' },
      translation: { label: 'Live Translation', icon: 'translate', desc: '14-language real-time translation' }
    };

    // Current state storage
    this.permissions = {};
    this.requests = {};
    this.changeListeners = new Set();

    // Initialize all to false
    this.features.forEach(f => {
      this.permissions[f] = false;
      this.requests[f] = null;
    });

    this.setupWebSocketListeners();
  }

  /**
   * Subscribe to state change callbacks
   * @param {Function} callback
   */
  subscribe(callback) {
    this.changeListeners.add(callback);
    // Trigger immediately with current state
    callback(this.getAllStates());
  }

  unsubscribe(callback) {
    this.changeListeners.delete(callback);
  }

  notify() {
    const states = this.getAllStates();
    this.changeListeners.forEach(cb => {
      try {
        cb(states);
      } catch (err) {
        console.error('Error in permission change listener:', err);
      }
    });
  }

  /**
   * Wire real-time permission WebSocket events
   */
  setupWebSocketListeners() {
    if (!window.websocketService) return;

    window.websocketService.on('permission_request', (data) => {
      if (data.session_id === this.sessionId) {
        this.requests[data.feature] = {
          status: 'pending',
          requested_by: data.from_remote_id,
          requested_from: this.currentRemoteId
        };
        this.notify();

        // Show prompt to user
        const featureName = this.meta[data.feature]?.label || data.feature;
        UI.showToast(`Remote user requested permission for: ${featureName}`, 'warning', 'Permission Requested');
      }
    });

    window.websocketService.on('permission_response', (data) => {
      if (data.session_id === this.sessionId) {
        this.permissions[data.feature] = data.approved;
        if (this.requests[data.feature]) {
          this.requests[data.feature].status = data.approved ? 'approved' : 'rejected';
        }
        this.notify();

        const featureName = this.meta[data.feature]?.label || data.feature;
        if (data.approved) {
          UI.showToast(`Permission for '${featureName}' was approved`, 'success', 'Permission Granted');
        } else {
          UI.showToast(`Permission for '${featureName}' was denied`, 'error', 'Permission Denied');
        }
      }
    });

    window.websocketService.on('permission_update', (data) => {
      if (data.session_id === this.sessionId) {
        this.permissions[data.feature] = Boolean(data.approved);
        this.notify();
      }
    });

    window.websocketService.on('permission_revoked', (data) => {
      if (data.session_id === this.sessionId) {
        this.permissions[data.feature] = false;
        this.requests[data.feature] = { status: 'revoked', revoked_by: data.revoked_by };
        this.notify();

        const featureName = this.meta[data.feature]?.label || data.feature;
        UI.showToast(`Permission for '${featureName}' has been revoked`, 'warning', 'Permission Revoked');
      }
    });
  }

  /**
   * Refresh permissions state from FastAPI backend
   */
  async fetchStatus() {
    try {
      const res = await api.getPermissionStatus(this.sessionId);
      if (res && res.permissions) {
        this.permissions = { ...res.permissions };
      }
      if (res && res.permission_requests) {
        this.requests = { ...res.permission_requests };
      }
      this.notify();
      return this.getAllStates();
    } catch (err) {
      console.error('Failed to fetch permission status:', err);
      throw err;
    }
  }

  /**
   * Determine the current functional state of a feature
   * @param {string} feature
   * @returns {string} REQUEST | PENDING | INCOMING_PENDING | ALLOWED | REJECTED | REVOKED
   */
  getFeatureState(feature) {
    // 1. If actively allowed in session permissions
    if (this.permissions[feature] === true) {
      return CONFIG.PERMISSION_STATES.ALLOWED;
    }

    const req = this.requests[feature];
    if (req) {
      if (req.status === 'pending') {
        if (req.requested_by === this.currentRemoteId) {
          return CONFIG.PERMISSION_STATES.PENDING;
        } else {
          return 'INCOMING_PENDING';
        }
      }
      if (req.status === 'rejected') {
        return CONFIG.PERMISSION_STATES.REJECTED;
      }
      if (req.status === 'revoked') {
        return CONFIG.PERMISSION_STATES.REVOKED;
      }
    }

    return CONFIG.PERMISSION_STATES.REQUEST;
  }

  /**
   * Check if a feature is currently allowed
   * @param {string} feature
   * @returns {boolean}
   */
  isAllowed(feature) {
    return Boolean(this.permissions[feature]);
  }

  /**
   * Get all states dictionary
   */
  getAllStates() {
    const states = {};
    this.features.forEach(f => {
      states[f] = {
        state: this.getFeatureState(f),
        allowed: this.isAllowed(f),
        meta: this.meta[f]
      };
    });
    return states;
  }

  /**
   * Send permission request to peer
   * @param {string} feature
   */
  async request(feature) {
    try {
      const res = await api.requestPermission(this.sessionId, feature);
      this.requests[feature] = {
        status: 'pending',
        requested_by: this.currentRemoteId,
        requested_from: this.otherRemoteId
      };
      this.notify();
      UI.showToast(`Requested permission for ${this.meta[feature]?.label || feature}`, 'info', 'Permission Request');
      return res;
    } catch (err) {
      console.error(`Error requesting permission for ${feature}:`, err);
      UI.showToast(err.message || 'Permission request failed', 'error');
      throw err;
    }
  }

  /**
   * Respond to an incoming permission request
   * @param {string} feature
   * @param {boolean} approved
   */
  async respond(feature, approved) {
    try {
      const res = await api.respondPermission(this.sessionId, feature, approved);
      this.permissions[feature] = Boolean(approved);
      this.requests[feature] = {
        status: approved ? 'approved' : 'rejected',
        responded_by: this.currentRemoteId
      };
      this.notify();
      UI.showToast(`Permission ${approved ? 'approved' : 'rejected'} for ${this.meta[feature]?.label || feature}`, approved ? 'success' : 'info');
      return res;
    } catch (err) {
      console.error(`Error responding to permission for ${feature}:`, err);
      UI.showToast(err.message || 'Failed to respond to permission request', 'error');
      throw err;
    }
  }

  /**
   * Revoke an active permission
   * @param {string} feature
   */
  async revoke(feature) {
    try {
      const res = await api.revokePermission(this.sessionId, feature);
      this.permissions[feature] = false;
      this.requests[feature] = {
        status: 'revoked',
        revoked_by: this.currentRemoteId
      };
      this.notify();
      UI.showToast(`Revoked permission for ${this.meta[feature]?.label || feature}`, 'warning', 'Permission Revoked');
      return res;
    } catch (err) {
      console.error(`Error revoking permission for ${feature}:`, err);
      UI.showToast(err.message || 'Failed to revoke permission', 'error');
      throw err;
    }
  }
}
