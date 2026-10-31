/* 词不一样就跑步 · 宣传页交互
   弹幕 / 彩带参数与游戏本体（public/app.js）保持一致 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------------------
// 数据：与游戏同源（server.js THEMES / app.js INSPIRATION_DECK / ACHIEVEMENTS）
// ---------------------------------------------------------------------------

const THEMES = [
  { icon: '🍜', name: '食物', words: '火锅 / 饺子 / 奶茶' },
  { icon: '🐾', name: '动物', words: '企鹅 / 海豚 / 仓鼠' },
  { icon: '🏫', name: '校园', words: '早八 / 食堂 / 晚自习' },
  { icon: '🎬', name: '影视', words: '周星驰 / 科幻片 / 动画片' },
  { icon: '🧳', name: '旅行', words: '露营 / 护照 / 攻略' },
  { icon: '🏠', name: '居家', words: '拖把 / 外卖 / 沙发' },
  { icon: '⚽', name: '运动', words: '跳绳 / 瑜伽 / 看球' },
  { icon: '🎵', name: '音乐', words: '演唱会 / KTV / 耳机' },
  { icon: '⛅', name: '天气', words: '台风 / 桑拿天 / 秋裤' },
  { icon: '💼', name: '打工', words: '周报 / 加班 / 摸鱼' },
];

const DECKS = [
  ['🍉', '水果摊'], ['🍢', '深夜食堂'], ['🦙', '动物世界'], ['🚇', '通勤路上'],
  ['🖇️', '办公室'], ['📓', '学生时代'], ['🌦️', '天气预感'], ['🛋️', '客厅角落'],
  ['🎭', '情绪小镇'], ['💻', '互联网黑话'], ['🏸', '运动场'], ['🧴', '旅行箱里'],
];

const ACHIEVEMENTS = [
  { icon: '⚡', name: '一见如故', desc: '第一次同词成功' },
  { icon: '💫', name: '一拍即合', desc: '第 1 轮就同词' },
  { icon: '🔥', name: '渐入佳境', desc: '连续 2 局同词成功' },
  { icon: '🌟', name: '心有灵犀', desc: '连续 5 局同词成功' },
  { icon: '🧭', name: '绕了十圈', desc: '坚持 10 轮终于同词' },
  { icon: '🤝', name: '名不虚同', desc: '3 次「同一个东西」判定成功' },
  { icon: '🏅', name: '老搭档', desc: '累计 10 局同词成功' },
  { icon: '🃏', name: '灵光乍现', desc: '抽灵感卡后 2 轮内同词成功', hidden: true },
];

// 演示剧本：第 1 轮词不一样 → 第 2 轮同词通关（默契值 = max(5, 22-3*(round-1))）
const DEMO_SCRIPT = [
  { theme: '🎯 主题 · 🍜 食物', first: ['火锅', '麻辣烫'], final: '火锅', value: 19 },
  { theme: '🎯 主题 · 🐾 动物', first: ['企鹅', '海豚'], final: '企鹅', value: 19 },
  { theme: '🎯 主题 · ⛅ 天气', first: ['台风', '桑拿天'], final: '台风', value: 19 },
];

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function countUp(el, target, duration = 900) {
  if (REDUCED) { el.textContent = target; return; }
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// 小鸡跑步进度条
// ---------------------------------------------------------------------------

const progressFill = $('#progressFill');
const progressChick = $('#progressChick');

function updateProgress() {
  const doc = document.documentElement;
  const max = doc.scrollHeight - window.innerHeight;
  const pct = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  progressFill.style.width = (pct * 100) + '%';
  const w = doc.clientWidth;
  progressChick.style.left = (17 + pct * (w - 34)) + 'px';
}
if (!REDUCED) {
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { updateProgress(); ticking = false; });
  }, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();
} else {
  progressChick.style.display = 'none';
}

// ---------------------------------------------------------------------------
// 滚动入场 + 导航高亮
// ---------------------------------------------------------------------------

const revealEls = [...document.querySelectorAll('.reveal')];
if (REDUCED) {
  revealEls.forEach((el) => el.classList.remove('reveal'));
} else {
  const revealObserver = new IntersectionObserver((entries) => {
    entries
      .filter((e) => e.isIntersecting)
      .forEach((entry, i) => {
        const el = entry.target;
        el.style.transitionDelay = (i * 80) + 'ms';
        el.classList.add('in');
        el.addEventListener('transitionend', () => {
          el.classList.remove('reveal', 'in');
          el.style.transitionDelay = '';
        }, { once: true });
        revealObserver.unobserve(el);
      });
  }, { threshold: 0.12 });
  revealEls.forEach((el) => revealObserver.observe(el));
}

// 导航高亮
const navLinks = [...document.querySelectorAll('.nav-links a')];
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    navLinks.forEach((a) => {
      a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id);
    });
  });
}, { rootMargin: '-40% 0px -55% 0px' });
['how', 'features', 'achievements', 'start'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) sectionObserver.observe(el);
});

// ---------------------------------------------------------------------------
// 数字滚动（hero 统计 / 默契值 chip）
// ---------------------------------------------------------------------------

const countObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    countUp(entry.target, Number(entry.target.dataset.count));
    countObserver.unobserve(entry.target);
  });
}, { threshold: 0.6 });
document.querySelectorAll('[data-count]').forEach((el) => countObserver.observe(el));

// ---------------------------------------------------------------------------
// 成就墙渲染
// ---------------------------------------------------------------------------

$('#achGrid').innerHTML = ACHIEVEMENTS.map((a) => `
  <li class="ach-card card reveal">
    <div class="ach-icon">${a.icon}</div>
    <div class="ach-name">${a.name}</div>
    <div class="ach-desc">${a.desc}</div>
    ${a.hidden ? '<span class="ach-tag">隐藏成就</span>' : ''}
  </li>`).join('');
// 动态插入的卡片也要参与入场动画
if (!REDUCED) {
  const revealObserver2 = new IntersectionObserver((entries) => {
    entries
      .filter((e) => e.isIntersecting)
      .forEach((entry, i) => {
        const el = entry.target;
        el.style.transitionDelay = (i * 60) + 'ms';
        el.classList.add('in');
        el.addEventListener('transitionend', () => {
          el.classList.remove('reveal', 'in');
          el.style.transitionDelay = '';
        }, { once: true });
        revealObserver2.unobserve(el);
      });
  }, { threshold: 0.12 });
  document.querySelectorAll('.ach-card.reveal').forEach((el) => revealObserver2.observe(el));
} else {
  document.querySelectorAll('.ach-card.reveal').forEach((el) => el.classList.remove('reveal'));
}

// ---------------------------------------------------------------------------
// 跑马灯（内容 ×2 实现无缝循环，CSS 负责滚动）
// ---------------------------------------------------------------------------

$('#marqueeThemes').innerHTML = [...Array(2)].map(() =>
  THEMES.map((t) => `<span class="m-item">${t.icon} ${t.name} <small>${t.words}</small></span>`).join('')
).join('');
$('#marqueeDecks').innerHTML = [...Array(4)].map(() =>
  DECKS.map(([icon, cat]) => `<span class="m-item">${icon} ${cat}</span>`).join('')
).join('');

// ---------------------------------------------------------------------------
// 表情弹幕（点击真的会飞，参数同游戏：字号 30~52px、时长 2~2.8s、旋转 10°）
// ---------------------------------------------------------------------------

const danmakuStage = $('#danmakuStage');
const DANMAKU_EMOJIS = ['👍', '😂', '❤️', '🔥', '😭'];

function spawnDanmaku(emoji) {
  if (REDUCED || !danmakuStage) return;
  if (danmakuStage.children.length > 14) danmakuStage.firstElementChild.remove();
  const el = document.createElement('span');
  el.className = 'fly';
  el.textContent = emoji;
  el.style.left = (12 + Math.random() * 70) + '%';
  el.style.fontSize = (30 + Math.random() * 22) + 'px';
  el.style.setProperty('--rise', (danmakuStage.clientHeight + 90) + 'px');
  el.style.setProperty('--rot', (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 6) + 'deg');
  el.style.setProperty('--dur', (2 + Math.random() * 0.8) + 's');
  el.addEventListener('animationend', () => el.remove());
  danmakuStage.appendChild(el);
}

document.querySelectorAll('.danmaku-btn').forEach((btn) => {
  btn.addEventListener('click', () => spawnDanmaku(btn.dataset.emoji));
});

// 卡片在视野内时偶尔自动飘一个，让页面保持「活」的
let danmakuVisible = false;
new IntersectionObserver((entries) => {
  danmakuVisible = entries[0].isIntersecting;
}, { threshold: 0.3 }).observe(danmakuStage);

setInterval(() => {
  if (danmakuVisible && Math.random() < 0.7) {
    spawnDanmaku(DANMAKU_EMOJIS[Math.floor(Math.random() * DANMAKU_EMOJIS.length)]);
  }
}, 2400);

// ---------------------------------------------------------------------------
// 彩带（26 片，五色与游戏同款）
// ---------------------------------------------------------------------------

const confettiWrap = $('#confettiWrap');
const CONFETTI_COLORS = ['#FFD24C', '#CDEEDD', '#FFB4A6', '#FFE18A', '#A8DEBE'];

function burstConfetti() {
  if (REDUCED) return;
  for (let i = 0; i < 26; i++) {
    const el = document.createElement('i');
    el.className = 'confetti';
    const size = 7 + (i % 3) * 4;
    el.style.cssText =
      `left:${(i * 37) % 100}%;` +
      `width:${size}px;height:${size}px;` +
      `background:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]};` +
      `border-radius:${i % 3 === 0 ? '50%' : '2px'};` +
      `animation-duration:${3 + (i % 5) * 0.7}s;` +
      `animation-delay:${(i % 8) * 0.4}s;`;
    confettiWrap.appendChild(el);
  }
  setTimeout(() => { confettiWrap.innerHTML = ''; }, 7500);
}

// ---------------------------------------------------------------------------
// 揭晓自动演示：打字 → 揭晓 → 「还差一点」→ 再想 → 同词通关 → 彩带
// ---------------------------------------------------------------------------

const demo = {
  root: $('#demo'),
  round: $('#demoRound'),
  theme: document.querySelector('.demo-theme'),
  timerFill: $('#demoTimerFill'),
  timer: document.querySelector('.demo-timer'),
  inputA: $('#demoInputA'),
  inputB: $('#demoInputB'),
  wordA: $('#demoWordA'),
  wordB: $('#demoWordB'),
  banner: $('#demoBanner'),
  success: $('#demoSuccess'),
  successSub: $('#demoSuccessSub'),
  value: $('#demoValue'),
};

let demoVisible = false;
new IntersectionObserver((entries) => {
  demoVisible = entries[0].isIntersecting;
}, { threshold: 0.35 }).observe(demo.root);

const CHAR_MS = 190;

function setWord(el, text, typing) {
  el.textContent = text;
  el.classList.toggle('empty', !text);
  el.closest('.demo-input').classList.toggle('typing', !!typing);
}

function clearRound() {
  [demo.inputA, demo.inputB].forEach((el) => {
    el.classList.remove('revealed', 'reveal-flip', 'typing');
  });
  setWord(demo.wordA, '', false);
  setWord(demo.wordB, '', false);
  demo.banner.classList.remove('show');
}

// 两只同时打字（小白鸭慢半拍，更像真人）
function typeBoth(wordA, wordB) {
  demo.success.classList.remove('show');
  demo.timer.classList.remove('low');
  demo.timerFill.style.transition = REDUCED ? 'none' : 'width 2.6s linear';
  demo.timerFill.style.width = '100%';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      demo.timerFill.style.width = '0%';
      if (!REDUCED) setTimeout(() => demo.timer.classList.add('low'), 1700);
    });
  });

  const typeInto = async (wordEl, word, delay) => {
    await sleep(delay);
    for (let i = 1; i <= word.length; i++) {
      setWord(wordEl, word.slice(0, i), true);
      await sleep(CHAR_MS);
    }
  };
  return Promise.all([typeInto(demo.wordA, wordA, 350), typeInto(demo.wordB, wordB, 620)]);
}

function revealBoth() {
  [demo.inputA, demo.inputB].forEach((el) => {
    el.classList.remove('typing');
    el.classList.add('revealed', 'reveal-flip');
  });
}

async function runDemo() {
  if (REDUCED) {
    // 降级：直接展示通关定格画面
    demo.theme.textContent = DEMO_SCRIPT[0].theme;
    demo.round.textContent = '第 2 轮';
    setWord(demo.wordA, DEMO_SCRIPT[0].final, false);
    setWord(demo.wordB, DEMO_SCRIPT[0].final, false);
    revealBoth();
    demo.successSub.textContent = '第 2 轮 · 同词成功';
    demo.value.textContent = DEMO_SCRIPT[0].value;
    demo.success.classList.add('show');
    return;
  }

  let scriptIdx = 0;
  for (;;) {
    while (!demoVisible) await sleep(400);
    const script = DEMO_SCRIPT[scriptIdx % DEMO_SCRIPT.length];
    scriptIdx++;
    demo.theme.textContent = script.theme;

    // 第 1 轮：词不一样
    demo.round.textContent = '第 1 轮';
    clearRound();
    await typeBoth(script.first[0], script.first[1]);
    await sleep(500);
    revealBoth();
    demo.banner.classList.add('show');
    await sleep(2100);

    // 第 2 轮：换思路，撞词
    while (!demoVisible) await sleep(400);
    demo.round.textContent = '第 2 轮';
    clearRound();
    await typeBoth(script.final, script.final);
    await sleep(500);
    revealBoth();
    await sleep(650);

    // 通关：默契值滚动 + 彩带
    demo.successSub.textContent = '第 2 轮 · 同词成功';
    demo.success.classList.add('show');
    burstConfetti();
    countUp(demo.value, script.value, 850);
    await sleep(3400);
    demo.success.classList.remove('show');
    await sleep(450);
  }
}

runDemo();
