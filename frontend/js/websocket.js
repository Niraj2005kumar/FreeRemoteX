/**
 * RemoteX - Central WebSocket Service & Event Dispatcher
 * Maintains a single, resilient WebSocket connection to FastAPI backend
 */

class WebSocketService {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.baseReconnectDelay = 1500;
    this.isConnected = false;
    this.currentRemoteId = null;
    this.isExplicitlyClosed = false;
  }

  /**
   * Register an event listener
   * @param {string} event - Event name (e.g. 'connection_request', 'chat_message')
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  /**
   * Unregister an event listener
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  /**
   * Dispatch an event to all subscribed callbacks
   * @param {string} event
   * @param {any} data
   */
  dispatch(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in WebSocket listener for '${event}':`, err);
        }
      });
    }

    // Also dispatch to a wildcard listener if any
    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach(cb => {
        try {
          cb({ event, data });
        } catch (err) {
          console.error(`Error in wildcard WebSocket listener:`, err);
        }
      });
    }
  }

  /**
   * Initialize or reuse WebSocket connection for current user
   */
  connect() {
    const token = auth.getToken();
    const user = auth.getUser();

    if (!token || !user || !user.remote_id) {
      console.warn('Cannot connect WebSocket: Missing token or user Remote ID');
      return;
    }

    // If already connected for this remote_id, do not reconnect
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (this.currentRemoteId === user.remote_id) {
        return;
      }
      this.disconnect();
    }

    this.isExplicitlyClosed = false;
    this.currentRemoteId = user.remote_id;

    const wsUrl = `${CONFIG.WS_BASE_URL}/ws/signaling/${encodeURIComponent(user.remote_id)}?token=${encodeURIComponent(token)}`;

    this.dispatch('status_change', { status: 'connecting' });
    this.updateGlobalConnectionIndicator('connecting');

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.log(`[WebSocket] Connected successfully as ${user.remote_id}`);
        this.dispatch('status_change', { status: 'connected' });
        this.updateGlobalConnectionIndicator('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const type = payload.type || 'message';

          // Central internal logging
          // console.debug('[WebSocket Event]', type, payload);

          // Dispatch specific typed event
          this.dispatch(type, payload);

          // Handle global notification toasts for incoming events if not already on the specific view
          this.handleGlobalNotifications(type, payload);
        } catch (parseErr) {
          console.error('[WebSocket] Failed to parse message JSON:', parseErr, event.data);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[WebSocket Error]:', err);
        this.dispatch('status_change', { status: 'error', error: err });
      };

      this.ws.onclose = (event) => {
        this.isConnected = false;
        console.warn(`[WebSocket] Connection closed (code: ${event.code})`);
        this.dispatch('status_change', { status: 'disconnected', code: event.code });
        this.updateGlobalConnectionIndicator('disconnected');

        if (!this.isExplicitlyClosed && auth.isAuthenticated()) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.error('[WebSocket Connection Failed]:', err);
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule exponential backoff reconnect
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[WebSocket] Maximum reconnection attempts reached.');
      this.updateGlobalConnectionIndicator('failed');
      return;
    }

    clearTimeout(this.reconnectTimer);
    const delay = Math.min(this.baseReconnectDelay * Math.pow(1.5, this.reconnectAttempts), 20000);
    this.reconnectAttempts++;

    console.log(`[WebSocket] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts})...`);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Send JSON message to backend WebSocket endpoint
   * @param {Object} data
   * @returns {boolean}
   */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    } else {
      console.warn('[WebSocket] Cannot send message: socket not open', data);
      return false;
    }
  }

  /**
   * Disconnect and cancel re-connections
   */
  disconnect() {
    this.isExplicitlyClosed = true;
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.isConnected = false;
    this.updateGlobalConnectionIndicator('disconnected');
  }

  /**
   * Updates any status indicator present in the DOM (e.g. top header status dot)
   */
  updateGlobalConnectionIndicator(status) {
    const dots = document.querySelectorAll('.ws-status-dot');
    const textEls = document.querySelectorAll('.ws-status-text');

    dots.forEach(dot => {
      dot.className = 'status-dot ws-status-dot ' + (
        status === 'connected' ? 'online' :
        status === 'connecting' ? 'connecting' : 'offline'
      );
    });

    textEls.forEach(el => {
      el.textContent = (
        status === 'connected' ? 'Real-time Online' :
        status === 'connecting' ? 'Connecting...' : 'Reconnecting...'
      );
    });
  }

  /**
   * Handle intelligent global toasts for background events
   */
  handleGlobalNotifications(type, data) {
    if (typeof UI === 'undefined') return;

    if (type === 'connection_request') {
      const from = data.from_name ? `${data.from_name} (${data.from_remote_id})` : data.from_remote_id;
      UI.showToast(`Incoming connection request from ${from}`, 'info', 'Connection Request');
      // If we are on dashboard or requests, trigger a refresh event
      this.dispatch('incoming_request_received', data);
    } else if (type === 'connection_response') {
      if (data.status === 'accepted') {
        UI.showToast(`User ${data.responder_remote_id} accepted your connection request!`, 'success', 'Connection Accepted');
      } else {
        UI.showToast(`User ${data.responder_remote_id} rejected your connection request.`, 'warning', 'Connection Rejected');
      }
    } else if (type === 'session_created') {
      UI.showToast(`Active session established: ${data.session_id}`, 'success', 'Session Started');
      // If not already on session.html, user might want to join
      if (!window.location.pathname.endsWith('session.html')) {
        localStorage.setItem(CONFIG.STORAGE_KEYS.ACTIVE_SESSION, data.session_id);
      }
    } else if (type === 'session_ended') {
      UI.showToast(`Session ${data.session_id} has ended`, 'info', 'Session Ended');
    }
  }
}

// Global singleton instance
window.websocketService = new WebSocketService();

// Automatically connect if user is already authenticated
document.addEventListener('DOMContentLoaded', () => {
  if (auth.isAuthenticated()) {
    window.websocketService.connect();
  }
});
