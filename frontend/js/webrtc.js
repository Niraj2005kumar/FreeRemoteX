class WebRTCService {
  constructor(sessionId, currentRemoteId, targetRemoteId, permissionsManager) {
    this.sessionId = sessionId;
    this.currentRemoteId = currentRemoteId;
    this.targetRemoteId = targetRemoteId;
    this.permissions = permissionsManager;

    this.peerConnection = null;
    this.localStream = null;
    this.activeFeature = null; // 'video' | 'voice' | 'screen'
    this.pendingCandidates = [];
    this.signalingQueue = Promise.resolve();
    this.remoteStream = new MediaStream();

    this.onRemoteStreamCallback = null;
    this.onLocalStreamCallback = null;
    this.onStatusChangeCallback = null;

    this.setupSignalingListeners();
    this.permissions.subscribe(() => {
      if (
        this.activeFeature &&
        !this.permissions.isAllowed(this.activeFeature)
      ) {
        console.warn(
          `[WebRTC] ${this.activeFeature} permission was revoked; stopping media`,
        );
        this.stop();
      }
    });
  }

  setupSignalingListeners() {
    if (!window.websocketService) return;

    window.websocketService.on('offer', (msg) => {
      if (this.isMessageForPeer(msg)) {
        this.enqueueSignaling(() => this.handleOffer(msg.data, msg.feature));
      }
    });

    window.websocketService.on('answer', (msg) => {
      if (this.isMessageForPeer(msg)) {
        this.enqueueSignaling(() => this.handleAnswer(msg.data));
      }
    });

    window.websocketService.on('ice-candidate', (msg) => {
      if (this.isMessageForPeer(msg)) {
        this.enqueueSignaling(() => this.handleCandidate(msg.data));
      }
    });

    window.websocketService.on('permission_denied', (msg) => {
      if (
        msg.session_id === this.sessionId &&
        (!msg.feature || msg.feature === this.activeFeature)
      ) {
        UI.showToast(
          `WebRTC signaling rejected by backend: ${msg.message}`,
          'error',
          'Permission Denied',
        );
        this.stop();
      }
    });

    window.websocketService.on('user_offline', (msg) => {
      if (msg.target_remote_id === this.targetRemoteId) {
        UI.showToast(
          'The other participant is not connected to signaling. Reconnect them and try again.',
          'error',
          'Participant Offline',
        );
        this.stop();
      }
    });

    window.websocketService.on('status_change', (msg) => {
      if (
        msg.status === 'disconnected' &&
        (this.peerConnection || this.localStream)
      ) {
        UI.showToast(
          'Signaling disconnected. The media session has been stopped.',
          'error',
          'WebSocket Disconnected',
        );
        this.stop();
      }
    });
  }

  isMessageForPeer(msg) {
    return (
      msg.session_id === this.sessionId &&
      msg.from_remote_id === this.targetRemoteId &&
      (!msg.target_remote_id || msg.target_remote_id === this.currentRemoteId)
    );
  }

  enqueueSignaling(handler) {
    this.signalingQueue = this.signalingQueue.then(handler).catch((error) => {
      console.error(
        '[WebRTC] Signaling message could not be processed:',
        error,
      );
      UI.showToast(
        error.message || 'A WebRTC signaling message could not be processed.',
        'error',
        'WebRTC Error',
      );
    });
  }

  createPeerConnection() {
    if (this.peerConnection) {
      return this.peerConnection;
    }

    console.log('[WebRTC] Creating peer connection');
    const peerConnection = new RTCPeerConnection(CONFIG.RTC_CONFIG);
    this.peerConnection = peerConnection;

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.activeFeature) {
        console.log('[WebRTC] Sending ICE candidate');
        try {
          this.sendSignal({
            type: 'ice-candidate',
            session_id: this.sessionId,
            target_remote_id: this.targetRemoteId,
            feature: this.activeFeature,
            data: event.candidate.toJSON(),
          });
        } catch (error) {
          console.error('[WebRTC] Failed to send ICE candidate:', error);
          UI.showToast(error.message, 'error', 'WebRTC Signaling Error');
          this.stop();
        }
      }
    };

    peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Remote track received:', event.track.kind);
      const remoteStream = event.streams[0] || this.remoteStream;
      if (
        !event.streams[0] &&
        !remoteStream.getTracks().includes(event.track)
      ) {
        remoteStream.addTrack(event.track);
      }
      if (this.onRemoteStreamCallback) {
        this.onRemoteStreamCallback(remoteStream);
      }

      event.track.addEventListener(
        'ended',
        () => {
          if (
            !remoteStream
              .getTracks()
              .some((track) => track.readyState === 'live')
          ) {
            this.onRemoteStreamCallback?.(null);
          }
        },
        { once: true },
      );
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log(`[WebRTC] Connection state: ${state}`);
      if (this.onStatusChangeCallback) {
        this.onStatusChangeCallback(state);
      }
      if (state === 'failed') {
        UI.showToast(
          'The WebRTC connection failed. Check network connectivity and retry.',
          'error',
          'WebRTC Connection Failed',
        );
        this.stop();
      } else if (state === 'closed') {
        this.cleanUpLocalStream();
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log(
        `[WebRTC] ICE connection state: ${peerConnection.iceConnectionState}`,
      );
      if (peerConnection.iceConnectionState === 'failed') {
        UI.showToast(
          'ICE could not establish a peer-to-peer route. Check network connectivity and retry.',
          'error',
          'WebRTC Connection Failed',
        );
      }
    };

    return peerConnection;
  }

  sendSignal(message) {
    if (!window.websocketService?.isConnected) {
      throw new Error(
        'The signaling WebSocket is disconnected. Reconnect before starting media.',
      );
    }
    if (!window.websocketService.send(message)) {
      throw new Error(
        'The signaling message could not be sent. Check the WebSocket connection.',
      );
    }
  }

  /**
   * Start outgoing media or screen share
   * @param {('video'|'voice'|'screen')} feature
   */
  async start(feature) {
    if (!['video', 'voice', 'screen'].includes(feature)) {
      UI.showToast('Unknown media feature requested.', 'error', 'WebRTC Error');
      return false;
    }

    if (!this.permissions.isAllowed(feature)) {
      UI.showToast(
        `Cannot start ${feature}: Permission not approved by remote participant`,
        'warning',
        'Permission Required',
      );
      return false;
    }

    if (
      !navigator.mediaDevices ||
      (feature === 'screen'
        ? !navigator.mediaDevices.getDisplayMedia
        : !navigator.mediaDevices.getUserMedia)
    ) {
      UI.showToast(
        'This browser does not support the required camera or screen capture API. Use an up-to-date browser over HTTPS.',
        'error',
        'Media Not Supported',
      );
      return false;
    }

    if (!window.websocketService?.isConnected) {
      UI.showToast(
        'Signaling is disconnected. Reconnect before starting a call or sharing your screen.',
        'error',
        'WebSocket Disconnected',
      );
      return false;
    }

    try {
      if (this.peerConnection || this.localStream) {
        this.stop();
      }

      this.activeFeature = feature;

      // Acquire media streams
      if (feature === 'video') {
        console.log(
          '[WebRTC] Requesting camera and microphone after video permission check',
        );
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
      } else if (feature === 'voice') {
        console.log(
          '[WebRTC] Requesting microphone after voice permission check',
        );
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        });
      } else if (feature === 'screen') {
        console.log(
          '[WebRTC] Requesting display capture after screen permission check',
        );
        this.localStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: false,
        });

        // Listen for screen share ended by user through browser UI
        this.localStream.getVideoTracks()[0]?.addEventListener(
          'ended',
          () => {
            this.stop();
          },
          { once: true },
        );
      }

      if (!this.permissions.isAllowed(feature)) {
        this.cleanUpLocalStream();
        throw new Error(
          `Permission for '${feature}' was revoked before media could start.`,
        );
      }

      if (this.onLocalStreamCallback && this.localStream) {
        this.onLocalStreamCallback(this.localStream);
      }

      // Add tracks to PeerConnection
      this.createPeerConnection();
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      // Create and send SDP Offer
      console.log('[WebRTC] Creating offer');
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      console.log('[WebRTC] Sending offer');
      this.sendSignal({
        type: 'offer',
        session_id: this.sessionId,
        target_remote_id: this.targetRemoteId,
        feature: this.activeFeature,
        data: {
          type: offer.type,
          sdp: offer.sdp,
        },
      });

      UI.showToast(`Starting ${feature} stream...`, 'info', 'WebRTC Initiated');
      return true;
    } catch (err) {
      console.error(`WebRTC start ${feature} failed:`, err);
      UI.showToast(
        this.getMediaErrorMessage(err, feature),
        'error',
        'Unable to Start Media',
      );
      this.stop();
      return false;
    }
  }

  getMediaErrorMessage(error, feature) {
    if (
      error.name === 'NotAllowedError' ||
      error.name === 'PermissionDeniedError'
    ) {
      return feature === 'screen'
        ? 'Screen capture was denied. Allow screen sharing in your browser to continue.'
        : 'Camera or microphone access was denied. Allow the requested devices in your browser to continue.';
    }
    if (
      error.name === 'NotFoundError' ||
      error.name === 'DevicesNotFoundError'
    ) {
      return feature === 'screen'
        ? 'No screen or window is available to share.'
        : 'No camera or microphone was found.';
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return 'The camera, microphone, or display is already in use by another application.';
    }
    return error.message || `Failed to start ${feature}.`;
  }

  /**
   * Handle incoming SDP Offer
   */
  async handleOffer(offerData, feature) {
    if (!this.permissions.isAllowed(feature)) {
      console.warn(
        `[WebRTC] Received ${feature} offer but permission is not allowed`,
      );
      UI.showToast(
        `The incoming ${feature} offer was ignored because permission is not approved.`,
        'warning',
        'Permission Required',
      );
      return;
    }

    if (!['video', 'voice', 'screen'].includes(feature)) {
      console.error('[WebRTC] Received an offer with an invalid media feature');
      return;
    }

    try {
      this.activeFeature = feature;
      this.createPeerConnection();

      console.log('[WebRTC] Received offer');
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(offerData),
      );
      await this.flushPendingCandidates();

      // Optional: attach local microphone or camera if approved
      if (feature === 'voice' || feature === 'video') {
        try {
          if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error(
              'This browser does not support camera or microphone capture.',
            );
          }
          this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: feature === 'video',
          });
          if (!this.permissions.isAllowed(feature)) {
            this.cleanUpLocalStream();
            this.stop();
            return;
          }
          this.localStream.getTracks().forEach((track) => {
            this.peerConnection.addTrack(track, this.localStream);
          });
          if (this.onLocalStreamCallback) {
            this.onLocalStreamCallback(this.localStream);
          }
        } catch (mediaErr) {
          UI.showToast(
            this.getMediaErrorMessage(mediaErr, feature),
            'warning',
            'Local Media Unavailable',
          );
        }
      }

      console.log('[WebRTC] Creating answer');
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      console.log('[WebRTC] Sending answer');
      this.sendSignal({
        type: 'answer',
        session_id: this.sessionId,
        target_remote_id: this.targetRemoteId,
        feature: this.activeFeature,
        data: {
          type: answer.type,
          sdp: answer.sdp,
        },
      });
    } catch (err) {
      console.error('[WebRTC] Handle offer error:', err);
      UI.showToast(
        err.message || 'Could not answer the remote media offer.',
        'error',
        'WebRTC Error',
      );
    }
  }

  /**
   * Handle incoming SDP Answer
   */
  async handleAnswer(answerData) {
    if (!this.peerConnection) {
      console.warn(
        '[WebRTC] Received an answer before creating a peer connection',
      );
      return;
    }
    try {
      console.log('[WebRTC] Received answer');
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(answerData),
      );
      await this.flushPendingCandidates();
    } catch (err) {
      console.error('[WebRTC] Handle answer error:', err);
    }
  }

  /**
   * Handle incoming ICE Candidate
   */
  async handleCandidate(candidateData) {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      console.log(
        '[WebRTC] Queuing ICE candidate until remote description is ready',
      );
      this.pendingCandidates.push(candidateData);
      return;
    }

    try {
      console.log('[WebRTC] Received ICE candidate');
      await this.peerConnection.addIceCandidate(
        new RTCIceCandidate(candidateData),
      );
    } catch (err) {
      console.error('[WebRTC] Add ICE candidate error:', err);
    }
  }

  async flushPendingCandidates() {
    if (!this.peerConnection?.remoteDescription) {
      return;
    }

    const candidates = this.pendingCandidates.splice(0);
    for (const candidate of candidates) {
      try {
        await this.peerConnection.addIceCandidate(
          new RTCIceCandidate(candidate),
        );
        console.log('[WebRTC] Added queued ICE candidate');
      } catch (err) {
        console.error('[WebRTC] Add queued ICE candidate error:', err);
      }
    }
  }

  /**
   * Stop all streams and close peer connection
   */
  stop() {
    this.cleanUpLocalStream();

    const peerConnection = this.peerConnection;
    this.peerConnection = null;
    this.pendingCandidates = [];
    this.remoteStream = new MediaStream();
    if (peerConnection) {
      peerConnection.close();
    }

    this.activeFeature = null;

    if (this.onRemoteStreamCallback) {
      this.onRemoteStreamCallback(null);
    }
    if (this.onLocalStreamCallback) {
      this.onLocalStreamCallback(null);
    }
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback('closed');
    }
  }

  cleanUpLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop();
      });
      this.localStream = null;
    }
  }
}
