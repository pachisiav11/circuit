// CIRCUIT server: serves the game, relays online multiplayer (Socket.IO), and
// optionally answers the OpenAI opponent. Runs locally and on Render.
//
//   npm install   then   node server.js   (or: npm start)
//   Online multiplayer needs NO key. The OpenAI opponent needs OPENAI_API_KEY in .env.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
let OpenAI = null; try { OpenAI = require('openai'); } catch (e) { /* openai optional */ }

const MODEL = 'gpt-5.4-nano';                 // <-- change if your account uses a different model id
const PORT = process.env.PORT || 8787;

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));           // serve index.html (game UI) + assets

/* ---------------- OpenAI opponent (optional) ---------------- */
let client = null;
if (process.env.OPENAI_API_KEY && OpenAI) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function describe(a) {
  switch (a.type) {
    case 'roll': return 'Roll the d3 to move 1-3 steps this turn.';
    case 'hold': return 'Hold: bank +5 coins (max 20) and end your turn without moving.';
    case 'step': return 'Move your token onto ' + a.state + ' (pass through; no claim).';
    case 'claim': return 'Claim Flop state ' + a.state + ' for $' + a.cost + ' (ends your turn).';
    case 'steal': return 'Seize the opponent tile you are standing on for double price (ends your turn).';
    case 'buyContract': return 'Buy your secret contract tile (ends your turn).';
    case 'blocked': return 'No legal move: reroll to swap out one Flop entry.';
    case 'end': return 'End your turn now.';
    default: return a.type;
  }
}
const GAME_RULES = [
  'You are Player 2 (an AI) in CIRCUIT, a two-player turn-based territory game. Play to WIN.',
  'OBJECTIVE: After 20 turns, the winner has the most states in a SINGLE connected cluster (states you own linked through shared borders). Only your LARGEST connected cluster counts. Tiebreakers: most total states, then most coins spent, else draw. Connection beats raw count.',
  'MAP: 25 states with price tiers $2 (weak edges) up to $8 = GRAIL (central hub, most connections). Central, costly states connect more and are best for growing and for cutting the opponent.',
  'COINS: start 15, NO income except Hold, capped at 20, never overspend.',
  'EACH TURN: ROLL a d3 (move 1-3 steps) or HOLD (+5 coins, end turn). Moving: own/empty land is free; stepping onto an opponent tile costs 1 coin; CLAIM a Flop state by stepping onto it (ends turn); SEIZE an opponent tile you stand on for double price (ends turn); buy your private SECRET CONTRACT tile by walking onto it.',
  'STRATEGY: claim valuable states that CONNECT to your cluster; take central hubs; seize opponent bridge tiles to split their cluster; hold when low on coins; do not scatter.',
  'Choose the single best action by calling exactly ONE of the provided function tools.'
].join('\n');

/* ---------------- AI Strategist hint / taunt ---------------- */
const STRATEGIST_SYSTEM = [
  'You are the CIRCUIT AI Strategist — a sharp, slightly cocky board-game coach.',
  'CIRCUIT is a 2-player territory game on 25 states. The goal is to build the',
  'LARGEST single CONNECTED cluster of states you own (only your biggest cluster',
  'scores; ties break by total states, then coins spent). Central, pricier states',
  '(GRAIL is the $8 hub) connect more and are strongest. Income is scarce: you only',
  'gain coins by HOLDING (+5, capped at 20), so never overspend. Each turn you ROLL',
  'a d3 to move and claim a Flop tile, HOLD for coins, or SEIZE an opponent tile for',
  'double price to split their cluster. You also hold one secret contract tile.',
  'Given a snapshot of the board, reply with ONE punchy hint (1-2 sentences, under 40',
  'words) telling the active player their single best idea right now. If asked for a',
  'taunt, give a short playful in-character jab instead. Be concrete: name states,',
  'coins, or "hold" when it fits. No preamble, no lists — just the line.'
].join(' ');

function buildHintPrompt(board, mode) {
  const lines = [];
  lines.push(`Turn ${board.turn || '?'} of ${board.maxTurns || '?'}.`);
  lines.push(`Active player: ${board.activePlayerName || 'You'} (P${board.activePlayer || '?'}).`);
  lines.push(`Your coins: ${board.yourCoins ?? '?'}. Opponent coins: ${board.oppCoins ?? '?'}.`);
  lines.push(`Your largest connected cluster: ${board.yourCluster || 0} states (you own ${board.yourTotal || 0} total).`);
  lines.push(`Opponent's largest connected cluster: ${board.oppCluster || 0} states (they own ${board.oppTotal || 0} total).`);
  lines.push(`You are standing on: ${board.yourTile || '?'}.`);
  if (Array.isArray(board.flop) && board.flop.length) {
    lines.push('Claimable Flop tiles right now: ' + board.flop.map(f => `${f.state} ($${f.cost})`).join(', ') + '.');
  }
  if (board.contract) {
    lines.push(`Your secret contract target: ${board.contract.state} ($${board.contract.cost}).`);
  }
  if (Array.isArray(board.yourTiles) && board.yourTiles.length) {
    lines.push('States you own: ' + board.yourTiles.join(', ') + '.');
  }
  lines.push(mode === 'taunt'
    ? '\nGive a short, playful in-character taunt about this position.'
    : '\nGive me my single best strategic move right now.');
  return lines.join('\n');
}

app.post('/api/ai-hint', async (req, res) => {
  try {
    if (!client) return res.status(503).json({ error: 'OpenAI not configured (no OPENAI_API_KEY).' });
    const { board = {}, mode = 'hint' } = req.body || {};
    const userPrompt = buildHintPrompt(board, mode);
    console.log(`[ai-hint] -> OpenAI ${MODEL}  (mode=${mode})`);
    const r = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: STRATEGIST_SYSTEM },
        { role: 'user', content: userPrompt }
      ],
      max_completion_tokens: 120
    });
    const text = (r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content || '').trim()
      || 'Hold for coins and build out from your strongest cluster.';
    console.log(`[ai-hint] <- "${text.slice(0, 80)}..."`);
    res.json({ hint: text, mode });
  } catch (e) { console.error('ai-hint error:', e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/ai-move', async (req, res) => {
  try {
    if (!client) return res.status(503).json({ error: 'OpenAI not configured (no OPENAI_API_KEY).' });
    const { state, actions } = req.body || {};
    if (!Array.isArray(actions) || !actions.length) return res.status(400).json({ error: 'no actions' });
    const tools = actions.map(a => ({ type: 'function', function: { name: a.id, description: describe(a), parameters: { type: 'object', properties: {}, additionalProperties: false } } }));
    const usr = 'Current state:\n' + JSON.stringify(state, null, 1) + '\n\nChoose one action by calling its tool.';
    console.log('[ai-move] -> OpenAI ' + MODEL + '  (turn ' + (state && state.turn) + ', ' + actions.length + ' options)');
    const r = await client.chat.completions.create({ model: MODEL, messages: [{ role: 'system', content: GAME_RULES }, { role: 'user', content: usr }], tools, tool_choice: 'required' });
    const call = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.tool_calls && r.choices[0].message.tool_calls[0];
    let action = call ? call.function.name : actions[0].id;
    if (!actions.some(a => a.id === action)) action = actions[0].id;
    console.log('[ai-move] <- OpenAI chose: ' + action + '  (tokens ' + (r.usage ? r.usage.total_tokens : '?') + ')');
    res.json({ action });
  } catch (e) { console.error('ai-move error:', e.message); res.status(500).json({ error: e.message }); }
});

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

server.listen(PORT, () => console.log('CIRCUIT server on http://localhost:' + PORT + '   (online multiplayer + ' + (client ? 'OpenAI ready' : 'OpenAI off') + ')'));
