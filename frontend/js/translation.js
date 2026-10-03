/**
 * RemoteX - Translation Controller
 * Multilingual in-session translation supporting 14 Indian and regional languages
 */

class TranslationController {
  constructor(sessionId, currentRemoteId, permissionsManager) {
    this.sessionId = sessionId;
    this.currentRemoteId = currentRemoteId;
    this.permissions = permissionsManager;

    this.sourceSelect = document.getElementById('trans-source-lang');
    this.targetSelect = document.getElementById('trans-target-lang');
    this.textInput = document.getElementById('trans-input-text');
    this.translateBtn = document.getElementById('trans-submit-btn');
    this.swapBtn = document.getElementById('trans-swap-btn');
    this.historyContainer = document.getElementById('trans-history-container');
    this.permissionGate = document.getElementById('trans-permission-gate');

    this.translations = [];
    this.initLanguages();
    this.setupListeners();
  }

  initLanguages() {
    const populate = (selectEl, defaultCode) => {
      if (!selectEl) return;
      selectEl.innerHTML = CONFIG.SUPPORTED_LANGUAGES.map(lang => `
        <option value="${lang.code}" ${lang.code === defaultCode ? 'selected' : ''}>
          ${lang.name} (${lang.code})
        </option>
      `).join('');
    };

    populate(this.sourceSelect, 'en');
    populate(this.targetSelect, 'hi');
  }

  setupListeners() {
    // Swap languages button
    if (this.swapBtn) {
      this.swapBtn.addEventListener('click', () => {
        const temp = this.sourceSelect.value;
        this.sourceSelect.value = this.targetSelect.value;
        this.targetSelect.value = temp;
      });
    }

    // Submit translation
    if (this.translateBtn) {
      this.translateBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await this.handleTranslate();
      });
    }

    // Real-time translation notifications
    if (window.websocketService) {
      window.websocketService.on('translation_result', (data) => {
        if (data.session_id === this.sessionId) {
          this.appendTranslation(data);
        }
      });
    }

    // Permission change subscription
    this.permissions.subscribe(() => {
      this.updatePermissionState();
    });
  }

  updatePermissionState() {
    const isAllowed = this.permissions.isAllowed('translation');

    if (this.permissionGate) {
      this.permissionGate.style.display = isAllowed ? 'none' : 'flex';
    }

    if (this.textInput) {
      this.textInput.disabled = !isAllowed;
      this.textInput.placeholder = isAllowed
        ? 'Enter text to translate across participants...'
        : 'Translation permission not granted. Request permission to use translation.';
    }

    if (this.translateBtn) {
      this.translateBtn.disabled = !isAllowed;
    }

    if (isAllowed && this.translations.length === 0) {
      this.loadHistory();
    }
  }

  async loadHistory() {
    if (!this.permissions.isAllowed('translation')) return;

    try {
      const res = await api.getTranslationHistory(this.sessionId);
      this.translations = res.translations || [];
      this.renderHistory();
    } catch (err) {
      console.warn('Failed to load translation history:', err);
    }
  }

  async handleTranslate() {
    if (!this.permissions.isAllowed('translation')) {
      UI.showToast('Translation permission is required', 'warning');
      return;
    }

    const text = this.textInput.value.trim();
    if (!text) {
      UI.showToast('Please enter text to translate', 'warning');
      return;
    }

    const source = this.sourceSelect.value;
    const target = this.targetSelect.value;

    if (source === target) {
      UI.showToast('Source and target languages must be different', 'warning');
      return;
    }

    try {
      UI.setButtonLoading(this.translateBtn, true, 'Translating...');

      const res = await api.translate({
        sessionId: this.sessionId,
        text,
        sourceLanguage: source,
        targetLanguage: target
      });

      this.appendTranslation(res);
      this.textInput.value = '';
    } catch (err) {
      console.error('Translation error:', err);
      UI.showToast(err.message || 'Translation failed', 'error');
    } finally {
      UI.setButtonLoading(this.translateBtn, false);
    }
  }

  appendTranslation(item) {
    if (this.translations.some(t => t.translation_id === item.translation_id)) return;
    this.translations.push(item);
    this.renderHistory();
  }

  renderHistory() {
    if (!this.historyContainer) return;

    if (this.translations.length === 0) {
      this.historyContainer.innerHTML = `
        <div class="empty-state" style="padding: 1.5rem 1rem;">
          <div class="empty-state-icon" style="width: 36px; height: 36px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/></svg>
          </div>
          <div class="empty-state-title" style="font-size: 0.9rem;">No Translations Yet</div>
          <div class="empty-state-desc" style="font-size: 0.8rem;">Select languages above and submit text to perform live in-session translation.</div>
        </div>
      `;
      return;
    }

    this.historyContainer.innerHTML = this.translations.map(t => {
      const isMine = t.from_remote_id === this.currentRemoteId;
      const srcName = CONFIG.SUPPORTED_LANGUAGES.find(l => l.code === t.source_language)?.name || t.source_language;
      const tgtName = CONFIG.SUPPORTED_LANGUAGES.find(l => l.code === t.target_language)?.name || t.target_language;

      return `
        <div class="translation-item-card">
          <div class="trans-header">
            <span class="badge badge-info">${srcName} → ${tgtName}</span>
            <span style="font-size:0.75rem; color:var(--text-muted);">
              ${isMine ? 'You' : escapeHtml(t.from_remote_id)} • ${UI.formatDate(t.created_at)}
            </span>
          </div>

          <div class="trans-body">
            <div class="trans-original">
              <span class="trans-label">Original:</span>
              <p>${escapeHtml(t.original_text)}</p>
            </div>
            <div class="trans-result">
              <span class="trans-label" style="color:var(--accent-secondary);">Translation:</span>
              <p>${escapeHtml(t.translated_text || 'Processing...')}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.historyContainer.scrollTop = this.historyContainer.scrollHeight;
  }
}
