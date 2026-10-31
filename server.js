import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------------------------------------------------------------------------
// 房间状态机
// phase: waiting -> thinking -> reveal -> success -> (again) thinking / ended
// ---------------------------------------------------------------------------

const rooms = new Map(); // code -> room
const CLEANUP_DELAY = 5 * 60 * 1000; // 双人全断开后 5 分钟回收

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 去掉易混淆的 I L O 0 1
const MASCOTS = ['chick', 'duck']; // 座位 0 = 小鸡, 座位 1 = 小鸭

function makeCode() {
  for (let i = 0; i < 50; i++) {
    let code = '';
    for (let j = 0; j < 4; j++) {
      code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return null;
}

function clampSeconds(s) {
  const n = Number(s);
  if (!Number.isFinite(n)) return 60;
  return Math.min(300, Math.max(10, Math.round(n)));
}

function createRoom(seconds) {
  const code = makeCode();
  if (!code) return null;
  const room = {
    code,
    phase: 'waiting',
    seconds: clampSeconds(seconds),
    round: 0,
    deadline: 0,
    players: [null, null], // { token, socket, connected, submitted, word, choice }
    trail: [], // { round, words:[a,b], matched, sameMeaning }
    result: null, // { matched, sameMeaning }
    timer: null,
    lastGame: null, // 上一局的 trail（再玩一局时保留展示）
  };
  rooms.set(code, room);
  return room;
}

function seatIndex(room, token) {
  return room.players.findIndex((p) => p && p.token === token);
}

function clearTimer(room) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
}

function broadcast(room) {
  for (const p of room.players) {
    if (p && p.connected && p.socket) sendState(p.socket, room);
  }
}

function publicRoom(room) {
  return {
    code: room.code,
    phase: room.phase,
    seconds: room.seconds,
    round: room.round,
    deadline: room.deadline,
    urls: LAN_URLS, // 局域网地址（生成二维码用，避免 localhost 编进去）
    players: room.players.map((p, i) => ({
      seat: i,
      mascot: MASCOTS[i],
      joined: !!p,
      connected: !!p && p.connected,
      submitted: !!p && p.submitted,
      choice: p ? p.choice : null, // reveal 阶段的选择（不含内容，只含动作）
    })),
    trail: room.trail,
    result: room.result,
    lastGame: room.lastGame,
  };
}

// 每个连接一份「个性化」快照：自己的词可见，对方的词揭晓前不可见
function sendState(socket, room) {
  const mySeat = seatIndex(room, socket.token);
  if (mySeat === -1) return;
  const base = publicRoom(room);
  const me = room.players[mySeat];
  const payload = {
    ...base,
    you: {
      seat: mySeat,
      mascot: MASCOTS[mySeat],
      submitted: me.submitted,
      word: me.submitted ? me.word : null,
      choice: me.choice,
    },
    // 揭晓/成功阶段才把对方的词发出来
    revealWords:
      room.phase === 'reveal' || room.phase === 'success'
        ? room.players.map((p) => (p && p.submitted ? p.word : null))
        : null,
    serverNow: Date.now(),
  };
  socket.safeSend({ t: 'state', data: payload });
}

function startRound(room, round) {
  clearTimer(room);
  room.round = round;
  room.phase = 'thinking';
  room.deadline = Date.now() + room.seconds * 1000;
  for (const p of room.players) {
    if (!p) continue;
    p.submitted = false;
    p.word = null;
    p.choice = null;
  }
  room.result = null;
  broadcast(room);
  room.timer = setTimeout(() => {
    // 时间到：按当前提交内容揭晓
    reveal(room);
  }, room.seconds * 1000);
}

function normalizeWord(w) {
  if (typeof w !== 'string') return null;
  const s = w.trim().slice(0, 20);
  return s.length ? s : null;
}

function reveal(room) {
  clearTimer(room);
  const words = room.players.map((p) => (p && p.submitted ? p.word : null));
  const a = words[0];
  const b = words[1];
  const matched = a !== null && b !== null && a.toLowerCase() === b.toLowerCase();
  room.phase = matched ? 'success' : 'reveal';
  room.result = { matched, sameMeaning: false };
  room.trail.push({ round: room.round, words, matched, sameMeaning: false });
  broadcast(room);
}

function onBothChosen(room) {
  const choices = room.players.map((p) => (p ? p.choice : null));
  const bothSameMeaning = choices.every((c) => c === 'sameMeaning');
  if (bothSameMeaning) {
    // 词不同但意思相同 -> 成功
    const entry = room.trail[room.trail.length - 1];
    if (entry) entry.sameMeaning = true;
    room.result = { matched: false, sameMeaning: true };
    room.phase = 'success';
  } else {
    // 只要有一人想继续/或意见不一致，就进下一轮（双 sameMeaning 才算成功）
    startRound(room, room.round + 1);
    return;
  }
  clearTimer(room);
  broadcast(room);
}

function endGame(room) {
  clearTimer(room);
  room.phase = 'ended';
  room.lastGame = room.trail.length ? room.trail : room.lastGame;
  broadcast(room);
}

function playAgain(room) {
  // 双方都点「再玩一局」-> 保留上一局记录摘要，重置进入新一轮
  const choices = room.players.map((p) => (p ? p.choice : null));
  if (!choices.every((c) => c === 'again')) {
    broadcast(room); // 更新等待状态
    return;
  }
  room.lastGame = room.trail.length ? room.trail : room.lastGame;
  room.trail = [];
  startRound(room, 1);
}

// ---------------------------------------------------------------------------
// WebSocket 消息处理
// ---------------------------------------------------------------------------

function attachRoom(socket, room, token) {
  const idx = seatIndex(room, token);
  if (idx !== -1) {
    // 重连回原座位
    const p = room.players[idx];
    p.socket = socket;
    p.connected = true;
  } else {
    const free = room.players.findIndex((p) => !p);
    if (free === -1) {
      socket.safeSend({ t: 'error', message: '房间已满（本版本支持 2 人）' });
      return false;
    }
    room.players[free] = {
      token,
      socket,
      connected: true,
      submitted: false,
      word: null,
      choice: null,
    };
  }
  socket.room = room;
  socket.token = token;
  return true;
}

function dropFromRoom(socket) {
  const room = socket.room;
  socket.room = null;
  if (!room) return;
  const idx = seatIndex(room, socket.token);
  if (idx === -1) return;
  const p = room.players[idx];
  p.connected = false;

  if (room.phase === 'waiting') {
    // 等待阶段直接移出座位
    room.players[idx] = null;
    broadcast(room);
    return;
  }

  // 游戏中断线：保留座位等待重连，通知对方；30 秒还没回来则代为提交
  broadcast(room);
  setTimeout(() => {
    const cur = room.players[idx];
    if (!cur || cur.connected) return;
    if (room.phase === 'thinking' && !cur.submitted) {
      cur.submitted = true;
      cur.word = null; // 未提交视为空词
      if (room.players.filter(Boolean).length === 2 && room.players.every((x) => x.submitted)) {
        reveal(room);
      } else {
        broadcast(room);
      }
    }
  }, 30 * 1000);
}

function handleMessage(socket, msg) {
  // 客户端在 sessionStorage 里保存自己的 token：刷新/断线重连后能回到原座位
  if (!socket.token && typeof msg.token === 'string' && /^[0-9a-f-]{8,64}$/.test(msg.token)) {
    socket.token = msg.token;
  }
  const room = socket.room;
  switch (msg.t) {
    case 'ping':
      socket.safeSend({ t: 'pong', serverNow: Date.now() });
      return;

    case 'create': {
      if (room) return;
      const newRoom = createRoom(msg.seconds);
      if (!newRoom) {
        socket.safeSend({ t: 'error', message: '创建失败，请重试' });
        return;
      }
      if (!attachRoom(socket, newRoom, socket.token)) return;
      sendState(socket, newRoom);
      return;
    }

    case 'join': {
      if (room) return;
      const code = String(msg.code || '').toUpperCase().trim();
      const target = rooms.get(code);
      if (!target) {
        socket.safeSend({ t: 'error', message: '房间不存在，检查一下房间码' });
        return;
      }
      if (!attachRoom(socket, target, socket.token)) return;
      const filled = target.players.filter(Boolean).length;
      if (filled === 2 && target.phase === 'waiting') {
        startRound(target, 1); // 人齐自动开局（内部会 broadcast）
      } else {
        broadcast(target);
      }
      return;
    }

    case 'resume': {
      if (room) return;
      const code = String(msg.code || '').toUpperCase().trim();
      const target = rooms.get(code);
      if (!target) {
        socket.safeSend({ t: 'error', message: '房间已结束或不存在', fatal: true });
        return;
      }
      const idx = target.players.findIndex((p) => p && p.token === socket.token);
      if (idx === -1) {
        socket.safeSend({ t: 'error', message: '你已不在该房间', fatal: true });
        return;
      }
      attachRoom(socket, target, socket.token);
      broadcast(target);
      return;
    }

    case 'settings': {
      // 等待阶段房主可改时长
      if (!room || room.phase !== 'waiting') return;
      room.seconds = clampSeconds(msg.seconds);
      broadcast(room);
      return;
    }

    case 'submit': {
      if (!room || room.phase !== 'thinking') return;
      const idx = seatIndex(room, socket.token);
      if (idx === -1) return;
      const p = room.players[idx];
      if (p.submitted) return;
      p.word = normalizeWord(msg.word);
      p.submitted = true;
      if (room.players.filter(Boolean).length === 2 && room.players.every((x) => x.submitted)) {
        reveal(room);
      } else {
        broadcast(room);
      }
      return;
    }

    case 'choice': {
      if (!room || room.phase !== 'reveal') return;
      const idx = seatIndex(room, socket.token);
      if (idx === -1) return;
      const p = room.players[idx];
      if (!['sameMeaning', 'continue', 'end', 'again'].includes(msg.value)) return;
      p.choice = msg.value;
      const choices = room.players.map((x) => (x ? x.choice : null));
      if (room.phase === 'reveal') {
        if (msg.value === 'end' || choices.includes('end')) {
          endGame(room);
          return;
        }
        if (choices.every(Boolean)) onBothChosen(room);
        else broadcast(room);
      }
      return;
    }

    case 'again': {
      if (!room || room.phase !== 'success') return;
      const idx = seatIndex(room, socket.token);
      if (idx === -1) return;
      room.players[idx].choice = 'again';
      playAgain(room);
      return;
    }

    case 'leave': {
      if (!room) return;
      endGame(room);
      dropFromRoom(socket);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// HTTP：静态文件 + 二维码
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let filePath = urlPath === '/' ? '/index.html' : urlPath;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const abs = path.join(PUBLIC_DIR, filePath);
  if (!abs.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(abs, (err, buf) => {
    if (err) {
      // SPA 兜底：未知路径回首页
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, index) => {
        if (err2) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(index);
      });
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname === '/qr') {
    const data = new URL(req.url, 'http://x').searchParams.get('d') || '';
    try {
      const svg = await QRCode.toString(data, {
        type: 'svg',
        margin: 1,
        color: { dark: '#3A2E1F', light: '#FFFFFF' },
      });
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' });
      res.end(svg);
    } catch {
      res.writeHead(500);
      res.end('qr error');
    }
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (socket) => {
  // 统一的安全发送
  socket.safeSend = (obj) => {
    if (socket.readyState === 1) socket.send(JSON.stringify(obj));
  };

  socket.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    try {
      handleMessage(socket, msg);
    } catch (err) {
      console.error('handleMessage error:', err);
    }
  });

  socket.on('close', () => dropFromRoom(socket));
});

// 房间回收
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyConnected = room.players.some((p) => p && p.connected);
    if (!anyConnected) {
      if (!room.abandonedAt) room.abandonedAt = now;
      if (now - room.abandonedAt > CLEANUP_DELAY) rooms.delete(code);
    } else {
      room.abandonedAt = 0;
    }
  }
}, 30 * 1000);

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

function lanUrls() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const it of ifs[name] || []) {
      if (it.family !== 'IPv4' || it.internal) continue;
      // 198.18.0.0/15 是 Clash/基准测试保留段，虚拟网卡对局域网设备不可达
      if (it.address.startsWith('198.18.') || it.address.startsWith('198.19.')) continue;
      out.push({ name, addr: it.address });
    }
  }
  return out;
}

const LAN_URLS = lanUrls().map(({ addr }) => `http://${addr}:${PORT}`);

server.listen(PORT, '0.0.0.0', async () => {
  const urls = lanUrls();
  const primary = urls[0]?.addr;
  const url = primary ? `http://${primary}:${PORT}` : `http://localhost:${PORT}`;
  console.log('');
  console.log('  🐤 词不一样就跑步 · 本地版已启动');
  console.log('  ────────────────────────────────');
  console.log(`  本机打开:   http://localhost:${PORT}`);
  for (const { name, addr } of urls) {
    console.log(`  手机连接:   http://${addr}:${PORT}   (${name})`);
  }
  console.log('');
  console.log('  📱 手机扫码（同一 WiFi）:');
  try {
    const qr = await QRCode.toString(url, { type: 'terminal', small: true });
    console.log(qr);
  } catch {}
  console.log(`  首选二维码内容: ${url}`);
  console.log('');
});
