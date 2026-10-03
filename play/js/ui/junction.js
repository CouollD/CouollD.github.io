// ═══════════════════════════════════════════════════
// js/ui/junction.js — 山場(junction)の型カード オーバーレイ（DOM操作）
// 常設の6ことだまパネルは増やさない。山場だけに現れる一時カード（§11）。
// choose(cards) は選ばれた型キー(kata)で解決する Promise を返す。
// ═══════════════════════════════════════════════════

const JunctionUI = (() => {

  // 型は選択肢の主役ではなく「分類ラベル」に退ける（§12）。カードの主役は具体セリフ。
  const KATA_LABEL = { question: '質問', empathy: '共感', selftalk: '自分の話', boke: 'ボケ' };

  let _el = null;

  /** 初期化。#junction-cards コンテナを渡す。 */
  function init(containerEl) {
    _el = containerEl;
  }

  /**
   * 型カードを流し込み、クリックされた型で解決する。
   * @param {Array<{kata:string,text:string}>} cards
   * @returns {Promise<string>} 選ばれた kata
   */
  function choose(cards) {
    return new Promise(resolve => {
      if (!_el || !Array.isArray(cards) || cards.length === 0) {
        resolve(cards && cards[0] ? cards[0].kata : 'question');
        return;
      }
      _el.innerHTML = '';
      _el.classList.remove('resolving');

      cards.forEach((c, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'jn-card';
        btn.style.animationDelay = (i * 90) + 'ms';

        const line = document.createElement('span');
        line.className = 'jn-line';
        line.textContent = c.text;                       // 主役＝具体セリフ
        const tag = document.createElement('span');
        tag.className = 'jn-kata';
        tag.textContent = KATA_LABEL[c.kata] || '';      // 小ラベル＝型
        btn.appendChild(line);
        btn.appendChild(tag);

        btn.addEventListener('click', ev => {
          ev.stopPropagation();               // ステージ/テキストの _onTap へ伝播させない
          if (_el.classList.contains('resolving')) return;
          _el.classList.add('resolving');
          btn.classList.add('picked');
          setTimeout(() => { _hide(); resolve(c.kata); }, 260);
        });
        _el.appendChild(btn);
      });

      // 二重タップ吸収（背面の _onTap を止める）
      _el.onclick = ev => ev.stopPropagation();
      _el.classList.add('show');
    });
  }

  function _hide() {
    if (!_el) return;
    _el.classList.remove('show');
    setTimeout(() => { if (_el) _el.innerHTML = ''; }, 200);
  }

  return { init, choose };

})();
