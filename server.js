// CIRCUIT server: serves the game and relays online multiplayer (Socket.IO).
// Runs locally and on Render.
//
//   npm install   then   node server.js   (or: npm start)
//   Online multiplayer needs NO key.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 8787;

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));           // serve index.html (game UI) + assets

/* ---------------- Online multiplayer relay (host-authoritative) ---------------- */
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const rooms = {};   // code -> { host: socketId, guest: socketId|null }

function genCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no easily-confused chars
  let c; do { c = ''; for (let i = 0; i < 4; i++) c += A[(Math.random() * A.length) | 0]; } while (rooms[c]);
  return c;
}

io.on('connection', (socket) => {
  let code = null, role = null;

  socket.on('create', (data, ack) => {
    let name = "Player 1";
    let callback = ack;
    if (typeof data === 'function') {
      callback = data;
    } else if (data && data.name) {
      name = data.name;
    }
    code = genCode(); role = 'host'; rooms[code] = { host: socket.id, guest: null, hostName: name };
    socket.join(code); if (callback) callback({ ok: true, code, role });
  });

  socket.on('join', (c, data, ack) => {
    let codeVal = c;
    let name = "Player 2";
    let callback = ack;
    if (typeof data === 'function') {
      callback = data;
    } else if (data && data.name) {
      name = data.name;
    }
    codeVal = String(codeVal || '').toUpperCase(); const r = rooms[codeVal];
    if (!r) { if (callback) callback({ ok: false, error: 'No game with that code.' }); return; }
    if (r.guest) { if (callback) callback({ ok: false, error: 'That game is already full.' }); return; }
    r.guest = socket.id; r.guestName = name; code = codeVal; role = 'guest'; socket.join(codeVal);
    if (callback) callback({ ok: true, code: codeVal, role, hostName: r.hostName });
    io.to(r.host).emit('opponentJoined', { guestName: name });          // tell host to start
  });

  socket.on('state', (s) => { if (code && role === 'host') socket.to(code).emit('state', s); });   // host -> guest
  socket.on('replay', (r) => { if (code && role === 'host') socket.to(code).emit('replay', r); }); // host -> guest (end-of-game replay)
  socket.on('action', (a) => {                                                                     // guest -> host
    if (code && role === 'guest') { const r = rooms[code]; if (r && r.host) io.to(r.host).emit('action', a); }
  });

  socket.on('disconnect', () => {
    if (code && rooms[code]) { socket.to(code).emit('opponentLeft'); delete rooms[code]; }
  });
});

server.listen(PORT, () => console.log('CIRCUIT server on http://localhost:' + PORT + '   (online multiplayer)'));
