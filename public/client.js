const socket = io();

const localVideo = document.getElementById('local');
localVideo.style.transform = 'scaleX(-1)';

const sidebar = document.getElementById('sidebar');
const chat = document.getElementById('chat');
const msg = document.getElementById('msg');
const btn = document.getElementById('btn');

const peers = {};
const commands = [
    'set-username',
    'help',
    'bob'
];

const pendingCandidates = {};
let stream;

// ---------------- USERNAME ----------------

let username = localStorage.username || prompt('Username?') || 'Anonymous';

socket.on('username-confirmed', name => {
    username = name;
    localStorage.username = name !== 'Anonymous' ? name : '';

    tell(`Your username is now ${name}`);
});

socket.emit('set-username', username);

// ---------------- SYSTEM MESSAGES ----------------

socket.on('system', tell);

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
        return command(msg);
    }

    socket.emit('chat', msg);
}

msg.addEventListener('keydown', e => {
    if (e.key === 'Enter' && msg.value.trim()) {
        send(msg.value.trim());
        msg.value = '';
    }
});

btn.addEventListener('click', () => {
    if (msg.value.trim()) {
        send(msg.value.trim());
        msg.value = '';
    }
});

// ---------------- VIDEO / WEBRTC ----------------

async function startVideo() {
    stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });

    localVideo.srcObject = stream;
}

const startPromise = startVideo();

async function safeSetRemoteDescription(pc, desc) {
    if (!pc) return;

    if (
        desc.type === 'answer' &&
        pc.signalingState !== 'have-local-offer'
    ) {
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

    stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
    });

    pc.onicecandidate = e => {
        if (e.candidate) {
            socket.emit('ice', {
                to: peerId,
                candidate: e.candidate
            });
        }
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

        socket.emit('offer', {
            to: id,
            offer
        });
    }
});

socket.on('offer', async ({ from, offer }) => {
    await startPromise;

    const pc = createPeer(from);

    if (!pc) return;

    await pc.setRemoteDescription(offer);

    for (const c of pendingCandidates[from]) {
        await pc.addIceCandidate(c);
    }

    pendingCandidates[from] = [];

    const answer = await pc.createAnswer();

    await pc.setLocalDescription(answer);

    socket.emit('answer', {
        to: from,
        answer
    });
});

socket.on('answer', async ({ from, answer }) => {
    const pc = peers[from];

    if (!pc) return;

    await safeSetRemoteDescription(pc, answer);

    for (const c of pendingCandidates[from]) {
        await pc.addIceCandidate(c);
    }

    pendingCandidates[from] = [];
});

socket.on('ice', async ({ from, candidate }) => {
    const pc = peers[from];

    if (!pc) return;

    if (pc.remoteDescription) {
        await pc.addIceCandidate(candidate);
    } else {
        pendingCandidates[from].push(candidate);
    }
});

socket.on('peer-left', id => {
    if (peers[id]) {
        peers[id].close();
        delete peers[id];
    }

    delete pendingCandidates[id];

    const video = document.getElementById(`remote-${id}`);

    if (video) {
        video.remove();
    }
});

// ---------------- COMMANDS ----------------

function command(cmd) {
    const args = cmd
        .trim()
        .match(/(?:[^\s"]+|"[^"]*")+/g)
        ?.map((x, i) =>
            i === 0
                ? x.slice(1)
                : x.replace(/^"(.*)"$/, '$1')
        ) ?? [];

    cmd = args[0];

    if (!commands.includes(cmd)) {
        return tell('Command not found');
    }

    switch (cmd) {
        case 'set-username':
            if (!args[1]) {
                return tell('Usage: /set-username username');
            }

            socket.emit('set-username', args[1]);
            break;

        case 'help':
            tell('Commands: ' + commands.map(cmd => '/' + cmd).join(', '));
            break;

        case 'bob':
            tell('Bob.');
            break;

        default:
            break;
    }
}

// ---------------- TELL ----------------

function tell(msg) {
    const d = document.createElement('div');

    d.className = 'msg system-msg';
    d.textContent = msg;

    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;
}