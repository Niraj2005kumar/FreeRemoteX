/**
 * RemoteX - WebRTC Service
 * Real-time Audio, Video, and Screen Sharing peer connection architecture
 * Strictly gated by active permission checks
 */

class WebRTCService {
  constructor(sessionId, currentRemoteId, targetRemoteId, permissionsManager) {
    this.sessionId = sessionId;
    this.currentRemoteId = currentRemoteId;
    this.targetRemoteId = targetRemoteId;
    this.permissions = permissionsManager;

    this.peerConnection = null;
    this.localStream = null;
    this.activeFeature = null; // 'video' | 'voice' | 'screen'

    this.onRemoteStreamCallback = null;
    this.onLocalStreamCallback = null;
    this.onStatusChangeCallback = null;

    this.setupSignalingListeners();
  }

  /**
   * Listen for signaling events forwarded over WebSocket
   */
  setupSignalingListeners() {
    if (!window.websocketService) return;

    window.websocketService.on('offer', async (msg) => {
      if (msg.session_id === this.sessionId && msg.from_remote_id === this.targetRemoteId) {
        await this.handleOffer(msg.data, msg.feature);
      }
    });

    window.websocketService.on('answer', async (msg) => {
      if (msg.session_id === this.sessionId && msg.from_remote_id === this.targetRemoteId) {
        await this.handleAnswer(msg.data);
      }
    });

    window.websocketService.on('ice-candidate', async (msg) => {
      if (msg.session_id === this.sessionId && msg.from_remote_id === this.targetRemoteId) {
        await this.handleCandidate(msg.data);
      }
    });

    window.websocketService.on('permission_denied', (msg) => {
      if (msg.session_id === this.sessionId) {
        UI.showToast(`WebRTC signaling rejected by backend: ${msg.message}`, 'error', 'Permission Denied');
        this.stop();
      }
    });
  }

  /**
   * Initialize RTCPeerConnection
   */
  createPeerConnection() {
    if (this.peerConnection) {
      return this.peerConnection;
    }

    this.peerConnection = new RTCPeerConnection(CONFIG.RTC_CONFIG);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.activeFeature) {
        window.websocketService.send({
          type: 'ice-candidate',
          session_id: this.sessionId,
          target_remote_id: this.targetRemoteId,
          feature: this.activeFeature,
          data: event.candidate.toJSON()
        });
      }
    };

    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Received remote stream track:', event.track.kind);
      if (event.streams && event.streams[0]) {
        if (this.onRemoteStreamCallback) {
          this.onRemoteStreamCallback(event.streams[0]);
        }
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection ? this.peerConnection.connectionState : 'closed';
      console.log('[WebRTC] PeerConnection state:', state);
      if (this.onStatusChangeCallback) {
        this.onStatusChangeCallback(state);
      }
      if (state === 'failed' || state === 'closed') {
        this.cleanUpLocalStream();
      }
    };

    return this.peerConnection;
  }

  /**
   * Start outgoing media or screen share
   * @param {('video'|'voice'|'screen')} feature
   */
  async start(feature) {
    if (!this.permissions.isAllowed(feature)) {
      UI.showToast(`Cannot start ${feature}: Permission not approved by remote participant`, 'warning', 'Permission Required');
      return false;
    }

    try {
      this.activeFeature = feature;
      this.createPeerConnection();

      // Acquire media streams
      if (feature === 'video') {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true
        });
      } else if (feature === 'voice') {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true
        });
      } else if (feature === 'screen') {
        this.localStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: false
        });

        // Listen for screen share ended by user through browser UI
        this.localStream.getVideoTracks()[0].onended = () => {
          this.stop();
        };
      }

      if (this.onLocalStreamCallback && this.localStream) {
        this.onLocalStreamCallback(this.localStream);
      }

      // Add tracks to PeerConnection
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      // Create and send SDP Offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      window.websocketService.send({
        type: 'offer',
        session_id: this.sessionId,
        target_remote_id: this.targetRemoteId,
        feature: this.activeFeature,
        data: {
          type: offer.type,
          sdp: offer.sdp
        }
      });

      UI.showToast(`Starting ${feature} stream...`, 'info', 'WebRTC Initiated');
      return true;

    } catch (err) {
      console.error(`WebRTC start ${feature} failed:`, err);
      UI.showToast(err.message || `Failed to start ${feature}`, 'error');
      this.stop();
      return false;
    }
  }

  /**
   * Handle incoming SDP Offer
   */
  async handleOffer(offerData, feature) {
    if (!this.permissions.isAllowed(feature)) {
      console.warn(`Incoming offer for '${feature}' ignored: Permission not allowed`);
      return;
    }

    try {
      this.activeFeature = feature;
      this.createPeerConnection();

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offerData));

      // Optional: attach local microphone or camera if approved
      if (feature === 'voice' || feature === 'video') {
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: feature === 'video'
          });
          this.localStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.localStream);
          });
          if (this.onLocalStreamCallback) {
            this.onLocalStreamCallback(this.localStream);
          }
        } catch (mediaErr) {
          console.warn('Could not acquire local response stream:', mediaErr);
        }
      }

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      window.websocketService.send({
        type: 'answer',
        session_id: this.sessionId,
        target_remote_id: this.targetRemoteId,
        feature: this.activeFeature,
        data: {
          type: answer.type,
          sdp: answer.sdp
        }
      });

      console.log('[WebRTC] Answer generated and sent for', feature);

    } catch (err) {
      console.error('[WebRTC] Handle offer error:', err);
    }
  }

  /**
   * Handle incoming SDP Answer
   */
  async handleAnswer(answerData) {
    if (!this.peerConnection) return;
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answerData));
      console.log('[WebRTC] Remote description successfully set from Answer');
    } catch (err) {
      console.error('[WebRTC] Handle answer error:', err);
    }
  }

  /**
   * Handle incoming ICE Candidate
   */
  async handleCandidate(candidateData) {
    if (!this.peerConnection) return;
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
    } catch (err) {
      console.error('[WebRTC] Add ICE candidate error:', err);
    }
  }

  /**
   * Stop all streams and close peer connection
   */
  stop() {
    this.cleanUpLocalStream();

    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {}
      this.peerConnection = null;
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
      this.localStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {}
      });
      this.localStream = null;
    }
  }
}
