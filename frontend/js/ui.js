/**
 * RemoteX - UI Utilities (Toasts, Modals, Confirmation, Loaders)
 */

const UI = {
  /**
   * Show toast notification
   * @param {string} message - Message text
   * @param {('success'|'error'|'info'|'warning')} type - Toast variant
   * @param {string} [title] - Optional title
   * @param {number} [duration=4000] - Duration in ms
   */
  showToast(message, type = 'info', title = '', duration = 4000) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
      success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`,
      error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
    };

    const displayTitle = title || type.charAt(0).toUpperCase() + type.slice(1);

    toast.innerHTML = `
      <div class="toast-icon">${icons[type] || icons.info}</div>
      <div class="toast-content">
        <div class="toast-title">${displayTitle}</div>
        <div class="toast-message">${escapeHtml(message)}</div>
      </div>
      <button class="toast-close" aria-label="Close notification" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    const removeToast = () => {
      toast.classList.add('toast-leave');
      setTimeout(() => {
        if (toast.parentElement) {
          toast.remove();
        }
      }, 200);
    };

    closeBtn.addEventListener('click', removeToast);

    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(removeToast, duration);
    }
  },

  /**
   * Show confirmation dialog with Promise
   * @param {Object} options
   * @param {string} options.title - Modal title
   * @param {string} options.message - Warning message
   * @param {string} [options.confirmText='Confirm'] - Confirm button text
   * @param {string} [options.cancelText='Cancel'] - Cancel button text
   * @param {boolean} [options.isDestructive=false] - If true, button is styled as danger
   * @returns {Promise<boolean>}
   */
  confirm({ title = 'Confirm Action', message, confirmText = 'Confirm', cancelText = 'Cancel', isDestructive = false }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';

      overlay.innerHTML = `
        <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-header">
            <h3 class="modal-title" id="modal-title">${escapeHtml(title)}</h3>
            <button class="modal-close-btn" aria-label="Close modal" type="button">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <p>${escapeHtml(message)}</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary modal-cancel-btn">${escapeHtml(cancelText)}</button>
            <button type="button" class="btn ${isDestructive ? 'btn-danger' : 'btn-primary'} modal-confirm-btn">${escapeHtml(confirmText)}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('active'));

      const cleanup = (result) => {
        overlay.classList.remove('active');
        setTimeout(() => {
          if (overlay.parentElement) overlay.remove();
        }, 200);
        resolve(result);
      };

      overlay.querySelector('.modal-confirm-btn').addEventListener('click', () => cleanup(true));
      overlay.querySelector('.modal-cancel-btn').addEventListener('click', () => cleanup(false));
      overlay.querySelector('.modal-close-btn').addEventListener('click', () => cleanup(false));

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup(false);
      });

      const handleKey = (e) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', handleKey);
          cleanup(false);
        }
      };
      document.addEventListener('keydown', handleKey);
    });
  },

  /**
   * Set loading state on a button
   * @param {HTMLButtonElement} button
   * @param {boolean} isLoading
   * @param {string} [loadingText]
   */
  setButtonLoading(button, isLoading, loadingText = '') {
    if (!button) return;

    if (isLoading) {
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `
        <span class="spinner"></span>
        <span>${loadingText || button.textContent.trim()}</span>
      `;
    } else {
      button.disabled = false;
      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
      }
    }
  },

  /**
   * Copy text to clipboard with toast notification
   * @param {string} text
   * @param {string} [successMessage='Copied to clipboard']
   */
  async copyToClipboard(text, successMessage = 'Copied to clipboard') {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      this.showToast(successMessage, 'success', 'Copied');
    } catch (err) {
      console.error('Clipboard copy error:', err);
      this.showToast('Failed to copy to clipboard', 'error');
    }
  },

  /**
   * Format ISO date string nicely
   * @param {string|Date} dateStr
   * @returns {string}
   */
  formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return String(dateStr);
    }
  },

  /**
   * Format bytes to readable string
   * @param {number} bytes
   * @returns {string}
   */
  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  },

  /**
   * Setup mobile sidebar toggler if present
   */
  setupMobileSidebar() {
    const toggleBtn = document.getElementById('mobile-sidebar-toggle');
    const sidebar = document.querySelector('.app-sidebar');
    let backdrop = document.querySelector('.sidebar-backdrop');

    if (!backdrop && sidebar) {
      backdrop = document.createElement('div');
      backdrop.className = 'sidebar-backdrop';
      document.body.appendChild(backdrop);
    }

    if (toggleBtn && sidebar && backdrop) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        backdrop.classList.toggle('active');
      });

      backdrop.addEventListener('click', () => {
        sidebar.classList.remove('open');
        backdrop.classList.remove('active');
      });
    }
  }
};

/**
 * Escape HTML to prevent injection
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
