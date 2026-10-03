// ═══════════════════════════════════════════════════
// js/ui/kotodama-panel.js — 手札パネル制御（DOM操作）
// 依存: DeckCore.face() が返す「札の顔」を受け取って描くだけ。計算はしない。
//
// 企画書 §17（2026-09-20 決定: A＝手札制）の第2段。
//   常時3枚の手札が見えている＝「出せるリアクションが、そのまま見えている」。
//   札の主役はセリフ。札名・型・繋ぎは小さく添える（§16: 生の数値は出さない）。
//   静観／話を振る／連絡先 は山札に入らない常時手として下段に置く。
//
// 旧7ボタン版は js/ui/kotodama-panel.js.bak7btn と
// archive/goukon_day_7button_2026-09-20/ に保存してある。
// ═══════════════════════════════════════════════════

const KotodamaPanel = (() => {

  // 山札に入らない常時手（IDはそのまま onFire に渡る）
  const SPECIALS = ['kanshi', 'furu', 'renraku', 'aim', 'pass'];
  const LINK_CAP = 3;   // DeckCore.CHAIN_LINK_CAP と揃える（表示だけに使う）

  let _dealAll  = false;   // 次の描画で全札に配りアニメを出す（手番開始の合図）
  let _panelEl   = null;
  let _timingBar = null;
  let _handEl    = null;
  let _chainEl   = null;
  let _onFire    = null;   // (id) => void   id = 札のid または 'kanshi'|'furu'|'renraku'
  let _timingTimer = null;
  let _statusEl  = null;
  let _specialEls = {};
  let _locked    = true;   // 手札が押せない状態（セリフ送り中・発動後）
  let _deckEl    = null;   // 山札の厚み
  let _lastIds   = [];     // 直前の手札。差分＝今引いた札 → 配る演出を付ける
  let _selected  = null;   // 扇から持ち上げている札のid（1回目のタップで選ぶ）
  let _lastFaces = null, _lastCtx = null;

  // 「この流れ」の点を順に灯すための状態（_renderChain 専用）
  const PIP_STEP_MS = 90;    // 点が灯る間隔
  const PIP_POP_MS  = 120;   // 灯った瞬間のポップ。css/fx-chain.css の cmPop と揃える
  let _lastLink    = 0;      // 直前に灯っていた点の数。増えたぶんだけを灯すために覚えておく
  let _chainTimers = [];     // 走っている点灯タイマー。描き直すたびに必ず捨てる

  const SPEECH_STATES = {
    talking: { cls: 'talking', text: '…話し中' },
    ready:   { cls: 'ready',   text: '💬 今なら出せる' },
    idle:    { cls: '',        text: '' },
  };

  /**
   * 初期化
   * @param {HTMLElement} panelEl   .kotodama-panel
   * @param {HTMLElement} timingBar .timing-bar
   * @param {Function}    onFire    (id) => void
   */
  function init(panelEl, timingBar, onFire) {
    _panelEl   = panelEl;
    _timingBar = timingBar;
    _onFire    = onFire;
    _statusEl  = panelEl.querySelector('#kdm-status');
    _handEl    = panelEl.querySelector('#hand');
    _chainEl   = panelEl.querySelector('#chain-meter');
    _deckEl    = panelEl.querySelector('#deck-stack');

    // 手札はイベント委譲（中身は毎ターン差し替わるため）
    if (_handEl) _handEl.addEventListener('click', (e) => {
      const card = e.target.closest('.fan-card');
      if (!card) { _selected = null; _rerender(); return; }
      if (_locked) return;
      const id = card.dataset.id;
      if (_selected !== id) { _selected = id; _rerender(); return; }   // 1回目: 選ぶ
      if (card.classList.contains('locked')) return;                   // まだ切れない札
      _selected = null;
      _fire(id);                                                       // 2回目: 出す
    });

    SPECIALS.forEach(id => {
      const el = panelEl.querySelector(`#kdm-${id}`);
      _specialEls[id] = el;
      if (!el) return;
      el.addEventListener('click', () => {
        if (el.classList.contains('disabled') || el.classList.contains('unavail')) return;
        // 静観と狙い変更は常時押せる。狙いは手番を消費しない自由行動なので、
        // セリフが流れている間に決めておける方が自然
        if (id !== 'kanshi' && id !== 'aim' && id !== 'pass' && _locked) return;
        _fire(id);
      });
    });
  }

  /**
   * 手札を描く（扇・案B）。
   *   伏せている札は「札名と役割の色」だけ。1枚選ぶと持ち上がってセリフが読める。
   *   もう一度押すと出す。＝選ぶ / 出す が分かれるので、誤爆しない。
   * @param {Array}  faces  DeckCore.face() の配列（5枚想定）
   * @param {object} ctx    { accumLink, streak, left }
   */
  function setHand(faces, ctx) {
    if (!_handEl) return;
    _lastFaces = faces; _lastCtx = ctx;
    const link = Math.max(0, Math.min(LINK_CAP, (ctx && ctx.accumLink) || 0));
    const list = (faces || []).filter(Boolean);
    const ids  = list.map(f => f.id);

    // 前の選択が手札から消えていたら解除
    if (_selected && ids.indexOf(_selected) < 0) _selected = null;

    const n = list.length;
    // 2026-09-23: 前回の手札と1枚も共通しない＝山から配り直し（＝ターン頭の初回配り）。
    // 1枚ずつ引いた時だけ演出していたので、手札が並ぶ瞬間に「配られた」感が無かった。
    // 選択・解除の再描画は _rerender が先に _lastIds を今の手札にするため必ず共通あり＝誤発火しない。
    // _dealAll = 手番が始まった合図。手札の中身が同じでも配り直して見せる
    const fresh   = n > 0 && (_dealAll || !ids.some(id => _lastIds.indexOf(id) >= 0));
    _dealAll = false;
    let   dealSeq = 0;   // 配る札の通し番号（左から）。ずらし幅の元
    const html = list.map((f, i) => {
      const sel   = f.id === _selected;
      const isNew = fresh || (_lastIds.length > 0 && _lastIds.indexOf(f.id) < 0);
      // 扇の角度と横位置（中心からの並び）
      const mid   = (n - 1) / 2;
      const off   = i - mid;
      // 2026-09-23: 7度→3.5度。回転は横幅を食う（原点が札の下にあるので
      // 端の札が外へ振り出される）。札を大きくするぶん、振り角を浅くして
      // 5枚が390pxに収まるようにする
      // 2026-09-23: ところが等間隔すぎて機械が並べたように見えるので、
      // 手で持ったゆらぎを足す（Balatro 参考: ±3度ほどの乱れで有機的に見える）。
      // 持ち上げた札（sel）は正面を向いていてほしいので掛けない。
      const edge  = mid > 0 && Math.abs(off) === mid;   // 5枚なら |off| === 2
      let jRot = 0, jLift = 0;
      if (!sel) {
        jRot  = _jitter(f.id, 'rot')  * 5 - 2.5;   // ±2.5度
        jLift = _jitter(f.id, 'lift') * 6 - 3;     // ±3px
        // 端の札だけは外向きに振らない。回転の原点が札の下にあるせいで
        // 1度振るごとに上角が約3px外へ逃げるが、3.5度刻みの現状で左右の
        // 余白はほぼゼロ（beat-play の88px札で実測）。沈みも同じで、
        // 下の「静観」行まで 3px しかない。内向き・浮く側にしか振らせない。
        if (edge) { jRot = Math.abs(jRot) * -Math.sign(off); jLift = -Math.abs(jLift); }
      }
      // 小数は2桁で切る（style 文字列が 6.952392578125deg のようになるのを避けるだけ）
      const rot   = Math.round((off * 3.5 + jRot) * 100) / 100;
      const lift  = Math.round((Math.abs(off) * 4 + jLift) * 100) / 100;   // 端の札の沈み。大きくすると下の行に被る
      const cls   = [
        'fan-card',
        'role-' + _roleOf(f),
        sel ? 'sel' : '',
        isNew ? 'dealt' : '',
        f.fits ? 'fits' : '',
        f.locked ? 'locked' : '',
        f.topic ? 'topic' : '',
      ].filter(Boolean).join(' ');
      // 持ち上げた札は「指のあった場所」に出す（2026-09-23）。
      // 中央固定にしていたため、端の札を選ぶと札が画面中央へ飛び、
      // 同じ場所をもう一度押しても札が無い＝「出せない」になっていた。
      // 画面からはみ出さないよう 27〜73% に丸める。
      const selLeft = Math.max(27, Math.min(73, 50 + off * 17));
      // 配りは同時ではなく1枚ずつずらす（2026-09-23）。同時に出ると札が増えた事しか
      // 分からず「配られた」が知覚できない。60ms は、ずれを目が拾える下限のあたり。
      const dealMs = isNew ? (dealSeq++) * 60 : 0;
      const style  = (sel
        ? `left:${selLeft}%;`
        : `transform: rotate(${rot}deg) translateY(${lift}px); z-index:${10 + (n - Math.abs(off))};`)
        + (dealMs ? ` animation-delay:${dealMs}ms;` : '');
      return `<button class="${cls}" data-id="${f.id}" style="${style}" aria-label="${_esc(f.label)}">
          ${sel ? _bigFace(f) : _smallFace(f)}
        </button>`;
    }).join('');

    _handEl.innerHTML =
      `<div class="fan">${html}</div>` +
      (_selected ? `<div class="fan-hint">もう一度おして出す</div>` : '');

    _lastIds = ids;
    _handEl.classList.toggle('chained', link > 0);
    _handEl.classList.toggle('locked', _locked);
    _handEl.classList.toggle('has-sel', !!_selected);
    _renderChain(link);
    if (ctx && ctx.left != null) _renderDeck(ctx.left);
  }

  /**
   * 札IDから 0〜1 の値を返す（FNV-1a 32bit）。
   * 扇のゆらぎに Math.random() を使うと、札を選ぶ／解除するたびに setHand が
   * 丸ごと走るので、その都度手札全体が別の角度へ飛んで扇が震える。
   * 同じ札は常に同じ傾き──でないと「手で持っている」には見えないので、
   * 乱数ではなく ID から引く。
   * @param {string} id   札のid
   * @param {string} salt 用途ごとに別の値がほしいときの種（'rot' / 'lift'）
   */
  function _jitter(id, salt) {
    const s = String(id) + '|' + salt;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 65536) / 65536;
  }

  /** 札の役割（色を1つに決める）: 連絡先 > ネタ > 使い切る > つなぐ */
  function _roleOf(f) {
    if (f.type === 'renraku') return 'renraku';
    if (f.topic)              return 'neta';
    if (f.link === 0)         return 'burn';
    return 'link';
  }

  const ROLE_JA = { renraku:'連絡先', neta:'ネタ', burn:'使い切る', link:'つなぐ' };

  /**
   * 【意図】席の上の予告と同じ印を札にも出す（2026-09-23）。
   * 頭上に▲が出たら手札の▲を探す、で読み→選ぶが1秒になる。
   * 予告と札が違う言葉で喋っていると、プレイヤーが頭の中で翻訳しないと繋がらない。
   * いま合っている札は印が光る（.mk-now）。
   */
  function _markOf(f) {
    const type = f.topic ? 'neta' : f.type;
    if (typeof HeroineAI === 'undefined' || !HeroineAI.answersOf) return null;
    const id = HeroineAI.answersOf(type);
    if (!id) return null;
    const face = HeroineAI.intentFace(id);
    return face ? { id, mark: face.mark, tone: face.tone } : null;
  }

  // 場に向く札は卓の多数派を、名指しの札は狙いの子の予告を見る（kotodama.js と同じ切り分け）
  const ROOM_TYPES = ['nori', 'change', 'nomiyo'];
  function _markHtml(f, ctx, big) {
    const m = _markOf(f);
    if (!m) return '';
    const want = ROOM_TYPES.includes(f.type) ? (ctx && ctx.roomIntent) : (ctx && ctx.targetIntent);
    const now  = want && want === m.id;
    return `<span class="fc-mk tone-${m.tone}${now ? ' mk-now' : ''}"${big ? ' data-big="1"' : ''}>${m.mark}</span>`;
  }

  /** 伏せている札: 役割の帯と札名だけ。何が出せるかは分かる */
  function _smallFace(f) {
    const dots = f.link > 0 ? `<span class="fc-dots">${'●'.repeat(f.link)}</span>` : '';
    return `<span class="fc-band">${_markHtml(f, _lastCtx)}${ROLE_JA[_roleOf(f)]}${dots}</span>
      <span class="fc-name">${_esc(f.label)}</span>
      ${f.isTop ? '<span class="fc-top">特</span>' : ''}
      ${f.fits ? '<span class="fc-fit"></span>' : ''}
      ${f.locked ? `<span class="fc-lock">${_esc(f.lockNote || 'まだ')}</span>` : ''}`;
  }

  /** 選ばれて持ち上がった札: セリフが読める */
  function _bigFace(f) {
    const role = _roleOf(f);
    const dots = f.link > 0 ? ` ${'●'.repeat(f.link)}` : '';
    const sub  = f.topic ? f.widthJa : (f.typeJa || '');
    return `<span class="fb-band">
        <span>${_markHtml(f, _lastCtx, true)}${ROLE_JA[role]}${dots}</span>
        ${f.fits ? '<span class="fb-fit">いまの話</span>' : (f.isTop ? '<span class="fb-fit">特</span>' : '')}
      </span>
      <span class="fb-line">${_esc(f.line)}</span>
      <span class="fb-foot">
        <span class="fb-name">${_esc(f.label)}</span>
        ${sub ? `<span class="fb-sub">${_esc(sub)}</span>` : ''}
      </span>
      ${f.locked ? `<span class="fb-lock">${_esc(f.lockNote || 'まだ')}</span>` : ''}`;
  }

  /** 山札の厚み。数字ではなく層の数で「あと何回引けそうか」を見せる */
  function _renderDeck(left) {
    if (!_deckEl) return;
    const layers = Math.max(0, Math.min(8, Math.ceil(left / 1.8)));
    _deckEl.innerHTML = layers
      ? '<span class="ds-label">山</span>' + '<i></i>'.repeat(layers)
      : '<span class="ds-label empty">切り直し</span>';
  }

  /**
   * 「この流れ」メーター。数値は出さず、灯った点の数だけで見せる。
   *
   * 【なぜ順番に灯すのか】点を一斉に光らせると「増えた」ことしか伝わらず、
   * どの札が効いて繋がったのかが読めない。増えたぶんだけ左から順に足していくと、
   * いま出した札と流れの因果が、説明なしにその場で見える。
   * 逆に切れるのは一瞬の出来事なので、消すときは順番を付けず一斉に消す。
   */
  function _renderChain(link) {
    if (!_chainEl) return;
    const n = Math.max(0, Math.min(LINK_CAP, link || 0));

    // 札を選び直すだけでも setHand 経由でここへ来る。数が同じなら手を付けない
    // （毎回描き直すと、札を選んだだけで点灯の途中がリセットされてしまう）
    if (n === _lastLink && _chainEl.querySelector('i')) return;

    // 点灯の途中で次の描画が来ても重ならないよう、前のタイマーは必ず捨てる
    _chainTimers.forEach(clearTimeout);
    _chainTimers = [];

    if (n <= 0) {
      _chainEl.className = 'chain-meter';
      _chainEl.innerHTML = '';
      _lastLink = 0;
      return;
    }

    // 点の要素は使い回す。innerHTML を毎回作り直すと途中のアニメが飛ぶ
    const fresh = _chainEl.querySelectorAll('i').length !== LINK_CAP;
    if (fresh) _chainEl.innerHTML = '<span class="cm-label"></span>' + '<i></i>'.repeat(LINK_CAP);
    const pips  = _chainEl.querySelectorAll('i');
    const label = _chainEl.querySelector('.cm-label');
    const prev  = fresh ? 0 : Math.max(0, Math.min(LINK_CAP, _lastLink));
    _lastLink = n;

    // 減った＝流れが切れた。一瞬の出来事なので一斉に消す
    if (n < prev) {
      for (let i = 0; i < LINK_CAP; i++) {
        pips[i].classList.toggle('on', i < n);
        if (i >= n) pips[i].classList.remove('cm-cap');
      }
      _chainEl.className = 'chain-meter show';
      if (label) label.textContent = 'いい流れ';
      return;
    }

    // 増えた。すでに灯っている点はそのまま、増分だけを左から順に灯す
    for (let i = 0; i < prev; i++) pips[i].classList.add('on');
    for (let i = n; i < LINK_CAP; i++) pips[i].classList.remove('on', 'cm-cap');
    _chainEl.className = 'chain-meter show';
    if (label) label.textContent = 'いい流れ';

    for (let i = prev; i < n; i++) {
      const pip = pips[i];
      const cap = (i === n - 1) && n >= LINK_CAP;   // 上限に届かせた最後の1点
      _chainTimers.push(setTimeout(() => {
        pip.classList.add('on');
        if (cap) pip.classList.add('cm-cap');
      }, (i - prev) * PIP_STEP_MS));
    }

    // ラベルと full の色は、点が全部灯り終わってから切り替える。
    // 先に文字が「乗ってる」に変わると、そのあと灯る点がただの飾りになってしまう
    if (n >= LINK_CAP) {
      _chainTimers.push(setTimeout(() => {
        _chainEl.classList.add('full');
        if (label) label.textContent = '乗ってる';
      }, (n - 1 - prev) * PIP_STEP_MS + PIP_POP_MS));
    }
  }

  /** 発話状態の見える化（旧仕様のまま） */
  function setSpeechState(state) {
    if (!_panelEl) return;
    const def = SPEECH_STATES[state] || SPEECH_STATES.idle;
    Object.values(SPEECH_STATES).forEach(s => { if (s.cls) _panelEl.classList.remove(s.cls); });
    if (def.cls) _panelEl.classList.add(def.cls);
    if (_statusEl) {
      _statusEl.textContent = def.text;
      _statusEl.className = 'kdm-status' + (def.cls ? ' ' + def.cls : '');
    }
  }

  /**
   * 常時手（静観／話を振る／連絡先）の可否。
   * 旧 setGreyout(greyMap) と同じ形で受ける＝司令塔側の呼び出しを変えない。
   * 山札の札はここでは触らない（引けた札は常に出せる＝手札制の芯）。
   * @param {object} greyMap { kanshi, furu, renraku, ... }
   */
  function setGreyout(greyMap) {
    SPECIALS.forEach(id => {
      const el = _specialEls[id];
      if (!el) return;
      el.classList.toggle('unavail', !!(greyMap && greyMap[id]));
    });
  }

  /** 「狙い」ボタンに今の相手を出す */
  function setAimTarget(name) {
    const el = _specialEls.aim?.querySelector('.kdm-main-sub');
    if (el) el.textContent = name || '';
  }

  /** 「話を振る」の相手名をボタンに出す（冷えてる子が誰か見える） */
  function setFuruTarget(name) {
    const el = _specialEls.furu;
    if (!el) return;
    const sub = el.querySelector('.kdm-main-sub');
    if (sub) sub.textContent = name ? name : '';
  }

  /** 札を1枚出した瞬間のエフェクト */
  function ripple(id) {
    const el = (_handEl && _handEl.querySelector(`[data-id="${id}"]`)) || _specialEls[id];
    if (!el) return;
    const r = document.createElement('div');
    r.className = 'kdm-ripple';
    el.appendChild(r);
    // 手札の札は「場に出ていく」。常時手はリップルだけ
    if (el.classList.contains('fan-card')) el.classList.add('played');
    setTimeout(() => r.remove(), 600);
  }

  /** 手札を押せなくする（セリフ送り中・発動後・ターン境界） */
  function disable() {
    _locked = true;
    // 【2拍】押せない間は「見る」拍＝札は下端に沈み、会話とヒロインが前に出る
    // （speechState ではなく、実際に押せるかどうかで切り替える。タイミング窓や
    //   札を選んだ状態で拍が戻ってしまうのを避けるため）
    document.body.classList.remove('beat-play');
    if (_handEl) _handEl.classList.add('locked');
    SPECIALS.forEach(id => _specialEls[id]?.classList.add('disabled'));
    _specialEls.kanshi?.classList.remove('disabled');   // 静観は常時押せる
    _specialEls.aim?.classList.remove('disabled');      // 狙い変更も常時押せる
    _specialEls.pass?.classList.remove('disabled');     // パスも常時押せる
  }

  /** 手札を押せるようにする */
  function enable() {
    // 自分の番が来たことを、札が配られる動きで知らせる（2026-09-24）。
    // 引いた1枚しか動かないので「いつ選べるようになったのか」が分からなかった。
    // ここで配り直すと、毎ターン手札が並び直って手番の開始が見える。
    _dealAll = true;
    _locked = false;
    document.body.classList.add('beat-play');   // 【2拍】自分の番＝「出す」拍
    if (_handEl) _handEl.classList.remove('locked');
    SPECIALS.forEach(id => _specialEls[id]?.classList.remove('disabled'));
    _rerender();
  }

  // ── タイミング窓（旧仕様のまま） ──────────────────
  function openTimingWindow(windowMs, onClose) {
    _closeTimingWindow();
    _panelEl.classList.remove('timing-pre');
    _panelEl.classList.add('timing-window');
    if (_timingBar) {
      _timingBar.classList.remove('priming');
      _timingBar.style.transition = 'none';
      _timingBar.style.width = '100%';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        _timingBar.style.transition = `width ${windowMs}ms linear`;
        _timingBar.style.width = '0%';
      }));
    }
    _timingTimer = setTimeout(() => { _closeTimingWindow(); if (onClose) onClose(); }, windowMs);
  }

  function primeTimingWindow(preMs) {
    _panelEl.classList.add('timing-pre');
    if (_timingBar && preMs > 0) {
      _timingBar.classList.add('priming');
      _timingBar.style.transition = 'none';
      _timingBar.style.width = '0%';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        _timingBar.style.transition = `width ${preMs}ms linear`;
        _timingBar.style.width = '100%';
      }));
    }
  }

  function closeTimingWindow() { _closeTimingWindow(); }

  // ── 旧API互換（7ボタン時代の呼び出しを壊さないための空実装） ──
  // 手札は常時見えているので「メニューを開く/閉じる」は無い。
  function openMenu()  {}
  function closeMenu() {}
  function setVocab()  {}   // 語彙は札そのものが持つ
  function setPreview(){}   // セリフは札の顔に出ている＝プレビューと実発言が同一

  // ── private ──────────────────────────────────────
  function _rerender() { const f = _lastFaces, c = _lastCtx; _lastIds = (f||[]).map(x=>x&&x.id); setHand(f, c); }
  function _fire(id) { if (_onFire) _onFire(id); }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _closeTimingWindow() {
    if (_timingTimer) { clearTimeout(_timingTimer); _timingTimer = null; }
    _panelEl.classList.remove('timing-window', 'timing-pre');
    if (_timingBar) {
      _timingBar.classList.remove('priming');
      _timingBar.style.transition = 'none';
      _timingBar.style.width = '0%';
    }
  }

  return {
    init, setHand, setGreyout, setFuruTarget, setAimTarget, setSpeechState,
    openTimingWindow, primeTimingWindow, closeTimingWindow,
    ripple, disable, enable,
    openMenu, closeMenu, setVocab, setPreview,
  };

})();
