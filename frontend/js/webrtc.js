let socket = null;
let peerConnection = null;
let localStream = null;

const ICE_SERVERS = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302',
    },
  ],
};

async function startWebRTC({
  remoteId,
  sessionId,
  feature = 'video',
  myRemoteId,
}) {
  if (!remoteId || !sessionId || !myRemoteId) {
    throw new Error('remoteId, sessionId and myRemoteId are required');
  }

  socket = new WebSocket(`ws://localhost:8000/ws/signaling/${myRemoteId}`);

  socket.onopen = async () => {
    console.log('Signaling connected');

    await createPeerConnection(remoteId, sessionId, feature);

    await startLocalMedia(feature);

    const offer = await peerConnection.createOffer();

    await peerConnection.setLocalDescription(offer);

    sendSignalingMessage({
      type: 'offer',
      target_remote_id: remoteId,
      session_id: sessionId,
      feature: feature,
      data: offer,
    });
  };

  socket.onmessage = async (event) => {
    const message = JSON.parse(event.data);

    await handleSignalingMessage(message, remoteId, sessionId, feature);
  };

  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  socket.onclose = () => {
    console.log('Signaling connection closed');
  };
}

async function createPeerConnection(remoteId, sessionId, feature) {
  peerConnection = new RTCPeerConnection(ICE_SERVERS);

  peerConnection.onicecandidate = (event) => {
    if (!event.candidate) {
      return;
    }

    sendSignalingMessage({
      type: 'ice-candidate',
      target_remote_id: remoteId,
      session_id: sessionId,
      feature: feature,
      data: event.candidate,
    });
  };

  peerConnection.ontrack = (event) => {
    const remoteVideo = document.getElementById('remoteVideo');

    if (remoteVideo) {
      remoteVideo.srcObject = event.streams[0];
    }
  };

  peerConnection.onconnectionstatechange = () => {
    console.log('Connection state:', peerConnection.connectionState);
  };
}

async function startLocalMedia(feature) {
  if (feature === 'video' || feature === 'voice') {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: feature === 'video',
      audio: true,
    });

    const localVideo = document.getElementById('localVideo');

    if (localVideo) {
      localVideo.srcObject = localStream;
    }

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });
  }

  if (feature === 'screen') {
    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });

    const localVideo = document.getElementById('localVideo');

    if (localVideo) {
      localVideo.srcObject = localStream;
    }

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });
  }
}

async function handleSignalingMessage(message, remoteId, sessionId, feature) {
  if (message.type === 'permission_denied') {
    console.error(message.message);
    return;
  }

  if (message.type === 'user_offline') {
    console.error('Remote user is offline');
    return;
  }

  if (message.type === 'offer') {
    if (!peerConnection) {
      await createPeerConnection(remoteId, sessionId, feature);

      await startLocalMedia(feature);
    }

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(message.data),
    );

    const answer = await peerConnection.createAnswer();

    await peerConnection.setLocalDescription(answer);

    sendSignalingMessage({
      type: 'answer',
      target_remote_id: remoteId,
      session_id: sessionId,
      feature: feature,
      data: answer,
    });

    return;
  }

  if (message.type === 'answer') {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(message.data),
    );

    return;
  }

  if (message.type === 'ice-candidate') {
    if (!message.data) {
      return;
    }

    await peerConnection.addIceCandidate(new RTCIceCandidate(message.data));
  }
}

function sendSignalingMessage(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.error('WebSocket is not connected');
    return;
  }

  socket.send(JSON.stringify(message));
}

function endWebRTC() {
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      track.stop();
    });

    localStream = null;
  }

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (socket) {
    socket.close();
    socket = null;
  }

  const localVideo = document.getElementById('localVideo');

  const remoteVideo = document.getElementById('remoteVideo');

  if (localVideo) {
    localVideo.srcObject = null;
  }

  if (remoteVideo) {
    remoteVideo.srcObject = null;
  }
}
