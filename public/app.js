/* 词不一样就跑步 · 本地版 — 前端 */

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

const TOKEN_KEY = 'cbyyjpb.token';
const SESSION_KEY = 'cbyyjpb.session'; // JSON: { code }

let token = sessionStorage.getItem(TOKEN_KEY);
if (!token) {
  token = crypto.randomUUID();
  sessionStorage.setItem(TOKEN_KEY, token);
}

// ---------------------------------------------------------------------------
// 原创吉祥物：小黄鸡（P1）× 小白鸭（P2）
// ---------------------------------------------------------------------------

function chickSVG() {
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="60" cy="107" rx="26" ry="5" fill="rgba(87,63,24,.10)"/>
  <path d="M49 95v7m-7 0h14M71 95v7m-7 0h14" stroke="#EDAE1B" stroke-width="4.5" stroke-linecap="round" fill="none"/>
  <ellipse cx="60" cy="63" rx="37" ry="35" fill="#FFD24C"/>
  <ellipse cx="60" cy="78" rx="26" ry="16" fill="rgba(87,63,24,.06)"/>
  <path d="M51 27c-3-9 4-14 8-7M62 25c1-9 10-9 11-1" stroke="#EDAE1B" stroke-width="4.5" stroke-linecap="round" fill="none"/>
  <ellipse cx="31" cy="66" rx="10" ry="15" fill="#FFC93C" transform="rotate(14 31 66)"/>
  <circle cx="47" cy="55" r="4.2" fill="#3A2E1F"/>
  <circle cx="48.5" cy="53.6" r="1.4" fill="#fff"/>
  <circle cx="73" cy="55" r="4.2" fill="#3A2E1F"/>
  <circle cx="74.5" cy="53.6" r="1.4" fill="#fff"/>
  <ellipse cx="40" cy="65" rx="5.2" ry="3.4" fill="#FFB09A" opacity=".85"/>
  <ellipse cx="80" cy="65" rx="5.2" ry="3.4" fill="#FFB09A" opacity=".85"/>
  <path d="M53.5 62h13l-6.5 8z" fill="#FF9838"/>
</svg>`;
}

function duckSVG() {
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="60" cy="107" rx="26" ry="5" fill="rgba(87,63,24,.10)"/>
  <path d="M49 95v7m-7 0h14M71 95v7m-7 0h14" stroke="#F0A24A" stroke-width="4.5" stroke-linecap="round" fill="none"/>
  <ellipse cx="60" cy="63" rx="37" ry="35" fill="#FFFDF4" stroke="#EFE2C4" stroke-width="2"/>
  <ellipse cx="60" cy="78" rx="26" ry="16" fill="rgba(87,63,24,.05)"/>
  <path d="M60 26c-1-8 5-11 9-6" stroke="#5FBF92" stroke-width="4.5" stroke-linecap="round" fill="none"/>
  <ellipse cx="31" cy="66" rx="10" ry="15" fill="#CDEEDD" transform="rotate(14 31 66)"/>
  <circle cx="47" cy="54" r="4.2" fill="#3A2E1F"/>
  <circle cx="48.5" cy="52.6" r="1.4" fill="#fff"/>
  <circle cx="73" cy="54" r="4.2" fill="#3A2E1F"/>
  <circle cx="74.5" cy="52.6" r="1.4" fill="#fff"/>
  <ellipse cx="40" cy="63" rx="5.2" ry="3.4" fill="#FFC4B8" opacity=".9"/>
  <ellipse cx="80" cy="63" rx="5.2" ry="3.4" fill="#FFC4B8" opacity=".9"/>
  <path d="M49 61.5h22c2.4 0 3.4 2.3 1.7 4-3 3-6.8 4.5-12.7 4.5s-9.7-1.5-12.7-4.5c-1.7-1.7-.7-4 1.7-4z" fill="#FFA94D"/>
  <path d="M53 65.5h14" stroke="#E8862F" stroke-width="2" stroke-linecap="round"/>
</svg>`;
}

const MASCOTS = { chick: chickSVG(), duck: duckSVG() };
const MASCOT_NAMES = { chick: '小黄鸡', duck: '小白鸭' };
const mascot = (kind, size) => `<span class="mascot mascot-${size}">${MASCOTS[kind]}</span>`;

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

let ws = null;
let snap = null;          // 服务器快照
let offset = 0;           // serverNow - clientNow
let reconnectTimer = null;
let focusWordInput = false;

const ui = {
  secondsChoice: 60,     // 30 | 60 | 'custom'
  secondsCustom: '',
  joinCode: '',
  word: '',
};

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => {
    const session = readSession();
    if (session && session.code) {
      send({ t: 'resume', token, code: session.code });
    }
  };

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    switch (msg.t) {
      case 'state': {
        snap = msg.data;
        offset = snap.serverNow - Date.now();
        if (snap.phase === 'ended') {
          clearSession();       // 对局结束，下次打开回到首页
          snap = null;
          renderLanding();
          break;
        }
        if (snap.you && snap.code) writeSession({ code: snap.code });
        render();
        break;
      }
      case 'error': {
        if (msg.fatal) {
          clearSession();
          snap = null;
        }
        toast(msg.message || '出错了');
        render();
        break;
      }
      case 'pong':
        offset = msg.serverNow - Date.now();
        break;
    }
  };

  ws.onclose = () => {
    snap = null;
    reconnectTimer = setTimeout(connect, 900);
    render();
  };
}

function send(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ ...obj, token }));
}

function readSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function writeSession(s) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { sessionStorage.removeItem(SESSION_KEY); }

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

let toastTimer = null;
function toast(text) {
  $toast.textContent = text;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 2400);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function joinUrl() {
  const base = (snap && snap.urls && snap.urls[0]) || location.origin;
  return `${base}/?room=${snap.code}`;
}

// 倒计时（用服务器时间换算）
function remainingSeconds() {
  if (!snap || snap.phase !== 'thinking') return 0;
  return Math.max(0, Math.ceil((snap.deadline - (Date.now() + offset)) / 1000));
}

function mascotOfSeat(seat) {
  return seat === 0 ? 'chick' : 'duck';
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

function render() {
  const wasWordInput =
    document.activeElement && document.activeElement.id === 'wordInput';

  if (!snap) {
    renderLanding();
  } else {
    switch (snap.phase) {
      case 'waiting': renderWaiting(); break;
      case 'thinking': renderThinking(); break;
      case 'reveal': renderReveal(); break;
      case 'success': renderSuccess(); break;
      case 'ended': renderLanding(); break;
      default: renderLanding();
    }
  }

  // 打字途中收到广播 → 恢复输入焦点
  if (wasWordInput) {
    const el = document.getElementById('wordInput');
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }
}

/* ---------- 首页 ---------- */

function renderLanding() {
  const prefill = new URLSearchParams(location.search).get('room') || ui.joinCode || '';
  const seconds = currentSecondsValue();

  $app.innerHTML = `
    <section class="hero">
      <div class="hero-pair">
        <span class="float-a">${mascot('chick', 'lg')}</span>
        <span class="float-b">${mascot('duck', 'lg')}</span>
      </div>
      <h1 class="hero-title">词不一样<span class="accent">就跑步</span></h1>
      <p class="hero-sub">各想一个词，同时揭晓；没撞上，就换个思路再想一轮。<br/>同一 WiFi 内联机，零延迟，不用出门跑真步 🏃</p>
    </section>

    <section class="card stack">
      <div>
        <div class="tiny" style="margin-bottom:8px;font-weight:700;letter-spacing:.1em;">每轮思考时间</div>
        <div class="pills" role="group" aria-label="每轮思考时间">
          <button class="pill" data-sec="30" aria-pressed="${seconds === 30}">30 秒</button>
          <button class="pill" data-sec="60" aria-pressed="${seconds === 60}">60 秒</button>
          <input class="pill pill-input" data-sec="custom" type="number" min="10" max="300"
            placeholder="自定义" aria-label="自定义秒数" value="${seconds !== 30 && seconds !== 60 ? seconds : ''}" />
        </div>
      </div>
      <button class="btn btn-primary btn-block" data-action="create">${mascot('chick', 'xs')} 创建房间</button>
      <div class="divider">或者</div>
      <div style="display:flex;gap:10px;">
        <input class="input" id="joinCode" inputmode="latin" maxlength="4" placeholder="房间码"
          style="text-align:center;text-transform:uppercase;letter-spacing:.3em;font-size:19px;" value="${esc(prefill.toUpperCase())}" />
        <button class="btn btn-mint" data-action="join" style="flex:0 0 auto;padding:12px 26px;">加入</button>
      </div>
    </section>

    <p class="tiny center" style="margin-top:auto;padding-top:24px;">
      词不一样就跑步 · 本地版 — 同一 WiFi 下打开本页即可联机
    </p>
  `;

  // pill 交互
  $app.querySelectorAll('.pill[data-sec]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      ui.secondsChoice = el.dataset.sec === 'custom' ? 'custom' : Number(el.dataset.sec);
      render();
    });
  });
  const customInput = $app.querySelector('.pill-input');
  customInput.addEventListener('input', () => {
    ui.secondsCustom = customInput.value;
    ui.secondsChoice = 'custom';
  });
  customInput.addEventListener('focus', () => { ui.secondsChoice = 'custom'; });

  const joinInput = document.getElementById('joinCode');
  joinInput.addEventListener('input', () => {
    joinInput.value = joinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    ui.joinCode = joinInput.value;
  });
  joinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $app.querySelector('[data-action="join"]')?.click(); });

  $app.querySelector('[data-action="create"]').addEventListener('click', () => {
    const s = currentSecondsValue();
    if (!s) { toast('自定义时间请填 10~300 的秒数'); return; }
    send({ t: 'create', seconds: s });
  });
  $app.querySelector('[data-action="join"]').addEventListener('click', () => {
    const code = (document.getElementById('joinCode').value || '').trim();
    if (code.length !== 4) { toast('房间码是 4 位哦'); return; }
    send({ t: 'join', code });
  });
}

function currentSecondsValue() {
  if (ui.secondsChoice === 'custom') {
    const n = Number(ui.secondsCustom);
    if (!Number.isFinite(n) || n < 10 || n > 300) return null;
    return Math.round(n);
  }
  return ui.secondsChoice;
}

/* ---------- 等待房间 ---------- */

function renderWaiting() {
  const ps = snap.players;
  const slots = ps.map((p, i) => {
    const kind = mascotOfSeat(i);
    const you = snap.you && snap.you.seat === i;
    if (!p.joined) {
      return `
        <div class="player-slot slot-empty">
          ${mascot(kind, 'md')}
          <div class="player-name" style="color:var(--ink-3);">${MASCOT_NAMES[kind]}</div>
          <div class="player-status">虚位以待</div>
        </div>`;
    }
    return `
      <div class="player-slot">
        <span class="wiggle" style="display:inline-block;">${mascot(kind, 'md')}</span>
        <div class="player-name">${MASCOT_NAMES[kind]}${you ? '（你）' : ''}</div>
        <div class="player-status ok">已加入</div>
      </div>`;
  }).join('');

  const seconds = snap.seconds;
  $app.innerHTML = `
    <div class="topbar">
      <span class="room-chip">房间 ${snap.code}</span>
      <button class="btn btn-danger-ghost btn-sm" data-action="leave">离开</button>
    </div>

    <section class="card stack center">
      <h1 class="h1" style="font-size:26px;">等小伙伴加入<span class="dots"></span></h1>
      <p class="sub">已有 ${ps.filter((p) => p.joined).length}/2 人，人齐后第一轮自动开始</p>

      <div class="vs-row">${slots}</div>

      <div>
        <div class="code-display" id="roomCode">${snap.code}</div>
        <button class="btn btn-ghost btn-sm" data-action="copy" style="margin-top:12px;">复制邀请链接</button>
      </div>

      <div class="qr-wrap"><img src="/qr?d=${encodeURIComponent(joinUrl())}" alt="扫码加入房间" width="168" height="168"></div>
      <p class="tiny">手机连同一 WiFi 扫码，或手动打开<br/><span style="user-select:all;">${esc(joinUrl())}</span></p>
    </section>

    <section class="card stack" style="margin-top:16px;">
      <div class="tiny" style="font-weight:700;letter-spacing:.1em;">每轮思考时间</div>
      <div class="pills" role="group" aria-label="每轮思考时间">
        <button class="pill" data-sec="30" aria-pressed="${seconds === 30}">30 秒</button>
        <button class="pill" data-sec="60" aria-pressed="${seconds === 60}">60 秒</button>
        <input class="pill pill-input" data-sec="custom" type="number" min="10" max="300" placeholder="自定义"
          aria-label="自定义秒数" value="${seconds !== 30 && seconds !== 60 ? seconds : ''}" />
      </div>
    </section>
  `;

  bindPillsInRoom();
  $app.querySelector('[data-action="copy"]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(joinUrl());
      toast('邀请链接已复制');
    } catch {
      toast('复制失败，长按上方链接手动复制');
    }
  });
  $app.querySelector('[data-action="leave"]').addEventListener('click', () => {
    clearSession(); snap = null; send({ t: 'leave' }); render();
  });
}

function bindPillsInRoom() {
  $app.querySelectorAll('.pill[data-sec]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const v = el.dataset.sec;
      const s = v === 'custom' ? null : Number(v);
      if (s) send({ t: 'settings', seconds: s });
    });
  });
  const customInput = $app.querySelector('.pill-input');
  if (customInput) {
    customInput.addEventListener('change', () => {
      const n = Number(customInput.value);
      if (Number.isFinite(n) && n >= 10 && n <= 300) send({ t: 'settings', seconds: Math.round(n) });
      else toast('请填 10~300 的秒数');
    });
  }
}

/* ---------- 答题 ---------- */

function renderThinking() {
  const you = snap.you;
  const other = snap.players[1 - you.seat];
  const lastEntry = snap.trail[snap.trail.length - 1];
  const myKind = mascotOfSeat(you.seat);
  const otherKind = mascotOfSeat(1 - you.seat);

  const promptHTML = snap.round === 1
    ? `<div class="prompt-label">第 1 轮</div>
       <p class="sub" style="margin-bottom:12px;">各想一个词，看看你们会不会想到同一个</p>`
    : `<div class="prompt-label">第 ${snap.round} 轮 · 从上一轮继续联想</div>
       <div class="prompt-words">
         <span class="word-chip">${esc(lastEntry?.words[0] ?? '')}</span>
         <span class="prompt-x">×</span>
         <span class="word-chip mint">${esc(lastEntry?.words[1] ?? '')}</span>
       </div>`;

  const bodyHTML = you.submitted
    ? `
      <div class="waiting-box">
        <div class="waiting-title">你的答案：${esc(you.word || '——（没想出来）')}</div>
        <div class="waiting-sub">锁定后不能修改，等${MASCOT_NAMES[otherKind]}揭晓</div>
        <div class="pulse-dot"><i></i><i></i><i></i></div>
      </div>`
    : `
      <div class="stack">
        ${other && other.submitted ? `<div class="banner" style="margin-bottom:0;">${mascot(otherKind, 'xs')} 已经锁定答案了，你也要加油呀</div>` : ''}
        <input class="input word-input" id="wordInput" type="text" maxlength="20"
          placeholder="写下你脑中的那个词" value="${esc(ui.word)}" autocomplete="off" />
        <button class="btn btn-primary btn-block" data-action="lock">锁定答案</button>
        <p class="tiny center">提交后不能修改，揭晓前对方看不到</p>
      </div>`;

  $app.innerHTML = `
    <div class="topbar">
      <span class="room-chip">房间 ${snap.code}</span>
      <button class="btn btn-danger-ghost btn-sm" data-action="leave">退出</button>
    </div>

    ${other && !other.connected ? `<div class="banner">${mascot(otherKind, 'xs')} 掉线了，等 TA 回来…</div>` : ''}

    <section class="card timer-card">
      <span class="timer-num" id="timerNum">--</span>
      <div class="timer-bar"><div class="timer-fill" id="timerFill" style="width:100%"></div></div>
    </section>

    <section class="card prompt-card" style="margin-top:16px;">${promptHTML}</section>

    <section class="card" style="margin-top:16px;">${bodyHTML}</section>

    ${snap.trail.length ? `
      <section class="card" style="margin-top:16px;">
        <div class="tiny center" style="font-weight:700;letter-spacing:.1em;margin-bottom:12px;">联想轨迹</div>
        <div class="trail">${trailHTML()}</div>
      </section>` : ''}
  `;

  bindTimer();
  $app.querySelector('[data-action="leave"]').addEventListener('click', () => {
    clearSession(); snap = null; send({ t: 'leave' }); render();
  });
  if (!you.submitted) {
    const input = document.getElementById('wordInput');
    input.addEventListener('input', () => { ui.word = input.value; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') lockWord(); });
    $app.querySelector('[data-action="lock"]').addEventListener('click', lockWord);
  }
}

function lockWord() {
  const input = document.getElementById('wordInput');
  const word = (input?.value || '').trim();
  if (!word) { toast('先想一个词呀（留空就等于弃权这轮）'); return; }
  ui.word = '';
  send({ t: 'submit', word });
}

function bindTimer() {
  updateTimer();
  if (render._timer) clearInterval(render._timer);
  render._timer = setInterval(updateTimer, 250);
}

function updateTimer() {
  const num = document.getElementById('timerNum');
  const fill = document.getElementById('timerFill');
  if (!num || !fill) { clearInterval(render._timer); return; }
  const total = snap.seconds;
  const left = remainingSeconds();
  num.textContent = `${left}s`;
  fill.style.width = `${total ? (left / total) * 100 : 0}%`;
  const urgent = left <= 10;
  num.classList.toggle('urgent', urgent);
  fill.classList.toggle('urgent', urgent);
}

function trailHTML() {
  return snap.trail.map((e) => `
    <span class="trail-item">
      <span class="no">${e.round}</span>
      ${esc(e.words[0] || '——')}
      <span class="prompt-x">×</span>
      ${esc(e.words[1] || '——')}
      ${e.matched ? '<span class="hit">✓</span>' : ''}
    </span>`).join('');
}

/* ---------- 揭晓（词不一样）---------- */

function renderReveal() {
  const you = snap.you;
  const words = snap.revealWords || [null, null];
  const myWord = words[you.seat];
  const otherWord = words[1 - you.seat];
  const otherKind = mascotOfSeat(1 - you.seat);
  const myChoice = you.choice;
  const otherChoice = snap.players[1 - you.seat].choice;
  const bothChosen = myChoice && otherChoice;

  const choiceButtons = myChoice
    ? `<div class="choice-state">等其他人选择（${[myChoice, otherChoice].filter(Boolean).length}/2）<span class="dots"></span></div>`
    : `
      <div class="stack" style="margin-top:20px;">
        <button class="btn btn-mint btn-block" data-action="sameMeaning">🤝 我们说的是同一个东西</button>
        <button class="btn btn-primary btn-block" data-action="continue">继续下一轮</button>
      </div>
      <p class="choice-note">「同一个东西」要双方都点头才算数；只要有一人想继续，就进下一轮</p>`;

  $app.innerHTML = `
    <div class="topbar">
      <span class="room-chip">房间 ${snap.code}</span>
      <span class="room-chip">第 ${snap.round} 轮 · 揭晓</span>
    </div>

    ${otherChoice === 'end' ? `<div class="banner">${mascot(otherKind, 'xs')} 选择了结束游戏</div>` : ''}

    <section class="card">
      <div class="reveal-grid">
        <div class="reveal-col you">
          ${mascot(mascotOfSeat(you.seat), 'sm')}
          <span class="tiny" style="font-weight:700;">你</span>
          <span class="word">${esc(myWord || '')}</span>
          ${!myWord ? '<span class="reveal-empty">没想出来</span>' : ''}
        </div>
        <div class="reveal-mid">×</div>
        <div class="reveal-col other">
          ${mascot(otherKind, 'sm')}
          <span class="tiny" style="font-weight:700;">${MASCOT_NAMES[otherKind]}</span>
          <span class="word">${esc(otherWord || '')}</span>
          ${!otherWord ? '<span class="reveal-empty">没想出来</span>' : ''}
        </div>
      </div>
      <div class="verdict">
        <div class="verdict-title miss">还差一点！</div>
        <div class="verdict-sub">从这两个词之间，寻找下一步联想</div>
      </div>
      ${choiceButtons}
    </section>

    <section class="card" style="margin-top:16px;">
      <div class="tiny center" style="font-weight:700;letter-spacing:.1em;margin-bottom:12px;">联想轨迹</div>
      <div class="trail">${trailHTML()}</div>
    </section>

    <button class="btn btn-danger-ghost btn-block" data-action="leave" style="margin-top:16px;">结束游戏，返回首页</button>
  `;

  $app.querySelector('[data-action="sameMeaning"]')?.addEventListener('click', () => send({ t: 'choice', value: 'sameMeaning' }));
  $app.querySelector('[data-action="continue"]')?.addEventListener('click', () => send({ t: 'choice', value: 'continue' }));
  $app.querySelectorAll('[data-action="leave"]').forEach((el) =>
    el.addEventListener('click', () => { clearSession(); snap = null; send({ t: 'leave' }); render(); }));
}

/* ---------- 通关 ---------- */

function renderSuccess() {
  const words = snap.revealWords || [null, null];
  const myKind = mascotOfSeat(snap.you.seat);
  const otherKind = mascotOfSeat(1 - snap.you.seat);
  const sameMeaning = snap.result?.sameMeaning;
  const myChoice = snap.you.choice;
  const otherChoice = snap.players[1 - snap.you.seat].choice;

  const confetti = Array.from({ length: 26 }, (_, i) => {
    const colors = ['#FFD24C', '#CDEEDD', '#FFB4A6', '#FFE18A', '#A8DEBE'];
    const c = colors[i % colors.length];
    const left = (i * 37) % 100;
    const dur = 3 + (i % 5) * 0.7;
    const delay = (i % 8) * 0.4;
    const shape = i % 3 === 0 ? 'border-radius:50%;' : 'border-radius:2px;';
    const size = 7 + (i % 3) * 4;
    return `<i class="confetti" style="left:${left}%;width:${size}px;height:${size}px;background:${c};${shape}animation-duration:${dur}s;animation-delay:${delay}s;"></i>`;
  }).join('');

  const actionHTML = myChoice === 'again'
    ? `<div class="choice-state">等其他人点「再玩一局」<span class="dots"></span></div>`
    : `
      <div class="stack" style="margin-top:22px;">
        <button class="btn btn-primary btn-block" data-action="photo">📸 预览记录照片</button>
        <button class="btn btn-mint btn-block" data-action="again">再玩一局</button>
        <button class="btn btn-danger-ghost btn-block" data-action="leave">结束并返回首页</button>
      </div>
      <p class="choice-note">双方都点「再玩一局」会自动开新的一局，本局记录保留在照片里</p>`;

  $app.innerHTML = `
    <div class="confetti-wrap" aria-hidden="true">${confetti}</div>

    <section class="card success-hi">
      <div class="success-round">第 ${snap.round} 轮 · 同词成功</div>
      <div style="display:flex;justify-content:center;align-items:flex-end;gap:6px;margin-top:18px;">
        <span class="float-a">${mascot(myKind, 'md')}</span>
        <span style="font-size:26px;padding-bottom:26px;">💛</span>
        <span class="float-b">${mascot(otherKind, 'md')}</span>
      </div>
      <h1 class="success-title">${sameMeaning ? '表达不同，想到同一个！' : '你们的脑回路相遇了'}</h1>
      <p class="success-sub">${sameMeaning
        ? `「${esc(words[0] || '')}」和「${esc(words[1] || '')}」说的是同一个东西`
        : `你们都写下了「${esc(words[0] || '')}」`}</p>
    </section>

    <section class="card" style="margin-top:16px;">
      <div class="tiny center" style="font-weight:700;letter-spacing:.1em;margin-bottom:12px;">本局联想轨迹</div>
      <div class="round-list">${roundListHTML()}</div>
    </section>

    <section class="card" style="margin-top:16px;">
      ${actionHTML}
    </section>
  `;

  $app.querySelector('[data-action="photo"]')?.addEventListener('click', openPhotoModal);
  $app.querySelector('[data-action="again"]')?.addEventListener('click', () => send({ t: 'again' }));
  $app.querySelector('[data-action="leave"]')?.addEventListener('click', () => {
    clearSession(); snap = null; send({ t: 'leave' }); render();
  });
}

function roundListHTML() {
  return snap.trail.map((e) => `
    <div class="round-row">
      <span class="no">R${e.round}</span>
      <span class="words">
        <span class="w">${esc(e.words[0] || '——')}</span>
        <span class="x">×</span>
        <span class="w">${esc(e.words[1] || '——')}</span>
      </span>
      ${e.matched ? '<span class="tag tag-hit">同词</span>' : ''}
      ${e.sameMeaning ? '<span class="tag tag-same">同一个东西</span>' : ''}
    </div>`).join('');
}

/* ---------- 记录照片 ---------- */

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function openPhotoModal() {
  const W = 1000, H = 1400;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 背景
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#FFF6E3');
  grad.addColorStop(1, '#FFEFC9');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 白卡
  ctx.fillStyle = '#FFFFFF';
  rr(ctx, 56, 56, W - 112, H - 112, 56);
  ctx.fill();
  ctx.strokeStyle = 'rgba(87,63,24,.08)';
  ctx.lineWidth = 2;
  rr(ctx, 56, 56, W - 112, H - 112, 56);
  ctx.stroke();

  // 吉祥物
  const chick = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(chickSVG()));
  const duck = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(duckSVG()));
  if (chick) ctx.drawImage(chick, W / 2 - 240, 130, 190, 190);
  if (duck) ctx.drawImage(duck, W / 2 + 50, 130, 190, 190);
  ctx.fillStyle = '#97876F';
  ctx.font = '700 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('×', W / 2, 245);

  // 标题
  ctx.fillStyle = '#3A2E1F';
  ctx.font = '900 76px system-ui, sans-serif';
  ctx.fillText('你们的脑回路相遇了', W / 2, 440);

  const sameMeaning = snap.result?.sameMeaning;
  ctx.fillStyle = '#1E5C40';
  ctx.font = '800 34px system-ui, sans-serif';
  ctx.fillText(
    sameMeaning ? '表达不同，想到同一个 ✨' : `第 ${snap.round} 轮，同词成功 🎉`,
    W / 2, 505
  );

  // 元信息
  const date = new Date().toLocaleDateString('zh-CN');
  ctx.fillStyle = '#97876F';
  ctx.font = '600 30px system-ui, sans-serif';
  ctx.fillText(`房间 ${snap.code} · 共 ${snap.trail.length} 轮 · ${date}`, W / 2, 570);

  // 分割线
  ctx.strokeStyle = 'rgba(87,63,24,.1)';
  ctx.beginPath();
  ctx.moveTo(160, 620);
  ctx.lineTo(W - 160, 620);
  ctx.stroke();

  // 每轮记录
  let y = 700;
  const rowH = 96;
  for (const e of snap.trail) {
    // 序号
    ctx.fillStyle = '#FFF3CE';
    rr(ctx, 150, y - 34, 64, 64, 32);
    ctx.fill();
    ctx.fillStyle = '#97876F';
    ctx.font = '800 28px system-ui, sans-serif';
    ctx.fillText(`R${e.round}`, 182, y + 10);

    // 词
    ctx.font = '800 40px system-ui, sans-serif';
    ctx.fillStyle = '#3A2E1F';
    const w1 = e.words[0] || '——';
    const w2 = e.words[1] || '——';
    ctx.textAlign = 'center';
    const midX = W / 2;
    ctx.fillText(w1, midX - 180, y + 10);
    ctx.fillStyle = '#C5B79C';
    ctx.font = '700 30px system-ui, sans-serif';
    ctx.fillText('×', midX, y + 6);
    ctx.fillStyle = '#3A2E1F';
    ctx.font = '800 40px system-ui, sans-serif';
    ctx.fillText(w2, midX + 180, y + 10);

    // 标记
    if (e.matched || e.sameMeaning) {
      ctx.font = '700 24px system-ui, sans-serif';
      ctx.fillStyle = '#46A87B';
      ctx.fillText(e.matched ? '同词 ✓' : '同一个东西 ✓', midX + 320, y + 6);
    }
    y += rowH;
  }

  // 页脚
  ctx.textAlign = 'center';
  ctx.fillStyle = '#C5B79C';
  ctx.font = '600 28px system-ui, sans-serif';
  ctx.fillText('词不一样就跑步 · 本地版', W / 2, H - 110);

  const modal = document.createElement('div');
  modal.className = 'modal-mask';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-title">记录照片 · 长按或保存到设备</div>
      <canvas></canvas>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-ghost" data-x="close" style="flex:1;">返回</button>
        <button class="btn btn-primary" data-x="save" style="flex:1;">保存照片</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('canvas').replaceWith(canvas);
  canvas.style.width = '100%';

  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.dataset.x === 'close') modal.remove();
  });
  modal.querySelector('[data-x="save"]').addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = `词不一样就跑步-${snap.code}-${Date.now()}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
    toast('已生成照片，浏览器开始下载');
  });
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

connect();
render();
