// ═══════════════════════════════════════════════════
// js/core/phase.js — フェーズ管理（純粋ロジック）
// 依存: なし（DOM操作なし）
// ═══════════════════════════════════════════════════

const PhaseManager = (() => {

  const PHASE_NAMES = ['乾杯', '序盤', '中盤', '終盤', 'お開き'];

  /**
   * フェーズ遷移すべきか判定する。
   * ターン終了後に呼ぶ（ターン途中では遷移しない）。
   * @param {number} phase        現在のフェーズ (0-4)
   * @param {number} turnInPhase  フェーズ内のターン数（このターンを含む）
   * @param {object} state        ゲーム状態（airGauge, twoWorld, friendHearts）
   * @returns {boolean}
   */
  function shouldTransition(phase, turnInPhase, state) {
    switch (phase) {
      case 0:
        // 自己紹介ターン（turnInPhase >= 2）で遷移
        return turnInPhase >= 2;

      case 1:
        // 2ターン経過 or いずれかの友達friendHeart≧40（8T配分: T3-4）
        if (turnInPhase >= 2) return true;
        return _anyFriendHeartAbove(state, 40);

      case 2:
        // 2ターン経過 or 2人の世界が1組成立（8T配分: T5-6）
        if (turnInPhase >= 2) return true;
        return Object.values(state.twoWorld || {}).filter(Boolean).length >= 1;

      case 3:
        // 1ターン経過で自動遷移（8T配分: T7）
        return turnInPhase >= 1;

      case 4:
        // Phase 4 は遷移先がない（ゲーム終了）
        return false;

      default:
        return false;
    }
  }

  /**
   * 次のフェーズ番号を返す
   * @param {number} phase
   * @returns {number}
   */
  function nextPhase(phase) {
    return Math.min(phase + 1, 4);
  }

  /**
   * フェーズ名を返す
   * @param {number} phase
   * @returns {string}
   */
  function phaseName(phase) {
    return PHASE_NAMES[phase] || '—';
  }

  /**
   * フェーズ開始時のナレーションテキストを返す
   * @param {number} phase
   * @returns {string}
   */
  function phaseStartNarration(phase) {
    switch (phase) {
      case 0: return '— 合コン、スタート —';
      case 1: return '— 場が温まってきた —';
      case 2: return '— 誰が誰を狙っているのか、見えてきた —';
      case 3: return '— 終盤。勝負どころだ —';
      case 4: return '— お開きが近づいている —';
      default: return '';
    }
  }

  // ── private ──────────────────────────────────────

  function _anyFriendHeartAbove(state, threshold) {
    const fh = state.friendHearts || {};
    for (const friendId of Object.keys(fh)) {
      const hearts = fh[friendId] || {};
      for (const heroineId of Object.keys(hearts)) {
        if ((hearts[heroineId] || 0) >= threshold) return true;
      }
    }
    return false;
  }

  // ── public API ───────────────────────────────────
  return { shouldTransition, nextPhase, phaseName, phaseStartNarration };

})();
