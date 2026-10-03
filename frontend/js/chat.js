/**
 * RemoteX - In-Session Chat Controller
 * Permission-gated encrypted messaging interface
 */

class ChatController {
  constructor(sessionId, currentRemoteId, permissionsManager) {
    this.sessionId = sessionId;
    this.currentRemoteId = currentRemoteId;
    this.permissions = permissionsManager;

    this.container = document.getElementById('chat-messages-container');
    this.form = document.getElementById('chat-send-form');
    this.input = document.getElementById('chat-message-input');
    this.sendBtn = document.getElementById('chat-send-btn');
    this.clearBtn = document.getElementById('chat-clear-btn');
    this.permissionGate = document.getElementById('chat-permission-gate');

    this.messages = [];
    this.setupListeners();
  }

  setupListeners() {
    // Form submit
    if (this.form) {
      this.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleSendMessage();
      });
    }

    // Clear history
    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', async () => {
        const confirm = await UI.confirm({
          title: 'Clear Chat History',
          message: 'Are you sure you want to permanently clear the chat history for both participants in this session?',
          confirmText: 'Clear Chat',
          isDestructive: true
        });
        if (confirm) {
          await this.clearHistory();
        }
      });
    }

    // Real-time messages via WebSocket
    if (window.websocketService) {
      window.websocketService.on('chat_message', (msg) => {
        if (msg.session_id === this.sessionId) {
          this.appendMessage({
            message_id: msg.message_id,
            from_remote_id: msg.from_remote_id,
            message: msg.message,
            timestamp: msg.timestamp
          });
        }
      });

      window.websocketService.on('chat_history_cleared', (msg) => {
        if (msg.session_id === this.sessionId) {
          this.messages = [];
          this.renderMessages();
          UI.showToast('Chat history cleared by participant', 'info');
        }
      });
    }

    // Permission change updates
    this.permissions.subscribe(() => {
      this.updatePermissionState();
    });
  }

  updatePermissionState() {
    const isAllowed = this.permissions.isAllowed('chat');

    if (this.permissionGate) {
      this.permissionGate.style.display = isAllowed ? 'none' : 'flex';
    }

    if (this.input) {
      this.input.disabled = !isAllowed;
      this.input.placeholder = isAllowed
        ? 'Type a secure message...'
        : 'Chat permission not granted. Request permission to chat.';
    }

    if (this.sendBtn) {
      this.sendBtn.disabled = !isAllowed;
    }

    if (this.clearBtn) {
      this.clearBtn.disabled = !isAllowed;
    }

    if (isAllowed && this.messages.length === 0) {
      this.loadHistory();
    }
  }

  async loadHistory() {
    if (!this.permissions.isAllowed('chat')) return;

    try {
      const res = await api.getChatHistory(this.sessionId);
      this.messages = res.messages || [];
      this.renderMessages();
    } catch (err) {
      console.warn('Could not load chat history:', err);
    }
  }

  async handleSendMessage() {
    if (!this.permissions.isAllowed('chat')) {
      UI.showToast('Chat permission is required to send messages', 'warning');
      return;
    }

    const text = this.input.value.trim();
    if (!text) return;

    try {
      this.input.disabled = true;
      this.sendBtn.disabled = true;

      const res = await api.sendMessage(this.sessionId, text);

      // Append own message immediately
      this.appendMessage({
        message_id: res.message_id,
        from_remote_id: this.currentRemoteId,
        message: text,
        timestamp: res.timestamp || new Date().toISOString()
      });

      this.input.value = '';
    } catch (err) {
      console.error('Send message failed:', err);
      UI.showToast(err.message || 'Failed to send message', 'error');
    } finally {
      this.input.disabled = false;
      this.sendBtn.disabled = false;
      this.input.focus();
    }
  }

  appendMessage(msg) {
    // Avoid duplicates if already rendered
    if (this.messages.some(m => m.message_id === msg.message_id)) return;
    this.messages.push(msg);
    this.renderMessages();
    this.scrollToBottom();
  }

  renderMessages() {
    if (!this.container) return;

    if (this.messages.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state" style="padding: 2rem 1rem;">
          <div class="empty-state-icon" style="width: 36px; height: 36px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div class="empty-state-title" style="font-size: 0.9rem;">No Messages Yet</div>
          <div class="empty-state-desc" style="font-size: 0.8rem;">Send a message to begin real-time session communication.</div>
        </div>
      `;
      return;
    }

    this.container.innerHTML = this.messages.map(m => {
      const isMine = m.from_remote_id === this.currentRemoteId;
      return `
        <div class="chat-message ${isMine ? 'outgoing' : 'incoming'}">
          <div class="chat-bubble">
            <div class="chat-text">${escapeHtml(m.message)}</div>
            <div class="chat-meta">
              <span>${isMine ? 'You' : escapeHtml(m.from_remote_id)}</span>
              <span>•</span>
              <span>${UI.formatDate(m.timestamp)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.scrollToBottom();
  }

  scrollToBottom() {
    if (this.container) {
      this.container.scrollTop = this.container.scrollHeight;
    }
  }

  async clearHistory() {
    try {
      await api.clearChatHistory(this.sessionId);
      this.messages = [];
      this.renderMessages();
      UI.showToast('Chat history cleared', 'success');
    } catch (err) {
      console.error('Failed to clear chat history:', err);
      UI.showToast(err.message || 'Failed to clear chat history', 'error');
    }
  }
}
