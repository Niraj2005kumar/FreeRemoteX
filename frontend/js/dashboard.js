const API_BASE = 'http://localhost:8000';
const token = localStorage.getItem('token');
const myName = localStorage.getItem('name');
const myRemoteId = localStorage.getItem('remote_id');

// Agar login nahi hai to wapas bhejo
if (!token) {
  window.location.href = 'index.html';
}

document.getElementById('userName').textContent = myName;
document.getElementById('myRemoteId').textContent = myRemoteId;

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.clear();
  window.location.href = 'index.html';
});

// --- WebSocket connect karo ---
connectWebSocket(myRemoteId, handleIncomingMessage);

function handleIncomingMessage(data) {
  console.log('📩 Incoming:', data);

  if (data.type === 'connection_request') {
    showIncomingPopup(data);
  }

  if (data.type === 'connection_response') {
    alert(`Your connection request was ${data.status}`);
    loadSessionHistory();
  }

  if (data.type === 'session_created') {
    alert('Session started! Redirecting...');
    window.location.href = `session.html?session_id=${data.session_id}`;
  }
}

// --- Connect button ---
document.getElementById('connectBtn').addEventListener('click', async () => {
  const targetId = document.getElementById('targetRemoteId').value.trim();
  const messageEl = document.getElementById('connectMessage');

  if (!targetId) {
    messageEl.style.color = 'red';
    messageEl.textContent = 'Please enter a Remote ID';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/connection/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ target_remote_id: targetId }),
    });

    const data = await res.json();

    if (res.ok) {
      messageEl.style.color = 'green';
      messageEl.textContent =
        'Connection request sent! Waiting for response...';
    } else {
      messageEl.style.color = 'red';
      messageEl.textContent = data.detail || 'Failed to send request';
    }
  } catch (err) {
    messageEl.style.color = 'red';
    messageEl.textContent = 'Server error';
  }
});

// --- Pending requests load karo ---
async function loadPendingRequests() {
  try {
    const res = await fetch(`${API_BASE}/connection/pending`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    const listEl = document.getElementById('pendingRequestsList');

    if (data.pending_requests.length === 0) {
      listEl.innerHTML = `<p class="empty-text">No pending requests</p>`;
      return;
    }

    listEl.innerHTML = '';
    data.pending_requests.forEach((req) => {
      const item = document.createElement('div');
      item.className = 'request-item';
      item.innerHTML = `
        <span>${req.from_name} (${req.from_remote_id})</span>
        <div class="actions">
          <button class="accept-btn" onclick="respondToRequest('${req.request_id}', true)">Accept</button>
          <button class="reject-btn" onclick="respondToRequest('${req.request_id}', false)">Reject</button>
        </div>
      `;
      listEl.appendChild(item);
    });
  } catch (err) {
    console.error(err);
  }
}

// --- Request ko accept/reject karo ---
async function respondToRequest(requestId, accept) {
  try {
    const res = await fetch(
      `${API_BASE}/connection/respond/${requestId}?accept=${accept}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = await res.json();

    if (res.ok && accept) {
      window.location.href = `session.html?session_id=${data.session_id}`;
    } else {
      loadPendingRequests();
    }
  } catch (err) {
    console.error(err);
  }
}

// --- Incoming popup dikhana (real-time WebSocket se) ---
function showIncomingPopup(data) {
  const popup = document.getElementById('incomingPopup');
  const popupText = document.getElementById('popupText');

  popupText.textContent = `${data.from_name} wants to connect with you`;
  popup.classList.remove('hidden');

  document.getElementById('popupAccept').onclick = () => {
    respondToRequest(data.request_id, true);
    popup.classList.add('hidden');
  };

  document.getElementById('popupReject').onclick = () => {
    respondToRequest(data.request_id, false);
    popup.classList.add('hidden');
  };
}

// --- Session history load karo ---
async function loadSessionHistory() {
  try {
    const res = await fetch(`${API_BASE}/session/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    const listEl = document.getElementById('sessionHistoryList');

    if (data.sessions.length === 0) {
      listEl.innerHTML = `<p class="empty-text">No sessions yet</p>`;
      return;
    }

    listEl.innerHTML = '';
    data.sessions.forEach((session) => {
      const item = document.createElement('div');
      item.className = 'request-item';
      item.innerHTML = `
        <span>With: ${session.with_remote_id} (${session.status})</span>
        <button onclick="window.location.href='session.html?session_id=${session.session_id}'">Open</button>
      `;
      listEl.appendChild(item);
    });
  } catch (err) {
    console.error(err);
  }
}

// Initial load
loadPendingRequests();
loadSessionHistory();

setInterval(loadPendingRequests, 5000);
