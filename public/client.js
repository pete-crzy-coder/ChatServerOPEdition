const socket = io();

const chat = document.getElementById('chat');
const msg = document.getElementById('msg');

const username = localStorage.username || prompt('Username?') || 'Anonymous';
localStorage.username = username !== 'Anonymous' ? username : '';
socket.emit('set-username', username);

socket.on('chat', data => {
    const d = document.createElement('div');
    d.className = 'msg';
    d.innerHTML = `<b>${data.user}:</b> ${data.text}`;
    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;
});

socket.on('system', text => {
    const d = document.createElement('div');
    d.className = 'msg';
    d.style.opacity = '0.6';
    d.style.alignSelf = 'center';
    d.textContent = text;
    chat.appendChild(d);
});

function send() {
    if (msg.value.trim()) socket.emit('chat', msg.value);
    msg.value = '';
}

msg.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        send();
    }
});

let pc;
let stream;
let pendingCandidates = [];

function createPeerConnection() {
    pc = new RTCPeerConnection();

    pc.ontrack = e => {
        remote.srcObject = e.streams[0];
    };

    pc.onicecandidate = e => {
        if (e.candidate) socket.emit('ice', e.candidate);
    };
}

async function startVideo() {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    local.srcObject = stream;

    createPeerConnection();
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', offer);
}

socket.on('offer', async offer => {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    local.srcObject = stream;

    createPeerConnection();
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    await pc.setRemoteDescription(offer);

    // flush queued ICE
    for (const c of pendingCandidates) {
        await pc.addIceCandidate(c);
    }
    pendingCandidates = [];

    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    socket.emit('answer', ans);
});

socket.on('answer', async ans => {
    await pc.setRemoteDescription(ans);

    for (const c of pendingCandidates) {
        await pc.addIceCandidate(c);
    }
    pendingCandidates = [];
});

socket.on('ice', async c => {
    if (!c) return;

    if (pc && pc.remoteDescription) {
        try {
            await pc.addIceCandidate(c);
        } catch (e) {
            console.error(e);
        }
    } else {
        pendingCandidates.push(c);
    }
});
