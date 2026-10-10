// js/night-i/stage.js — 合コン画面の部品（卓・人・吹き出し・ログ・結果）。元：prototypes/compare-2026-10/stage.js（10/8 に本編へ）
// 共通の舞台（案6の灰色）。どの方式もここに描く
const Stage = (() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const NAME = { 101: 'あおい', 102: 'ゆな', 103: 'めい', 1: 'けんた', 4: 'けいた', P: 'あなた' };
  const HS = [101, 102, 103], ALL = [101, 102, 103, 1, 4];
  let gen = 0, tapFn = null, alwaysTap = null, log = [], softFocus = false;
  const timers = new Set();

  // 方式を始めるたびに世代を進める。古い世代の待ちは、以後ずっと解決しない（止まる）
  function begin(title) {
    gen++; tapFn = null; alwaysTap = null; log = []; softFocus = false;
    timers.forEach(t => clearTimeout(t)); timers.clear();
    $('home').hidden = true; $('play').hidden = false;
    $('sheet-end').hidden = true; $('sheet-log').hidden = true; $('dbg').hidden = true;
    $('ttl').textContent = title; $('dots').innerHTML = '';
    HS.forEach(h => { expr(h, '真顔'); meter(h, ''); });
    document.querySelectorAll('.note').forEach(x => x.remove());
    focus(null); tag(null); air(60); narr('', true); clear(); bar(0);
    document.querySelectorAll('.fig.gone').forEach(f => f.classList.remove('gone')); scene('');
    return gen;
  }
  const live = g => g === gen;
  function home() { gen++; tapFn = null; alwaysTap = null; timers.forEach(t => clearTimeout(t)); timers.clear();
    $('play').hidden = true; $('home').hidden = false; $('sheet-end').hidden = true; $('sheet-log').hidden = true; }
  function later(fn, ms, g) { const t = setTimeout(() => { timers.delete(t); if (live(g)) fn(); }, ms); timers.add(t); return t; }
  function cancel(t) { clearTimeout(t); timers.delete(t); }
  const sleep = (ms, g) => new Promise(res => later(res, ms, g));

  // タップ待ち
  function waitTap(g, hintText) {
    $('next').hidden = false;
    if (hintText !== undefined) hint(hintText);
    return new Promise(res => { tapFn = v => { if (!live(g)) return; tapFn = null; $('next').hidden = true; res(v || 'tap'); }; });
  }
  // タップか時間切れの早い方。下に細い残り時間の線を出す
  function waitTapOr(ms, g) {
    bar(ms);
    return new Promise(res => {
      let done = false;
      const fin = how => { if (done || !live(g)) return; done = true; tapFn = null; cancel(t); bar(0); res(how); };
      const t = later(() => fin('time'), ms, g);
      tapFn = v => fin(v || 'tap');
    });
  }
  function onTap(fn) { alwaysTap = fn; }
  function tapNow() { if (tapFn) tapFn(); else if (alwaysTap) alwaysTap(); }
  function fire(v) { if (tapFn) tapFn(v); }        // 待っている所に、タップ以外の値を渡す（言葉を撃つ・行動する など）
  function bar(ms) {
    const b = $('tbar'); b.style.transition = 'none'; b.style.width = '0';
    if (!ms) return;
    void b.offsetWidth; b.style.transition = `width ${ms}ms linear`; b.style.width = 'calc(100% - 24px)';
  }

  // 台詞・地の文
  function say(sp, to, act, text, o = {}) {
    $('win').classList.remove('narr');
    const toTxt = to == null ? '' : to === 'all' ? 'みんな' : NAME[to];
    $('plate').innerHTML = `<span class="who">${NAME[sp]}</span>` + (toTxt ? `<span>→</span><span class="to">${toTxt}</span>` : '')
      + (act ? `<span class="act">${act}</span>` : '');
    if (o.html != null) $('text').innerHTML = o.html; else $('text').textContent = text;
    if (o.expr) Object.entries(o.expr).forEach(([h, x]) => expr(+h, x));
    focus(typeof sp === 'number' ? sp : null, o.far);
    if (!o.nolog) log.push({ sp, who: NAME[sp], to: toTxt, act, text: o.logText || text });
  }
  function setText(t) { $('text').textContent = t; }
  function narr(text, nolog) {
    $('win').classList.add('narr'); $('plate').innerHTML = ''; $('text').textContent = text;
    if (!nolog && text) log.push({ narr: text });
  }
  function thinking(on, msg) {
    if (!on) return;
    $('win').classList.add('narr'); $('plate').innerHTML = '';
    $('text').innerHTML = `<span class="think">……</span> <span style="font-size:12px">${msg || ''}</span>`;
  }
  function expr(h, x) { const b = document.querySelector('#fig-' + h + ' [data-expr]'); if (b) b.textContent = x; }
  function meter(h, t) { const b = document.querySelector('#fig-' + h + ' [data-meter]'); if (b) b.textContent = t; }
  function focus(sp, far) {
    far = far || [];
    ALL.forEach(id => {
      const f = $('fig-' + id); f.classList.remove('speak', 'dim', 'far', 'watch');
      if (id === sp) f.classList.add('speak');
      else if (id === 1 || id === 4 || far.includes(id)) f.classList.add('far');
      else f.classList.add(softFocus ? 'watch' : 'dim');
    });
  }
  // 場所が変わる（店の外・カラオケ・駅まで）／場を離れた人を消す
  function scene(name, place) { const s = $('stage'); s.dataset.scene = name || ''; s.dataset.place = place || ''; }
  function leave(h) { const f = $('fig-' + h); if (f) f.classList.add('gone'); }
  function soft(on) { softFocus = !!on; }
  function watchAll() { HS.forEach(h => { const f = $('fig-' + h); f.classList.remove('dim', 'far', 'speak'); f.classList.add('watch'); }); }
  function tag(t) { const e = $('tag'); if (t) { e.hidden = false; e.textContent = t; } else e.hidden = true; }
  function air(v) { $('shade').style.opacity = String(Math.max(0, Math.min(0.45, (60 - v) / 100))); }
  function note(h, mark) {
    const f = $('fig-' + h); if (!f) return;
    const n = document.createElement('div'); n.className = 'note'; n.textContent = mark; f.appendChild(n);
    setTimeout(() => n.remove(), 1900);
  }
  function dots(n, of) {
    const d = $('dots'); d.innerHTML = '';
    for (let i = 1; i <= of; i++) { const s = document.createElement('span'); s.className = 'dot' + (i > n ? ' on' : ''); d.appendChild(s); }
  }
  function dotsText(t) { $('dots').textContent = t; }

  // 手の欄
  function clear() { $('cmds').innerHTML = ''; }
  function hint(t) { $('cmds').innerHTML = ''; if (t) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = t; $('cmds').appendChild(h); } }
  function put(...nodes) { const c = $('cmds'); c.innerHTML = ''; nodes.forEach(n => n && c.appendChild(n)); }
  function btn(label, sub, cls, fn) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cmd ' + (cls || '');
    b.innerHTML = label + (sub ? `<small>${sub}</small>` : '');
    b.addEventListener('click', ev => { ev.stopPropagation(); fn(); });
    return b;
  }
  function row(nodes, cols) {
    const r = document.createElement('div'); r.className = 'row';
    r.style.gridTemplateColumns = `repeat(${cols || nodes.length || 1}, minmax(0, 1fr))`;
    nodes.forEach(n => r.appendChild(n)); return r;
  }
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  // メニュー
  let menuItems = [];
  function menu(items) { menuItems = items; }
  function renderMenu() {
    const m = $('menu'); m.innerHTML = '';
    [{ label: 'ログ', fn: openLog }].concat(menuItems).forEach(it => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = typeof it.label === 'function' ? it.label() : it.label;
      b.addEventListener('click', ev => { ev.stopPropagation(); closeMenu(); it.fn(); }); m.appendChild(b);
    });
  }
  const closeMenu = () => { $('menu').hidden = true; $('btn-menu').setAttribute('aria-expanded', 'false'); };

  // ログ・結果
  function logRound(n) { log.push({ r: n }); }
  // ログ：3つの見せ方（チャット／台本／振り返り）。どれも同じ記録から描く
  let logStyle = 'mix';
  try { logStyle = localStorage.getItem('cmp_logStyle2') || 'mix'; } catch (e) {}
  const INI = { 101: 'あ', 102: 'ゆ', 103: 'め', 1: 'け', 4: 'い', S: '店', P: '自' };
  const KINDJ = { dig: '聞く', go: '乗る', tease: 'ツッコむ', card: '手札', furu: '話しかける', topic: '話題を出す', silence: '黙る', cue: '気づき', listen: '聞き届けた', cut: '遮った' };
  function sections() {
    const out = []; let cur = { h: null, items: [] };
    log.forEach(x => { if (x.r) { if (cur.items.length || cur.h) out.push(cur); cur = { h: x.r, items: [] }; } else cur.items.push(x); });
    if (cur.items.length || cur.h) out.push(cur);
    return out;
  }
  const fxText = d => Object.entries(d).map(([h, v]) => `${NAME[h]} ${v > 0 ? '+' : ''}${Math.round(v)}`).join('　');
  function chatItem(x) {
    if (x.sp != null) {
      const me = x.sp === 'P';
      return `<div class="lc-row ${me ? 'me' : ''}">${me ? '' : `<span class="lc-av">${INI[x.sp] || '・'}</span>`}<div class="lc-col">`
        + (me ? '' : `<div class="lc-name">${x.who}${x.to && x.to !== 'あなた' ? ` <i>→ ${x.to}</i>` : ''}</div>`)
        + `<div class="lc-b">${esc(x.text)}</div>${x.act && me ? `<div class="lc-act">${x.act}</div>` : ''}</div></div>`;
    }
    if (x.narr) return `<div class="lc-n">${esc(x.narr)}</div>`;
    if (x.fx) return `<div class="lc-fx">${fxText(x.fx)}</div>`;
    if (x.pick && (x.kind === 'silence' || x.kind === 'listen')) return `<div class="lc-n">（${esc(x.pick)}）</div>`;
    if (x.vote) return `<div class="lc-n">${x.vote[0]} → <b>${x.vote[1]}</b></div>`;
    return '';
  }
  function renderChat() {
    return sections().map(sec => (sec.h ? `<div class="lc-h"><span>${esc(sec.h)}</span></div>` : '') + sec.items.map(chatItem).join('')).join('');
  }
  function secSummary(sec) {
    const kinds = {}, sum = {};
    sec.items.forEach(x => { if (x.pick) kinds[x.kind] = (kinds[x.kind] || 0) + 1; if (x.fx) Object.entries(x.fx).forEach(([h, v]) => { sum[h] = (sum[h] || 0) + v; }); });
    return { kindLine: Object.entries(kinds).map(([k, n]) => `${KINDJ[k] || k} ${n}`).join('・'), sumLine: Object.keys(sum).length ? fxText(sum) : '変化なし' };
  }
  // 複合：話題ごとのカード（振り返りの要約）を開くと、中はチャット
  function renderMix() {
    const secs = sections().filter(sec => sec.h || sec.items.some(x => x.sp != null));
    return secs.map((sec, si) => {
      const { kindLine, sumLine } = secSummary(sec);
      return `<details class="lm-card" ${si === secs.length - 1 ? 'open' : ''}><summary><span class="lm-h">${esc(sec.h || 'はじめ')}</span>`
        + `<span class="lm-k">${kindLine ? kindLine + '　' : ''}<b>${sumLine}</b></span></summary>`
        + `<div class="lm-body">${sec.items.map(chatItem).join('')}</div></details>`;
    }).join('');
  }
  function renderScript() {
    return sections().map(sec => (sec.h ? `<div class="ls-h">${esc(sec.h)}</div>` : '') + sec.items.map(x => {
      if (x.sp != null) return `<div class="ls-row ${x.sp === 'P' ? 'me' : ''}"><div class="ls-name">${x.who}${x.act ? `<small>${x.act}</small>` : ''}</div><div class="ls-text">${esc(x.text)}</div></div>`;
      if (x.narr) return `<div class="ls-n">${esc(x.narr)}</div>`;
      if (x.fx) return `<div class="ls-fx">${fxText(x.fx)}</div>`;
      if (x.pick && (x.kind === 'silence' || x.kind === 'listen')) return `<div class="ls-n">（${esc(x.pick)}）</div>`;
      if (x.vote) return `<div class="ls-row"><div class="ls-name">${x.vote[0]}</div><div class="ls-text">→ ${x.vote[1]}</div></div>`;
      return '';
    }).join('')).join('');
  }
  function renderRecap() {
    const secs = sections();
    return secs.map((sec, si) => {
      const kinds = {}, sum = {}, acts = [];
      sec.items.forEach((x, i) => {
        if (x.pick) kinds[x.kind] = (kinds[x.kind] || 0) + 1;
        if (x.fx) Object.entries(x.fx).forEach(([h, v]) => { sum[h] = (sum[h] || 0) + v; });
        if (x.sp === 'P') {
          const reply = sec.items.slice(i + 1).find(y => y.sp != null && y.sp !== 'P');
          acts.push(`<li><b>${x.act || '話した'}</b> ${esc(x.text)}${reply ? `<br><span>→ ${reply.who} ${esc(reply.text)}</span>` : ''}</li>`);
        }
      });
      const kindLine = Object.entries(kinds).map(([k, n]) => `${KINDJ[k] || k} ${n}`).join('・');
      const sumLine = Object.keys(sum).length ? fxText(sum) : '変化なし';
      const all = sec.items.filter(x => x.sp != null || x.narr).map(x => x.sp != null ? `<p><b>${x.who}</b> ${esc(x.text)}</p>` : `<p class="n">${esc(x.narr)}</p>`).join('');
      return `<div class="lr-card"><div class="lr-h">${esc(sec.h || 'はじめ')}</div>`
        + (kindLine ? `<div class="lr-k">あなたの手：${kindLine}</div>` : '')
        + `<div class="lr-k">反応：${sumLine}</div>`
        + (acts.length ? `<ul class="lr-acts">${acts.join('')}</ul>` : '<div class="lr-k">（自分からは何も言わなかった）</div>')
        + `<details ${si === secs.length - 1 ? 'open' : ''}><summary>この区切りの会話をぜんぶ見る</summary>${all}</details></div>`;
    }).join('');
  }
  function openLog() {
    const box = $('log'); box.innerHTML = '';
    const head = el('div', 'loghead', '<h2>ログ</h2>');
    const tabs = el('div', 'logtabs');
    [['mix', '複合'], ['chat', 'チャット'], ['script', '台本'], ['recap', '振り返り']].forEach(([k, l]) => {
      const b = el('button', 'ltab' + (k === logStyle ? ' on' : ''), l); b.type = 'button';
      b.addEventListener('click', ev => { ev.stopPropagation(); logStyle = k; try { localStorage.setItem('cmp_logStyle2', k); } catch (e) {} openLog(); });
      tabs.appendChild(b);
    });
    const close = el('button', 'lclose', '閉じる'); close.type = 'button';
    close.addEventListener('click', ev => { ev.stopPropagation(); $('sheet-log').hidden = true; });
    head.appendChild(tabs); head.appendChild(close); box.appendChild(head);
    const body = el('div', 'logbody ' + logStyle);
    body.innerHTML = log.length ? (logStyle === 'mix' ? renderMix() : logStyle === 'chat' ? renderChat() : logStyle === 'script' ? renderScript() : renderRecap()) : '<p class="small">まだ何もない</p>';
    box.appendChild(body);
    $('sheet-log').hidden = false;
    if (logStyle === 'chat' || logStyle === 'script') requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
  }
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const RESULT = {
    home: { title: '一緒に帰る', lead: '駅まで、二人で歩いた。' },
    contact: { title: '連絡先を交換', lead: '帰りぎわに、連絡先を交換した。' },
    none: { title: '今夜は、なし', lead: 'そのまま、解散になった。' },
  };
  // hearts: {101:数}, base: {101:数}
  function end(o) {
    const R = RESULT[o.result] || { title: o.title, lead: o.lead };
    let h = `<h2>${R.title}</h2><p>${o.lead || R.lead}</p>`;
    if (o.said) h += `<p>${o.said}</p>`;
    if (o.hearts) {
      h += '<h3>好感度（本番では見せない）</h3><div class="hearts">' + HS.map(id => {
        const v = Math.round(o.hearts[id]), d = o.base ? v - Math.round(o.base[id]) : null;
        return `<div>${NAME[id]}<b>${v}</b>${d == null ? '' : (d >= 0 ? '+' : '') + d}</div>`;
      }).join('') + '</div>';
    }
    (o.sections || []).forEach(s => { h += `<h3>${s.h}</h3>` + s.p.map(p => `<p class="small">${p}</p>`).join(''); });
    h += '<div class="row" style="grid-template-columns:1fr 1fr 1fr;margin-top:14px"></div>';
    $('end').innerHTML = h;
    const r = $('end').querySelector('.row');
    r.appendChild(btn('ログ', null, 'quiet', openLog));
    r.appendChild(btn(o.backLabel || '設定へ', null, 'quiet', () => { $('sheet-end').hidden = true; if (o.back) o.back(); }));
    r.appendChild(btn('もう一回', null, '', () => { $('sheet-end').hidden = true; o.again(); }));
    $('sheet-end').hidden = false; clear();
  }
  function dbg(html) { const d = $('dbg'); if (html == null) { d.hidden = true; return; } d.hidden = false; d.innerHTML = html; }
  const dbgOn = () => !$('dbg').hidden;

  // つなぎ
  $('stage').addEventListener('click', tapNow);
  $('cmds').addEventListener('click', e => { if (e.target === $('cmds') || e.target.classList.contains('hint')) tapNow(); });
  $('btn-menu').addEventListener('click', ev => { ev.stopPropagation(); const m = $('menu'); if (m.hidden) renderMenu(); m.hidden = !m.hidden; $('btn-menu').setAttribute('aria-expanded', String(!m.hidden)); });
  document.addEventListener('click', closeMenu);
  $('sheet-log').addEventListener('click', e => { if (e.target === $('sheet-log')) $('sheet-log').hidden = true; });

  return { NAME, HS, fire, begin, home, live, later, cancel, sleep, waitTap, waitTapOr, onTap, bar, say, setText, narr, thinking, expr, meter,
           focus, soft, watchAll, scene, leave, tag, air, note, dots, dotsText, clear, hint, put, btn, row, el, menu, logRound, openLog, end, dbg, dbgOn, esc,
           get log() { return log; } };
})();
