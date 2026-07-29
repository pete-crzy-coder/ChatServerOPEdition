const socket = io();

const localVideo = document.getElementById('local');
localVideo.style.transform = 'scaleX(-1)';
const sidebar = document.getElementById('sidebar');
const chat = document.getElementById('chat');
const msg = document.getElementById('msg');
const btn = document.getElementById('btn');

const peers = {};
const commands = [
    '/set-username',
    '/help',
    '/bob'
];
const pendingCandidates = {};
let stream;

// ---------------- USERNAME ----------------
let username = localStorage.username || prompt('Username?') || 'Anonymous';
socket.emit('set-username', username);

socket.on('username-confirmed', name => {
    username = name;
});

localStorage.username = username !== 'Anonymous' ? username : '';

socket.on('system', text => { const d = document.createElement('div'); d.className = 'msg'; d.style.opacity = '0.6'; d.style.alignSelf = 'center'; d.textContent = text; chat.appendChild(d); });
// ---------------- TEXT CHAT ----------------
socket.on('chat', data => {
    const d = document.createElement('div');
    d.className = 'msg';
    d.innerHTML = `<b>${data.user}:</b> ${data.msg}`;
    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;
});

function send(msg) {
    if (msg.startsWith('/')) {
        if (!commands.includes('msg')) { const d = document.createElement('div'); d.className = 'msg'; d.style.opacity = '0.6'; d.style.alignSelf = 'center'; d.textContent = 'Error: Command does not exist'; chat.appendChild(d); return; }
        const d = document.createElement('div'); d.className = 'msg'; d.style.opacity = '0.6'; d.style.alignSelf = 'center'; d.textContent = 'yo bro commands dont exist yet'; chat.appendChild(d);
    } else {
        socket.emit('chat', msg);
    }
};

msg.addEventListener('keydown', e => {
    if (e.key === 'Enter' && msg.value.trim()) {
        send(msg.value.trim())
        msg.value = '';
    }
});

btn.addEventListener('click', () => {
    if (msg.value.trim()) {
        send(msg.value.trim())
        msg.value = '';
    }
});

// ---------------- VIDEO / WEBRTC ----------------
async function startVideo() {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = stream;
}

const startPromise = startVideo();

async function safeSetRemoteDescription(pc, desc) {
    if (!pc) return;
    if (desc.type === 'answer' && pc.signalingState !== 'have-local-offer') {
        await new Promise(resolve => {
            const interval = setInterval(() => {
                if (pc.signalingState === 'have-local-offer') {
                    clearInterval(interval);
                    resolve();
                }
            }, 10);
        });
    }
    await pc.setRemoteDescription(desc);
}

function createPeer(peerId) {
    if (peers[peerId]) return peers[peerId];
    if (!stream) {
        console.warn('Stream not ready yet for', peerId);
        return null;
    }

    const pc = new RTCPeerConnection();
    peers[peerId] = pc;
    pendingCandidates[peerId] = [];

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = e => {
        if (e.candidate) socket.emit('ice', { to: peerId, candidate: e.candidate });
    };

    pc.ontrack = e => {
        let video = document.getElementById(`remote-${peerId}`);
        if (!video) {
            video = document.createElement('video');
            video.style.transform = 'scaleX(-1)';
            video.id = `remote-${peerId}`;
            video.autoplay = true;
            video.playsInline = true;
            sidebar.appendChild(video);
        }
        video.srcObject = e.streams[0];
    };

    return pc;
}

// ---------------- SIGNALING ----------------
socket.on('peers', async ids => {
    await startPromise;
    for (const id of ids) {
        if (id === socket.id || peers[id]) continue;
        const pc = createPeer(id);
        if (!pc) continue;

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { to: id, offer });
    }
});

socket.on('offer', async ({ from, offer }) => {
    await startPromise;
    const pc = createPeer(from);
    if (!pc) return;

    await pc.setRemoteDescription(offer);

    for (const c of pendingCandidates[from]) await pc.addIceCandidate(c);
    pendingCandidates[from] = [];

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answer', { to: from, answer });
});

socket.on('answer', async ({ from, answer }) => {
    const pc = peers[from];
    if (!pc) return;

    await safeSetRemoteDescription(pc, answer);

    for (const c of pendingCandidates[from]) await pc.addIceCandidate(c);
    pendingCandidates[from] = [];
});

socket.on('ice', async ({ from, candidate }) => {
    const pc = peers[from];
    if (!pc) return;

    if (pc.remoteDescription) await pc.addIceCandidate(candidate);
    else pendingCandidates[from].push(candidate);
});

socket.on('peer-left', id => {
    if (peers[id]) {
        peers[id].close();
        delete peers[id];
    }
    const video = document.getElementById(`remote-${id}`);
    if (video) video.remove();
});
