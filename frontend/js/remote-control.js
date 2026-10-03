/**
 * RemoteX - Remote Control Service
 * Handles mouse and keyboard capture and dispatches commands to backend
 * Strictly gated by active mouse and keyboard permissions
 */

class RemoteControlService {
  constructor(sessionId, permissionsManager) {
    this.sessionId = sessionId;
    this.permissions = permissionsManager;

    this.interactiveCanvas = document.getElementById('remote-stream-canvas');
    this.screenOverlay = document.getElementById('remote-screen-overlay');
    this.controlToggleBtn = document.getElementById('toggle-remote-control-btn');
    this.controlStatusBadge = document.getElementById('remote-control-status');

    this.isCapturing = false;
    this.lastMouseMoveTime = 0;
    this.throttleMs = 40; // 25 fps max for cursor tracking

    this.setupListeners();
  }

  setupListeners() {
    if (this.controlToggleBtn) {
      this.controlToggleBtn.addEventListener('click', () => {
        this.toggleCapture();
      });
    }

    // Subscribe to permission changes
    this.permissions.subscribe(() => {
      this.checkPermissions();
    });

    if (this.interactiveCanvas) {
      // Mouse move
      this.interactiveCanvas.addEventListener('mousemove', (e) => {
        if (!this.isCapturing || !this.permissions.isAllowed('mouse')) return;
        const now = Date.now();
        if (now - this.lastMouseMoveTime > this.throttleMs) {
          this.lastMouseMoveTime = now;
          const coords = this.getNormalizedCoordinates(e);
          api.sendMouseCommand({
            sessionId: this.sessionId,
            action: 'move',
            x: coords.x,
            y: coords.y
          }).catch(err => console.debug('Mouse command discarded:', err));
        }
      });

      // Mouse down / up / click
      this.interactiveCanvas.addEventListener('mousedown', (e) => {
        if (!this.isCapturing || !this.permissions.isAllowed('mouse')) return;
        const coords = this.getNormalizedCoordinates(e);
        const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
        api.sendMouseCommand({
          sessionId: this.sessionId,
          action: 'mousedown',
          x: coords.x,
          y: coords.y,
          button
        }).catch(err => console.debug('Mousedown discarded:', err));
      });

      this.interactiveCanvas.addEventListener('mouseup', (e) => {
        if (!this.isCapturing || !this.permissions.isAllowed('mouse')) return;
        const coords = this.getNormalizedCoordinates(e);
        const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
        api.sendMouseCommand({
          sessionId: this.sessionId,
          action: 'mouseup',
          x: coords.x,
          y: coords.y,
          button
        }).catch(err => console.debug('Mouseup discarded:', err));
      });

      // Context menu prevent default during capture
      this.interactiveCanvas.addEventListener('contextmenu', (e) => {
        if (this.isCapturing && this.permissions.isAllowed('mouse')) {
          e.preventDefault();
          const coords = this.getNormalizedCoordinates(e);
          api.sendMouseCommand({
            sessionId: this.sessionId,
            action: 'right_click',
            x: coords.x,
            y: coords.y,
            button: 'right'
          }).catch(err => console.debug('Right click discarded:', err));
        }
      });

      // Wheel scroll
      this.interactiveCanvas.addEventListener('wheel', (e) => {
        if (!this.isCapturing || !this.permissions.isAllowed('mouse')) return;
        e.preventDefault();
        const coords = this.getNormalizedCoordinates(e);
        api.sendMouseCommand({
          sessionId: this.sessionId,
          action: 'scroll',
          x: coords.x,
          y: Math.sign(e.deltaY)
        }).catch(err => console.debug('Scroll discarded:', err));
      }, { passive: false });
    }

    // Keyboard capture on window when capturing is active
    window.addEventListener('keydown', (e) => {
      if (!this.isCapturing || !this.permissions.isAllowed('keyboard')) return;

      // Do not capture if typing in input fields
      const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      // Allow Escape to cancel capture
      if (e.key === 'Escape') {
        this.disableCapture();
        UI.showToast('Remote control released (Escape)', 'info', '', 1500);
        return;
      }

      e.preventDefault();
      api.sendKeyboardCommand({
        sessionId: this.sessionId,
        action: 'keydown',
        key: e.key
      }).catch(err => console.debug('Keydown discarded:', err));
    });

    window.addEventListener('keyup', (e) => {
      if (!this.isCapturing || !this.permissions.isAllowed('keyboard')) return;
      const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      e.preventDefault();
      api.sendKeyboardCommand({
        sessionId: this.sessionId,
        action: 'keyup',
        key: e.key
      }).catch(err => console.debug('Keyup discarded:', err));
    });
  }

  getNormalizedCoordinates(e) {
    const rect = this.interactiveCanvas.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1920);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1080);
    return {
      x: Math.max(0, Math.min(1920, x)),
      y: Math.max(0, Math.min(1080, y))
    };
  }

  checkPermissions() {
    const hasMouse = this.permissions.isAllowed('mouse');
    const hasKeyboard = this.permissions.isAllowed('keyboard');

    if (!hasMouse && !hasKeyboard && this.isCapturing) {
      this.disableCapture();
      UI.showToast('Remote control permissions revoked. Control disabled.', 'warning', 'Control Disabled');
    }

    if (this.controlToggleBtn) {
      const canControl = hasMouse || hasKeyboard;
      this.controlToggleBtn.disabled = !canControl;
      if (!canControl) {
        this.controlToggleBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Control Gated
        `;
      } else if (!this.isCapturing) {
        this.controlToggleBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          Engage Control
        `;
      }
    }
  }

  toggleCapture() {
    if (this.isCapturing) {
      this.disableCapture();
    } else {
      this.enableCapture();
    }
  }

  enableCapture() {
    const hasMouse = this.permissions.isAllowed('mouse');
    const hasKeyboard = this.permissions.isAllowed('keyboard');

    if (!hasMouse && !hasKeyboard) {
      UI.showToast('Mouse or Keyboard permission is required to engage remote control', 'warning');
      return;
    }

    this.isCapturing = true;
    if (this.interactiveCanvas) {
      this.interactiveCanvas.classList.add('capturing-active');
      this.interactiveCanvas.focus();
    }

    if (this.controlToggleBtn) {
      this.controlToggleBtn.classList.remove('btn-secondary');
      this.controlToggleBtn.classList.add('btn-accent');
      this.controlToggleBtn.innerHTML = `
        <span class="status-dot online"></span>
        Controlling (Esc to Release)
      `;
    }

    if (this.controlStatusBadge) {
      this.controlStatusBadge.textContent = 'Active Control';
      this.controlStatusBadge.className = 'badge badge-success';
    }

    UI.showToast('Remote control engaged. Press Escape to release.', 'info', 'Control Active');
  }

  disableCapture() {
    this.isCapturing = false;
    if (this.interactiveCanvas) {
      this.interactiveCanvas.classList.remove('capturing-active');
    }

    if (this.controlToggleBtn) {
      this.controlToggleBtn.classList.remove('btn-accent');
      this.controlToggleBtn.classList.add('btn-secondary');
      this.controlToggleBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        Engage Control
      `;
    }

    if (this.controlStatusBadge) {
      this.controlStatusBadge.textContent = 'Passive View';
      this.controlStatusBadge.className = 'badge badge-neutral';
    }
  }
}
