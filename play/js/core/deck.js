// ═══════════════════════════════════════════════════
// js/core/deck.js — 手札制の山・手札・札の生成（純粋ロジック）
// 依存: なし（DOM操作なし・localStorage不使用）
//
// 企画書 §17（2026-09-20 決定: A＝手札制）の第1段。
//   属性（居住/サークル/バイト） → 札の「種類」
//   パラメータ（コミュ/頭/酒/ビジュ/手際） → 札の「質」
//   札は power（強さ）と link（繋ぎ）の2値を持つ。
//   link は次に出す札に乗る＝「弱い札でも繋がるなら出す」を成立させる。
//
// 札の type は既存の KotodamaCore.calcEffect にそのまま渡せる値
//   ('kyokan'|'nori'|'fukagori'|'change'|'nomiyo')。コマンドは増やさない（§16）。
// ═══════════════════════════════════════════════════

const DeckCore = (() => {
  'use strict';

  // ── 定数 ──────────────────────────────────────────
  // 2026-09-22: 連絡先を「常時押せるボタン」から「山から引く札」に変えたのに伴い、
  // 手札を3→5、デッキを11→14に広げた。3枚だと連絡先を握った瞬間に
  // 実質2枚になり、選ぶ余地が消えるため。
  const HAND_SIZE       = 5;   // 手札枚数
  const DRAW_PER_PLAY   = 1;   // 1手打ったら何枚引くか
  // ネタ札が3種→6種に増えたぶんデッキも広げた（14→18）。
  // 内訳は ネタ6枚 / 相槌12枚 ＝ 33% : 67%。
  // 6手＋初手5枚で11枚を見るので、デッキの約6割を引く（TCGの実戦と同じくらい）。
  const PLAIN_BASE      = 12;  // 相槌札の枚数（ネタの枚数はこれに足される）
  const DECK_BASE       = 18;  // 目安（互換のため残す）
  // ── 流れ（チェイン）の設計 ──────────────────────
  // 2026-09-20 修正: 累積式をやめ、持ち越し式にした。
  //   累積だと 3手で上限に張り付き、以後ずっと最大倍率＝「資源」ではなく「永久バフ」になる。
  //   持ち越し式なら、毎手「繋ぐ札を残すか／流れを使い切って強い札を出すか」の判断が立つ。
  //   出した札の link が、そのまま次の札の土台になる（自分の link は自分には乗らない）。
  //   数値は実測で決めた（tools/sweep_deck.js）。0.20 では「一番強い札を出す」と
  //   「最適に打つ」の差が10%しか無く、繋ぐ意味が数字に出なかった。0.45 で約21%。
  const CHAIN_STEP      = 0.45; // 土台 link 1 あたりの次札倍率（最大 +1.35）
  const CHAIN_LINK_CAP  = 3;   // link の最大値（= 土台の上限）
  const STREAK_STEP     = 0.10; // 繋ぎ続けた連続回数あたりの上乗せ
  const STREAK_CAP      = 3;   // 上乗せの上限回数（最大 +0.30 → 合計 2.65倍）
  const STREAK_MIN_LINK = 2;   // これ以上の link を出したら「繋いだ」とみなす

  // ランク：質。power はそのまま効果倍率に掛かる
  const RANK = {
    n: { power: 1.00, ja: '並' },
    a: { power: 1.25, ja: '上' },
    s: { power: 1.60, ja: '特' },
  };

  // 繋ぎ(link)の設計ルール:
  //   power >= 1.20 の札は link 0 —— 強い手は流れを使い切る。
  //   power <  1.00 の札は link 2-3 —— 弱い手の存在理由は「次に繋ぐこと」。
  //   これを崩すとデッキの大半が link>=1 になり、流れが切れなくなる＝どう打っても同じになる。
  // 札テンプレ: label=札名 / type=既存コマンド / link=繋ぎ0-3 / base=素の強さ / line=実際に言う一行
  // tags: この札が「効く」場の色（situation.tags と同じ語彙）。
  //   playful / tense / emotional / intimate / chaotic / closing
  //   今の話題と重なる札は、手札に来やすく・光って・実際に強い（FIT_BONUS）。
  //   「なんでこの札が手札にあるのか」に、場が答えるための仕組み。
  const T = (label, type, link, base, line, tags) => ({ label, type, link, base, line, tags: tags || [] });

  // ネタ札（話題を持つ札）。出すと自分から話題を振り、刺されば会話が続き、外せば冷える。
  //   type は 'change'（話題を変える＝流れは切れる）。link 0 も同じ理由。
  //   line は card-topics.js の open を使うので持たない（二重管理を避ける）。
  //   width は UI 表示用（広い＝外れにくい／狭い＝刺さると大きい）。
  // ネタ札は card-topics.js から組む（どの話題を持てるかは向こうの require が決める）。
  // 種類ごとの素の強さ: 入り口は浅く、濃いあるあるが一番強い。
  const NETA_BASE = { intro:1.00, aruaru:1.40, general:1.15, deep:1.70, learned:1.25 };
  const _netaTpl = (t) => ({
    label: t.label, type: 'change', link: 0,
    base: NETA_BASE[t.kind] || 1.20,
    line: null, topic: t.id, tags: t.tags || [],
  });

  // ── 共通札（誰でも持つ相槌。弱いが繋ぐ） ──────────
  const COMMON = [
    // 入り口のネタ（誰でも持つ）。ほぼ全員が拾うが伸びは小さい
    T('合いの手',   'kyokan', 3, 0.65, '「うんうん、で、どうなったの」', ['emotional', 'intimate', 'tense']),
    T('それな',   'kyokan', 3, 0.70, '「わかるわ。俺もたまにある」', ['emotional', 'playful']),
    T('つられ笑い',     'nori',   2, 0.70, '「あはは、なにそれ。ずるい」', ['playful', 'chaotic']),
  ];

  // ── 連絡先（夜が深まってから山に入る一枚）────────
  // 常時押せるボタンではなく「引けたら切れる札」。引けなければ、その夜は聞けない。
  // 握ったまま出せる（＝手札を1枠使って、切るタイミングを待てる）。
  const RENRAKU_CARD = {
    label: '連絡先', type: 'renraku', link: 0, base: 1.00,
    line: '「あのさ。……連絡先、聞いてもいい？」',
    tags: ['closing', 'intimate'], late: true,
  };
  const LATE_TOP_N = 5;   // 山の上から何枚以内に混ぜるか（引けない夜もある幅）

  /**
   * 夜が深まったタイミングで、連絡先札を山に一枚混ぜる。
   * 山の上位 LATE_TOP_N 枚のどこかに入るので、引ける夜と引けない夜が出る。
   * @returns {object|null} 入れた札（既に入っていれば null）
   */
  function injectLate(st, rnd) {
    if (!st || st.lateDone) return null;
    st.lateDone = true;
    rnd = rnd || Math.random;
    const card = _mk(RENRAKU_CARD, {}, rnd, 'late', 0);
    card.rank = 'n'; card.rankJa = RANK.n.ja; card.power = RENRAKU_CARD.base;
    const at = Math.min(st.draw.length, Math.floor(rnd() * LATE_TOP_N));
    st.draw.splice(at, 0, card);
    return card;
  }

  // ── 属性 → 札の種類 ───────────────────────────────
  const BY_PART = {
    izakaya: [
      T('もう一杯',   'nomiyo', 1, 1.05, '「はい飲も。みんな、なに飲む」', ['chaotic', 'closing', 'playful']),
      T('厨房の惨事',   'nori',   2, 1.10, '「うちの店、こないだ大惨事でさ」', ['playful', 'tense']),
      T('無茶ぶり',     'nori',   0, 1.25, '「じゃあ一発、なんかいってよ」', ['playful', 'chaotic']),
      T('乾杯やり直し',   'nori',   0, 1.55, '「えー、じゃあ乾杯やり直しで」', ['chaotic', 'closing']),
    ],
    cafe: [
      T('気が利く',     'kyokan', 2, 0.95, '「なんか足りてる？　頼もうか」', ['tense', 'emotional']),
      T('脈絡なし',       'change', 2, 0.90, '「あ、ごめん全然関係ないけど」', ['tense', 'chaotic']),
      T('なに飲む派',     'fukagori', 1, 1.00, '「ふだん何飲むの。甘いの派？」', ['playful', 'closing']),
    ],
    juku: [
      T('踏み込む',   'fukagori', 0, 1.35, '「それ、どういう仕組みなの」', ['emotional', 'intimate']),
      T('なんで？',     'fukagori', 2, 1.15, '「なんで？　そこ気になるわ」', ['playful', 'emotional']),
      T('つまり、こう',       'fukagori', 0, 1.50, '「つまり、こういうことでしょ」', ['tense', 'chaotic']),
    ],
    none: [
      T('暇を持て余す',       'change', 1, 0.85, '「そういえば最近、暇すぎてさ」', ['tense', 'playful']),
    ],
  };

  const BY_CIRCLE = {
    culture: [
      T('黙って聞く',   'kyokan', 3, 0.80, '「いや、続けて。聞いてるから」', ['emotional', 'intimate']),
      T('いつから？',   'fukagori', 2, 1.10, '「いつから？　きっかけあったの」', ['playful', 'emotional']),
    ],
    sports: [
      T('食い気味',   'nori', 0, 1.30, '「待って、それ何時間やってんの」', ['playful', 'chaotic']),
      T('全員でいこうぜ', 'nori', 0, 1.55, '「よし、じゃあ全員でいこうぜ」', ['chaotic', 'closing']),
    ],
    none: [
      T('ふと思い出す',   'change', 2, 0.90, '「あ、ちょっと話変えていい？」', ['tense', 'chaotic']),
    ],
  };

  const BY_LIVING = {
    home: [
      T('腰を据える', 'kyokan', 3, 0.85, '「まあまあ。で、その続きは」', ['chaotic', 'tense']),
      T('うちもそう',       'kyokan', 1, 1.00, '「うち実家だから、それ分かる」', ['emotional', 'playful']),
    ],
    alone_send: [
      T('やってみたい',           'nori',   0, 1.20, '「へえ。俺もそれ、やってみたい」', ['playful', 'emotional']),
      T('誰もいない家', 'kyokan', 2, 1.00, '「分かる、うちも誰もいないし」', ['intimate', 'emotional']),
    ],
    alone_nosend: [
      T('切り替える',     'change', 2, 1.05, '「ごめん、いったん全然違う話」', ['tense', 'closing']),
      T('腹減った',     'nomiyo', 1, 1.10, '「なんか頼も。腹減ってきた」', ['chaotic', 'playful']),
    ],
  };

  // ── パラメータ → 質 ───────────────────────────────
  const _clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /**
   * 札1枚のランクを抽選する。
   * コミュ力が全体の底上げ、頭は深掘り札、酒は飲もうぜ札に効く。
   */
  function _rollRank(tpl, params, rnd) {
    const comm = params.comm || 50;
    let pS = 0.06 + _clamp((comm - 40) / 400, 0, 0.14);  // 特: 6%〜20%
    let pA = 0.24 + _clamp((comm - 40) / 200, 0, 0.26);  // 上: 24%〜50%
    if (tpl.type === 'fukagori') { const h = params.head || 50; pS += _clamp((h - 50) / 500, 0, 0.10); pA += _clamp((h - 50) / 250, 0, 0.20); }
    if (tpl.type === 'nomiyo')   { const k = params.sake || 50; pS += _clamp((k - 50) / 500, 0, 0.10); pA += _clamp((k - 50) / 250, 0, 0.20); }
    const r = rnd();
    if (r < pS) return 's';
    if (r < pS + pA) return 'a';
    return 'n';
  }

  function _mk(tpl, params, rnd, src, seq) {
    const rank = _rollRank(tpl, params, rnd);
    return {
      id:    `${src}-${seq}`,
      label: tpl.label,
      line:  tpl.line,
      type:  tpl.type,
      link:  tpl.link,
      base:  tpl.base,
      tags:  tpl.tags || [],
      topic: tpl.topic || null,     // ネタ札だけが持つ（card-topics.js のキー）
      late:  !!tpl.late,
      rank,
      rankJa: RANK[rank].ja,
      power: +(tpl.base * RANK[rank].power).toFixed(3),
      src,
    };
  }

  /**
   * その夜のデッキを組む。
   * @param {object} config  { living, circle, part }
   * @param {object} params  プレイヤーの素パラメータ
   * @param {function} rnd   0..1 を返す乱数（省略時 Math.random）
   * @returns {{cards:Array, meta:object}}
   */
  function buildDeck(config, params, rnd, flags) {
    rnd = rnd || Math.random;
    const p = params || {};
    const cfg = config || {};
    // 相槌札: 属性ごとのプールから
    const plainPool = []
      .concat(COMMON)
      .concat(BY_PART[cfg.part || 'none']     || BY_PART.none)
      .concat(BY_CIRCLE[cfg.circle || 'none'] || BY_CIRCLE.none)
      .concat(BY_LIVING[cfg.living || 'home'] || BY_LIVING.home);
    // ネタ札: 「持てる話題」を card-topics.js に訊く。
    //   入り口は誰でも／あるあるは同じ属性なら／一般ネタはコミュ力や頭が要る／
    //   濃いあるあるは二属性そろったとき／覚えた札は日常でその行動を選んだとき。
    const self = {
      living: cfg.living || 'home', circle: cfg.circle || 'none', part: cfg.part || 'none',
      hometown: cfg.hometown || null, params: p, flags: flags || [],
    };
    const netaPool = (typeof CardTopics !== 'undefined')
      ? CardTopics.holdable(self).map(_netaTpl) : [];
    const pools = plainPool.concat(netaPool);

    // 相槌の枚数は固定。ネタが多い人はそのぶんデッキが厚くなる
    // （選択肢は増えるが、1枚あたりの引きやすさは下がる＝広く浅くのビルド）。
    const tact  = p.tact || 50;
    const size  = PLAIN_BASE + netaPool.length + Math.round(_clamp((tact - 50) / 25, -1, 2));

    // ネタ札は「会話の芯」なので、プール循環まかせにせず必ず2枚ずつ入れる。
    // （循環だと11枚中1枚しか入らず、話題を振る手が回ってこなかった）
    const netas  = netaPool;
    const plains = plainPool;
    const cards  = [];
    let seq = 0;
    netas.forEach(t => { cards.push(_mk(t, p, rnd, 'self', seq++)); });
    while (cards.length < size && plains.length) {
      cards.push(_mk(plains[seq % plains.length], p, rnd, 'self', seq++));
    }

    // ビジュが高いと初手が良い：上位札を前に寄せる
    const visu = p.visu || 50;
    if (visu >= 60) {
      const w = { s: 0, a: 1, n: 2 };
      cards.sort((a, b) => (w[a.rank] - w[b.rank]) * (rnd() < (visu - 50) / 60 ? 1 : 0));
    } else {
      for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
    }

    return { cards, meta: { size, pools: pools.length, config: { ...(config || {}) } } };
  }

  // ── 山・手札・捨て札 ──────────────────────────────

  /** デッキから初期状態を作る（手札 HAND_SIZE 枚を配る） */
  function createState(cards, rnd, sitTags) {
    const st = { draw: cards.slice(), hand: [], discard: [], accumLink: 0, streak: 0, played: 0 };
    drawUp(st, HAND_SIZE, rnd, sitTags);
    return st;
  }

  const PEEK       = 3;     // 山の上から何枚を「思い出しうる範囲」とみなすか
  const RECALL_P   = 0.65;  // その中に場に合う札があったとき、それを思い出す確率

  /**
   * n枚引く。山が尽きたら捨て札をシャッフルして戻す（＝札は尽きない）。
   * sitTags を渡すと「今の話に合う札」が山の上の方にあるとき、確率でそれを先に引く。
   *   ＝出せるリアクションは、その場で思い出せたリアクション。
   * 確定ではないので「欲しい札が来ない」緊張は残る。
   */
  function drawUp(st, n, rnd, sitTags) {
    rnd = rnd || Math.random;
    for (let i = 0; i < n; i++) {
      if (!st.draw.length) {
        if (!st.discard.length) break;           // 本当に無い（通常6手では起きない）
        st.draw = st.discard.splice(0);
        for (let k = st.draw.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [st.draw[k], st.draw[j]] = [st.draw[j], st.draw[k]]; }
      }
      let idx = 0;
      if (sitTags && sitTags.length && rnd() < RECALL_P) {
        for (let k = 0; k < Math.min(PEEK, st.draw.length); k++) {
          if (fits(st.draw[k], sitTags)) { idx = k; break; }
        }
      }
      st.hand.push(st.draw.splice(idx, 1)[0]);
    }
    return st;
  }

  /** 1枚出す。出した札は捨て札へ。link が次の札に乗る */
  function playCard(st, cardId, rnd, sitTags) {
    const i = st.hand.findIndex(c => c.id === cardId);
    if (i < 0) return { card: null, st };
    const card = st.hand.splice(i, 1)[0];
    st.discard.push(card);
    st.played += 1;
    // 持ち越し: 出した札の link が次の札の土台になる。
    // 強い札(link 0-1)を出した瞬間に流れは薄くなる＝「使い切った」。
    st.streak    = card.link >= STREAK_MIN_LINK ? Math.min(STREAK_CAP, (st.streak || 0) + 1) : 0;
    st.accumLink = Math.min(CHAIN_LINK_CAP, card.link);
    drawUp(st, DRAW_PER_PLAY, rnd, sitTags);
    return { card, st };
  }

  // 場との相性: 今の話題タグと1つでも重なれば「効く札」
  const FIT_BONUS = 1.20;   // 効く札を出したときの上乗せ

  /**
   * パス（引き直し・2026-09-24）。手札を全部捨て、HAND_SIZE まで引き直す。
   * 「出せる札が無いのにペナルティを払う」を無くすための逃げ道。
   * 代償は手番1つと流れ（chain）の断絶で、playCard のような link 持ち越しは無い。
   */
  function mulligan(st, rnd, sitTags) {
    if (!st) return { n: 0, st };
    const n = st.hand.length;
    while (st.hand.length) st.discard.push(st.hand.pop());
    drawUp(st, HAND_SIZE, rnd, sitTags);
    st.accumLink = 0;
    st.streak    = 0;
    return { n, st };
  }

  /** この札は今の場に効くか。sitTags が無ければ常に false（＝素の扱い） */
  function fits(card, sitTags) {
    if (!card || !sitTags || !sitTags.length || !card.tags || !card.tags.length) return false;
    for (const t of card.tags) if (sitTags.indexOf(t) >= 0) return true;
    return false;
  }

  /** チェインが切れたとき（話題転換・失敗・対象変更）に呼ぶ */
  function breakChain(st) { if (st) { st.accumLink = 0; st.streak = 0; } return st; }

  /**
   * 【意図】相手が待っていたものを出せたとき（2026-09-22）。
   * 流れは「自分で繋ぐ札を選んだか」だけでなく「相手を読めたか」でも伸びる。
   * これがないと予告は倍率の微調整にしかならず、読む理由が生まれない。
   */
  function boostChain(st) {
    if (!st) return st;
    st.streak    = Math.min(STREAK_CAP, (st.streak || 0) + 1);
    st.accumLink = Math.max(st.accumLink || 0, 2);
    return st;
  }

  /** 友達が撒いた札／ライバルの邪魔札を差し込む口（第3段で使う） */
  function inject(st, card, to) {
    if (to === 'hand') st.hand.push(card);
    else st.draw.unshift(card);
    return st;
  }

  /**
   * この札を今出したときの効果倍率。
   * 直前までの累積 link が乗る＝弱い札で繋いでから強い札を出すと伸びる。
   */
  function effectMult(card, st, sitTags) {
    if (!card) return 1;
    const link   = Math.min(CHAIN_LINK_CAP, (st && st.accumLink) || 0);
    const streak = Math.min(STREAK_CAP,     (st && st.streak)    || 0);
    const chain  = 1 + CHAIN_STEP * link + STREAK_STEP * streak;
    const fit    = fits(card, sitTags) ? FIT_BONUS : 1;
    return +(card.power * chain * fit).toFixed(3);
  }

  /** 表示用: 今どれだけ流れが乗っているか（0=切れてる, 1.0=素） */
  function chainMult(st) {
    const link   = Math.min(CHAIN_LINK_CAP, (st && st.accumLink) || 0);
    const streak = Math.min(STREAK_CAP,     (st && st.streak)    || 0);
    return +(1 + CHAIN_STEP * link + STREAK_STEP * streak).toFixed(3);
  }

  const TYPE_JA = { kyokan:'共感', nori:'ノリ', fukagori:'深掘り', change:'話題変え', nomiyo:'飲もうぜ', renraku:'連絡先' };

  /**
   * 札の「顔」。§16「会話力のスコア化・常時数値表示」に触れないよう、
   * 強さ・繋ぎの生の数値は返さない。主役はセリフ、札名と型は添え物。
   *   linkDots : 繋ぎを点の数で表す（次に続く感じ）
   *   heat     : 強さを語彙で表す（数値ではない）
   */
  // 幅はもう札が持たない。card-topics.js が「10人中何人が拾うか」から決める。
  function _widthOf(card) {
    if (!card.topic || typeof CardTopics === 'undefined') return null;
    const t = CardTopics.get(card.topic);
    if (!t) return null;
    const all = (typeof HEROINES !== 'undefined') ? HEROINES : null;
    if (!all) return null;
    return CardTopics.widthOf(t, all);
  }

  function face(card, sitTags) {
    if (!card) return null;
    // ネタ札のセリフは card-topics.js が持つ（二重管理を避けるため deck 側では持たない）
    const line = card.line
      || (card.topic && typeof CardTopics !== 'undefined'
          && (CardTopics.get(card.topic) || {}).open) || '';
    const _w = _widthOf(card);
    const heat = card.power >= 1.8 ? 'burst' : card.power >= 1.2 ? 'strong' : card.power >= 0.9 ? 'mid' : 'soft';
    return {
      id: card.id,
      line,
      label: card.label,
      typeJa: TYPE_JA[card.type] || card.type,
      type: card.type,
      rankJa: card.rankJa,
      isTop: card.rank === 's',
      linkDots: '・'.repeat(card.link),
      link: card.link,
      heat,
      fits: fits(card, sitTags),   // 今の話に効く札か（UIが光らせる）
      topic: card.topic || null,   // ネタ札か
      width: (_w && _w.width) || null,   // 'wide'|'mid'|'narrow'
      widthJa: (_w && _w.ja) || null,
      reach: _w ? _w.n : null,           // 10人中何人が拾う話題か
      late: !!card.late,           // 連絡先札（夜の後半にだけ山へ入る）
      src: card.src,
    };
  }

  return {
    buildDeck, createState, drawUp, playCard, mulligan, breakChain, boostChain, inject, injectLate, effectMult, chainMult, fits, face, TYPE_JA,
    HAND_SIZE, DRAW_PER_PLAY, DECK_BASE, PLAIN_BASE, LATE_TOP_N, CHAIN_STEP, CHAIN_LINK_CAP, STREAK_STEP, STREAK_CAP, FIT_BONUS, RANK,
    _pools: { COMMON, BY_PART, BY_CIRCLE, BY_LIVING },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DeckCore;
