// ═══════════════════════════════════════════════════
// js/core/chain.js — 会話チェインのレーン判定（純粋ロジック）
// 依存: なし（DOM操作なし）
//
// 仕様: docs/chain-core-spec.md C1段。
// 会話の連鎖を2レーンで数える:
//   - 場チェイン(lane='ba'): いつでも。ノリ/話を振る、または宛先が定まらない継続
//   - 二人チェイン(lane='futari'): 同じ子への共感/深掘りが2連続 + 席が斜め前まで
//     + ♥一定 で成立（「二人の空気」）
// C1はレーン判定と計数のみ（報酬・頂点イベント・割り込み断絶はC2/C3で追加）。
// STATE は破壊せず、新しい chain 値を返して呼び出し側が代入する。
// 数値は仮置き（テストプレイでユーザーと確定）。
// ═══════════════════════════════════════════════════

const ChainCore = (() => {

  // ── 定数（仮置き）─────────────────────────────────
  const FUTARI_HEART_LINE = 45;   // 二人チェインに入れる♥ライン
  const FUTARI_STREAK_REQ = 2;    // 同じ子への連続手数（2連続で二人の空気）
  const FUTARI_APEX_REQ   = 4;    // 頂点【二人の温度】の連鎖数（spec仮4-5→4を採用）
  const SEAT_NEAR_DIST    = 1;    // 斜め前まで＝席index差1以内

  // ── C3: 割り込みのレーン別挙動（仮置き）──────────
  // 割り込み成立の最小push。これ未満の弱い接近（静観の1・譲れる/汎用の3）では
  // 二人の空気は散らない＝本気の接近だけが断絶を起こす
  // 2026-09-16: 4 では友達の通常押し(5〜9)が常に超えてしまい、二人チェインが
  // 成立した次のターン頭に必ず断絶していた（実測30,000ターンで成立0回）。
  // 12 に上げて、断絶するのは「煽った」「暴走しやすい友達を連れて行った」の
  // 結果だけにする＝偶然ではなくプレイヤーの選択の帰結として壊れる。
  const INTERRUPT_PUSH_MIN      = 12;
  // 場チェイン中: 友達が乗ると場が更に温まる（1人あたりの空気加算とその上限）
  const BA_BOOST_AIR_PER_FRIEND = 1;
  const BA_BOOST_AIR_CAP        = 3;

  // チェインを繋ぐ手（それ以外は断絶/リセット）
  const CONTINUE_TYPES = ['kyokan', 'nori', 'fukagori'];

  /**
   * チェインの初期値（試合開始時・断絶時に使う）。
   */
  function init() {
    return { lane: null, count: 0, partnerId: null, streak: 0, lastTargetId: null };
  }

  /**
   * 席の近接判定: 斜め前まで（自分の席と相手の席のindex差が1以内）。
   * seat_battle が「二人チェインを狙える相手のドラフト」になる根拠。
   */
  function seatNear(selfSeat, heroineIdx) {
    return Math.abs((selfSeat ?? 0) - heroineIdx) <= SEAT_NEAR_DIST;
  }

  /**
   * その子と「二人の空気」に入れる状態か（席・♥・在席の3条件）。
   * @param {object} state         hearts / twoWorld / stolenHeroineId
   * @param {object} heroine       対象ヒロイン
   * @param {Array}  heroineChars  参加ヒロイン（席index解決用）
   * @param {number} selfSeat      自分の席index
   */
  function canFutari(state, heroine, heroineChars, selfSeat) {
    if (!heroine) return false;
    const idx = heroineChars.findIndex(h => h.id === heroine.id);
    if (idx < 0 || !seatNear(selfSeat, idx)) return false;
    if (((state.hearts || {})[heroine.id] || 0) < FUTARI_HEART_LINE) return false;
    if (state.stolenHeroineId === heroine.id) return false;
    if (Object.values(state.twoWorld || {}).includes(heroine.id)) return false;
    return true;
  }

  /**
   * プレイヤーの手が解決した後に呼ぶ。新しい chain 値を返す。
   * @param {object|null} chain
   * @param {object} a  { type, ok, targetId, canFutariNow }
   *   type:         ことだまID（furu 含む）
   *   ok:           成功したか（result bad は false）
   *   targetId:     会話の宛先ヒロインid（直前に話していた子）
   *   canFutariNow: その子と二人の空気に入れる状態か（canFutari の結果）
   */
  function onAction(chain, a) {
    const c = chain || init();

    // バランス確定(C5・§7発見1): 二人チェイン中の深掘り失敗は「連鎖リセットのみ」に緩和。
    // lane/partnerId/lastTargetId は維持し、streak だけ1減らす（lane==='ba'での
    // 深掘り失敗は緩和しない＝成立前にリスクを消すと「とりあえず深掘り連打」が最適解化するため）。
    // この判定は既存の全断絶チェックより前に評価する。
    if (!a.ok && a.type === 'fukagori' && c.lane === 'futari') {
      return { ...c, streak: Math.max(1, c.streak - 1) };
    }

    // 失敗・チェイン外の手（話題がえ/静観/飲もう/連絡先/耳打ち）は断絶
    if (!a.ok || (!CONTINUE_TYPES.includes(a.type) && a.type !== 'furu')) {
      return init();
    }

    // ノリ・話を振る = 場レーン（卓全体に向く手）
    if (a.type === 'nori' || a.type === 'furu') {
      return { lane: 'ba', count: c.count + 1, partnerId: null,
               streak: 0, lastTargetId: a.targetId ?? null };
    }

    // 共感/深掘り = 宛先が同じ子に続くと二人の空気へ
    const sameTarget = a.targetId != null && a.targetId === c.lastTargetId;
    // バランス確定(C5・§7発見1): 二人チェイン中の深掘り成功は加速ボーナス（streak+2）。
    // 共感は従来通り streak+1 固定（安全に積む役割を維持）。
    const streakGain = (a.type === 'fukagori' && c.lane === 'futari' && sameTarget) ? 2 : 1;
    const streak      = sameTarget ? c.streak + streakGain : 1;

    if (streak >= FUTARI_STREAK_REQ && a.canFutariNow) {
      return { lane: 'futari', count: c.count + 1, partnerId: a.targetId,
               streak, lastTargetId: a.targetId };
    }
    return { lane: 'ba', count: c.count + 1, partnerId: null,
             streak, lastTargetId: a.targetId ?? null };
  }

  /**
   * 頂点判定: 二人チェインが FUTARI_APEX_REQ 連鎖に達したか（C2）。
   * 発火の1回制御（ヒロインごと）は呼び出し側が行う。
   */
  function isApex(chain) {
    return !!(chain && chain.lane === 'futari' && chain.streak >= FUTARI_APEX_REQ);
  }

  /**
   * 友達AIの行動が解決した後に呼ぶ（C3: 割り込みの意味がレーンで反転）。
   *   - 二人チェイン中: 相手の子への本気の接近（push>=INTERRUPT_PUSH_MIN）で断絶。
   *     事前の耳打ち「なだめる」(mod='nadameru') で予防できる。
   *   - 場チェイン中: 友達が乗ると場が更に温まる（baBoost=空気加算量を返す）。
   * 仮決め: 割り込みペナルティ＝チェイン喪失のみ（空気ロスは付けない）。
   * specの「断絶の空気ロス」(§1)の解釈はユーザー確認待ち。
   *
   * @param {object|null} chain
   * @param {Array} pushes  [{ friendId, targetId, push, mod }]
   *                        mod: 'nadameru' | 'aoru' | null
   * @returns {{ chain: object|null, interruptedBy: *|null, baBoost: number }}
   */
  function onFriendActions(chain, pushes) {
    const noChange = { chain, interruptedBy: null, baBoost: 0 };
    if (!chain || !chain.lane) return noChange;
    const list = pushes || [];

    if (chain.lane === 'futari') {
      const interrupter = list.find(p =>
        p.targetId === chain.partnerId &&
        p.push >= INTERRUPT_PUSH_MIN &&
        p.mod !== 'nadameru'
      );
      if (!interrupter) return noChange;
      return { chain: init(), interruptedBy: interrupter.friendId, baBoost: 0 };
    }

    if (chain.lane === 'ba' && chain.count >= 1) {
      const activeFriends = list.filter(p => p.push > 0).length;
      const baBoost = Math.min(activeFriends * BA_BOOST_AIR_PER_FRIEND, BA_BOOST_AIR_CAP);
      return { chain, interruptedBy: null, baBoost };
    }
    return noChange;
  }

  // ── public API ───────────────────────────────────
  return { init, seatNear, canFutari, onAction, isApex, onFriendActions,
           FUTARI_HEART_LINE, FUTARI_STREAK_REQ, FUTARI_APEX_REQ,
           INTERRUPT_PUSH_MIN, BA_BOOST_AIR_PER_FRIEND, BA_BOOST_AIR_CAP };

})();
