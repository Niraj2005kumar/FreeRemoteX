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

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event).add(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  dispatch(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in WebSocket listener for '${event}':`, error);
        }
      });
    }

    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach((callback) => {
        try {
          callback({
            event,
            data,
          });
        } catch (error) {
          console.error('Error in wildcard WebSocket listener:', error);
        }
      });
    }
  }

  connect() {
    if (typeof CONFIG === 'undefined' || !CONFIG.WS_BASE_URL) {
      console.error('[WebSocket] CONFIG.WS_BASE_URL is not available.');
      return;
    }

    if (typeof auth === 'undefined' || !auth.getToken || !auth.getUser) {
      console.error('[WebSocket] Auth service is not available.');
      return;
    }

    const token = auth.getToken();
    const user = auth.getUser();

    if (!token || !user || !user.remote_id) {
      console.warn('[WebSocket] Missing token or user Remote ID.');
      return;
    }

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      if (this.currentRemoteId === user.remote_id) {
        return;
      }

      this.disconnect();
    }

    this.isExplicitlyClosed = false;
    this.currentRemoteId = user.remote_id;

    const wsUrl =
      `${CONFIG.WS_BASE_URL}/ws/signaling/` +
      `${encodeURIComponent(user.remote_id)}` +
      `?token=${encodeURIComponent(token)}`;

    this.dispatch('status_change', {
      status: 'connecting',
    });

    this.updateGlobalConnectionIndicator('connecting');

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;

        console.log(`[WebSocket] Connected as ${user.remote_id}`);

        this.dispatch('status_change', {
          status: 'connected',
        });

        this.updateGlobalConnectionIndicator('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          const type = payload.type || 'message';

          this.dispatch(type, payload);

          this.handleGlobalNotifications(type, payload);
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Connection error:', error);

        this.dispatch('status_change', {
          status: 'error',
          error,
        });
      };

      this.ws.onclose = (event) => {
        this.isConnected = false;

        console.warn(`[WebSocket] Connection closed: ${event.code}`);

        this.dispatch('status_change', {
          status: 'disconnected',
          code: event.code,
        });

        this.updateGlobalConnectionIndicator('disconnected');

        if (
          !this.isExplicitlyClosed &&
          typeof auth !== 'undefined' &&
          auth.isAuthenticated &&
          auth.isAuthenticated()
        ) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);

      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[WebSocket] Maximum reconnect attempts reached.');

      this.updateGlobalConnectionIndicator('failed');

      return;
    }

    clearTimeout(this.reconnectTimer);

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(1.5, this.reconnectAttempts),
      20000,
    );

    this.reconnectAttempts++;

    console.log(`[WebSocket] Reconnecting in ${Math.round(delay / 1000)}s`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(data));

        return true;
      } catch (error) {
        console.error('[WebSocket] Send failed:', error);

        return false;
      }
    }

    console.warn('[WebSocket] Socket is not open.');

    return false;
  }

  disconnect() {
    this.isExplicitlyClosed = true;

    clearTimeout(this.reconnectTimer);

    if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        console.error('[WebSocket] Close error:', error);
      }

      this.ws = null;
    }

    this.isConnected = false;

    this.updateGlobalConnectionIndicator('disconnected');
  }

  updateGlobalConnectionIndicator(status) {
    const dots = document.querySelectorAll('.ws-status-dot');

    const textElements = document.querySelectorAll('.ws-status-text');

    dots.forEach((dot) => {
      dot.className =
        'status-dot ws-status-dot ' +
        (status === 'connected'
          ? 'online'
          : status === 'connecting'
            ? 'connecting'
            : 'offline');
    });

    textElements.forEach((element) => {
      element.textContent =
        status === 'connected'
          ? 'Real-time Online'
          : status === 'connecting'
            ? 'Connecting...'
            : status === 'failed'
              ? 'Connection Failed'
              : 'Reconnecting...';
    });
  }

  handleGlobalNotifications(type, data) {
    if (typeof UI === 'undefined') {
      return;
    }

    if (type === 'connection_request') {
      const from = data.from_name
        ? `${data.from_name} (${data.from_remote_id})`
        : data.from_remote_id;

      UI.showToast(
        `Incoming connection request from ${from}`,
        'info',
        'Connection Request',
      );

      this.dispatch('incoming_request_received', data);
    } else if (type === 'connection_response') {
      if (data.status === 'accepted') {
        UI.showToast(
          `User ${data.responder_remote_id} accepted your connection request!`,
          'success',
          'Connection Accepted',
        );
      } else {
        UI.showToast(
          `User ${data.responder_remote_id} rejected your connection request.`,
          'warning',
          'Connection Rejected',
        );
      }
    } else if (type === 'session_created') {
      UI.showToast(
        `Active session established: ${data.session_id}`,
        'success',
        'Session Started',
      );

      if (!window.location.pathname.endsWith('session.html')) {
        localStorage.setItem(
          CONFIG.STORAGE_KEYS.ACTIVE_SESSION,
          data.session_id,
        );
      }
    } else if (type === 'session_ended') {
      UI.showToast(
        `Session ${data.session_id} has ended`,
        'info',
        'Session Ended',
      );
    }
  }
}

window.websocketService = new WebSocketService();

document.addEventListener('DOMContentLoaded', () => {
  if (
    typeof auth !== 'undefined' &&
    auth.isAuthenticated &&
    auth.isAuthenticated()
  ) {
    window.websocketService.connect();
  }
});
