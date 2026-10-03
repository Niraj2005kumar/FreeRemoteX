/**
 * RemoteX - Authentication Service
 * Manages JWT tokens, user session state, and route protection
 */

const auth = {
  /**
   * Get JWT access token
   * @returns {string|null}
   */
  getToken() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
  },

  /**
   * Store JWT access token
   * @param {string} token
   */
  setToken(token) {
    if (token) {
      localStorage.setItem(CONFIG.STORAGE_KEYS.TOKEN, token);
    } else {
      localStorage.removeItem(CONFIG.STORAGE_KEYS.TOKEN);
    }
  },

  /**
   * Get current user data
   * @returns {Object|null}
   */
  getUser() {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.USER);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse cached user:', e);
      return null;
    }
  },

  /**
   * Save current user data
   * @param {Object} userData
   */
  setUser(userData) {
    if (userData) {
      localStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(userData));
    } else {
      localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);
    }
  },

  /**
   * Check if user is currently logged in
   * @returns {boolean}
   */
  isAuthenticated() {
    const token = this.getToken();
    return Boolean(token && token.trim().length > 0);
  },

  /**
   * Clear all auth session data
   */
  clearAuth() {
    localStorage.removeItem(CONFIG.STORAGE_KEYS.TOKEN);
    localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);
    localStorage.removeItem(CONFIG.STORAGE_KEYS.ACTIVE_SESSION);
    localStorage.removeItem(CONFIG.STORAGE_KEYS.ACTIVE_TARGET);
  },

  /**
   * Route guard: redirect to login if not authenticated
   */
  requireAuth() {
    if (!this.isAuthenticated()) {
      this.clearAuth();
      const current = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `login.html?redirect=${current}`;
      return false;
    }
    return true;
  },

  /**
   * Route guard: redirect to dashboard if already authenticated
   */
  redirectIfAuthenticated() {
    if (this.isAuthenticated()) {
      window.location.href = 'dashboard.html';
      return true;
    }
    return false;
  },

  /**
   * Log out user
   */
  async logout() {
    try {
      if (window.websocketService && typeof window.websocketService.disconnect === 'function') {
        window.websocketService.disconnect();
      }
    } catch (e) {
      console.warn('WebSocket disconnect on logout warning:', e);
    }

    this.clearAuth();
    if (typeof UI !== 'undefined') {
      UI.showToast('You have been logged out', 'info');
    }
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 400);
  }
};
