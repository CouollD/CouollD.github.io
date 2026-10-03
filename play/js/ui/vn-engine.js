// ═══════════════════════════════════════════════════
// js/ui/vn-engine.js — VNセリフ表示エンジン（DOM操作）
// 依存: js/ui/stage.js（setImages呼び出し）
// ═══════════════════════════════════════════════════

const VNEngine = (() => {

  const TYPEWRITER_SPEED = 38; // ms/文字

  let _els = {};           // DOM要素キャッシュ
  let _stage = null;       // Stage インスタンス

  let _queue       = [];
  let _index       = 0;
  let _resolve     = null;
  let _waitingTap  = false;
  let _active      = false;
  let _typing      = false;
  let _typingTimer = null;
  let _typingText  = '';
  let _tapGuard    = false;
  let _interjectTimer = null;

  /**
   * 初期化。HTML のマウント後に1回呼ぶ。
   * @param {object} elements  { nameEl, textEl, tapEl, friendEl, obsEl }
   * @param {object} stageInst Stage インスタンス
   */
  function init(elements, stageInst) {
    _els   = elements;
    _stage = stageInst;
  }

  /**
   * セリフ配列を順番にタップ送りで表示する。
   * 全セリフ表示完了後に resolve する Promise を返す。
   * @param {Array} dialogues  { type, speaker, text, heroineId? }[]
   * @returns {Promise<void>}
   */
  function showDialogues(dialogues) {
    _clearInterject();
    _queue  = dialogues;
    _index  = 0;
    _active = true;
    return new Promise(resolve => {
      _resolve = resolve;
      _showCurrent();
    });
  }

  /**
   * 1行だけ即時表示（ことだま結果等）。Promise なし。
   */
  function showImmediate(type, speaker, text) {
    _cancelTyping();
    _waitingTap = false;
    _tapEl().classList.remove('show');
    _renderLine(type, speaker, text, null, false, null);
  }

  /**
   * タップ/クリックハンドラ。
   * タイピング中 → スキップ。TAP待ち → 次のセリフへ。
   */
  function tap() {
    if (_tapGuard) return;
    _tapGuard = true;
    setTimeout(() => { _tapGuard = false; }, 150);

    if (_typing) {
      _skipTyping();
      setTimeout(() => {
        _waitingTap = true;
        _tapEl().classList.add('show');
      }, 60);
      return;
    }
    if (!_waitingTap) return;
    _waitingTap = false;
    _tapEl().classList.remove('show');
    _index++;
    _showCurrent();
  }

  /**
   * 進行中のセリフに1行割り込み、少し置いて元のセリフを頭から再表示する。
   * 早とちりペナルティ用。abort と違いキューは破棄しない。
   */
  function interject(type, speaker, text, resumeMs = 1600) {
    _cancelTyping();
    _waitingTap = false;
    _tapEl().classList.remove('show');
    _renderLine(type, speaker, text, null, false, null);
    _clearInterject();
    _interjectTimer = setTimeout(() => {
      _interjectTimer = null;
      if (_active) _showCurrent();
    }, resumeMs);
  }

  function _clearInterject() {
    if (_interjectTimer) { clearTimeout(_interjectTimer); _interjectTimer = null; }
  }

  /** セリフ送り中か（タイミング窓判定に使用） */
  function isActive() { return _active; }

  /** TAP待ち中か */
  function isWaitingTap() { return _waitingTap; }

  /**
   * 進行中の showDialogues を強制終了し Promise を解放する。
   * 早とちり等で showImmediate を呼んだ後に呼ぶことで、
   * await showDialogues(...) のブロックを解除してターンを継続できる。
   * テキスト表示は呼び出し元が管理するので、ここでは state のみリセット。
   */
  function abort() {
    _clearInterject();
    _cancelTyping();
    _queue      = [];
    _index      = 0;
    _waitingTap = false;
    _active     = false;
    _tapEl().classList.remove('show');
    if (_resolve) { _resolve(); _resolve = null; }
  }

  // ── private ──────────────────────────────────────

  function _showCurrent() {
    if (_index >= _queue.length) {
      _active     = false;
      _waitingTap = false;
      _tapEl().classList.remove('show');
      if (_resolve) { _resolve(); _resolve = null; }
      return;
    }
    _cancelTyping();
    const d = _queue[_index];
    _waitingTap = false;
    _active     = true;
    _tapEl().classList.remove('show');

    _renderLine(d.type, d.speaker, d.text, d.heroineId, true, () => {
      _waitingTap = true;
      _tapEl().classList.add('show');
    });
  }

  function _renderLine(type, speaker, text, heroineId, animate, onDone) {
    const nameEl   = _els.nameEl;
    const textEl   = _els.textEl;
    const friendEl = _els.friendEl;

    // テキストクラス
    textEl.className = 'vn-text';
    if (type === 'narr')           textEl.className += ' narr';
    else if (type === 'player')    textEl.className += ' player';
    else if (type === 'result bad') textEl.className += ' result-bad';
    else if (type === 'result neutral') textEl.className += ' result-neutral';
    else if (type === 'result')    textEl.className += ' result-good';

    // テキスト表示
    if (animate) {
      _typewrite(textEl, text, onDone);
    } else {
      _cancelTyping();
      textEl.textContent = text;
      if (onDone) onDone();
    }

    // ネームボックス
    if (speaker && type !== 'narr') {
      nameEl.textContent      = speaker;
      nameEl.style.visibility = 'visible';
    } else {
      nameEl.style.visibility = 'hidden';
    }

    // 友達インジケーター
    if (friendEl) friendEl.className = 'friend-indicator';

    // 立ち絵
    if (_stage) {
      if (type === 'heroine') {
        _stage.setSpeaker(heroineId);
      } else if (type === 'friend') {
        _stage.dimAll();
        if (friendEl && speaker) {
          friendEl.textContent = `💬 ${speaker}`;
          friendEl.className   = 'friend-indicator show';
        }
      } else if (type === 'narr' || type === 'player') {
        _stage.dimAll();
      }
    }
  }

  function _typewrite(el, text, onComplete) {
    _cancelTyping();
    _typingText = text;
    el.textContent = '';
    _typing = true;
    let i = 0;
    _typingTimer = setInterval(() => {
      i++;
      el.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(_typingTimer);
        _typingTimer = null;
        _typing = false;
        if (onComplete) onComplete();
      }
    }, TYPEWRITER_SPEED);
  }

  function _skipTyping() {
    if (!_typing) return;
    _cancelTyping();
    if (_els.textEl) _els.textEl.textContent = _typingText;
    _typing = false;
  }

  function _cancelTyping() {
    if (_typingTimer) { clearInterval(_typingTimer); _typingTimer = null; }
    _typing = false;
  }

  function _tapEl() { return _els.tapEl; }

  // ── public API ───────────────────────────────────
  return { init, showDialogues, showImmediate, interject, tap, isActive, isWaitingTap, abort };

})();
