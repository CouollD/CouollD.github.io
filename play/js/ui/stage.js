// ═══════════════════════════════════════════════════
// js/ui/stage.js — 奥行きカード・視線・観察ヒント制御（DOM操作）
// 依存: なし
//
// カードの位置(pos-left/center/right)=席順、
// 距離(tier-near/mid/far)=自席との席差。遠いほど夜の靄に沈む。
// 視線レイヤー(SVG)は renderGaze() で毎ターン描き直す。
// ═══════════════════════════════════════════════════

const Stage = (() => {

  const POS_CLASSES = ['pos-left', 'pos-center', 'pos-right'];

  // C4: 二人の空気の深度クラス（streak2=lv1 / 3=lv2 / 4+=lv3。数字は画面に出さない）
  const FUTARI_LV_CLASSES = ['futari-lv1', 'futari-lv2', 'futari-lv3'];
  const FUTARI_LV2_STREAK = 3;
  const FUTARI_LV3_STREAK = 4;

  let _heroineChars = [];
  let _cards        = [];   // [{ root, img, nameEl, subEl }]
  let _obsEl        = null;
  let _obsTimer     = null;
  let _stageEl      = null;
  let _svgEl        = null;
  let _selfSeat     = 0;
  let _targetId     = null;
  let _lastGazes    = null;

  // 本気モード: ライバル到達バー要素（狙いの子カード下）
  let _rivalBar     = null;   // { fill, val, warn }
  const RIVAL_DANGER_HEART = 55;   // これを超えると警告演出（>55相当）
  // 到達バーの読みは「質的表現」で出す（core-loop 規律: 生の数値を露出しない）。
  // バーの伸び＝図として読み、状態語で今どのくらい迫っているかを補う。ratio境界は表示専用。
  const RIVAL_STAGE_CLOSE  = 0.50;   // これ以上で「接近」帯
  const RIVAL_STAGE_MID    = 0.28;   // これ以上で「詰め」帯
  function _rivalStageLabel(ratio, stolen) {
    if (stolen)                     return '決着…';
    if (ratio >= RIVAL_STAGE_CLOSE) return '接近中';
    if (ratio >= RIVAL_STAGE_MID)   return '詰めてきた';
    return '様子見';
  }

  /**
   * 初期化
   * @param {Array}  heroineChars 表示するヒロイン配列（順番 = 席順）
   * @param {Array}  cardEls      カード要素の配列 [{root,img,nameEl,subEl}] ×3
   * @param {HTMLElement} obsEl   観察ヒント要素
   * @param {object} opts         { selfSeat, targetId, stageEl, svgEl }
   */
  function init(heroineChars, cardEls, obsEl, opts) {
    _heroineChars = heroineChars;
    _cards        = cardEls;
    _obsEl        = obsEl;
    _selfSeat     = opts?.selfSeat ?? 0;
    _targetId     = opts?.targetId ?? null;
    _stageEl      = opts?.stageEl ?? null;
    _svgEl        = opts?.svgEl ?? null;

    _cards.forEach((c, i) => {
      const h = _heroineChars[i];
      if (!c?.root) return;
      if (!h) { c.root.classList.add('hidden'); return; }

      const dist = Math.min(2, Math.abs(i - _selfSeat));
      const tier = dist === 0 ? 'tier-near' : dist === 1 ? 'tier-mid' : 'tier-far';
      c.root.classList.add(POS_CLASSES[i] || 'pos-left', tier);
      if (h.id === _targetId) c.root.classList.add('h-target');
      if (c.nameEl) c.nameEl.textContent = _shortName(h.name);
      _loadImg(c.img, h);
    });

    _placeFriends();

    window.addEventListener('resize', () => {
      if (_lastGazes) renderGaze(_lastGazes);
    });
  }

  /**
   * 友達の影絵を「実際の席」に置く（2026-09-22）。
   * これまで #f-sil-0 が left:8px、#f-sil-1 が right:8px に固定されていたため、
   * どの席を選んでも自分が卓の真ん中にいるように見えていた。
   * 卓のこちら側は 3席（0=左 / 1=中央 / 2=右）。自分が selfSeat を取り、
   * 残り2席に友達が座る。友達の位置が変わることで、自分がどこに座ったかが見える。
   *   自分が左端 → 友達は2人とも右　／　中央 → 左右に1人ずつ　／　右端 → 2人とも左
   */
  const SEAT_X = ['16%', '50%', '84%'];
  function _placeFriends() {
    const others = [0, 1, 2].filter(seat => seat !== _selfSeat);
    others.forEach((seat, i) => {
      const x = SEAT_X[seat];
      const sil  = document.getElementById('f-sil-' + i);
      const chip = document.getElementById('f-chip-' + i);
      if (sil) {
        sil.style.left = x; sil.style.right = 'auto';
        sil.style.transform = 'translateX(-50%)';
      }
      if (chip) {
        chip.style.left = x; chip.style.right = 'auto';
        // 端に寄った席は画面外にはみ出さないよう寄せ方を変える
        const shift = seat === 0 ? '-18%' : seat === 2 ? '-82%' : '-50%';
        chip.style.transform = `translateX(${shift}) rotate(${seat === 2 ? 1.2 : -1.5}deg)`;
        chip.style.textAlign = seat === 2 ? 'right' : 'left';
      }
    });
    // 自分の席を卓の手前に示す（どこに座っているかを明示）
    if (_stageEl) {
      let me = _stageEl.querySelector('.me-marker');
      if (!me) {
        me = document.createElement('div');
        me.className = 'me-marker';
        me.innerHTML = '<span>あなた</span>';
        _stageEl.appendChild(me);
      }
      me.style.left = SEAT_X[_selfSeat];
    }
  }

  /**
   * speakerIdの人物を靄から浮かび上がらせる（talk-dots点灯）。
   * @param {number|null} speakerId  話しているヒロインのID
   */
  function setSpeaker(speakerId) {
    _eachCard((c, h) => {
      c.root.classList.remove('hidden');
      _loadImg(c.img, h);
      c.root.classList.toggle('talking', speakerId !== null && h.id === speakerId);
    });
  }

  /**
   * 全員を距離なりの靄に戻す（友達発言・ナレーション時）
   */
  function dimAll() {
    setSpeaker(null);
  }

  /**
   * 1人だけ表示（自己紹介モード）
   * @param {number} heroineId
   */
  function showOnly(heroineId) {
    _eachCard((c, h) => {
      _loadImg(c.img, h);
      c.root.classList.toggle('hidden', h.id !== heroineId);
      c.root.classList.toggle('talking', h.id === heroineId);
    });
  }

  /**
   * 視線レイヤーを描き直す。
   * @param {Array} gazes
   *   { kind:'self',  heroineId }            自分→狙い（ピンク点線）
   *   { kind:'rival', heroineId, fromEl }    友達→狙い（シアン矢印、fromEl=影絵の頭）
   */
  // 視線の矢印は廃止（2026-09-24）。
  // 「けんた 💬→ ゆな」というチップが同じことを文字で言っていて、
  // 矢印は卓を横切って画面の真ん中を占めるだけだった。情報は増えていない。
  // 戻したくなったら GAZE_ON を true にすれば元通り動く。
  const GAZE_ON = false;

  function renderGaze(gazes) {
    if (!GAZE_ON) { _lastGazes = gazes; if (_svgEl) _svgEl.innerHTML = _svgEl.querySelector('defs')?.outerHTML || ''; return; }
    _lastGazes = gazes;
    if (!_svgEl || !_stageEl) return;

    requestAnimationFrame(() => {
      const sr = _stageEl.getBoundingClientRect();
      if (sr.width < 10 || sr.height < 10) return;
      const w = Math.round(sr.width), h = Math.round(sr.height);
      _svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
      _svgEl.querySelectorAll('path.gz').forEach(p => p.remove());

      (gazes || []).forEach(g => {
        const to = _cardAnchor(g.heroineId, sr);
        if (!to) return;

        let from;
        if (g.kind === 'self') {
          // 自分=下端、自席の列から（影絵と重ならないよう内寄せ）
          const cols = [w * 0.32, w * 0.5, w * 0.68];
          from = { x: w * [0.16, 0.50, 0.84][Math.min(2, Math.max(0, _selfSeat))], y: h - 4 };
        } else {
          const fr = g.fromEl?.getBoundingClientRect();
          if (!fr) return;
          from = { x: fr.left - sr.left + fr.width / 2, y: fr.top - sr.top + 8 };
        }

        // 弧: 中間点を横にずらして「視線が卓を渡る」曲がりを作る
        const mx = (from.x + to.x) / 2 + (to.x > from.x ? -24 : 24);
        const my = (from.y + to.y) / 2;
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', `M${from.x},${from.y} Q${mx},${my} ${to.x},${to.y}`);
        p.setAttribute('class', 'gz gz-' + g.kind);
        if (g.kind === 'rival') p.setAttribute('marker-end', 'url(#gz-arrow)');
        _svgEl.appendChild(p);
      });
    });
  }

  /**
   * 本気モード: 狙いの子カード下にライバル到達バーを作る（1回だけ）。
   * @param {number} targetHeroineId  狙いの子（バーを付けるカード）
   * @param {string} rivalName        ライバルの表示名
   */
  function initRivalBar(targetHeroineId, rivalName) {
    const i = _heroineChars.findIndex(x => x.id === targetHeroineId);
    const card = _cards[i]?.root;
    if (!card || _rivalBar) return;

    const bar = document.createElement('div');
    bar.className = 'rival-bar';
    bar.innerHTML =
      `<div class="rival-bar-top">` +
        `<span class="rival-bar-label">🏁 ライバル: ${rivalName}</span>` +
        `<span class="rival-bar-val">様子見</span>` +
      `</div>` +
      `<div class="rival-track"><div class="rival-fill"></div></div>` +
      `<div class="rival-warn">危ない…!</div>`;
    card.appendChild(bar);

    _rivalBar = {
      root: bar,
      fill: bar.querySelector('.rival-fill'),
      val:  bar.querySelector('.rival-bar-val'),
      warn: bar.querySelector('.rival-warn'),
    };
  }

  /**
   * 本気モード: ライバル到達バーを更新する。
   * @param {number}  heart      ライバルの狙いの子への♥
   * @param {number}  threshold  二人の世界到達閾値
   * @param {boolean} stolen     既に奪われたか
   */
  function updateRivalRace(heart, threshold, stolen) {
    if (!_rivalBar) return;
    const t     = threshold || 1;
    const ratio = Math.max(0, Math.min(1, heart / t));
    _rivalBar.fill.style.width = Math.round(ratio * 100) + '%';
    // 生数値は出さない。バーの伸び（図）＋状態語（質的表現）で読ませる。
    _rivalBar.val.textContent  = _rivalStageLabel(ratio, stolen);

    const danger = !stolen && heart > RIVAL_DANGER_HEART;
    _rivalBar.root.classList.toggle('danger', danger);
    _rivalBar.root.classList.toggle('taken', !!stolen);
    if (stolen) _rivalBar.warn.textContent = '連れて行かれた…';
  }

  /**
   * 本気モード: 狙いの子が奪われた退場演出（立ち絵が靄に沈む）。
   * @param {number} heroineId
   */
  function markStolen(heroineId) {
    const i = _heroineChars.findIndex(x => x.id === heroineId);
    const card = _cards[i]?.root;
    if (card) card.classList.add('h-stolen');
  }

  /**
   * C4: 二人の空気の演出（チェインの質的可視化。数字は絶対に出さない）。
   * lane==='futari' のとき:
   *   - partner のカード: .futari-partner + 深度クラス（提灯ピンクの暖グロー）
   *   - それ以外のカード: .futari-dim（夜の靄に沈む。名前は読める範囲）
   *   - ステージ全体:     .futari-mode（ごく薄いビネット）
   * それ以外（lane が ba/null）のとき全て除去する。冪等＝毎ターン呼んでよい。
   * 既存クラス（pos-*, tier-*, h-target, talking, h-stolen）には触らない（共存）。
   * @param {object|null} chain  STATE.chain（{ lane, partnerId, streak, ... }）
   */
  function renderChain(chain) {
    const isFutari = !!(chain && chain.lane === 'futari' && chain.partnerId != null);
    if (_stageEl) _stageEl.classList.toggle('futari-mode', isFutari);

    _eachCard((c, h) => {
      const isPartner = isFutari && h.id === chain.partnerId;
      const depth     = isPartner ? _futariDepthClass(chain.streak) : null;
      c.root.classList.toggle('futari-partner', isPartner);
      FUTARI_LV_CLASSES.forEach(lv => c.root.classList.toggle(lv, lv === depth));
      c.root.classList.toggle('futari-dim', isFutari && !isPartner);
    });
  }

  // 連鎖の深さ → 深度クラス（成立時 streak は必ず 2 以上 = lv1 から始まる）
  function _futariDepthClass(streak) {
    if (streak >= FUTARI_LV3_STREAK) return 'futari-lv3';
    if (streak >= FUTARI_LV2_STREAK) return 'futari-lv2';
    return 'futari-lv1';
  }

  /**
   * 観察ヒントを表示してフェード
   * @param {string} text
   */
  function showObsHint(text) {
    if (!_obsEl || !text) return;
    if (_obsTimer) { clearTimeout(_obsTimer); _obsTimer = null; }
    _obsEl.textContent = text;
    _obsEl.classList.add('flash');
    _obsTimer = setTimeout(() => {
      _obsEl.classList.remove('flash');
      _obsTimer = null;
    }, 3000);
  }

  // ── 出した札が宛先へ飛ぶ（css/fx-fly.css と対）───
  // これまで札は上へ42pxずれて消えるだけで、誰に出した一手なのかが盤面に残らなかった。
  // 宛先の席まで飛ばして、狙いを動きそのもので見せる。
  const FLY_MS      = 380;   // 飛んでいる時間（CSS の fxFlyHit / fxFlyMiss と揃える）
  const FLY_DROP_MS = 420;   // 宛先の無い札が卓に落ちて消えるまで（CSS の fxFlyDrop）
  const RECV_MS     = 120;   // 受け取った側がふくらんで戻るまで（CSS の fxRecv）

  /**
   * 出した札を宛先のヒロインへ飛ばす。宛先が無ければ卓の真ん中へ落とす。
   * 飛ぶのは body 直下に置いた position:fixed のクローン。手札の中で動かすと
   * 親の overflow に切られて、卓の向こう側の席まで届かない。
   * @param {DOMRect|object} fromRect     出した瞬間の札の矩形（ビューポート座標）
   * @param {number|null}    toHeroineId  宛先のヒロインid。null＝宛先なし（卓の真ん中へ）
   * @param {object}         opts         { el: 見た目のもとにする札要素, origin: 場に残っている本体 }
   */
  function flyCard(fromRect, toHeroineId, opts) {
    if (!fromRect || !(fromRect.width > 4) || !(fromRect.height > 4)) return;

    const dest = _flyDest(toHeroineId);
    if (!dest) return;

    // 元の札は .played に任せず即座に引っ込める（飛んでいるクローンと二重に見える）
    if (opts && opts.origin) opts.origin.classList.add('fx-flown');

    const ghost = _flyGhost(opts && opts.el, fromRect);
    ghost.style.setProperty('--fly-dx', (dest.x - (fromRect.left + fromRect.width  / 2)) + 'px');
    ghost.style.setProperty('--fly-dy', (dest.y - (fromRect.top  + fromRect.height / 2)) + 'px');
    ghost.classList.add(dest.card ? 'fx-fly-hit' : 'fx-fly-miss');
    document.body.appendChild(ghost);

    const life = dest.card ? FLY_MS : FLY_MS + FLY_DROP_MS;
    setTimeout(() => ghost.remove(), life + 80);
    if (dest.card) setTimeout(() => _flyReceive(dest.card), FLY_MS);
  }

  // ── private ──────────────────────────────────────
  // 宛先の座標（ビューポート）。席が見当たらない札は卓の真ん中に落とす
  function _flyDest(heroineId) {
    if (heroineId != null) {
      const i    = _heroineChars.findIndex(x => x.id === heroineId);
      const card = _cards[i]?.root;
      const r    = card && !card.classList.contains('hidden') ? card.getBoundingClientRect() : null;
      if (r && r.width > 4) {
        return { card, x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    const band = _stageEl?.querySelector('.table-band') || _stageEl;
    const br   = band?.getBoundingClientRect();
    if (!br || br.width < 4) return null;
    return { card: null, x: br.left + br.width / 2, y: br.top + br.height / 2 };
  }

  // 飛ばす分身。位置と大きさはインラインで固定する——手札用のCSS（.sel の
  // 中央寄せ・扇の負マージン・下から120%の回転原点）がそのまま効くと、
  // 出した場所からではなく画面の妙な所から飛び出す
  function _flyGhost(srcEl, rect) {
    let g;
    if (srcEl) {
      g = srcEl.cloneNode(true);
      g.classList.remove('played', 'dealt', 'fx-flown');
      g.removeAttribute('id');
      g.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    } else {
      g = document.createElement('div');
      g.className = 'fan-card';
    }
    g.classList.add('fx-fly');
    g.setAttribute('aria-hidden', 'true');
    g.setAttribute('tabindex', '-1');

    const st = g.style;
    st.position  = 'fixed';
    st.left      = rect.left   + 'px';
    st.top       = rect.top    + 'px';
    st.width     = rect.width  + 'px';
    st.height    = rect.height + 'px';
    st.right     = 'auto';
    st.bottom    = 'auto';
    st.margin    = '0';
    st.transition      = 'none';
    st.transformOrigin = '50% 50%';
    return g;
  }

  // 受け取った合図。同じ席へ続けて出したとき取り直せるよう、一度外してから付ける
  function _flyReceive(card) {
    if (!card) return;
    card.classList.remove('fx-recv');
    void card.offsetWidth;
    card.classList.add('fx-recv');
    setTimeout(() => card.classList.remove('fx-recv'), RECV_MS + 60);
  }

  function _eachCard(fn) {
    _heroineChars.forEach((h, i) => {
      const c = _cards[i];
      if (!c?.root || !h) return;
      fn(c, h);
    });
  }

  // 視線の終点=カードの立ち絵下寄り(顔を横切らない)
  function _cardAnchor(heroineId, stageRect) {
    const i = _heroineChars.findIndex(x => x.id === heroineId);
    const c = _cards[i];
    if (!c?.img) return null;
    const r = c.img.getBoundingClientRect();
    return {
      x: r.left - stageRect.left + r.width / 2,
      y: r.top - stageRect.top + r.height * 0.78,
    };
  }

  function _loadImg(img, heroine) {
    if (!img) return;
    const expr = _expr(heroine.id);
    const src  = `../images/h${heroine.id}_${expr}.png`;
    if (img.dataset.src === src) return; // 既にロード済み
    img.dataset.src = src;

    const fallbackSrc = `../images/h${heroine.id}_normal.png`;
    img.onload = () => {
      img.closest('.h-portrait')?.classList.remove('img-fallback');
    };
    img.onerror = () => {
      if (img.dataset.fallbackTried !== '1' && src !== fallbackSrc) {
        // 表情差分の読み込み失敗 → normal にフォールバック
        img.dataset.fallbackTried = '1';
        img.src = fallbackSrc;
        return;
      }
      // normal も失敗 → シルエット表示（onerror無限ループ防止のため src は触らない）
      img.onerror = null;
      img.closest('.h-portrait')?.classList.add('img-fallback');
    };
    img.dataset.fallbackTried = '0';
    img.src = src;
  }

  // 現在の好感度から表情を返す
  let _hearts = {};

  /**
   * 【意図】席の上に「いま何を待っているか」を1つだけ出す（2026-09-22）。
   * 手札ではなく、ここが読むところ。1ターン固定で、札の効き方に直結している
   * （heroine-ai.js INTENT_MULT / kotodama.js calcEffect）。
   * @param {object} map          { heroineId: 'kiki'|'akita'|'yoso'|'matte' }
   * @param {Array}  heroineChars 省略時は init 時の配列
   */
  function renderIntents(map, heroineChars) {
    const list = heroineChars || _heroineChars;
    _cards.forEach((c, i) => {
      const h = list[i];
      if (!c || !c.root || !h) return;
      let tag = c.root.querySelector('.intent-tag');
      const id   = (map || {})[h.id];
      const face = (typeof HeroineAI !== 'undefined' && HeroineAI.intentFace)
        ? HeroineAI.intentFace(id) : null;
      if (!face) { if (tag) tag.remove(); return; }
      if (!tag) {
        tag = document.createElement('div');
        tag.className = 'intent-tag';
        c.root.appendChild(tag);
      }
      const changed = tag.dataset.intent !== id;
      tag.dataset.intent = id;
      tag.className = 'intent-tag tone-' + face.tone + (changed ? ' just-changed' : '');
      tag.innerHTML = '<span class="it-mark">' + face.mark + '</span>'
                    + '<span class="it-label">' + face.label + '</span>';
    });
  }

  /** 狙いを変えたときにピンク枠を移す（2026-09-24） */
  function setTarget(heroineId) {
    _targetId = heroineId;
    _cards.forEach((c, i) => {
      const h = _heroineChars[i];
      if (c && c.root) c.root.classList.toggle('h-target', !!h && h.id === heroineId);
    });
  }

  function updateHearts(hearts) { _hearts = hearts || {}; }
  function _expr(heroineId) {
    const h = _hearts[heroineId] || 0;
    if (h >= 60) return 'shy';
    if (h >= 38) return 'happy';
    return 'normal';
  }

  function _shortName(name) {
    if (!name) return '—';
    const p = name.split(/[\s　]+/);
    return p[p.length - 1] || name;
  }

  // ── public API ───────────────────────────────────
  return { init, setSpeaker, dimAll, showOnly, showObsHint, updateHearts, renderGaze,
           renderChain, initRivalBar, updateRivalRace, markStolen, renderIntents,
           flyCard, setTarget };

})();
