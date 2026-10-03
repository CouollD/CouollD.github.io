// ═══════════════════════════════════════════════════
// js/core/friend-ai.js — 友達の自律行動（純粋ロジック）
// 依存: なし（DOM操作なし）
// ═══════════════════════════════════════════════════

const FriendAI = (() => {

  // ── 「友達に向く」耳打ちの効果定数 ────────────────
  // バランス調整前提。勝手に変えない（変える時はユーザー確認）。
  const NADAMERU_PUSH_MULT       = 0.4;   // なだめる: push倍率
  const AORU_PUSH_MULT           = 1.6;   // 煽る: push倍率
  const AORU_ACCIDENT_PROB_BONUS = 0.15;  // 煽る: 事故確率加算
  const AORU_ACCIDENT_AIR_MULT   = 1.3;   // 煽る: 事故時の空気減少倍率

  // ── 本気モード（狙いの子の本気ライバル）定数 ──────
  // 二人の世界到達閾値。goukon-game.js と共有（ライバル到達バーの分母）。
  const TWO_WORLD_THRESHOLD = 72;
  // ライバルは trait 由来のブレを抑え、安定して狙いの子へ迫る。
  // なだめる/煽る補正・静観ブーストは従来通りこの push に掛かる。
  // 2026-09-13 調整: 6〜11 では奪われ判定の山がT7に来て、連絡先が解禁されるT7と
  // 衝突していた（T7は 友達行動→奪われ判定→選択 の順なので、初めて押せる前に69%で終わる）。
  // 5〜9 に下げて山をT8へ移し、T7を「間に合うか」の勝負にする。
  const RIVAL_PUSH_MIN = 5;
  const RIVAL_PUSH_MAX = 9;

  /**
   * 合コン開始時にライバル1人を選ぶ（純粋ロジック）。優先順位:
   *   1. 現在のターゲットがプレイヤーの狙い（state.targetHeroine）と同じ友達
   *   2. いなければ攻撃的特性（暴走しやすい / 惚れっぽい）を持つ友達
   *   3. それもいなければコミュ力が最も高い友達
   * 同一ティア内はコミュ力降順で決定的に選ぶ（解釈: 仕様は同点処理未指定）。
   * @param {object} state        friendTargets / targetHeroine を持つゲーム状態
   * @param {Array}  partyChars   参加中の友達
   * @returns {number|null}       ライバルの友達id（友達不在なら null）
   */
  function selectRival(state, partyChars) {
    if (!partyChars || partyChars.length === 0) return null;
    const targetId = state.targetHeroine ? state.targetHeroine.id : null;
    const byComm   = (a, b) => ((b.params || {}).comm || 0) - ((a.params || {}).comm || 0);

    if (targetId) {
      const sameTarget = partyChars
        .filter(c => (state.friendTargets || {})[c.id] === targetId)
        .sort(byComm);
      if (sameTarget.length) return sameTarget[0].id;
    }

    const attackers = partyChars
      .filter(c => _hasTrait(c.traits || [], '暴走しやすい') || _hasTrait(c.traits || [], '惚れっぽい'))
      .sort(byComm);
    if (attackers.length) return attackers[0].id;

    return [...partyChars].sort(byComm)[0].id;
  }

  /**
   * 毎ターン、友達が自律的に行動する。
   * STATE を直接変更せず、変更差分と行動ログを返す。
   * state.friendMods（{ friendId: 'nadameru'|'aoru' }）を読んで行動を補正する。
   * mods のクリアはゲーム側（goukon-game.js）が友達AI行動後に行う。
   *
   * @param {object} state        ゲーム状態（friendHearts, friendTargets, twoWorld, airGauge, lastActionWasKanshi, friendMods）
   * @param {Array}  partyChars   参加中の友達キャラクター配列
   * @param {Array}  heroineChars 参加中のヒロイン配列
   * @param {number} airDecayMult シナジー補正（空気減少倍率）
   * @returns {{ heartDeltas: object, airDelta: number, targetChanges: object, actionLogs: string[] }}
   */
  function runActions(state, partyChars, heroineChars, airDecayMult = 1.0) {
    const heartDeltas   = {};   // { friendId: { heroineId: delta } }
    const targetChanges = {};   // { friendId: newHeroineId }
    const actionLogs    = [];   // 表示用テキスト
    let airDelta        = 0;

    const kanshiBoost = state.lastActionWasKanshi ? 1.8 : 1.0;

    partyChars.forEach(friend => {
      if (state.twoWorld[friend.id]) return; // 2人の世界は離脱済み

      const traits   = friend.traits || [];
      const targetId = state.friendTargets[friend.id];
      const mod      = (state.friendMods || {})[friend.id] || null;
      const isRival  = state.rivalId != null && friend.id === state.rivalId;
      let push       = 0;
      let log        = '';

      if (isRival) {
        // ライバルは一途に狙いの子へ迫る（targetId は選定時に固定済み＝目移りしない）。
        push = RIVAL_PUSH_MIN + _rand(RIVAL_PUSH_MAX - RIVAL_PUSH_MIN + 1);
        log  = `${_sn(friend.name)}が${_heroName(targetId, heroineChars)}に本気で迫っている`;
      }
      else if (_hasTrait(traits, '暴走しやすい')) {
        push = 8 + _rand(5);
        log  = `${_sn(friend.name)}が${_heroName(targetId, heroineChars)}にガンガン話しかけている`;
        if (_accidentHappens(0.2, mod)) {
          airDelta -= _accidentAirLoss(5, airDecayMult, mod);
          log += '…場がちょっと引いた';
        }
      }
      else if (_hasTrait(traits, '惚れっぽい')) {
        push = 5 + _rand(5);
        // 15%でターゲット変更
        if (_chance(0.15)) {
          const newTarget = _highestHeroineFor(friend.id, state, heroineChars);
          if (newTarget) {
            targetChanges[friend.id] = newTarget;
            log = `${_sn(friend.name)}の視線が${_heroName(newTarget, heroineChars)}に移った`;
          } else {
            log = `${_sn(friend.name)}が${_heroName(targetId, heroineChars)}に夢中になっている`;
          }
        } else {
          log = `${_sn(friend.name)}が${_heroName(targetId, heroineChars)}に夢中になっている`;
        }
      }
      else if (_hasTrait(traits, '静観しやすい')) {
        push = 1;
        log  = `${_sn(friend.name)}は静かに飲んでいる`;
      }
      else if (_hasTrait(traits, '学歴厨')) {
        const intellectual = heroineChars.find(h =>
          (h.likes || []).includes('知的系') || (h.type || '').includes('知的')
        );
        if (intellectual) {
          targetChanges[friend.id] = intellectual.id;
          push = 6;
          log  = `${_sn(friend.name)}が${_sn(intellectual.name)}と知的な話で盛り上がっている`;
        } else {
          push = 2;
          log  = `${_sn(friend.name)}が学歴の話を始めた…`;
          if (_accidentHappens(0.15, mod)) airDelta -= _accidentAirLoss(4, airDecayMult, mod);
        }
      }
      else if (_hasTrait(traits, '譲れる')) {
        const selfTarget = state.targetHeroine ? state.targetHeroine.id : null;
        if (targetId === selfTarget) {
          push = 0;
          log  = `${_sn(friend.name)}がさりげなくスペースを空けてくれた`;
        } else {
          push = 3;
          log  = `${_sn(friend.name)}が${_heroName(targetId, heroineChars)}と穏やかに話している`;
        }
      }
      else {
        push = 3;
        log  = `${_sn(friend.name)}が${_heroName(targetId, heroineChars)}に話しかけた`;
      }

      // 耳打ち補正（なだめる/煽る）
      if (mod === 'nadameru')  push = Math.round(push * NADAMERU_PUSH_MULT);
      else if (mod === 'aoru') push = Math.round(push * AORU_PUSH_MULT);

      // 静観ブースト
      push = Math.round(push * kanshiBoost);

      if (push > 0 && targetId) {
        if (!heartDeltas[friend.id]) heartDeltas[friend.id] = {};
        heartDeltas[friend.id][targetId] = (heartDeltas[friend.id][targetId] || 0) + push;
      }

      if (log && mod === 'nadameru')  log += '…少し落ち着いたようだ';
      else if (log && mod === 'aoru') log += '…完全にスイッチが入った';

      if (log) actionLogs.push(log);
    });

    return { heartDeltas, airDelta, targetChanges, actionLogs };
  }

  /**
   * 2人の世界の成立をチェックする。
   * @param {object} state
   * @param {Array}  partyChars
   * @param {Array}  heroineChars
   * @returns {{ newTwoWorld: object, events: Array<{friendId, heroineId, text}> }}
   */
  function check2World(state, partyChars, heroineChars) {
    const newTwoWorld = {};
    const events      = [];

    partyChars.forEach(friend => {
      if (state.twoWorld[friend.id]) return;
      const targetId = state.friendTargets[friend.id];
      if (!targetId) return;
      const heart = (state.friendHearts[friend.id] || {})[targetId] || 0;
      if (heart >= TWO_WORLD_THRESHOLD) {
        newTwoWorld[friend.id] = targetId;
        const fn = _sn(friend.name);
        const hn = _heroName(targetId, heroineChars);
        events.push({
          friendId:  friend.id,
          heroineId: targetId,
          text:      `💕 ${fn}と${hn}が2人の世界に入っていった…`,
          airBonus:  5,
        });
      }
    });

    return { newTwoWorld, events };
  }

  // ── private helpers ──────────────────────────────

  function _hasTrait(traits, keyword) {
    return traits.some(t => t.includes(keyword));
  }

  function _rand(n) {
    return Math.floor(Math.random() * n);
  }

  function _chance(p) {
    return Math.random() < p;
  }

  // 空気事故が起きるか（なだめる=発生させない / 煽る=確率加算）
  function _accidentHappens(baseProb, mod) {
    if (mod === 'nadameru') return false;
    const p = mod === 'aoru' ? baseProb + AORU_ACCIDENT_PROB_BONUS : baseProb;
    return _chance(p);
  }

  // 事故時の空気減少量（煽る=倍率増）
  function _accidentAirLoss(base, airDecayMult, mod) {
    const aoruMult = mod === 'aoru' ? AORU_ACCIDENT_AIR_MULT : 1;
    return Math.round(base * airDecayMult * aoruMult);
  }

  function _sn(name) {
    const parts = name.split(/[\s　]+/);
    return parts[parts.length - 1] || name;
  }

  function _heroName(heroineId, heroineChars) {
    const h = heroineChars.find(x => x.id === heroineId);
    return h ? _sn(h.name) : '?';
  }

  function _highestHeroineFor(friendId, state, heroineChars) {
    const hearts = (state.friendHearts[friendId] || {});
    let best = null, bestVal = -1;
    heroineChars.forEach(h => {
      const v = hearts[h.id] || 0;
      if (v > bestVal) { bestVal = v; best = h.id; }
    });
    return best;
  }

  // ── public API ───────────────────────────────────
  return { runActions, check2World, selectRival, TWO_WORLD_THRESHOLD };

})();
