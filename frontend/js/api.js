const CONFIG = {
  API_BASE_URL: 'https://freeremotex.onrender.com',
  WS_BASE_URL: 'wss://freeremotex.onrender.com',
  STORAGE_KEYS: {
    ACTIVE_SESSION: 'remotex_active_session',
  },
};

const API = {
  async request(endpoint, options = {}) {
    const url = `${CONFIG.API_BASE_URL}${endpoint}`;

    const headers = {
      ...(options.headers || {}),
    };

    const token = auth.getToken();

    if (token && !options.skipAuth) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (
      options.body &&
      !(options.body instanceof FormData) &&
      !headers['Content-Type']
    ) {
      headers['Content-Type'] = 'application/json';
    }

    const config = {
      ...options,
      headers,
    };

    try {
      const response = await fetch(url, config);

      if (response.status === 401 && !options.skipAuthRedirect) {
        auth.clearAuth();

        if (typeof UI !== 'undefined') {
          UI.showToast(
            'Your session has expired. Please log in again.',
            'warning',
          );
        }

        setTimeout(() => {
          if (!window.location.pathname.endsWith('login.html')) {
            window.location.href = 'login.html';
          }
        }, 800);

        throw new Error('Unauthorized');
      }

      if (options.responseType === 'blob') {
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || 'Download failed');
        }

        return await response.blob();
      }

      const contentType = response.headers.get('content-type');

      let data = null;

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        const errorMsg =
          data && data.detail
            ? data.detail
            : `Request failed with status ${response.status}`;

        throw new Error(errorMsg);
      }

      return data;
    } catch (error) {
      console.error(
        `API Error [${options.method || 'GET'} ${endpoint}]:`,
        error,
      );

      throw error;
    }
  },

  async register({ name, email, remote_id, password }) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name,
        email,
        remote_id,
        password,
      }),
      skipAuth: true,
    });
  },

  async login({ email, password }) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
      }),
      skipAuth: true,
    });
  },

  async getProfile() {
    return this.request('/user/me');
  },

  async getUserByRemoteId(remoteId) {
    return this.request(`/user/${encodeURIComponent(remoteId)}`);
  },

  async sendConnectionRequest(targetRemoteId) {
    return this.request('/connection/request', {
      method: 'POST',
      body: JSON.stringify({
        target_remote_id: targetRemoteId,
      }),
    });
  },

  async getPendingRequests() {
    return this.request('/connection/pending');
  },

  async getSentRequests() {
    return this.request('/connection/sent');
  },

  async respondConnection(requestId, accept) {
    return this.request(
      `/connection/respond/${encodeURIComponent(
        requestId,
      )}?accept=${Boolean(accept)}`,
      {
        method: 'POST',
      },
    );
  },

  async getSession(sessionId) {
    return this.request(`/session/${encodeURIComponent(sessionId)}`);
  },

  async getMySessions() {
    return this.request('/session/');
  },

  async endSession(sessionId) {
    return this.request(`/session/${encodeURIComponent(sessionId)}/end`, {
      method: 'POST',
    });
  },

  async requestPermission(sessionId, feature) {
    return this.request('/permission/request', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        feature: feature,
      }),
    });
  },

  async respondPermission(sessionId, feature, approved) {
    return this.request('/permission/respond', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        feature: feature,
        approved: Boolean(approved),
      }),
    });
  },

  async revokePermission(sessionId, feature) {
    return this.request('/permission/revoke', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        feature: feature,
      }),
    });
  },

  async getPermissionStatus(sessionId) {
    return this.request(`/permission/status/${encodeURIComponent(sessionId)}`);
  },

  async sendMessage(sessionId, message) {
    return this.request('/chat/send', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        message: message,
      }),
    });
  },

  async getChatHistory(sessionId) {
    return this.request(`/chat/history/${encodeURIComponent(sessionId)}`);
  },

  async clearChatHistory(sessionId) {
    return this.request(`/chat/history/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  },

  async uploadFile(sessionId, file) {
    const formData = new FormData();

    formData.append('file', file);

    return this.request(
      `/file/upload?session_id=${encodeURIComponent(sessionId)}`,
      {
        method: 'POST',
        body: formData,
      },
    );
  },

  async getFiles(sessionId) {
    return this.request(`/file/list/${encodeURIComponent(sessionId)}`);
  },

  async getFileInfo(fileId) {
    return this.request(`/file/${encodeURIComponent(fileId)}`);
  },

  getFileDownloadUrl(fileId) {
    return `${CONFIG.API_BASE_URL}/file/download/${encodeURIComponent(fileId)}`;
  },

  async downloadFile(fileId) {
    return this.request(`/file/download/${encodeURIComponent(fileId)}`, {
      responseType: 'blob',
    });
  },

  async deleteFile(fileId) {
    return this.request(`/file/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
    });
  },

  async translate({ sessionId, text, sourceLanguage, targetLanguage }) {
    const params = new URLSearchParams({
      session_id: sessionId,
      text: text,
      source_language: sourceLanguage,
      target_language: targetLanguage,
    });

    return this.request(`/translation/translate?${params.toString()}`, {
      method: 'POST',
    });
  },

  async getTranslationHistory(sessionId) {
    return this.request(
      `/translation/history/${encodeURIComponent(sessionId)}`,
    );
  },

  async getLanguages() {
    return this.request('/translation/languages');
  },

  async sendMouseCommand({ sessionId, action, x = 0, y = 0, button = 'left' }) {
    return this.request('/control/mouse', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        action,
        x,
        y,
        button,
      }),
    });
  },

  async sendKeyboardCommand({ sessionId, action, key }) {
    return this.request('/control/keyboard', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        action,
        key,
      }),
    });
  },
};

const api = API;
window.CONFIG = CONFIG;
window.API = API;
window.api = api;
