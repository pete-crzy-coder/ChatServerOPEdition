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

const key = await fs.readFile(path.join(__dirname, '../certs/key.pem'));
const cert = await fs.readFile(path.join(__dirname, '../certs/cert.pem'));

const server = https.createServer({ key, cert }, app);
const io = new Server(server);

const usernames = new Set();

io.on('connection', socket => {
  socket.username = null;

  socket.on('set-username', name => {
    const raw = typeof name === 'string' ? name : '';
    let base = raw.slice(0, 20).trim() || 'Anonymous';
    let finalName = base;
    let i = 1;

    if (socket.username) usernames.delete(socket.username);
    while (usernames.has(finalName)) finalName = `${base}${i++}`;

    socket.username = finalName;
    usernames.add(finalName);

    socket.emit('username-confirmed', finalName);
    io.emit('system', `${finalName} joined`);
  });

  socket.on('chat', msg => {
    if (!socket.username || typeof msg !== 'string') return;
    io.emit('chat', { user: socket.username, text: msg });
  });

  socket.on('offer', o => socket.broadcast.emit('offer', o));
  socket.on('answer', a => socket.broadcast.emit('answer', a));
  socket.on('ice', c => socket.broadcast.emit('ice', c));

  socket.on('disconnect', () => {
    if (!socket.username) return;
    usernames.delete(socket.username);
    io.emit('system', `${socket.username} left`);
  });
});

server.listen(8443, () => {
  console.log('🚀 HTTPS Server running at https://localhost:8443');
});
