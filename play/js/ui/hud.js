// ═══════════════════════════════════════════════════
// js/ui/hud.js — HUD（ステータスバー・ゲームオーバー）制御（DOM操作）
// 依存: なし
// ═══════════════════════════════════════════════════

const HUD = (() => {

  let _els = {};

  /**
   * 初期化
   * @param {object} elements
   *   { nightMeterEl, nightClockEl, nightWordEl, airFillEl, airNumEl, targetNameEl,
   *     gameOverEl, goIconEl, goTitleEl, goSubEl,
   *     hSubEls: [el×3],   // カードのネームプレート下段（タイプ・♥）
   *     fChipEls: [el×2] } // 友達状態チップ（b+small入り）
   */
  function init(elements) {
    _els = elements;
  }

  /**
   * 空気ゲージを更新
   * @param {number} value  0-100
   */
  function updateAir(value) {
    const v = Math.round(Math.max(0, Math.min(100, value)));
    if (_els.airFillEl) {
      _els.airFillEl.style.width = v + '%';
      _els.airFillEl.className   = 'air-fill ' + (v >= 60 ? 'air-hi' : v >= 35 ? 'air-md' : 'air-lo');
    }
    if (_els.airNumEl) _els.airNumEl.textContent = v;
  }

  // 夜の残り時間をデジタル時計で見せる。表示するのは世界内の時刻（診断値ではない）。
  // 8ターンぶんの夜を 18:00→お開き22:00 に配置し、時刻が進むほど温度が上がる。
  // 2026-09-21: 20:00〜24:00 は大学生の合コンとしては遅すぎたので2時間前倒し。
  // 「抜け出す」のが22時なら終電も終わっていない＝このあとが続く時間帯になる。
  const NIGHT_START_MIN = 18 * 60;   // 18:00（乾杯）
  const NIGHT_END_MIN   = 22 * 60;   // 22:00（お開き）
  // 残りターン数 → ムード（語・色クラス）
  const NIGHT_BANDS = [
    { minRemaining: 6, cls: 'calm', word: '宵の口' },
    { minRemaining: 4, cls: 'warm', word: 'たけなわ' },
    { minRemaining: 2, cls: 'late', word: 'そろそろ終盤' },
    { minRemaining: 1, cls: 'last', word: 'ラストオーダー' },
  ];

  // 時刻(24h)を時計フェイス絵文字にする。🕐=1時 …🕛=12時 / 🕜=1:30 …🕧=12:30
  function _clockFace(hour24, min) {
    const h12  = ((hour24 + 11) % 12) + 1;              // 1..12
    const base = min >= 30 ? 0x1F55C : 0x1F550;         // 半 or 正時
    return String.fromCodePoint(base + (h12 - 1));
  }

  function _formatTime(totalMin) {
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /**
   * 夜の残り時間を更新（デジタル時計）
   * @param {number} turn      現在のターン番号（1始まり）
   * @param {number} maxTurns  総ターン数
   */
  function updateTurn(turn, maxTurns) {
    const max       = maxTurns || 1;
    const t         = Math.min(Math.max(1, turn), max);
    const remaining = Math.max(1, max - t + 1);
    const band      = NIGHT_BANDS.find(b => remaining >= b.minRemaining) || NIGHT_BANDS[NIGHT_BANDS.length - 1];

    const frac    = (t - 1) / max;                       // 0 .. (max-1)/max
    const nowMin  = NIGHT_START_MIN + Math.round(frac * (NIGHT_END_MIN - NIGHT_START_MIN));
    const hour24  = Math.floor(nowMin / 60);
    const minute  = nowMin % 60;

    if (_els.nightClockEl) {
      _els.nightClockEl.textContent = `${_clockFace(hour24, minute)} ${_formatTime(nowMin)}`;
    }
    if (_els.nightWordEl) {
      _els.nightWordEl.textContent = band.word;
    }
    if (_els.nightMeterEl) {
      _els.nightMeterEl.className = 'night-meter ' + band.cls;
    }
  }

  /**
   * ターゲット名を更新
   * @param {string} name
   */
  function updateTarget(name) {
    if (_els.targetNameEl) _els.targetNameEl.textContent = name;
  }

  /**
   * ゲームオーバーオーバーレイを表示
   * @param {object} ending  { icon, title, sub }
   */
  function showGameOver(ending) {
    if (_els.goIconEl)  _els.goIconEl.textContent  = ending.icon;
    if (_els.goTitleEl) _els.goTitleEl.textContent = ending.title;
    if (_els.goSubEl)   _els.goSubEl.textContent   = ending.sub;
    if (_els.gameOverEl) _els.gameOverEl.classList.add('show');
  }

  /**
   * ヒロイン情報をカードのネームプレート下段に描画
   * @param {Array} items [{ name, typeLabel, typeClass, justRevealed, hearts }]
   *   typeLabel:  '??系' | '清楚?' | '清楚' 等（呼び出し側で整形済み）
   *   typeClass:  'unknown' | 'uncertain' | 'known'
   *   justRevealed: true なら reveal-flash を1回付与
   *   hearts:     'hidden' | 'low' | 'mid' | 'high'
   */
  function updateHeroineInfo(items) {
    const subs = _els.hSubEls;
    if (!subs) return;
    items.forEach((it, i) => {
      const sub = subs[i];
      if (!sub) return;
      let text = it.typeLabel;
      if (it.hearts !== 'hidden') {
        const filled = it.hearts === 'high' ? 3 : it.hearts === 'mid' ? 1 : 0;
        text += ' · ' + '♥'.repeat(filled) + '♡'.repeat(3 - filled);
      }
      sub.textContent = text;
      sub.classList.remove('unknown', 'uncertain', 'known');
      sub.classList.add(it.typeClass);
      sub.classList.toggle('reveal-flash', !!it.justRevealed);
      // S1: 会話から冷えている子は名前バッジがくすむ（質的表現）
      const badge = sub.closest('.h-name');
      if (badge) badge.classList.toggle('eng-low', it.engLevel === 'low');
    });
  }

  /**
   * 友達状態チップ（影絵の上）を描画
   * @param {Array} items [{ name, mode, targetLabel, heartGlyphs }]
   *   mode:        'normal' | 'quiet' | 'twoworld'
   *   targetLabel: 'ゆな' | '???' （twoworld時は相手名）
   *   heartGlyphs: '' | '♥' | '♥♥' | '♥♥♥'（ターン7未満は ''）
   */
  function updateFriendIndicators(items) {
    const chips = _els.fChipEls;
    if (!chips) return;
    items.forEach((it, i) => {
      const chip = chips[i];
      if (!chip) return;
      const b = chip.querySelector('b');
      const s = chip.querySelector('small');
      chip.classList.remove('quiet', 'twoworld');
      if (b) b.textContent = it.name;
      if (!s) return;
      if (it.mode === 'twoworld') {
        chip.classList.add('twoworld');
        s.textContent = `💕 ${it.targetLabel}と2人の世界`;
      } else if (it.mode === 'quiet') {
        chip.classList.add('quiet');
        s.textContent = '☕ 様子見';
      } else {
        s.textContent = `💬→ ${it.targetLabel}${it.heartGlyphs ? ' ' + it.heartGlyphs : ''}`;
      }
    });
  }

  // ── public API ───────────────────────────────────
  return { init, updateAir, updateTurn, updateTarget, showGameOver, updateHeroineInfo, updateFriendIndicators };

})();
