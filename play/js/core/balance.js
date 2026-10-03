// ═══════════════════════════════════════════════════
// js/core/balance.js — 難易度プリセット（純粋ロジック）
// 依存: なし（DOM操作なし。localStorageのみ・node実行時はガード）
//
// Balance.get() → { mode, airInitBonus, airDecayMult, contactHeartLine }
// localStorage 'goukon_balance' が 'easy' のときだけ easy。既定は normal。
// ═══════════════════════════════════════════════════

const Balance = (() => {

  const STORAGE_KEY = 'goukon_balance';

  // normal = 現行値（挙動を変えない）
  const PRESETS = {
    normal: {
      airInitBonus:     0,     // 空気初期値への加算
      airDecayMult:     1.0,   // 空気自然減衰（友達AI事故由来）倍率
      contactHeartLine: 55,    // 連絡先成功の♥ライン
    },
    easy: {
      airInitBonus:     16,    // 空気初期値 +16
      airDecayMult:     0.5,   // 空気自然減衰 ×0.5
      contactHeartLine: 48,    // 連絡先♥ライン 48
    },
  };

  /**
   * 現在の難易度プリセットを返す。
   * @returns {{mode:string, airInitBonus:number, airDecayMult:number, contactHeartLine:number}}
   */
  function get() {
    let mode = 'normal';
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === 'easy') mode = 'easy';
      }
    } catch (e) {
      // localStorage不可（プライベートモード等）→ normal 扱い
    }
    return { mode, ...PRESETS[mode] };
  }

  // ── public API ───────────────────────────────────
  return { get };

})();
