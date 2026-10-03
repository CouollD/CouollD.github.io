// ═══════════════════════════════════════════════════
// js/core/situations.js — シチュエーション選択ロジック（純粋ロジック）
// 依存: なし（DOM操作なし）
// ═══════════════════════════════════════════════════

const SituationManager = (() => {

  // ── ヘルパー ──────────────────────────────────────
  function _sn(name) {
    const p = (name || '').split(/[\s　]+/);
    return p[p.length - 1] || name;
  }
  function _rand(n) { return Math.floor(Math.random() * n); }

  // ── シチュエーション定義 ──────────────────────────
  // generateDialogues は (state, partyChars, heroineChars) → dialogue[] を返す関数
  // timing: null | { windowMs }
  // conditions: { phaseMin, phaseMax, airMin, airMax, friendHeartMin, targetHeartMin,
  //               requireTraits(OR条件), oncePerGame }

  const SITUATION_DEFS = [

    // ─── Phase 0: 乾杯・自己紹介 ───────────────────
    {
      id: 'SIT_001', phase: 0, tags: ['playful'], timing: null, mandatory: true,
      conditions: {},
      weight: 1.0,
      generateDialogues(state, party, heroines) {
        const h0 = heroines[0], h1 = heroines[1], h2 = heroines[2];
        const fn = party[0] ? _sn(party[0].name) : '友達';
        return [
          { type:'heroine', speaker: h0 ? _sn(h0.name) : 'ヒロイン', heroineId: h0?.id,
            text:'「とりあえず乾杯しよっか！」' },
          { type:'friend',  speaker: fn,
            text:'「カンパーイ！」' },
          { type:'narr',    speaker:'',
            text:'グラスがぶつかり合った。合コンが始まった。' },
        ];
      },
    },

    {
      id: 'SIT_002', phase: 0, tags: ['emotional'], timing: null, mandatory: true,
      conditions: {},
      weight: 1.0,
      generateDialogues(state, party, heroines) {
        return heroines.map(h => ({
          type:'heroine', speaker: _sn(h.name), heroineId: h.id,
          text: HEROINE_INTRO_LINES[h.id] || `「${_sn(h.name)}です。よろしくお願いします！」`,
        }));
      },
    },

    {
      id: 'SIT_003', phase: 0, tags: ['playful'], timing: null, mandatory: false,
      conditions: {},
      weight: 1.0,
      generateDialogues(state, party, heroines) {
        // 観察材料: 注文の早さ＝各ヒロインの場慣れ。ことり/ゆなは即決、あおいは保留組。
        const fast = heroines.find(h => h.id === 102 || h.id === 109) || heroines[0];
        const slow = heroines.find(h => (h.id === 101 || h.id === 105 || h.id === 107) && h.id !== fast?.id)
                   || heroines.find(h => h.id !== fast?.id) || heroines[1];
        return [
          { type:'narr',    speaker:'', text:'メニューが回ってきた。' },
          { type:'heroine', speaker: fast ? _sn(fast.name) : 'ヒロイン', heroineId: fast?.id,
            text:'「とりあえずファーストドリンク決めよ〜！」' },
          ...(slow ? [{ type:'heroine', speaker: _sn(slow.name), heroineId: slow.id,
            text:'「……私、後で大丈夫です」' }] : []),
        ];
      },
    },

    {
      id: 'SIT_004', phase: 0, tags: ['emotional'], timing: null, mandatory: false,
      conditions: {},
      weight: 1.0,
      generateDialogues(state, party, heroines) {
        // 観察材料: 席の配置。誰が誰の正面か。あおいなら「全部見えている」の片鱗（相槌の正確さ）。
        const f0 = party[0];
        const h  = heroines[_rand(heroines.length)];
        const hn = h ? _sn(h.name) : 'ヒロイン';
        if (h && h.id === 101) {
          return [
            { type:'narr', speaker:'', text:`${f0 ? _sn(f0.name) : '友達'}の話に、全員が笑った。` },
            { type:'heroine', speaker: hn, heroineId: h.id,
              text:'「ふふ」（みんなより半拍遅れて笑った）' },
            { type:'narr', speaker:'', text:'相槌のタイミングだけが、妙に正確だった。' },
          ];
        }
        return [
          { type:'friend', speaker: f0 ? _sn(f0.name) : '友達', text:'「席これでいい感じ？」' },
          { type:'heroine', speaker: hn, heroineId: h?.id,
            text:'「うん、ちょうどいいかも！」' },
          { type:'narr', speaker:'', text:`${hn}が自然と${f0 ? _sn(f0.name) : '友達'}の正面に座り直した。` },
        ];
      },
    },

    {
      id: 'SIT_005', phase: 0, tags: ['tense'], timing: null, mandatory: false,
      conditions: { airMax: 50 },
      weight: 2.0,
      generateDialogues(state, party, heroines) {
        // 観察材料: 第一印象の探り。空気が温まりきる前、誰が口火を切り、誰のグラスがまだ手つかずか。
        const f0 = party[0];
        const h  = heroines[_rand(heroines.length)];
        const hn = h ? _sn(h.name) : 'ヒロイン';
        return [
          { type:'heroine', speaker: hn, heroineId: h?.id,
            text:'「みなさん、どういう繋がりなんですか？」' },
          { type:'friend', speaker: f0 ? _sn(f0.name) : '友達',
            text:`「えーっと、${['サークル','バイト','ゼミ','地元'][_rand(4)]}が一緒で…」` },
          { type:'narr', speaker:'',
            text:'まだ最初の一杯が半分残っている。探り合いの時間だ。' },
        ];
      },
    },

    // ─── Phase 1: 序盤の会話 ───────────────────────
    {
      id: 'SIT_101', phase: 1, tags: ['playful'], timing: { windowMs: 1400 },
      conditions: {},
      weight: 1.0,
      generateDialogues(state, party, heroines) {
        const h  = heroines[_rand(heroines.length)];
        const fn = party[_rand(party.length)] ? _sn(party[_rand(party.length)].name) : '友達';
        const hn = h ? _sn(h.name) : '彼女';
        // 趣味別の返し（確定稿）
        const HOBBY_FOLLOWUPS = {
          'サッカー':   { heroine:'「観る派ですか? やる派?」',       friend:'「やる派。今度フットサル来る?」' },
          '映画':       { heroine:'「最近なに観ました?」',           friend:'「それがさ、話すと長いんだけど…」' },
          'ゲーム':     { heroine:'「え、ランクどれくらいですか?」', friend:'「聞いて驚くなよ?」' },
          'カフェ巡り': { heroine:'「意外! おすすめあります?」',     friend:'「メモの用意はいい?」' },
        };
        const hobbies = Object.keys(HOBBY_FOLLOWUPS);
        const hobby   = hobbies[_rand(hobbies.length)];
        const follow  = HOBBY_FOLLOWUPS[hobby];
        return [
          // meta: 続き段（thread.js _hobbyStep）が hobby分岐を復元するための印。表示側は無視する
          { type:'heroine', speaker: hn, heroineId: h?.id, text:'「休みの日って何してるんですか？」', meta: { hobby } },
          { type:'friend',  speaker: fn, text:`「俺は${hobby}とか〜」` },
          { type:'heroine', speaker: hn, heroineId: h?.id, text: follow.heroine },
          { type:'friend',  speaker: fn, text: follow.friend },
          { type:'heroine', speaker: hn, heroineId: h?.id, text:'「え〜いいじゃないですか！」' },
        ];
      },
    },

    {
      id: 'SIT_102', phase: 1, tags: ['tense'], timing: { windowMs: 1500 },
      conditions: { airMax: 45 },
      weight: 3.0,
      generateDialogues(state, party, heroines) {
        const h  = heroines[_rand(heroines.length)];
        const fn = party[0] ? _sn(party[0].name) : '友達';
        return [
          { type:'narr',    speaker:'', text:'……沈黙が続いている。' },
          { type:'heroine', speaker: h ? _sn(h.name) : 'ヒロイン', heroineId: h?.id,
            text:'…（スマホをいじりはじめた）' },
          { type:'friend',  speaker: fn, text:'「えっと…なんか飲む？」' },
        ];
      },
    },

    {
      id: 'SIT_103', phase: 1, tags: ['playful'], timing: null,
      conditions: {},
      weight: 0.8,
      generateDialogues(state, party, heroines) {
        const h  = heroines[_rand(heroines.length)];
        const fn = party[0] ? _sn(party[0].name) : '友達';
        return [
          { type:'heroine', speaker: h ? _sn(h.name) : 'ヒロイン', heroineId: h?.id,
            text:'「次何飲もうかな〜」' },
          { type:'friend',  speaker: fn, text:'「俺頼むよ！何がいい？」' },
          { type:'heroine', speaker: h ? _sn(h.name) : 'ヒロイン', heroineId: h?.id,
            text:'「じゃあカシスソーダで〜」' },
        ];
      },
    },

    {
      id: 'SIT_104', phase: 1, tags: ['emotional', 'intimate'], timing: null,
      conditions: { oncePerGame: true },
      weight: 1.5,
      generateDialogues(state, party, heroines) {
        const target = state.targetHeroine || heroines[0];
        const hn = target ? _sn(target.name) : 'ヒロイン';
        const fn = party[0] ? _sn(party[0].name) : '友達';
        return [
          { type:'friend',  speaker: fn,
            text:'「ぶっちゃけどんな人がタイプ？」' },
          { type:'heroine', speaker: hn, heroineId: target?.id,
            text:`「うーん…${['優しい人','面白い人','頼れる人','一緒にいて楽な人'][_rand(4)]}かな〜」` },
          { type:'narr',    speaker:'',
            text:'場の視線が少しこちらに向いた気がした。' },
        ];
      },
    },

    {
      id: 'SIT_105', phase: 1, tags: ['emotional'], timing: null,
      conditions: {},
      weight: 0.9,
      generateDialogues(state, party, heroines) {
        const h  = heroines[_rand(heroines.length)];
        const fn = party[_rand(party.length)] ? _sn(party[_rand(party.length)].name) : '友達';
        return [
          { type:'heroine', speaker: h ? _sn(h.name) : 'ヒロイン', heroineId: h?.id,
            text:'「出身ってどのへん？」' },
          { type:'friend',  speaker: fn,
            text:`「俺${['関西','関東','地方'][_rand(3)]}だよ〜」` },
          { type:'heroine', speaker: h ? _sn(h.name) : 'ヒロイン', heroineId: h?.id,
            text:'「え〜遠いじゃないですか！」' },
        ];
      },
    },

    // ─── Phase 2: 中盤の攻防 ───────────────────────
    {
      id: 'SIT_201', phase: 2, tags: ['chaotic'], timing: { windowMs: 1000 },
      conditions: { friendHeartMin: 40 },
      weight: 3.0,
      generateDialogues(state, party, heroines) {
        // friendHeartが一番高い友達を特定
        const attacker = _mostObsessedFriend(state, party, heroines);
        const fn       = attacker ? _sn(attacker.friend.name) : (party[0] ? _sn(party[0].name) : '友達');
        const hn       = attacker ? _sn(attacker.heroine.name) : _sn(heroines[0]?.name || 'ヒロイン');
        const heroineId = attacker ? attacker.heroine.id : heroines[0]?.id;
        return [
          { type:'friend',  speaker: fn,
            text:`「${hn}さんってさ、普段どんなとこ行くの？」` },
          { type:'heroine', speaker: hn, heroineId,
            text:'「え〜よく行くのは渋谷かな〜？」' },
          { type:'friend',  speaker: fn,
            text:`「マジ！俺もよく行くわ。次一緒に行かない？」` },
          { type:'narr',    speaker:'',
            text:`${fn}が${hn}を独占し始めている…` },
        ];
      },
    },

    {
      id: 'SIT_202', phase: 2, tags: ['intimate'], timing: null,
      conditions: { friendHeartMin: 60 },
      weight: 5.0,
      generateDialogues(state, party, heroines) {
        const attacker = _mostObsessedFriend(state, party, heroines);
        const fn       = attacker ? _sn(attacker.friend.name) : (party[0] ? _sn(party[0].name) : '友達');
        const hn       = attacker ? _sn(attacker.heroine.name) : _sn(heroines[0]?.name || 'ヒロイン');
        const heroineId = attacker ? attacker.heroine.id : heroines[0]?.id;
        const others    = heroines.filter(h => h.id !== heroineId);
        const oh        = others[0];
        return [
          { type:'narr',    speaker:'',
            text:`${fn}と${hn}の会話が盛り上がっている。` },
          { type:'friend',  speaker: fn,
            text:'「あはは、それわかるわ〜！」' },
          { type:'heroine', speaker: hn, heroineId,
            text:'「でしょ！？」（嬉しそうに）' },
          ...(oh ? [{ type:'heroine', speaker: _sn(oh.name), heroineId: oh.id,
            text:'……（少し置いてけぼり感）' }] : []),
        ];
      },
    },

    {
      id: 'SIT_203', phase: 2, tags: ['playful', 'chaotic'], timing: { windowMs: 1300 },
      conditions: { airMin: 50 },
      weight: 2.0,
      generateDialogues(state, party, heroines) {
        const h  = heroines[_rand(heroines.length)];
        const fn = party[0] ? _sn(party[0].name) : '友達';
        return [
          { type:'friend',  speaker: fn, text:'「ゲームしようぜ！」' },
          { type:'heroine', speaker: h ? _sn(h.name) : 'ヒロイン', heroineId: h?.id,
            text:'「え〜何するの！？」' },
          { type:'narr',    speaker:'',
            text:'場が一気に盛り上がった。' },
        ];
      },
    },

    {
      id: 'SIT_204', phase: 2, tags: ['tense'], timing: { windowMs: 800 },
      conditions: { requireTraits: ['学歴厨', '暴走しやすい'] },
      weight: 2.0,
      generateDialogues(state, party, heroines) {
        // 学歴厨 or 暴走を持つ友達を特定
        const culprit = party.find(c =>
          (c.traits || []).some(t => t.includes('学歴厨') || t.includes('暴走'))
          && !state.twoWorld[c.id]
        );
        const fn = culprit ? _sn(culprit.name) : (party[0] ? _sn(party[0].name) : '友達');
        const text = culprit && (culprit.traits || []).some(t => t.includes('学歴厨'))
          ? `「そういえばみんなどこ大？俺${['早稲田','慶應','東大'][_rand(3)]}なんだけど」`
          : '「いやー俺って基本モテるんだよね〜ぶっちゃけ」';
        return [
          { type:'friend',  speaker: fn, text },
          { type:'narr',    speaker:'', text:'場の空気が微妙になった…' },
          { type:'heroine', speaker: _sn(heroines[0]?.name || 'ヒロイン'), heroineId: heroines[0]?.id,
            text:'……（引いている）' },
        ];
      },
    },

    {
      id: 'SIT_205', phase: 2, tags: ['intimate', 'emotional'], timing: null,
      conditions: { targetHeartMin: 35 },
      weight: 2.0,
      generateDialogues(state, party, heroines) {
        const target = state.targetHeroine || heroines[0];
        const hn = target ? _sn(target.name) : 'ヒロイン';
        return [
          { type:'heroine', speaker: hn, heroineId: target?.id,
            text:'「ねえ、趣味って何かあるんですか？」' },
          { type:'narr',    speaker:'',
            text:`${hn}が直接話しかけてきた。` },
        ];
      },
    },

    {
      id: 'SIT_206', phase: 2, tags: ['playful'], timing: null,
      // ── 山場(junction) ─────────────────────────────
      // 相手の開き方=自虐オチ(vulnerable-self)。docs/conversation-metacognition-design.md §3の作例そのもの。
      // openTag×型を KotodamaCore.judgeKata で二値判定し、着地(§6)を必ず言語化する。
      // 4型の内訳・missの根拠は同 §5（4型版マッチ表）。empathy(重い共感)だけが miss。
      openTag: 'vulnerable-self',
      junction: {
        prompt: '——友達の話がオチた。卓の視線が、こっちに来た。',
        cards: [
          { kata: 'question', text: '「え、それ気づいたのいつ？」' },
          { kata: 'selftalk', text: '「わかる、俺も先月似たようなのやった」' },
          { kata: 'boke',     text: '「てか結果的にめっちゃいいことしてるじゃん(笑)」' },
          { kata: 'empathy',  text: '「それ、生活大丈夫だった…？」' },
        ],
        landing: {
          hit:  { heroine: '「あはは、いいなあ そういうノリ」',
                  narr: '軽く笑って乗ってくれた——今のは、ちゃんと届いた。' },
          miss: { friend: '「まあまあ、そんな深刻な話じゃないから(笑)」',
                  narr: '今のは、ちょっと重く受け止めすぎたかもしれない。' },
        },
      },
      conditions: {},
      weight: 1.0,
      generateDialogues(state, party, heroines) {
        const h  = heroines[_rand(heroines.length)];
        const f0 = party[0], f1 = party[1];
        if (!f0) return [{ type:'narr', speaker:'', text:'場が盛り上がっている。' }];
        // 山場の直前で止める（オチ→ヒロインの食いつき）。締めの一行は junction 着地が担う。
        return [
          { type:'friend', speaker: _sn(f0.name),
            text:'「こいつさ、昔すごい失敗したんだよ」' },
          { type:'friend', speaker: f1 ? _sn(f1.name) : _sn(f0.name),
            text:'「やめろよ！」（笑）' },
          { type:'heroine', speaker: h ? _sn(h.name) : 'ヒロイン', heroineId: h?.id,
            text:'「え、なになに！？聞きたい！」' },
          { type:'friend', speaker: _sn(f0.name),
            text:'「文化祭でマイク持ったまま転んで、そのまま自己紹介続けたんだぜ」' },
          { type:'heroine', speaker: h ? _sn(h.name) : 'ヒロイン', heroineId: h?.id,
            text:'「えー! ちょっと見たかったかも」' },
        ];
      },
    },

    // ─── Phase 3: 終盤 ──────────────────────────────
    {
      id: 'SIT_301', phase: 3, tags: ['playful'], timing: null, mandatory: true,
      conditions: {},
      weight: 1.0,
      generateDialogues(state, party, heroines) {
        const fn = party[0] ? _sn(party[0].name) : '友達';
        return [
          { type:'friend',  speaker: fn, text:'「二次会どこ行く？」' },
          { type:'narr',    speaker:'', text:'場がそういう雰囲気になってきた。' },
        ];
      },
    },

    {
      id: 'SIT_302', phase: 3, tags: ['intimate'], timing: null,
      conditions: {},
      weight: 1.0,
      generateDialogues(state, party, heroines) {
        const target = state.targetHeroine || heroines[0];
        const hn = target ? _sn(target.name) : 'ヒロイン';
        return [
          { type:'heroine', speaker: hn, heroineId: target?.id,
            text:'「今日楽しいですね〜」' },
          { type:'narr',    speaker:'', text:'距離が少し縮まった気がする。' },
        ];
      },
    },

    {
      id: 'SIT_303', phase: 3, tags: ['intimate', 'emotional'], timing: null,
      conditions: { targetHeartMin: 40 },
      weight: 2.0,
      generateDialogues(state, party, heroines) {
        const target = state.targetHeroine || heroines[0];
        const hn = target ? _sn(target.name) : 'ヒロイン';
        return [
          { type:'heroine', speaker: hn, heroineId: target?.id,
            text:'「なんかさ……ちゃんと話せる人って少ないんですよね」' },
          { type:'narr',    speaker:'', text:'少し本音が出てきた。' },
        ];
      },
    },

    {
      id: 'SIT_304', phase: 3, tags: ['chaotic'], timing: { windowMs: 1000 },
      conditions: { requireTraits: ['暴走しやすい', '惚れっぽい'] },
      weight: 2.0,
      generateDialogues(state, party, heroines) {
        const attacker = _mostObsessedFriend(state, party, heroines);
        const fn       = attacker ? _sn(attacker.friend.name) : (party[0] ? _sn(party[0].name) : '友達');
        const hn       = attacker ? _sn(attacker.heroine.name) : _sn(heroines[0]?.name || 'ヒロイン');
        const heroineId = attacker ? attacker.heroine.id : heroines[0]?.id;
        return [
          { type:'friend',  speaker: fn,
            text:`「${hn}ちゃん、LINE交換しよ！」` },
          { type:'heroine', speaker: hn, heroineId,
            text:'「え、いいよ〜！」' },
          { type:'narr',    speaker:'',
            text:`${fn}が独占状態に入りかけている…` },
        ];
      },
    },

    {
      id: 'SIT_305', phase: 3, tags: ['intimate'], timing: null,
      conditions: { friendHeartMin: 72 },
      weight: 1.0,
      generateDialogues(state, party, heroines) {
        // このシチュエーションはcheck2Worldが発動する直前に表示
        const attacker = _mostObsessedFriend(state, party, heroines);
        const fn       = attacker ? _sn(attacker.friend.name) : '友達';
        const hn       = attacker ? _sn(attacker.heroine.name) : 'ヒロイン';
        return [
          { type:'narr', speaker:'',
            text:`${fn}と${hn}がいつの間にか2人だけの空間を作っている…` },
        ];
      },
    },

    // ─── Phase 4: お開き ────────────────────────────
    {
      id: 'SIT_401', phase: 4, tags: ['closing', 'emotional'], timing: null, mandatory: true,
      conditions: {},
      weight: 1.0,
      generateDialogues(state, party, heroines) {
        const target = state.targetHeroine || heroines[0];
        const hn     = target ? _sn(target.name) : 'ヒロイン';
        const heart  = target ? (state.hearts[target.id] || 0) : 0;
        const line   = heart >= 55
          ? '「今日楽しかったです。また会えたら嬉しいな」'
          : '「そろそろお時間ですかね…」';
        return [
          { type:'narr',    speaker:'', text:'終わりが近づいてきた。今動かないと。' },
          { type:'heroine', speaker: hn, heroineId: target?.id, text: line },
        ];
      },
    },
    {
      id: 'SIT_402', phase: 4, tags: ['intimate', 'emotional'], timing: null, mandatory: false,
      conditions: { targetHeartMin: 55 },
      weight: 3.0,
      generateDialogues(state, party, heroines) {
        // 観察材料: 脈ありサイン。お開きの瞬間、ターゲットが片付けの手を止めてこちらを見る。
        const target = state.targetHeroine || heroines[0];
        const hn = target ? _sn(target.name) : 'ヒロイン';
        const line = target && target.id === 101
          ? '「あの……今日、楽しかったです。本当に」（鞄の持ち手を握り直した）'
          : '「ねえ、まだ帰りたくないかも」';
        return [
          { type:'narr', speaker:'', text:'みんなが鞄を持ち始めた。' },
          { type:'heroine', speaker: hn, heroineId: target?.id, text: line },
          { type:'narr', speaker:'', text:`${hn}だけ、立ち上がるのが一拍遅れた。` },
        ];
      },
    },

    {
      id: 'SIT_403', phase: 4, tags: ['chaotic'], timing: { windowMs: 1200 }, mandatory: false,
      conditions: { friendHeartMin: 55 },
      weight: 3.0,
      generateDialogues(state, party, heroines) {
        // 観察材料: 友達の駆け込み独占。お開き間際に一番入れ込んだ友達がLINEを取りに行く。
        const attacker  = _mostObsessedFriend(state, party, heroines);
        const fn        = attacker ? _sn(attacker.friend.name) : (party[0] ? _sn(party[0].name) : '友達');
        const hn        = attacker ? _sn(attacker.heroine.name) : _sn(heroines[0]?.name || 'ヒロイン');
        const heroineId = attacker ? attacker.heroine.id : heroines[0]?.id;
        return [
          { type:'friend', speaker: fn,
            text:`「${hn}ちゃん帰る前に！連絡先だけ、ね？」` },
          { type:'heroine', speaker: hn, heroineId,
            text:'「あ、うん、いいよ〜」' },
          { type:'narr', speaker:'',
            text:`${fn}がスマホを構えた。出遅れたら持っていかれる。` },
        ];
      },
    },

    {
      id: 'SIT_404', phase: 4, tags: ['tense', 'closing'], timing: null, mandatory: false,
      conditions: { airMax: 38 },
      weight: 3.0,
      generateDialogues(state, party, heroines) {
        // 観察材料: しらけた解散。空気が低いまま終わる。誰も次の話をせず、ドライな子が先に切り上げる。
        const h  = heroines.find(h => h.id === 107) || heroines[_rand(heroines.length)];
        const hn = h ? _sn(h.name) : 'ヒロイン';
        return [
          { type:'narr', speaker:'', text:'会計の声がした。誰も引き止めなかった。' },
          { type:'heroine', speaker: hn, heroineId: h?.id,
            text:'「……じゃ、私たちこっちなので」' },
          { type:'narr', speaker:'', text:'ヒロイン側が先に立ち上がった。温まらないまま終わった。' },
        ];
      },
    },

    {
      id: 'SIT_405', phase: 4, tags: ['closing'], timing: null, mandatory: false,
      conditions: { airMin: 55 },
      weight: 2.0,
      generateDialogues(state, party, heroines) {
        // 観察材料: 良い空気での名残惜しい解散。二次会の流れが残るが、まだ誰の総取りでもない。
        const f0 = party[0];
        const h  = heroines[_rand(heroines.length)];
        const hn = h ? _sn(h.name) : 'ヒロイン';
        return [
          { type:'heroine', speaker: hn, heroineId: h?.id,
            text:'「あー、もうこんな時間なんだ」' },
          { type:'friend', speaker: f0 ? _sn(f0.name) : '友達',
            text:'「次あったら絶対また呼ぶわ！」' },
          { type:'narr', speaker:'',
            text:'店の前で全員が固まったまま、誰も最初に歩き出さない。' },
        ];
      },
    },

    // ─── Phase横断: 話題コンテンツ（docs/topic-content-spec.md 確定稿） ───
    {
      id: 'SIT_TALE', phase: null, tags: ['playful'], timing: null,
      conditions: { phaseMin: 1, phaseMax: 3, oncePerGame: true },
      weight: 1.0,
      generateDialogues(state, party, heroines) {
        // 友達の武勇伝: 参加友達からランダムに1人が自分の武勇伝を語る
        const f = party[_rand(party.length)];
        if (!f) return [{ type:'narr', speaker:'', text:'場が盛り上がっている。' }];
        const h  = heroines[_rand(heroines.length)];
        const hn = h ? _sn(h.name) : 'ヒロイン';
        const tale     = FRIEND_TALE_LINES[f.id] || FRIEND_TALE_FALLBACK;
        const reaction = TALE_REACTION_LINES[_rand(TALE_REACTION_LINES.length)];
        return [
          { type:'friend',  speaker: _sn(f.name), text: tale },
          { type:'heroine', speaker: hn, heroineId: h?.id, text: reaction },
          ...(f.id === 13 ? [{ type:'narr', speaker:'', text:'……その節はどうも。' }] : []),
        ];
      },
    },

    {
      id: 'SIT_HOLIDAY', phase: null, tags: ['emotional'], timing: null,
      conditions: { phaseMin: 1, phaseMax: 2, oncePerGame: true },
      weight: 1.0,
      generateDialogues(state, party, heroines) {
        // ヒロインの休日の話: 質問を振られ、参加中ヒロインからランダムに1人が答える
        const f = party[_rand(party.length)];
        const h = heroines[_rand(heroines.length)];
        const hn = h ? _sn(h.name) : 'ヒロイン';
        const intro = f
          ? { type:'friend', speaker: _sn(f.name), text:'「休みの日って何してるんですか?」' }
          : { type:'narr',   speaker:'',           text:'「休みの日って何してるんですか?」' };
        return [
          intro,
          { type:'heroine', speaker: hn, heroineId: h?.id,
            text: HEROINE_HOLIDAY_LINES[h?.id] || HEROINE_HOLIDAY_FALLBACK },
        ];
      },
    },

    {
      id: 'SIT_ANIME', phase: null, tags: ['emotional'], timing: null,
      conditions: { phaseMin: 1, phaseMax: 3, oncePerGame: true },
      weight: 1.0,   // 仮置き（テストプレイで確定）
      generateDialogues(state, party, heroines) {
        // 架空アニメ話題（C5第1弾・docs/topic-content-spec.md C節確定稿）:
        // 友達（いなければナレ）が立ち上げ → 参加ヒロインからランダム1人が段0スタンス。
        // スタンス未定義のidは選ばない（確定稿以外のセリフを作らない）
        const f = party[_rand(party.length)];
        const intro = f
          ? { type:'friend', speaker: _sn(f.name), text: ANIME_TOPIC_INTRO }
          : { type:'narr',   speaker:'',           text: ANIME_TOPIC_INTRO };
        const pool = heroines.filter(h => ANIME_STANCE_LINES[h.id]);
        if (pool.length === 0) return [intro];
        const h  = pool[_rand(pool.length)];
        return [
          intro,
          { type:'heroine', speaker: _sn(h.name), heroineId: h.id,
            text: ANIME_STANCE_LINES[h.id] },
        ];
      },
    },
  ];

  // ── ヒロイン自己紹介セリフ（Phase 0 で使用）────────
  const HEROINE_INTRO_LINES = {
    101: '「はじめまして。瀬川あおいです。読書が趣味なんですが…よろしくお願いします。」',
    102: '「橘ゆなで〜す！今日よろしく！テンション上がってきた〜！」',
    103: '「星野めいです……。なんか、今夜の空気が少し特別な気がして。」',
    104: '「長谷部ゆうきです！体育会系なので遠慮なく話しかけてください！」',
    105: '「木下りなです。こういう場が少し苦手で…でもちゃんと楽しもうと思います。」',
    106: '「田所みほで〜す！飲み物とか足りてなかったら言ってね！よろしく！」',
    107: '「上原なつきです。よろしく。あ、怒ってないですよ。こういう顔なので。」',
    108: '「有坂エミリです。少し前まで海外にいたんです。日本の合コン、初めてで新鮮です。」',
    109: '「佐々木ことりです〜！楽しそうなメンツで嬉しい！よろしくお願いします♡」',
    110: '「藤堂しおりです。よろしく。……珍しい組み合わせだね」',
  };

  // ── 友達の武勇伝セリフ（SIT_TALE で使用・docs/topic-content-spec.md A節確定稿）──
  const FRIEND_TALE_LINES = {
    1:  '「応援団長のとき、声出しすぎて決勝前に完全に声が出なくなってさ。決勝は身振りだけで応援した。優勝したよ」',
    2:  '「文化祭のミスコン、勝手にエントリーされてた。……無言で立ってたら優勝してた」',
    3:  '「新歓で先輩の分まで一気してさ、気づいたら先輩のチャリで帰ってた。翌日3km歩いて返しに行った」',
    4:  '「ゼミ合宿で全員寝坊したとき、朝5時からレンタカー回して全員間に合わせたことある。誰も気づいてないけど」',
    5:  '「模試で全国3位取ったことあるんだけど、その日のこと、隣の子に消しゴム借りたことしか覚えてない」',
    6:  '「サークル旅行の幹事で台風直撃を前日に読んで、全行程組み替えて全員無事に帰した。……感謝はされてない」',
    7:  '「クイズ大会で優勝したとき、優勝コメントで審査員の出題ミスを指摘した。会場は静まり返った。だが正しさは勝つ」',
    8:  '「この前、献血50回目で表彰された。……暇だったから通ってただけなんだけど」',
    9:  '「学園祭の焼きそば屋で鉄板2枚同時に回して行列捌いたの、いまだに『伝説のシフト』って呼ばれてる」',
    10: '「道案内頼まれて、一緒に30分迷子になったことある。なのに最後、なぜか連絡先渡された」',
    11: '「余興を頼まれすぎて、先月3週連続で違う結婚式で同じネタやった。3回ともウケた」',
    12: '「……ゼミ飲みで全員の推しの話を覚えてて、翌週それぞれに合う本を貸した。それだけ」',
    13: '「こいつ(※プレイヤー)が小学生のとき忘れ物ばっかでさ、先生にバレる前に届けるの、俺の裏の仕事だった。3年間」',
    14: '「留学先で財布落とした旅行者を助けたら、うちの教授の家族だった。単位はもらってない。飯は3回もらった」',
  };
  // 定義がないidのフォールバック（既存 SIT_206 の汎用行を流用）
  const FRIEND_TALE_FALLBACK = '「文化祭でマイク持ったまま転んで、そのまま自己紹介続けたんだぜ」';
  // ヒロインの反応ローテ（汎用）
  const TALE_REACTION_LINES = [
    '「え、なにそれ」',
    '「えー、ちょっと見たかった」',
    '「その話もっと聞きたいんだけど」',
  ];

  // ── ヒロインの休日の答え（SIT_HOLIDAY で使用・docs/topic-content-spec.md B節確定稿）──
  const HEROINE_HOLIDAY_LINES = {
    101: '「……休みの日は、本を。……あ、今、すごく面白いのがあって——……すみません、つい」',
    102: '「え、うち? だいたい誰かと遊んでる! 予定ない日とか逆に怖くない? ……てか、そっちはどうなの? はい次!」',
    103: '「休日って、平日が決めた休みの日でしょ。変な制度だよね。……わたしは、夢の続きを観てるかな。たぶん」',
    104: '「休み? 後輩連れて飯行って、バイトのシフト入って……あれ、うちの休みどこ行った? まあええねん、動いてる方が性に合うわ」',
    105: '「課題を進めて、あとは資格の勉強を。……休みの日まで真面目って、つまらないですよね。あ、いえ、今のは忘れてください」',
    106: '「だいたい誰かの買い物に付き合ってるかなあ。……え、わたし自身の予定? ……えっと、あれ、なんだろ。……ごめん、わたしの話なんて、いいよいいよ!」',
    107: '「……家おるよ。音楽と、本。それだけやけど、まあ、悪くない」',
    108: '「週末はギャラリー行ったり、友達とブランチしたり? ……actually、なにもしない日曜日って、ちょっとだけ長いんだよね。あ、なんでもない」',
    109: '「わたし? みんなと遊んでるよ〜! カフェ行ったり、買い物したり! ……一人の日? 一人の日は〜……なにしてるんだろ? あはは、なんだろうね〜!」',
    110: '「さあ。知らない方がいいこともあるよ。……ふふ、冗談。普通だよ、本を読んで、お茶を淹れて。……案外ね」',
  };
  const HEROINE_HOLIDAY_FALLBACK = '「うーん、普通に過ごしてるかな」';

  // ── 架空アニメ話題『花冷えのアンサンブル』（SIT_ANIME で使用・docs/topic-content-spec.md C-1確定稿）──
  // 立ち上げ（友達またはナレが振る）
  const ANIME_TOPIC_INTRO = '「そういえばさ、『花冷えのアンサンブル』って観た?いま流行ってるじゃん」';
  // 段0=視聴スタンス（回し用と共用）。視聴済み8人／未視聴2人（104ゆうき・105りな）。
  // 未視聴も含めてスタンスそのものが性格開示
  const ANIME_STANCE_LINES = {
    101: '「……観ていました。原作の小説の方も、その、とても良くて」',
    102: '「てかそれ、うち十一話でガチ泣きして化粧全部持ってかれたやつ!泣けるって分かってて観るの、うけるよね」',
    103: '「あれって、音の話に見えて、消えるものの話でしょ。わたしは周波数合ってたよ、たぶん」',
    104: '「あー、後輩らが観ろ観ろうるさいやつやろ?うち、アニメ観る暇あったら寝るわ」',
    105: '「すみません、まだ観てなくて。テストが終わったら観るって決めてるんです、リストには入れてて」',
    106: '「観たよ、友達がどうしてもって言うから一緒に!みんなぼろぼろ泣いてて、ハンカチ二枚貸したもん」',
    107: '「……ああ、あれは観た。悪くなかった」',
    108: '「『絶対泣ける』って言われると、逆に構えちゃうタイプなの。……で、actually、普通に泣いた」',
    109: '「観たよ〜、十一話やばかったよね!タイムラインもみんな泣いてた!」',
    110: '「ああ、みんなが泣いたっていうあれね。よくできてるよ、ちゃんと泣かせに来てるもの」',
  };
  // 回し用の汎用つなぎ（横・ノリ。全員がスタンスを言い終えたあとに使う）
  const ANIME_KAWASHI_LINES = [
    '「分かる、十一話は反則」',
    '「観てない組、置いてかれてるんだけど!」',
    '「主題歌、最近どこ行っても流れてるよね」',
  ];
  // 未視聴組（回し用つなぎの話者に選ばない=「視聴済みの任意ヒロインまたは友達」）
  const ANIME_UNWATCHED_IDS = [104, 105];

  /**
   * 現在のフェーズに対応するシチュエーションを選択して返す。
   *
   * @param {number} phase
   * @param {object} state
   * @param {Array}  partyChars
   * @param {Array}  heroineChars
   * @returns {object} シチュエーション定義（generateDialogulesを実行済み）
   */
  function select(phase, state, partyChars, heroineChars) {
    // 1. フェーズでフィルタ（単一phase指定 or conditions.phaseMin/phaseMax の範囲指定）
    let pool = SITUATION_DEFS.filter(s => _matchesPhase(s, phase));

    // 2. 必須シチュエーション優先（mandatory）
    const mandatory = pool.find(s => s.mandatory && !_alreadyUsed(s.id, state));
    if (mandatory) return _resolve(mandatory, state, partyChars, heroineChars);

    // 3. 出現条件でフィルタ
    const eligible = pool.filter(s =>
      !s.mandatory && _meetsConditions(s, state, partyChars)
    );
    const candidates = eligible.length > 0 ? eligible : pool.filter(s => !s.mandatory);

    // 4. 直近重複回避
    const recent = state.recentSituations || [];
    const deduped = candidates.filter(s => !recent.includes(s.id));
    const finalPool = deduped.length > 0 ? deduped : candidates;

    // 5. 重み付きランダム
    const chosen = _weightedRandom(finalPool, state, partyChars);
    return chosen ? _resolve(chosen, state, partyChars, heroineChars) : null;
  }

  // ── private ──────────────────────────────────────

  function _matchesPhase(def, phase) {
    const c = def.conditions || {};
    if (c.phaseMin !== undefined || c.phaseMax !== undefined) {
      if (c.phaseMin !== undefined && phase < c.phaseMin) return false;
      if (c.phaseMax !== undefined && phase > c.phaseMax) return false;
      return true;
    }
    return def.phase === phase;
  }

  function _resolve(def, state, partyChars, heroineChars) {
    return {
      ...def,
      dialogues: def.generateDialogues(state, partyChars, heroineChars),
    };
  }

  function _meetsConditions(def, state, partyChars) {
    const c = def.conditions || {};

    if (c.airMin  !== undefined && state.airGauge < c.airMin)  return false;
    if (c.airMax  !== undefined && state.airGauge > c.airMax)  return false;
    if (c.targetHeartMin !== undefined) {
      const th = state.targetHeroine ? (state.hearts[state.targetHeroine.id] || 0) : 0;
      if (th < c.targetHeartMin) return false;
    }
    if (c.friendHeartMin !== undefined) {
      if (!_anyFriendHeartAbove(state, c.friendHeartMin)) return false;
    }
    if (c.requireTraits) {
      // OR条件: 指定traitのいずれかを持つ友達がいるか
      const hasAny = partyChars.some(fr =>
        !state.twoWorld[fr.id] &&
        (fr.traits || []).some(t => c.requireTraits.some(req => t.includes(req)))
      );
      if (!hasAny) return false;
    }
    if (c.oncePerGame) {
      if (_alreadyUsed(def.id, state)) return false;
    }
    return true;
  }

  function _alreadyUsed(id, state) {
    return (state.usedSituations || []).includes(id);
  }

  function _anyFriendHeartAbove(state, threshold) {
    const fh = state.friendHearts || {};
    for (const fid of Object.keys(fh)) {
      const hearts = fh[fid] || {};
      for (const hid of Object.keys(hearts)) {
        if ((hearts[hid] || 0) >= threshold) return true;
      }
    }
    return false;
  }

  function _weightedRandom(pool, state, partyChars) {
    if (!pool.length) return null;
    const weights = pool.map(s => _calcWeight(s, state, partyChars));
    const total   = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  function _calcWeight(def, state, partyChars) {
    let w = def.weight || 1.0;
    const fh = state.friendHearts || {};

    // 友達状態による重み上昇
    if (def.id === 'SIT_201' || def.id === 'SIT_304') {
      if (_anyFriendHeartAbove(state, 40)) w *= 3.0;
    }
    if (def.id === 'SIT_202' || def.id === 'SIT_305') {
      if (_anyFriendHeartAbove(state, 60)) w *= 5.0;
    }
    if (def.id === 'SIT_204') {
      const hasCulprit = partyChars.some(c =>
        !state.twoWorld[c.id] &&
        (c.traits || []).some(t => t.includes('学歴厨') || t.includes('暴走'))
      );
      if (hasCulprit) w *= 2.0;
    }
    if (def.id === 'SIT_102') {
      if (state.airGauge <= 40) w *= 3.0;
    }
    if (def.id === 'SIT_203') {
      if (state.airGauge >= 65) w *= 2.0;
    }

    return w;
  }

  function _mostObsessedFriend(state, partyChars, heroineChars) {
    let best = null, bestVal = -1;
    partyChars.forEach(friend => {
      if (state.twoWorld[friend.id]) return;
      const hearts = (state.friendHearts[friend.id] || {});
      heroineChars.forEach(h => {
        const v = hearts[h.id] || 0;
        if (v > bestVal) {
          bestVal = v;
          best = { friend, heroine: h };
        }
      });
    });
    return best;
  }

  // ── public API ───────────────────────────────────
  // TOPIC_LINES: 確定稿テーブルへの読み取り参照（thread.js のスレッド段生成で流用）
  return {
    select, HEROINE_INTRO_LINES,
    TOPIC_LINES: {
      FRIEND_TALE_LINES, FRIEND_TALE_FALLBACK, TALE_REACTION_LINES,
      HEROINE_HOLIDAY_LINES, HEROINE_HOLIDAY_FALLBACK,
      ANIME_TOPIC_INTRO, ANIME_STANCE_LINES, ANIME_KAWASHI_LINES, ANIME_UNWATCHED_IDS,
    },
  };

})();
