import fs from 'fs/promises';
import https from 'https';
import express from 'express';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const key = await fs.readFile('/home/craz4c0mput3r/.acme.sh/craz4.duckdns.org_ecc/craz4.duckdns.org.key');
const cert = await fs.readFile('/home/craz4c0mput3r/.acme.sh/craz4.duckdns.org_ecc/fullchain.cer');

const server = https.createServer({ key, cert }, app);
const io = new Server(server);

let usernames = [];

// ---------------- CHAT ----------------
io.on('connection', socket => {
  // ---------------- USERNAME ----------------
  socket.on('set-username', usernameReq => {
    let username;
    if (usernames.includes(usernameReq)) {
      let i = 1;
      while (usernames.includes(usernameReq + i)) i++;
      username = usernameReq + i;
    } else {
      username = usernameReq;
    }
    usernames.push(username);

    socket.emit('username-confirmed', username);
    io.emit('system', `${username} joined`);
    console.log(`${username} connected`);
    socket.username = username;
  });

  // send all current peers to new socket
  socket.emit(
  'peers',
  Array.from(io.sockets.sockets.keys()).filter(id => id !== socket.id)
);

  // Chat messaging
  socket.on('chat', msg => {
    const user = socket.username;
    io.emit('chat', { user, msg });
  });

  // WebRTC signaling
  socket.on('offer', ({ to, offer }) => {
    socket.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ to, answer }) => {
    socket.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice', ({ to, candidate }) => {
    socket.to(to).emit('ice', { from: socket.id, candidate });
  });

  socket.on('disconnect', () => {
    io.emit('peer-left', socket.id);
    if (socket.username) {
      usernames = usernames.filter(u => u !== socket.username);
      io.emit('system', `${socket.username} left`);
      console.log(`${socket.username} disconnected`);
    }
  });
});

server.listen(8443, () => {
  console.log('🚀 HTTPS Server running at https://localhost:8443');
});
