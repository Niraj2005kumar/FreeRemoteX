/**
 * RemoteX - File Transfer Controller
 * Governed file uploading, downloading, and audit tracking
 */

class FileTransferController {
  constructor(sessionId, currentRemoteId, permissionsManager) {
    this.sessionId = sessionId;
    this.currentRemoteId = currentRemoteId;
    this.permissions = permissionsManager;

    this.dropzone = document.getElementById('file-dropzone');
    this.fileInput = document.getElementById('file-input');
    this.browseBtn = document.getElementById('file-browse-btn');
    this.filesContainer = document.getElementById('files-list-container');
    this.permissionGate = document.getElementById('file-permission-gate');
    this.uploadProgress = document.getElementById('file-upload-progress');
    this.progressBar = document.getElementById('file-progress-bar');
    this.progressText = document.getElementById('file-progress-text');

    this.files = [];
    this.setupListeners();
  }

  setupListeners() {
    // Browse button triggers file input
    if (this.browseBtn && this.fileInput) {
      this.browseBtn.addEventListener('click', () => {
        if (!this.permissions.isAllowed('file_transfer')) {
          UI.showToast('File transfer permission is not granted', 'warning');
          return;
        }
        this.fileInput.click();
      });
    }

    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.uploadFile(e.target.files[0]);
          this.fileInput.value = '';
        }
      });
    }

    // Drag and Drop
    if (this.dropzone) {
      ['dragenter', 'dragover'].forEach(eventName => {
        this.dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.permissions.isAllowed('file_transfer')) {
            this.dropzone.classList.add('drag-active');
          }
        });
      });

      ['dragleave', 'drop'].forEach(eventName => {
        this.dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.dropzone.classList.remove('drag-active');
        });
      });

      this.dropzone.addEventListener('drop', (e) => {
        if (!this.permissions.isAllowed('file_transfer')) {
          UI.showToast('File transfer permission is required to upload files', 'warning');
          return;
        }
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.uploadFile(e.dataTransfer.files[0]);
        }
      });
    }

    // WebSocket real-time events
    if (window.websocketService) {
      window.websocketService.on('file_received', (data) => {
        if (data.session_id === this.sessionId) {
          this.loadFiles();
          UI.showToast(`New file received: ${data.filename}`, 'info', 'File Received');
        }
      });

      window.websocketService.on('file_deleted', (data) => {
        if (data.session_id === this.sessionId) {
          this.loadFiles();
          UI.showToast(`A file was removed from the session`, 'info', 'File Deleted');
        }
      });
    }

    // Permissions subscription
    this.permissions.subscribe(() => {
      this.updatePermissionState();
    });
  }

  updatePermissionState() {
    const isAllowed = this.permissions.isAllowed('file_transfer');

    if (this.permissionGate) {
      this.permissionGate.style.display = isAllowed ? 'none' : 'flex';
    }

    if (this.dropzone) {
      this.dropzone.style.opacity = isAllowed ? '1' : '0.4';
      this.dropzone.style.pointerEvents = isAllowed ? 'auto' : 'none';
    }

    if (isAllowed) {
      this.loadFiles();
    }
  }

  async loadFiles() {
    if (!this.permissions.isAllowed('file_transfer')) return;

    try {
      const res = await api.getFiles(this.sessionId);
      this.files = res.files || [];
      this.renderFiles();
    } catch (err) {
      console.warn('Failed to load session files:', err);
    }
  }

  async uploadFile(file) {
    if (!this.permissions.isAllowed('file_transfer')) {
      UI.showToast('File transfer permission is not granted', 'warning');
      return;
    }

    // Client-side limit: 100 MB
    if (file.size > 100 * 1024 * 1024) {
      UI.showToast('File exceeds the 100 MB maximum size limit', 'error', 'File Too Large');
      return;
    }

    try {
      this.showProgress(true, `Uploading ${file.name}...`);

      const res = await api.uploadFile(this.sessionId, file);
      UI.showToast(`Uploaded ${res.filename} (${UI.formatBytes(res.size)})`, 'success', 'Upload Complete');

      await this.loadFiles();
    } catch (err) {
      console.error('File upload error:', err);
      UI.showToast(err.message || 'File upload failed', 'error');
    } finally {
      this.showProgress(false);
    }
  }

  showProgress(visible, text = '') {
    if (!this.uploadProgress) return;
    this.uploadProgress.style.display = visible ? 'block' : 'none';
    if (this.progressText) this.progressText.textContent = text;
  }

  renderFiles() {
    if (!this.filesContainer) return;

    if (this.files.length === 0) {
      this.filesContainer.innerHTML = `
        <div class="empty-state" style="padding: 2rem 1rem;">
          <div class="empty-state-icon" style="width: 36px; height: 36px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div class="empty-state-title" style="font-size: 0.9rem;">No Files Transferred</div>
          <div class="empty-state-desc" style="font-size: 0.8rem;">Drag and drop documents or packages to share securely within this session.</div>
        </div>
      `;
      return;
    }

    this.filesContainer.innerHTML = this.files.map(f => {
      const isMine = f.from_remote_id === this.currentRemoteId;
      return `
        <div class="file-item-card" id="file-${f.file_id}">
          <div class="file-item-main">
            <div class="file-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
            </div>
            <div>
              <div class="file-name" title="${escapeHtml(f.filename)}">${escapeHtml(f.filename)}</div>
              <div class="file-meta">
                <span>${UI.formatBytes(f.size)}</span>
                <span>•</span>
                <span>From: ${isMine ? 'You' : escapeHtml(f.from_remote_id)}</span>
                <span>•</span>
                <span>${UI.formatDate(f.created_at)}</span>
              </div>
            </div>
          </div>
          <div class="file-actions">
            <button type="button" class="btn btn-secondary btn-sm download-file-btn" data-id="${f.file_id}" data-name="${escapeHtml(f.filename)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download
            </button>
            <button type="button" class="btn btn-danger-outline btn-sm delete-file-btn" data-id="${f.file_id}" title="Delete file">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach download actions
    this.filesContainer.querySelectorAll('.download-file-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fileId = btn.getAttribute('data-id');
        const filename = btn.getAttribute('data-name');
        await this.handleDownload(fileId, filename, btn);
      });
    });

    // Attach delete actions
    this.filesContainer.querySelectorAll('.delete-file-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fileId = btn.getAttribute('data-id');
        const confirm = await UI.confirm({
          title: 'Delete File',
          message: 'Are you sure you want to delete this file from the session? This cannot be undone.',
          confirmText: 'Delete',
          isDestructive: true
        });
        if (confirm) {
          await this.handleDelete(fileId);
        }
      });
    });
  }

  async handleDownload(fileId, filename, btnEl) {
    try {
      UI.setButtonLoading(btnEl, true, 'Saving...');
      const blob = await api.downloadFile(fileId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      UI.showToast(`Downloaded ${filename}`, 'success');
    } catch (err) {
      console.error('Download error:', err);
      UI.showToast(err.message || 'Download failed', 'error');
    } finally {
      UI.setButtonLoading(btnEl, false);
    }
  }

  async handleDelete(fileId) {
    try {
      await api.deleteFile(fileId);
      UI.showToast('File deleted successfully', 'info');
      await this.loadFiles();
    } catch (err) {
      console.error('Delete file error:', err);
      UI.showToast(err.message || 'Failed to delete file', 'error');
    }
  }
}
