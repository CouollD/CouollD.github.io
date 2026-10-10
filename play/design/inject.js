/* design/inject.js — 立ち絵と見た目の差し込み（10/10 デザイン3案から本編へ）。ゲームの進行(night-i.js / stage.js)には触らない。
   1. 立ち絵：各 .fig に <img class="sprite"> を入れ、[data-expr]（真顔/笑/はにかみ）が変わったら normal/happy/shy に差し替え
   2. 話者：#plate の名札の文字から #win[data-sp] を決める（名札の色分け用）
   3. LINE/ログ：.lc-row に data-sp（アイコンを顔写真にする用）、手札つきの選択肢に .is-card を付ける */
(() => {
  'use strict';
  const IMG = new URL('img/', document.currentScript ? document.currentScript.src : location.href).href;
  const EXPR = { '真顔': 'normal', '笑': 'happy', 'はにかみ': 'shy' };          // それ以外 → normal
  const SP = { 'あおい': '101', 'ゆな': '102', 'めい': '103', 'けんた': '1', 'けいた': '4', 'あなた': 'P' };
  const $ = id => document.getElementById(id);

  // 1. 立ち絵 ------------------------------------------------------------
  ['101', '102', '103'].forEach(id => ['normal', 'happy', 'shy'].forEach(e => { new Image().src = `${IMG}h${id}_${e}.png`; }));   // 先読み
  document.querySelectorAll('.fig').forEach(fig => {
    const id = fig.id.replace('fig-', ''), isHero = fig.classList.contains('h');
    const img = new Image(); img.className = 'sprite'; img.alt = ''; img.draggable = false;
    const sync = () => {
      const ex = fig.querySelector('[data-expr]');
      const e = EXPR[ex ? ex.textContent.trim() : ''] || 'normal';
      const src = isHero ? `${IMG}h${id}_${e}.png` : `${IMG}m${id}.png`;
      if (img.dataset.src !== src) { img.dataset.src = src; img.src = src; }
    };
    fig.insertBefore(img, fig.firstChild); sync();
    const ex = fig.querySelector('[data-expr]');
    if (ex) new MutationObserver(sync).observe(ex, { childList: true, characterData: true, subtree: true });
  });

  // 2. 話者（名札の色） -----------------------------------------------------
  const plate = $('plate'), win = $('win');
  if (plate && win) {
    const sp = () => { const w = plate.querySelector('.who'); win.dataset.sp = w ? (SP[w.textContent.trim()] || '') : ''; };
    new MutationObserver(sp).observe(plate, { childList: true, subtree: true, characterData: true }); sp();
  }

  // 3. LINE（.phone）とログの .lc-row ／ 手札つきの選択肢 --------------------------
  const tagRow = row => {
    if (row.dataset.sp) return;
    if (row.classList.contains('me')) { row.dataset.sp = 'P'; return; }
    const n = row.querySelector('.lc-name'); const name = n ? n.firstChild.textContent.trim() : '';
    if (SP[name]) row.dataset.sp = SP[name];
  };
  const scan = node => {
    if (node.nodeType !== 1) return;
    if (node.classList.contains('lc-row')) tagRow(node);
    node.querySelectorAll && node.querySelectorAll('.lc-row').forEach(tagRow);
    if (node.classList.contains('cmd') || node.querySelector) {
      (node.classList.contains('cmd') ? [node] : node.querySelectorAll('.cmd')).forEach(b => {
        const s = b.querySelector('small'); if (s && /^(#|ネタ：)/.test(s.textContent.trim())) b.classList.add('is-card');   // 10/10：「手札」→「話のネタ」
      });
    }
  };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });
})();
