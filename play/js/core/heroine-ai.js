// ═══════════════════════════════════════════════════
// js/core/heroine-ai.js — ヒロインの内部状態と自律行動（純粋ロジック）
// 依存: なし（DOM操作なし）
//
// 仕様: docs/heroine-agent-spec.md §2-2（S1: engagement骨格 / S4: trait能動行動）
// friend-ai.js と対のモジュール。ヒロインを「的」から「エージェント」へ。
//   - engagement(0-100): いま会話に乗っているか。関わられないと冷え、
//     話題に関わると温まる
//   - trait行動: 惚れっぽい=放置すると友達に流れる(取り合いに直結)、
//     暴走しやすい=退屈すると自分から話題を投げ込む、
//     静観しやすい=冷えにくい(受け身だが根気がある)
// STATE は破壊せず、差分(deltas)とログを返して呼び出し側が適用する。
// 数値は仮置き(バランス確定はユーザーとテストプレイ時)。
// ═══════════════════════════════════════════════════

const HeroineAI = (() => {

  // ── engagement 定数（仮置き）─────────────────────
  const ENGAGE_INIT          = 55;   // 開始値
  const ENGAGE_DECAY         = 8;    // 関わられなかったターンの冷え
  const ENGAGE_DECAY_QUIET   = 4;    // 静観しやすい子はゆっくり冷える
  const ENGAGE_GAIN_INVOLVED = 14;   // 話題に関わったターンの回復
  const ENGAGE_LOW           = 30;   // 「冷えている」閾値(バッジくすみ・trait行動の発火線)
  const FLOW_PUSH            = 4;    // 惚れっぽい: 友達に流れるfriendHeart加算
  const BOUNCE_GAIN          = 18;   // 暴走しやすい: 自分から話題を投げた回復
  const BOUNCE_AIR           = 2;    // 同上の空気ボーナス

  // ── ヘルパー ──────────────────────────────────────
  function _sn(name) {
    const p = (name || '').split(/[\s　]+/);
    return p[p.length - 1] || name;
  }
  function _clamp(v) { return Math.max(0, Math.min(100, v)); }
  function _hasTrait(h, keyword) {
    return (h.traits || []).some(t => t.includes(keyword));
  }
  function _gone(state, heroineId) {
    if (state.stolenHeroineId === heroineId) return true;
    return Object.values(state.twoWorld || {}).includes(heroineId);
  }

  /**
   * engagement の初期マップを作る（STATE構築時に呼ぶ）。
   */
  function initEngagement(heroineChars) {
    const map = {};
    (heroineChars || []).forEach(h => { map[h.id] = ENGAGE_INIT; });
    return map;
  }

  /**
   * 毎ターン頭に呼ぶ（Phase1以降）。engagement を更新し、trait行動の差分を返す。
   * @param {object} state        engagement / friendTargets / friendHearts / twoWorld 等
   * @param {Array}  partyChars
   * @param {Array}  heroineChars
   * @param {Array}  involvedIds  前のターンに話題へ関わったヒロインid（発話者・相槌の宛先）
   * @returns {{ engagement, friendHeartDeltas, airDelta, logs }}
   */
  function tick(state, partyChars, heroineChars, involvedIds) {
    const prev = state.engagement || {};
    const engagement = {};
    const friendHeartDeltas = {};   // { friendId: { heroineId: delta } }
    const logs = [];
    let airDelta = 0;

    heroineChars.forEach(h => {
      const cur = prev[h.id] != null ? prev[h.id] : ENGAGE_INIT;
      if (_gone(state, h.id)) { engagement[h.id] = cur; return; }

      const involved = (involvedIds || []).includes(h.id);
      const decay    = _hasTrait(h, '静観') ? ENGAGE_DECAY_QUIET : ENGAGE_DECAY;
      let next       = _clamp(involved ? cur + ENGAGE_GAIN_INVOLVED : cur - decay);

      // ── trait能動行動（冷えたときだけ発火）──────────
      if (!involved && next < ENGAGE_LOW) {
        if (_hasTrait(h, '惚れっぽい')) {
          // 放置された惚れっぽい子は、自分に来ている友達へ流れる（取り合いに直結）
          const fid = _friendCourting(state, partyChars, h.id);
          if (fid != null) {
            if (!friendHeartDeltas[fid]) friendHeartDeltas[fid] = {};
            friendHeartDeltas[fid][h.id] = (friendHeartDeltas[fid][h.id] || 0) + FLOW_PUSH;
            const f = partyChars.find(c => c.id === fid);
            logs.push(`${_sn(h.name)}が${_sn(f ? f.name : '友達')}の話に相槌を打ち始めた…`);
            next = _clamp(next + 6);   // 友達に構われて少し温まる
          }
        }
        else if (_hasTrait(h, '暴走')) {
          // 退屈した暴走タイプは自分から話題を投げ込む
          airDelta += BOUNCE_AIR;
          next = _clamp(next + BOUNCE_GAIN);
          logs.push(`${_sn(h.name)}「ねえねえ、聞いてよ！」と話題を投げ込んだ`);
        }
      }

      engagement[h.id] = next;
    });

    return { engagement, friendHeartDeltas, airDelta, logs };
  }

  // ── 相槌への返し（2026-07-12 バイブル10冊再読の上で執筆）─────
  // プレイヤーの相槌(共感/ノリ/深掘り成功)に、その場でヒロインが一言返す。
  // 「自分のセリフで会話が終わる」のを塞ぐ最小ビート。禁止リスト遵守
  // (感情の直接申告なし・弱音を言い切らない・社交辞令なし等)。
  const REACTION_LINES = {
    101: { kyokan: '「……ですよね。あ、いえ、その……はい」',
           nori:   '「ふふ……」（半拍遅れて、でも今度はちゃんと笑った）',
           fukagori: '「……よく、聞いてますね。……少しだけ、続きを」' },
    102: { kyokan: '「え、わかる? わかるよね!? やっぱそうじゃん!」',
           nori:   '「でしょ〜! てかノリいいじゃん、見直したわ」',
           fukagori: '「……真顔で聞くじゃん、そういうの。ま、まあ? 話してもいいけど?」' },
    103: { kyokan: '「……あなた、今の、ちゃんと受信したんだ。ふうん」',
           nori:   '「ふふ。今、ちょっと周波数合ったかも。たぶん」',
           fukagori: '「……続き、聞きたいの? 珍しい人。いいよ」' },
    104: { kyokan: '「お、話わかるやん。アンタええ耳しとるわ」',
           nori:   '「あはは! ノリええなあ、アンタ。よし、飲も」',
           fukagori: '「……真面目な顔して聞くやん。しゃーないな、ちょっとだけやで」' },
    105: { kyokan: '「……そう言ってもらえると、その、間違ってなかったのかなって」',
           nori:   '「ふふっ……あ、ごめんなさい、普通に笑っちゃいました」',
           fukagori: '「え、続き、ですか? ……変じゃないなら、話しますけど」' },
    106: { kyokan: '「え、ほんとに? 気をつかってない? ……ふふ、ならよかった」',
           nori:   '「あはは、なにそれ〜。……あ、いま、わたし普通に笑ってたね」',
           fukagori: '「わたしの話、聞きたいの? ……えっと、じゃあ、ちょっとだけ」' },
    107: { kyokan: '「……お。話、通じるやん」',
           nori:   '「……ふっ。……今のは、まあ、おもろかった」',
           fukagori: '「……なんで、そこ聞くん。……別に、ええけど」' },
    108: { kyokan: '「え、わかってくれるの? ……なんか、ちょっと意外。いい意味でね」',
           nori:   '「あはは! ね、あなた面白いじゃん。気に入った、かも」',
           fukagori: '「……そこ、聞いてくるんだ。えっと……じゃあ、少しだけ、ね」' },
    109: { kyokan: '「わかる〜! ……あ、今の、ほんとに『わかる』って思って言ったやつ」',
           nori:   '「あはは! なにそれ〜! ……ふふ、今の、楽しかったかも」',
           fukagori: '「え、まだ聞くの? ……えへへ、ちゃんと聞かれるの、変な感じ」' },
    110: { kyokan: '「……ふうん。君、思ってるよりちゃんと聞いてるんだね」',
           nori:   '「ふふ。若い子のノリ、案外きらいじゃないよ」',
           fukagori: '「踏み込むね、君。……いいよ、少しだけ」' },
  };

  /**
   * 相槌への返しを返す（無ければ null）。
   * @param {number} heroineId
   * @param {string} type  kyokan | nori | fukagori
   */
  function pickReaction(heroineId, type) {
    const t = REACTION_LINES[heroineId];
    return (t && t[type]) || null;
  }

  // ── 【二人の温度】本音一行（docs/topic-content-spec.md D節確定稿）─────
  // 二人チェイン4連鎖の頂点=周りの声が遠くなった瞬間に、その子が漏らす一言。
  // バイブルの傷に対応するが核心は気配のみ。D表の「演出・計器」列は
  // セリフではなく将来の演出指示メモなので実装しない。
  const FUTARI_APEX_LINES = {
    101: '「……変ですね。今、この席にだけ、私がいる気がします」',
    102: '「……ね、気づいてた?うち、さっきから一回も回してない」',
    103: '「……周りが遠くなるの自体は、慣れてるんだけどな。二人で遠いのは、初めてかも」',
    104: '「……アンタ、ずるいわ。うちに何もさせへんまま、こんなとこまで連れてきて」',
    105: '「これ、正解とかないんですね。……なんだ、ないんだ」',
    106: '「あのね、わたしね——……あ、ほんとに聞いてくれるんだ、わたしの話」',
    107: '「……今日、うち、一回も顔つくってへんわ。楽やな、なんか」',
    108: '「あなたって、わたしに『すごい』とか言わないよね。……それ、やめないでね」',
    109: '「……あれ、いまの。笑おうと思う前に、笑ってた、わたし」',
    110: '「……参ったな。君相手だと、次に言うことを決める前に、口が動く」',
  };

  /**
   * 【二人の温度】頂点の本音一行を返す（未定義idは null=呼び出し側が共通仮テキストへ）。
   * @param {number} heroineId
   */
  function pickApexLine(heroineId) {
    return FUTARI_APEX_LINES[heroineId] || null;
  }

  /**
   * engagement 値を質的レベルに変換（表示用。生数値は出さない=憲法準拠）。
   * @returns {'low'|'mid'|'high'}
   */
  function level(v) {
    if (v == null) return 'mid';
    return v < ENGAGE_LOW ? 'low' : v < 60 ? 'mid' : 'high';
  }

  /**
   * いちばん冷えているヒロインを返す（S5「話を振る」の宛先）。
   * 冷えている子(low)がいなければ null。
   */
  function coldest(state, heroineChars) {
    let best = null, bestVal = Infinity;
    (heroineChars || []).forEach(h => {
      if (_gone(state, h.id)) return;
      const v = (state.engagement || {})[h.id];
      const val = v != null ? v : ENGAGE_INIT;
      if (val < ENGAGE_LOW && val < bestVal) { bestVal = val; best = h; }
    });
    return best;
  }

  // 彼女を狙っている友達（2人の世界でない）のうちfriendHeart最大の1人
  function _friendCourting(state, partyChars, heroineId) {
    let best = null, bestVal = -1;
    (partyChars || []).forEach(c => {
      if ((state.twoWorld || {})[c.id]) return;
      if ((state.friendTargets || {})[c.id] !== heroineId) return;
      const v = ((state.friendHearts || {})[c.id] || {})[heroineId] || 0;
      if (v > bestVal) { bestVal = v; best = c.id; }
    });
    return best;
  }


  // ═══════════════════════════════════════════════════
  // 【意図】ヒロインが「いま何を待っているか」を毎ターン1つだけ出す（2026-09-22）
  //
  // なぜ入れたか: 手札を豪華にしても、相手側に読むものが無いと
  // 「たぶんこれかな」しか起きない。スレスパで見ているのは手札ではなく
  // 敵の予告で、手札はその答えを実行する動詞でしかない。
  // ヒロインに手札を持たせる必要はない。「いま何を待っているか」が
  // 見えれば、札を選ぶ理由が「強いから」→「今あの子がそれを待っているから」に変わる。
  //
  // 飾りにしないための条件: 予告は必ず効果倍率に接続する（kotodama.js _intentMult）。
  // 表示だけの予告は嘘なので置かない。
  //
  //   kiki  前のめり   … 深掘り・ネタが伸びる。ノリと話題変えは滑る
  //   akita 飽きてきた … ノリ・話題変えが伸びる。深掘りは重い
  //   yoso  よそ見     … 何を出しても薄い。話を振って引き戻すのが正解
  //   matte 待ってる   … 連絡先の窓。ここでしか本当には通らない
  // ═══════════════════════════════════════════════════
  const INTENT_FACE = {
    kiki:  { mark: '▲', label: '聞きたそう',   tone: 'hot'  },
    akita: { mark: '…', label: '飽きてきた',   tone: 'cool' },
    yoso:  { mark: '↗', label: 'よそ見',       tone: 'away' },
    matte: { mark: '♥', label: '待ってる',     tone: 'open' },
  };

  // 手の種類 → 倍率。ここが「予告を読む意味」そのもの。
  const INTENT_MULT = {
    kiki:  { kyokan: 1.30, nori: 0.80, fukagori: 1.70, change: 0.50, nomiyo: 0.85, renraku: 0.70, neta: 1.55 },
    akita: { kyokan: 0.55, nori: 1.70, fukagori: 0.40, change: 1.75, nomiyo: 1.35, renraku: 0.45, neta: 1.05 },
    // よそ見は「あなたへの注意が切れている」状態。名指しの手(共感/深掘り/連絡先)は通らないが、
    // 卓ごと引き戻す手(ノリ/飲もうぜ/話題変え)はむしろここで効く＝立て直しの札になる
    yoso:  { kyokan: 0.45, nori: 1.25, fukagori: 0.35, change: 1.15, nomiyo: 1.35, renraku: 0.25, neta: 0.50 },
    matte: { kyokan: 1.20, nori: 1.00, fukagori: 1.30, change: 0.60, nomiyo: 1.00, renraku: 1.60, neta: 1.20 },
  };

  // 予告の分布は「偶然当たる率」を決める。kiki に寄りすぎると
  // 「とりあえず共感か深掘り」で半分当たってしまい、読む意味が薄れる。
  // 4種がなるべく均されるように線を引く（実測: tools/tune_intent.js）。
  const INTENT_MATTE_HEART = 42;   // 「待ってる」に入る好感度の線
  const INTENT_MATTE_ENG   = 55;   // 同・engagement の線
  const INTENT_AWAY        = 40;   // これ未満は「よそ見」
  const INTENT_HOT         = 58;   // ここから上が前のめり
  // これ以下は「外した」扱い＝ただ減るのではなく、流れが切れる（読まない打ち手への罰）
  const INTENT_MISS        = 0.6;

  /**
   * ヒロイン1人の、このターンの意図。
   * engagement を土台に、traitで色をつける（同じ温度でも子によって待っているものが違う）。
   * @returns {'kiki'|'akita'|'yoso'|'matte'|null}  null = もう卓にいない
   */
  function intent(h, state, opts) {
    if (!h || _gone(state, h.id)) return null;
    const eng    = (state.engagement || {})[h.id];
    const e      = eng != null ? eng : ENGAGE_INIT;
    const heart  = (state.hearts || {})[h.id] || 0;
    const air    = state.airGauge != null ? state.airGauge : 50;
    const isTgt  = (state.targetHeroine || {}).id === h.id;
    const phase  = state.phase || 0;

    // 連絡先の窓は「狙っている子が、十分温まって、こっちを見ている」ときだけ開く
    if (isTgt && phase >= 2 && heart >= INTENT_MATTE_HEART && e >= INTENT_MATTE_ENG) return 'matte';

    if (e < INTENT_AWAY) return 'yoso';

    if (e < INTENT_HOT) {
      // 静観しやすい子は、冷めていても聞く姿勢のまま
      return _hasTrait(h, '静観') ? 'kiki' : 'akita';
    }

    // 暴走しやすい子は、温まっていても場が重いと飽きる
    if (_hasTrait(h, '暴走') && air < 45) return 'akita';
    return 'kiki';
  }

  /**
   * 卓全員ぶん。ターン頭に1回呼び、STATE.intents に保存して1ターン固定する。
   */
  function intents(state, heroineChars) {
    const map = {};
    (heroineChars || []).forEach(h => {
      const v = intent(h, state);
      if (v) map[h.id] = v;
    });
    return map;
  }

  /**
   * その型の札が「どの予告に答える札か」。INTENT_MULT の一番高い行を選ぶだけ＝
   * 表示と効果が必ず一致する（表と裏で違う話をしない）。
   * よそ見に答える札は無い＝答えは「話を振る」。
   */
  function answersOf(type) {
    let best = null, bestV = 1.0;
    Object.keys(INTENT_MULT).forEach(id => {
      const v = INTENT_MULT[id][type];
      if (v != null && v > bestV) { bestV = v; best = id; }
    });
    return best;
  }

  /** 表示用（記号・短い言葉・色の種類）。生数値は出さない。 */
  function intentFace(id) { return INTENT_FACE[id] || null; }

  /** 手の種類に対する倍率。未知の組み合わせは 1.0（＝何も起きない）。 */
  function intentMult(intentId, type) {
    const row = INTENT_MULT[intentId];
    if (!row) return 1.0;
    const m = row[type];
    return m != null ? m : 1.0;
  }


  // ═══════════════════════════════════════════════════
  // 【領域外の話題】その子の守備範囲じゃない話を振られたとき（2026-09-23）
  //
  // 話題23種 × 10人ぶんの専用セリフは書かない（230本になって破綻する）。
  // 専用は「その子の領域」にだけ置き、領域外はここで共通に受ける。
  // ただし共通を1本にすると全員が同じ顔になるので、2軸で3段階に割る。
  //
  //   付き合い度 = ♥ × 0.6 + 空気 × 0.4
  //     乗る(norm) 知らないと言った上で聞く。知ってるフリはさせない＝嘘になる
  //     流す(pass) 声は返るが、手は別のことをしている＝社交辞令の正体
  //     切る(cut)  セリフなし。仕草だけ
  //
  // 仕草の規律（3つ）:
  //   1. 動作は1つ。重ねない
  //   2. 感情を書かない。「つまらなそうに」はナレーターの評価＝間接情報。
  //      見えたものだけ書く
  //   3. 話題に触れない。どの話題の後でも成立する
  //
  // 切り方はその子らしさで痛みが変わる。ゆうきは皿を重ね、みほは店員を呼ぶ＝
  // 「場のために動く」形で逃げるので無視にならない。しおり(空気85)の
  // 「見たまま何も言わない」が一番きつい＝わざとだから。
  // ═══════════════════════════════════════════════════
  const OOA_WARM = 50;   // これ以上で「乗る」
  const OOA_COOL = 40;   // これ以上で「流す」、未満は「切る」

  // 「流す」「切る」は同じ夜に何度も出るので2つずつ持つ（ターンで交互）。
  // 同じ仕草が連続すると、その瞬間に台本に見える。
  const OUT_OF_AREA = {
    101: { norm:[{ say:'「……知らないです。えっと、どういう」' }],
           pass:[{ say:'「……はい」', act:'グラスの水滴を指でなぞっている。' },
                 { say:'「……ええ」', act:'メニューの角を揃えた。' }],
           cut: [{ act:'おしぼりを畳み直している。三回目だ。' },
                 { act:'膝の上で、スカートの皺を伸ばしている。' }] },
    102: { norm:[{ say:'「え、なにそれ。知らないんだけど」' }],
           pass:[{ say:'「うんうん」', act:'三回うなずいて、髪を結び直した。' },
                 { say:'「そうなんだ」', act:'氷を噛んだ。' }],
           cut: [{ say:'「あー、はいはい」', act:'言いながら、もう隣を向いている。' },
                 { act:'前髪を直して、鏡を閉じた。' }] },
    103: { norm:[{ say:'「……いまの、まだ途中だよね？」' }],
           pass:[{ say:'「ふーん」', act:'それきり、ストローで氷を沈めている。' },
                 { say:'「うん」', act:'おしぼりの袋を指で潰している。' }],
           cut: [{ act:'天井の照明をずっと見ている。' },
                 { act:'同じところを、もう一度ストローでかき混ぜた。' }] },
    104: { norm:[{ say:'「なんやそれ、知らん。教えて」' }],
           pass:[{ say:'「ええやん」', act:'ジョッキの持ち手を回した。' },
                 { say:'「ほんまに」', act:'箸置きの向きを直した。' }],
           cut: [{ act:'空いた皿を重ね始めた。' },
                 { act:'端の席まで身を乗り出して、注文を確認している。' }] },
    105: { norm:[{ say:'「知らないです。……それ、どこで覚えるんですか」' }],
           pass:[{ say:'「そうなんですね」', act:'コースターの角を折った。' },
                 { say:'「はい」', act:'おしぼりを三角に畳んだ。' }],
           cut: [{ act:'背筋を伸ばしたまま、時計を見た。' },
                 { act:'メニューを開いて、また閉じた。' }] },
    106: { norm:[{ say:'「わかんないけど、聞きたい。続けて」' }],
           pass:[{ say:'「うん、うん」', act:'頷きながら、誰かの取り皿を替えた。' },
                 { say:'「へえ」', act:'空いたグラスを端に寄せた。' }],
           cut: [{ act:'店員を呼んだ。注文はまだ決まっていない。' },
                 { act:'取り分け用の箸を、新しいのに替えた。' }] },
    107: { norm:[{ say:'「……知らない。でも聞くだけ聞く」' }],
           pass:[{ say:'「へえ」', act:'それきり、おしぼりで手を拭いた。' },
                 { say:'「ふうん」', act:'レモンを沈めた。' }],
           cut: [{ act:'何も言わずにスマホを裏返して、また置いた。' },
                 { act:'椅子を引いて、座り直した。' }] },
    108: { norm:[{ say:'「待って、それ日本の話？　全然わかんない」' }],
           pass:[{ say:'「なるほどね」', act:'言って、ピアスを触った。' },
                 { say:'「そうなんだ」', act:'爪の先を見た。' }],
           cut: [{ act:'髪を耳にかけて、グラスの縁を拭った。' },
                 { act:'口紅を塗り直している。' }] },
    109: { norm:[{ say:'「えー、なにそれ聞きたい。なんで？」' }],
           pass:[{ say:'「そうなんだぁ」', act:'伸ばして、毛先を指に巻き直した。' },
                 { say:'「へえー」', act:'ストローの袋を結んでいる。' }],
           cut: [{ act:'自撮りの角度を探し始めた。' },
                 { act:'写真フォルダをさかのぼっている。' }] },
    110: { norm:[{ say:'「知らない話は好きだよ。続けて」' }],
           pass:[{ act:'少し笑って、グラスを持ち上げただけだった。' },
                 { act:'頬杖をついたまま、まばたきを一度した。' }],
           cut: [{ act:'こちらを見たまま、何も言わなかった。' },
                 { act:'グラスの脚を、指先で回している。' }] },
  };
  // 名簿に無いidが来たときの保険（空セリフを出さないため）
  const OUT_OF_AREA_ANY = {
    norm:[{ say:'「知らない。でも、聞くのは好き」' }],
    pass:[{ say:'「へえ」', act:'グラスの氷を回した。' }],
    cut: [{ act:'手元の伝票を、意味もなく裏返した。' }],
  };

  // 段階ごとの効き方。「流す」は無風ではなく、静かに離れていく＝
  // 次のターンの予告が「よそ見」に寄る。因果が見えるようにする。
  const OUT_OF_AREA_FX = {
    norm: { air:  2, heart:  2, engage:   0 },
    pass: { air:  0, heart:  0, engage:  -6 },
    cut:  { air: -6, heart: -2, engage: -18 },
  };

  /**
   * 領域外の話題を振られたときの反応。
   * @returns {{level:'norm'|'pass'|'cut', say:?string, act:?string, fx:object}}
   */
  function outOfArea(h, state) {
    const heart = ((state && state.hearts) || {})[h && h.id] || 0;
    const air   = (h && h.params && h.params.air != null) ? h.params.air : 50;
    const along = heart * 0.6 + air * 0.4;          // 付き合い度
    const level = along >= OOA_WARM ? 'norm' : along >= OOA_COOL ? 'pass' : 'cut';
    const row   = OUT_OF_AREA[h && h.id] || OUT_OF_AREA_ANY;
    const pool  = row[level] || OUT_OF_AREA_ANY[level];
    // ターンで交互に出す＝同じ仕草が連続しない
    const one   = pool[((state && state.turn) || 0) % pool.length];
    return { level, say: one.say || null, act: one.act || null, fx: OUT_OF_AREA_FX[level] };
  }

  // ── public API ───────────────────────────────────
  return { initEngagement, tick, level, coldest, pickReaction, pickApexLine, ENGAGE_LOW,
           intent, intents, intentFace, intentMult, answersOf, INTENT_MISS,
           outOfArea };

})();
