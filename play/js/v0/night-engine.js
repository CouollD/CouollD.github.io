// ═══════════════════════════════════════════════════════════════
// js/v0/night-engine.js — 遊べる版（v0）の1夜の進行（2026-09-28）
// 依存: HEROINES（data/gamedata.js）, CardTopics（js/core/card-topics.js）。DOM は触らない
//
// ルールは docs/rules-v0.md。数値は tools/sim_round.js と同じ（2000夜で 読んで掘る54%・読まずに掘る23%）。
// 画面は「出来事（events）」を順に読み、「決めること（decision）」が来たら選択肢を出す。
//
//   const night = NightEngine.create({ HEROINES, CardTopics }).newNight(seed);
//   night.advance();                  // 次の決めることまで進む
//   night.events                      // 起きたことの列（画面はここを読む）
//   night.decision                    // { kind:'start'|'react'|'rescue'|'end', options, speaker }
//   night.choose({ cmd:'open', topic }) / ({ cmd:'go'|'dig'|'tease'|'wait' })
// ═══════════════════════════════════════════════════════════════
const NightEngine = (() => {
  'use strict';

  const V0_HEROINES = [101, 102, 103];
  const V0_FRIENDS = [1, 4];            // けんた・けいた
  // 話題は「持ち主」がいる（card-topics.js の require）。あるある話題は、その事情の人しか出さない（9/30）
  //   自分  = 塾バイト・実家・文化系サークル → 入り口3つ＋自分のあるある3つ
  //   けんた = 居酒屋・一人暮らし（仕送りあり）・体育会 ／ けいた = カフェ・一人暮らし（仕送りなし）・文化系
  const INTROS = ['baito_intro', 'sumai_intro', 'jimoto_intro'];
  const PLAYER_TOPICS = ['baito_intro', 'sumai_intro', 'jimoto_intro', 'juku_tantou', 'jikka_juku', 'culture_nushi'];
  const FRIEND_TOPICS = { 1: ['sports_asaren', 'send_shiokuri', 'izakaya_kinyou'], 4: ['cafe_latte', 'nosend_denki'] };
  const V0_TOPICS = PLAYER_TOPICS.concat(FRIEND_TOPICS[1], FRIEND_TOPICS[4]);

  const CFG = {
    H0: 10, HSTEP: 20, MW: 0.03, APPEAL: [-2, -1, 0, 1], NOISE: 0.2,
    DIG: [0, 5, 9, 14],                  // 9/30 話題に持ち主と順番を付けたので、伸びを sim_depth.js の値に戻した
    GO_HEART: 2, GO_SPILL: 0.5, GO_AIR: 3,
    FAIL_HEART: 6, FAIL_AIR: 10,
    DEEP_DRAIN: [0, 0, 3, 6], TEASE_AIR: 12, OPEN_HEART: [0, 0, 1, 3], AIR_DECAY: 2,
    FRIEND_DIG_AIR: 5, FRIEND_GO: 0.5,
    ROUNDS: 8, HOME: 55, CONTACT_AVG: 45, AIR0: 60,
    self: { head: 50, air: 50, mental: 50 },
  };

  function rng(seed) {                    // 種を混ぜてから使う（連番の種だと最初の値が偏るため）
    let s = (seed ^ 0x9E3779B9) >>> 0;
    s = Math.imul(s ^ (s >>> 16), 0x85EBCA6B) >>> 0; s = Math.imul(s ^ (s >>> 13), 0xC2B2AE35) >>> 0; s = (s ^ (s >>> 16)) >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }
  function gauss(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const isH = s => V0_HEROINES.includes(s);
  const isF = s => V0_FRIENDS.includes(s);

  function create(deps) {
    const { HEROINES, CardTopics } = deps;
    const TOPICS = CardTopics.TOPICS;
    const H = id => HEROINES.find(h => h.id === id);
    const ap = (tid, hid) => CardTopics.score(TOPICS[tid], H(hid));
    const MAXD = {};
    for (const id of Object.keys(TOPICS)) {
      const reach = HEROINES.filter(h => CardTopics.score(TOPICS[id], h) >= 2).length;
      MAXD[id] = reach >= 4 ? 2 : 3;
    }

    function newNight(seed, overrides) {
      const cfg = Object.assign({}, CFG, overrides || {});
      const r = rng(seed == null ? (Date.now() >>> 0) : seed);
      const hearts = {}, noise = {};
      V0_HEROINES.forEach(id => { hearts[id] = 15 + Math.floor(r() * 21); noise[id] = gauss(r) * cfg.NOISE; });

      const n = {
        cfg, seed, heroines: V0_HEROINES.slice(), friends: V0_FRIENDS.slice(),
        hearts, noise, air: cfg.AIR0, friendAff: { 1: 50, 4: 50 },
        hand: PLAYER_TOPICS.slice(), friendPool: { 1: FRIEND_TOPICS[1].slice(), 4: FRIEND_TOPICS[4].slice() },
        opened: new Set(), topic: null,
        round: 0, phase: 'roundStart', acted: false, chain: [], ci: 0,
        events: [], decision: null, result: null, over: false,
        expr: {}, stats: { acts: 0, digs: 0, digOk: 0, fails: 0, maxDepth: 0 },
      };
      V0_HEROINES.forEach(h => n.expr[h] = '真顔');
      // 出来事には、その瞬間の場の様子を写しておく（画面は出来事を1つずつ再生するので、今の値を見ると先走る）
      const emit = e => {
        e.round = n.round; e.air = n.air; e.exprs = Object.assign({}, n.expr);
        e.topicNow = n.topic ? { id: n.topic.id, depth: n.topic.depth, max: n.topic.max, partner: n.topic.partner } : null;
        n.events.push(e); return e;
      };

      // ── 判定 ────────────────────────────────────────────────
      function tolerance(hid, tid) {
        const c = n.cfg;
        return (n.hearts[hid] - c.H0) / c.HSTEP + (H(hid).params.mental - 60) * c.MW + c.APPEAL[ap(tid, hid)] + n.noise[hid];
      }
      const gainMult = () => (0.6 + n.air / 150) * (0.8 + n.cfg.self.head / 250);
      const honmei = () => V0_HEROINES.slice().sort((a, b) => n.hearts[b] - n.hearts[a])[0];
      function canDig(hid) {
        const t = n.topic;
        return !!t && !t.strained && t.depth < t.max && t.depth + 1 <= tolerance(hid, t.id);
      }
      // 表情（サイン）: 空気読みの精度で、掘れるかどうかを匂わせる
      function signalExpr(hid) {
        const t = n.topic;
        if (t.strained) return '困り顔';
        if (ap(t.id, hid) === 0) return 'つまらない';
        const truth = canDig(hid);
        const shown = n.r() < 0.55 + n.cfg.self.air / 200 ? truth : !truth;
        return shown ? 'はにかみ' : '真顔';
      }
      function settleOthers(except) {
        const t = n.topic;
        V0_HEROINES.forEach(h => {
          if (h === except) return;
          if (!t) { n.expr[h] = '真顔'; return; }
          if (t.depth >= 2 && t.partner && t.partner !== h) n.expr[h] = 'つまらない';
          else if (ap(t.id, h) === 0) n.expr[h] = 'つまらない';
          else if (n.expr[h] === '困り顔') n.expr[h] = '真顔';
        });
      }

      // ── 話題 ────────────────────────────────────────────────
      // あるある話題は、入り口でその事情が出てから（バイト→「バイト何してる」、住まい→「実家？一人暮らし？」）
      function unlocked(tid) {
        const req = TOPICS[tid].require || {};
        if (req.part && !n.opened.has('baito_intro')) return false;
        if (req.living && !n.opened.has('sumai_intro')) return false;
        return true;
      }
      function openTopic(tid, by) {
        const known = PLAYER_TOPICS.includes(tid);              // 自分の話題か、誰でも知っている入り口なら分かる
        n.hand = n.hand.filter(x => x !== tid);
        V0_FRIENDS.forEach(f => { n.friendPool[f] = n.friendPool[f].filter(x => x !== tid); });
        n.opened.add(tid);
        // 話すこと＝食いつきの強さ。入り口の話題はみんなに聞いているので、全員がひとことは答える
        const left = {}; V0_HEROINES.forEach(h => left[h] = INTROS.includes(tid) ? Math.max(ap(tid, h), 1) : ap(tid, h));
        n.topic = { id: tid, by, openedRound: n.round, depth: 0, max: MAXD[tid], strained: false, wall: null, known, partner: null,
                    reached: {}, left, part: new Set(), lost: 0, said: {}, friendSaid: false, talk: {}, friendAnswered: false };
        V0_HEROINES.forEach(h => { n.hearts[h] = Math.min(100, n.hearts[h] + n.cfg.OPEN_HEART[ap(tid, h)]); });
        emit({ t: 'open', by, topic: tid, known });
        settleOthers(null);
        if (!known) emit({ t: 'narr', key: 'unknown', topic: tid });
      }
      function alive() {
        const t = n.topic; if (!t) return false;
        if (t.depth >= 2 && t.partner) return t.left[t.partner] > 0;
        return V0_HEROINES.some(h => t.left[h] > 0 && (ap(t.id, h) >= 2 || h === t.partner));
      }
      // 友達が話題を出す: 自分のあるある（事情が出たあと）か、まだ出ていない入り口
      function npcOpen() {
        const pool = [];
        V0_FRIENDS.forEach(f => n.friendPool[f].filter(unlocked).forEach(tid => pool.push([tid, f])));
        n.hand.filter(tid => INTROS.includes(tid)).forEach(tid => pool.push([tid, V0_FRIENDS[Math.floor(n.r() * V0_FRIENDS.length)]]));
        if (!pool.length) { emit({ t: 'narr', key: 'stall' }); n.topic = null; return false; }
        const [tid, fid] = pool[Math.floor(n.r() * pool.length)];
        openTopic(tid, fid);
        return true;
      }
      function buildChain() {
        const t = n.topic; if (!t) return [];
        if (t.depth >= 2 && t.partner) { t.leadNext = null; return t.left[t.partner] > 0 ? [t.partner] : []; }
        // 通じていない子（食いつき1以下）が口を挟むのは、話題が出たラウンドだけ
        const hs = V0_HEROINES.filter(h => t.left[h] > 0 && (ap(t.id, h) >= 2 || h === t.partner || t.openedRound === n.round))
          .sort((a, b) => (t.left[b] - t.left[a]) || (n.hearts[b] - n.hearts[a]));
        const out = hs.slice();
        if (t.leadNext && out.includes(t.leadNext)) { out.splice(out.indexOf(t.leadNext), 1); out.unshift(t.leadNext); }   // 掘られた子が先に答える
        t.leadNext = null;
        if (out.length && !t.friendSaid && n.r() < n.cfg.FRIEND_GO) out.splice(1, 0, V0_FRIENDS[n.r() < 0.5 ? 0 : 1]);   // 友達が割り込むのは1つの話題で1回まで
        return out;
      }
      function utter(s) {
        const t = n.topic;
        if (isH(s)) {
          t.left[s]--; t.part.add(s);
          const ld = (t.depth === 0 || t.partner === s) ? t.depth : 0;   // 掘られていない子は、深い話をしない（台詞の深さ）
          const key = ld + ':' + s; t.said[key] = (t.said[key] || 0) + 1;
          n.expr[s] = signalExpr(s); settleOthers(s);
          // 話す相手: 自分が一度でも反応した子は、以降こっちに話す。そうでなければ話題を出した人に
          const to = (t.partner === s || t.talk[s]) ? 'P' : t.by;
          emit({ t: 'say', who: s, to, topic: t.id, depth: ld, topicDepth: t.depth, count: t.said[key], appeal: ap(t.id, s),
                 strained: t.strained, expr: n.expr[s], lead: n.ci === 1, dugBy: t.partner === s ? 'P' : null });
          // 友達に聞き返したら、友達が答える（1つの話題で1回）
          if (ld === 0 && t.said[key] === 2 && isF(to) && !t.friendAnswered) { t.friendAnswered = true; emit({ t: 'friend', who: to, mode: 'answer', topic: t.id, to: s }); }
        } else {
          emit({ t: 'friend', who: s, mode: 'go', topic: t.id, playerOpened: t.by === 'P', first: !t.friendSaid });
          t.friendSaid = true;
        }
      }

      // ── 自分の手 ────────────────────────────────────────────
      function legal(s) {
        const t = n.topic, a = ['tease'];
        if (!t || !t.known) return a;
        a.unshift('go');
        if (isF(s) || (t.depth < t.max && !t.strained)) a.splice(1, 0, 'dig');
        return a;
      }
      function tease(s, free) {
        const c = n.cfg, t = n.topic;
        emit({ t: 'player', cmd: free ? 'rescue' : 'tease', to: s, topic: t.id, depth: t.depth });
        if (t.depth === 0 && !t.strained) { n.air -= 3; emit({ t: 'narr', key: 'slip' }); return; }
        if (t.strained && t.lost && isH(s)) { n.hearts[s] += t.lost * (c.self.mental / 100); t.lost = 0; }
        t.depth = Math.max(0, t.depth - 1); t.strained = false; n.air += c.TEASE_AIR;
        if (isH(s)) { n.expr[s] = '笑'; emit({ t: 'react', who: s, kind: free ? 'rescue' : 'tease', expr: '笑' }); }
        else emit({ t: 'friend', who: s, mode: 'teased', topic: t.id });
        settleOthers(s);
      }
      // 戻り値: 外れたら true
      function act(s, cmd) {
        const c = n.cfg, t = n.topic, gm = gainMult();
        n.stats.acts++;
        if (cmd === 'tease') { tease(s, false); return false; }
        emit({ t: 'player', cmd, to: s, topic: t.id, depth: t.depth });
        if (isH(s)) t.talk[s] = 'P';
        if (isF(s)) {
          if (cmd === 'go') { t.part.forEach(h => n.hearts[h] += c.GO_SPILL * gm); n.air += c.GO_AIR; n.friendAff[s] += 2;
                              emit({ t: 'friend', who: s, mode: 'backed', topic: t.id }); }
          else { n.air += c.FRIEND_DIG_AIR; n.friendAff[s] += 5; emit({ t: 'friend', who: s, mode: 'dug', topic: t.id });
                 emit({ t: 'friend', who: s, mode: 'story', topic: t.id }); }
          return false;
        }
        if (cmd === 'go') {
          n.hearts[s] += (ap(t.id, s) >= 2 ? c.GO_HEART : c.GO_HEART / 2) * gm;
          t.part.forEach(h => { if (h !== s) n.hearts[h] += c.GO_SPILL * gm; });
          n.air += c.GO_AIR;
          n.expr[s] = '笑';
          emit({ t: 'react', who: s, kind: 'go', expr: '笑' });
          return false;
        }
        // 掘る
        n.stats.digs++;
        const want = t.depth + 1;
        if (canDig(s)) {
          n.stats.digOk++; t.depth = want; t.partner = s; t.left[s] += 1;
          if (want > (t.reached[s] || 0)) { n.hearts[s] += c.DIG[want] * gm; t.reached[s] = want; }
          n.stats.maxDepth = Math.max(n.stats.maxDepth, want);
          // 答えは次のラウンドの頭で話す（その場では、少し考える間だけ）。自分はその答えに反応できる
          t.leadNext = s;
          n.expr[s] = 'はにかみ'; settleOthers(s);
          emit({ t: 'react', who: s, kind: 'ok', expr: 'はにかみ' });
          if (want === 2 && !t.twoWorldShown) { t.twoWorldShown = true; emit({ t: 'narr', key: 'twoWorld' }); }
          return false;
        }
        n.stats.fails++; t.strained = true; t.wall = want; t.lost = c.FAIL_HEART;
        n.hearts[s] -= c.FAIL_HEART; n.air -= c.FAIL_AIR;
        n.expr[s] = '困り顔';
        emit({ t: 'react', who: s, kind: 'fail', expr: '困り顔' });
        return true;
      }

      // ── 進行 ────────────────────────────────────────────────
      function startRound() {
        n.round++; n.acted = false; n.chain = []; n.ci = 0;
        emit({ t: 'round', n: n.round, of: n.cfg.ROUNDS });
        if (n.topic && n.topic.leadNext) {                 // 相手が答えている途中は、話題を変えられない
          n.decision = null; n.chain = buildChain(); n.ci = 0; n.phase = 'chain';
          runChain(); return;
        }
        const opts = n.hand.filter(unlocked).map(tid => ({ cmd: 'open', topic: tid, known: true }));
        opts.push({ cmd: 'wait' });
        n.decision = { kind: 'start', options: opts };
        n.phase = 'start';
      }
      function endRound() {
        n.air -= n.cfg.AIR_DECAY + (n.topic ? n.cfg.DEEP_DRAIN[n.topic.depth] : 0);
        V0_HEROINES.forEach(h => n.hearts[h] = clamp(n.hearts[h], 0, 100));
        n.air = clamp(n.air, 0, 100);
        emit({ t: 'roundEnd', air: n.air, acted: n.acted });
        if (n.air <= 0) { n.over = true; emit({ t: 'narr', key: 'cold' }); }
        if (n.over || n.round >= n.cfg.ROUNDS) {
          if (!n.over && n.topic && n.topic.leadNext) { const s = n.topic.leadNext; n.topic.leadNext = null; n.ci = 1; utter(s); }   // 最後に掘った答えは、お開きの前に聞ける
          finish();
        } else n.phase = 'roundStart';
      }
      function finish() {
        const F = honmei(), hF = n.hearts[F];
        n.result = n.over ? 'none' : hF >= n.cfg.HOME ? 'home' : ((n.air + hF) / 2 >= n.cfg.CONTACT_AVG ? 'contact' : 'none');
        emit({ t: 'end', result: n.result, honmei: F, reachedDepth3: n.stats.maxDepth >= 3 });
        n.decision = { kind: 'end', result: n.result, honmei: F };
        n.phase = 'end';
      }
      function runChain() {
        while (n.ci < n.chain.length) {
          const s = n.chain[n.ci++];
          utter(s);
          if (!n.acted) {
            const opts = legal(s).map(cmd => ({ cmd })); opts.push({ cmd: 'wait' });
            n.decision = { kind: 'react', speaker: s, options: opts, last: n.ci >= n.chain.length };
            n.phase = 'react';
            return;
          }
        }
        endRound();
      }
      function advance() {
        if (n.phase === 'roundStart') startRound();
        else if (n.phase === 'chain') runChain();
        return n.decision;
      }
      function choose(ch) {
        const d = n.decision; if (!d) return;
        if (n.phase === 'start') {
          n.decision = null;
          if (ch.cmd === 'open' && n.hand.includes(ch.topic) && unlocked(ch.topic)) {
            emit({ t: 'player', cmd: 'open', topic: ch.topic });
            openTopic(ch.topic, 'P'); n.acted = true; n.stats.acts++;
          } else if (!alive()) npcOpen();
          n.chain = buildChain(); n.ci = 0;
          n.phase = 'chain';
          if (!n.chain.length && n.topic) emit({ t: 'narr', key: 'stall' });
          runChain();
        } else if (n.phase === 'react') {
          const s = d.speaker; n.decision = null;
          if (ch.cmd === 'wait') {
            if (n.topic && !n.topic.known) { n.topic.known = true; emit({ t: 'narr', key: 'learned', topic: n.topic.id }); }
            n.phase = 'chain'; runChain(); return;
          }
          if (!legal(s).includes(ch.cmd)) { n.decision = d; return; }
          const failed = act(s, ch.cmd);
          n.acted = true;
          if (failed) { n.decision = { kind: 'rescue', speaker: s, options: [{ cmd: 'tease' }, { cmd: 'wait' }] }; n.phase = 'rescue'; return; }
          n.ci = n.chain.length; endRound();
        } else if (n.phase === 'rescue') {
          const s = d.speaker; n.decision = null;
          if (ch.cmd === 'tease') tease(s, true);          // 外した直後の茶化すは数えない
          else emit({ t: 'narr', key: 'let' });
          n.ci = n.chain.length; endRound();
        }
      }

      n.r = r;
      n.advance = advance; n.choose = choose; n.legal = legal; n.honmei = honmei;
      n.appeal = ap; n.maxDepth = id => MAXD[id]; n.canDig = canDig;   // 画面のデバッグ表示と試験用
      n.tolerance = tolerance; n.unlocked = unlocked; n.alive = alive;
      return n;
    }
    return { newNight, CFG, V0_HEROINES, V0_FRIENDS, V0_TOPICS, PLAYER_TOPICS, FRIEND_TOPICS, INTROS };
  }

  return { create, CFG, V0_HEROINES, V0_FRIENDS, V0_TOPICS, PLAYER_TOPICS, FRIEND_TOPICS, INTROS };
})();

if (typeof module !== 'undefined') module.exports = NightEngine;
