// ═══════════════════════════════════════════════════
// js/ui/friend-panel.js — 「友達に向く」入口ストリップ＋オーバーレイ（DOM操作）
// 依存: なし（ゲームデータは goukon-game.js から callbacks 経由で受け取る）
//
// 入口: ことだまパネル下の「↩ ◯◯に向く」ボタン。
//       活性制御はことだまと同じ（setEnabled）。
// オーバーレイ: 今の衝動＋耳打ち＋なだめる/煽る/向き直す。
//       開いただけでは手番消費なし。手番処理は onAction 側（goukon-game.js）。
// 特性テキストは docs/conversation-redesign-spec.md B-2 の確定稿。変更禁止。
// ═══════════════════════════════════════════════════

const FriendPanel = (() => {

  // 特性→今の衝動（targetName = 友達の現在ターゲットの名前）
  const IMPULSE_TEXTS = [
    { key:'暴走しやすい', text: n => `${n}に直球アプローチ中。任せると場が荒れるかも。` },
    { key:'惚れっぽい',   text: n => `${n}に夢中。でもすぐ目移りしそうだ。` },
    { key:'静観しやすい', text: () => '静かに飲んでいる。自分からは動かなそう。' },
    { key:'学歴厨',       text: () => '知的な話で距離を詰めたがっている。空回りの気配も。' },
    { key:'譲れる',       text: () => '場を見ている。こっちの狙いを察している気がする。' },
  ];
  const IMPULSE_DEFAULT = n => `${n}と楽しそうに話している。`;

  // 特性→耳打ちセリフ（友達の一言）
  const WHISPER_TEXTS = [
    { key:'暴走しやすい', text: () => '「なあ、俺いけてるよな? もっと行っていいよな?」' },
    { key:'惚れっぽい',   text: n => `「やばい、${n}ちゃんまじでかわいくね?」` },
    { key:'静観しやすい', text: () => '「ん? どうした。俺は見てるだけでいいんだよ」' },
    { key:'学歴厨',       text: n => `「${n}さん、話通じるわ〜。俺の話ウケてるよな?」` },
    { key:'譲れる',       text: () => '「おまえこそどうなんだよ。進んでんの?」' },
  ];
  const WHISPER_DEFAULT = () => '「おう、どうした?」';

  let _stripEl      = null;
  let _overlayEl    = null;
  let _cb           = {};      // { onAction(friendId, 'nadameru'|'aoru'), getInfo(friendId) }
  let _enabled      = false;
  let _openFriendId = null;

  /**
   * 初期化
   * @param {HTMLElement} stripEl   #friend-strip（ことだまパネル下）
   * @param {HTMLElement} overlayEl #friend-overlay（画面全体を覆う）
   * @param {object} callbacks
   *   onAction(friendId, action)  なだめる/煽る 確定時（手番消費はゲーム側）
   *   getInfo(friendId)           → { name, traits, targetName }
   */
  function init(stripEl, overlayEl, callbacks) {
    _stripEl   = stripEl;
    _overlayEl = overlayEl;
    _cb        = callbacks || {};
  }

  /**
   * 入口ストリップを描き直す（2人の世界で離脱済みの友達は渡さないこと）。
   * @param {Array<{id:number, name:string}>} friends
   */
  function renderStrip(friends) {
    if (!_stripEl) return;
    _stripEl.innerHTML = '';
    (friends || []).forEach(f => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'friend-turn-btn' + (_enabled ? '' : ' disabled');
      btn.textContent = `↩ ${f.name}に向く`;
      btn.addEventListener('click', () => {
        if (!_enabled) return;
        openOverlay(f.id);
      });
      _stripEl.appendChild(btn);
    });
  }

  /**
   * 入口ボタンの活性制御（ことだまパネルの enable/disable と同時に呼ぶ）。
   * @param {boolean} on
   */
  function setEnabled(on) {
    _enabled = !!on;
    if (!_stripEl) return;
    _stripEl.querySelectorAll('.friend-turn-btn').forEach(b => {
      b.classList.toggle('disabled', !_enabled);
    });
  }

  /**
   * オーバーレイを開く（開いただけでは手番消費なし）。
   * @param {number} friendId
   */
  function openOverlay(friendId) {
    if (!_overlayEl || !_cb.getInfo) return;
    const info = _cb.getInfo(friendId);
    if (!info) return;

    _openFriendId = friendId;
    _overlayEl.innerHTML = '';

    const card = _el('div', 'friend-ov-card');

    // 1. 名前＋特性チップ
    const head = _el('div', 'friend-ov-head');
    head.appendChild(_el('b', '', info.name));
    (info.traits || []).forEach(t => head.appendChild(_el('span', 'friend-ov-trait', t)));
    card.appendChild(head);

    // 2. 今の衝動
    card.appendChild(_el('div', 'friend-ov-impulse',
      _traitText(IMPULSE_TEXTS, IMPULSE_DEFAULT, info.traits, info.targetName)));

    // 3. 耳打ちセリフ
    card.appendChild(_el('div', 'friend-ov-whisper',
      _traitText(WHISPER_TEXTS, WHISPER_DEFAULT, info.traits, info.targetName)));

    // 4. アクション3つ
    const actions = _el('div', 'friend-ov-actions');
    actions.appendChild(_actionBtn('なだめる', '勢いを落とす', '', () => _fireAction('nadameru')));
    actions.appendChild(_actionBtn('煽る', 'さらに行かせる', '', () => _fireAction('aoru')));
    actions.appendChild(_actionBtn('ヒロインに向き直す ↵', 'やめて場に戻る', 'back', () => closeOverlay()));
    card.appendChild(actions);

    _overlayEl.appendChild(card);
    _overlayEl.classList.add('show');
  }

  /**
   * オーバーレイを閉じる（キャンセル=向き直す。手番も♡も減らない）。
   */
  function closeOverlay() {
    _openFriendId = null;
    if (!_overlayEl) return;
    _overlayEl.classList.remove('show');
    _overlayEl.innerHTML = '';
  }

  // ── private ──────────────────────────────────────

  function _fireAction(action) {
    const fid = _openFriendId;
    closeOverlay();
    if (fid !== null && _cb.onAction) _cb.onAction(fid, action);
  }

  function _traitText(defs, fallback, traits, targetName) {
    const hit = defs.find(d => (traits || []).some(t => t.includes(d.key)));
    return hit ? hit.text(targetName) : fallback(targetName);
  }

  function _actionBtn(label, sub, extraClass, onClick) {
    const btn = _el('button', 'friend-ov-btn' + (extraClass ? ' ' + extraClass : ''));
    btn.type = 'button';
    btn.appendChild(_el('span', '', label));
    btn.appendChild(_el('small', '', sub));
    btn.addEventListener('click', onClick);
    return btn;
  }

  function _el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ── public API ───────────────────────────────────
  return { init, renderStrip, setEnabled, openOverlay, closeOverlay };

})();
