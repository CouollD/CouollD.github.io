// ═══════════════════════════════════════════════════
// js/core/thread.js — 会話スレッド管理（純粋ロジック）
// 依存: SituationManager.TOPIC_LINES（確定稿テーブルの参照のみ）
//
// 仕様: docs/heroine-agent-spec.md §2-1（S2: 会話スレッド導入）
// situation を毎ターン独立で引く代わりに、対応する話題は
// 「スレッド」として数ターンかけて場を回る。
//   - 共感/ノリ/深掘り（成功）→ スレッド継続（話題が次の話者に回る）
//   - 話題がえ・失敗（result bad）→ スレッド終了
//   - 静観・飲もう・連絡先・友達に向く → スレッドは静かに終わる
// 本文は確定稿（休日の話10人・武勇伝14人）を流用し、新規執筆はしない。
// friend-ai と同じく STATE は破壊せず、新しい thread 値を返して呼び出し側が代入する。
// ═══════════════════════════════════════════════════

const ThreadManager = (() => {

  // スレッドを継続させることだま（それ以外は終了）
  const CONTINUE_TYPES = ['kyokan', 'nori', 'fukagori'];

  // スレッド化できる話題の定義
  // maxSteps は「step0（元situation）を含む」上限。実際は話者の残りで頭打ち。
  const TOPICS = {
    SIT_HOLIDAY: { phaseMax: 2, maxSteps: 4, buildStep: _holidayStep },   // 4=深掘り(縦)と回し(横)が両立できる幅
    SIT_TALE:    { phaseMax: 3, maxSteps: 2, buildStep: _taleStep },
    SIT_104:     { phaseMax: 2, maxSteps: 4, buildStep: _typeStep },      // タイプの話(恋愛の探り合い)
    SIT_ANIME:   { phaseMax: 3, maxSteps: 4, buildStep: _animeStep },     // 4=段0(初回)+段1〜3で同一宛先4発話=チェイン4連鎖の頂点に届く
    SIT_206:     { phaseMax: 3, maxSteps: 3, buildStep: _taleFailStep },  // 失敗談の顛末（縦=深掘り2段まで／横=卓が回る）topic-content-spec.md E節
    SIT_101:     { phaseMax: 2, maxSteps: 4, buildStep: _hobbyStep },     // 趣味4分岐の続き（縦=具体が一段深く／横=乗る）topic-content-spec.md F節
  };

  // ── ヘルパー ──────────────────────────────────────

  // ══════════════════════════════════════════════════
  // 汎用の続き段（2026-09-20）
  //
  // TOPICS に固有の続きを持つのは3件（SIT_101/104/206）だけで、
  // 残り23件は open() が null を返し、1ターン喋って使い捨てになっていた。
  // ＝「会話が続かない」の正体。ここを埋める。
  //
  // 話題固有の本文は書かない（23件×10人は現実的でない）。代わりに
  // 「話題が何であれ成立する続き」＝その子が一歩自分を開く／友達が被せる、
  // で2段持たせる。話題の色は situation.tags（playful/tense/emotional/
  // intimate/chaotic/closing）から取る。
  // ══════════════════════════════════════════════════

  const GENERIC_TOPIC = { phaseMax: 4, maxSteps: 3, buildStep: _genericStep };

  // 段1: プレイヤーの手が届いたあと、その子が「もう一歩」続ける。
  // REACTION_LINES（heroine-ai.js）の直後に来る想定なので、そこと重複しない語り出しにする。
  // 話題には触れない＝どの話題のあとでも成立する。
  const OPEN_ONE_MORE = {
    101: { kyokan:   '「……じゃあ、もう少しだけ。あんまり人に言わないんですけど」',
           nori:     '「あ、笑いました？　……よかった、すべってなくて」',
           fukagori: '「そこまで聞かれると思ってなくて。……えっと、どこからでしたっけ」' },
    102: { kyokan:   '「でしょ？　だからさ、こっからが本題なんだけど」',
           nori:     '「あはは、待って、まだあるんだって。聞いて」',
           fukagori: '「うわ、掘るじゃん。……別にいいけど、引かないでよ」' },
    103: { kyokan:   '「……通じた。じゃあ、もうちょっと電波飛ばしてもいい？」',
           nori:     '「ふふ。笑うところ合ってる。珍しいね、合う人」',
           fukagori: '「そこ掘るんだ。……掘っても何も出ないよ。たぶんね」' },
    104: { kyokan:   '「せやろ。まだ続きあんねんけどな、これが」',
           nori:     '「あはは、ノリええわアンタ。ほな、もう一個いこか」',
           fukagori: '「……そこまで聞くか。ええわ、話したる。一回だけな」' },
    105: { kyokan:   '「……えっと、じゃあ、もう少し話しても、大丈夫ですか」',
           nori:     '「あ、笑ってもらえた……。すみません、嬉しくて」',
           fukagori: '「そこ、気になりますか。……あんまり上手く説明できないんですけど」' },
    106: { kyokan:   '「ほんと？　……じゃあ、もうちょっとだけ喋っていい？」',
           nori:     '「あはは、ね、面白いでしょ。……あ、自分で言っちゃった」',
           fukagori: '「聞きたいんだ、ほんとに。……珍しいね、そういう人」' },
    107: { kyokan:   '「……ふーん。まあ、続き、あるにはあるけど」',
           nori:     '「……ふっ。調子乗るからやめて」',
           fukagori: '「……なんで聞くん。答えたら、なんかあんの」' },
    108: { kyokan:   '「え、ほんとに？　じゃあ続けるね。止めてって言うまで喋るけど」',
           nori:     '「あはは！　ね、もっかい言っていい？　さっきの」',
           fukagori: '「そこ突っ込むんだ。……ちょっと待って、英語だと言えるんだけどな」' },
    109: { kyokan:   '「ほんま？　じゃあ聞いて聞いて、まだあんねん」',
           nori:     '「あはは！　な？　な？　もっかい言うわ」',
           fukagori: '「えー、そこ？　……なんやろ、急に恥ずかしなってきた」' },
    110: { kyokan:   '「拾うんだ、そこ。……じゃあ、もう少し話そうか」',
           nori:     '「ふふ。君、笑うところが早いね。続けるよ」',
           fukagori: '「踏み込むね。……いいよ、どこまで聞く？」' },
  };

  // 段2: その子（または別の子）がプレイヤーを引き戻す＝会話が一方通行にならない。
  const PULL_IN = {
    101: '「……あの。さっきから、ちゃんと聞いてくれてますよね」',
    102: '「てかさ、あんたはどうなの。聞いてばっかじゃん」',
    103: '「ね、あなたの周波数は？　まだ受信してないんだけど」',
    104: '「で、アンタは？　聞くばっかりはずるいで」',
    105: '「あの……わたしばっかり話してますよね。すみません」',
    106: '「ね、退屈じゃない？　ほんとに？　……ならいいけど」',
    107: '「……で？　そっちの話は」',
    108: '「ずっとわたしのターンじゃない？　交代、交代」',
    109: '「あ、うちばっか喋ってるやん！　ごめん、どうぞ」',
    110: '「……君の番だよ。さっきから、こっちばかり喋らせてる」',
  };

  // 友達の被せ（話題に触れず、場が同じ話を向いたままなのを示す）
  const TAG_FRIEND_CUTIN = {
    playful:   ['「待て待て、俺もそれある」', '「え、続き。続きは」'],
    tense:     ['「……なんか空気変わったな、いま」', '「いいから、そのまま続けてよ」'],
    emotional: ['「……あー、なんかわかるわ」', '「え、もっと聞きたいんだけど」'],
    intimate:  ['「おい、二人で進めんなって」', '「なに、俺だけ置いてかれてる？」'],
    chaotic:   ['「は？　いま何の話してんの」', '「待って、俺完全に見失った」'],
    closing:   ['「もうこんな時間か。……で、さっきの」', '「あと何分？　いや、いい。続けて」'],
  };

  // 段の地の文（話題が「まだ終わっていない」ことだけを伝える）
  const TAG_NARR_HOLD = {
    playful:   'テーブルの笑い声が、まだ同じ方を向いている。',
    tense:     '誰も話題を変えようとしない。まだ、この話の途中だ。',
    emotional: '声のトーンが一段落ちて、それでも続いている。',
    intimate:  '周りの声が、少しだけ遠い。',
    chaotic:   '話が三方向に散らかったまま、まだ終わらない。',
    closing:   '閉店の声が遠くで鳴った。それでも、話は途切れない。',
  };
  const TAG_NARR_CLOSE = {
    playful:   '——ひとしきり笑って、まだ誰も次の話題を出さない。',
    tense:     '——空気が、まだこの話を離さない。',
    emotional: '——短い沈黙。悪くない沈黙だ。',
    intimate:  '——いま、この卓に二人しかいない気がした。',
    chaotic:   '——結局、何の話だったか誰も覚えていない。',
    closing:   '——残り時間のことを、一瞬だけ忘れた。',
  };

  function _tagOf(thread) {
    const tags = thread.tags || [];
    for (const t of tags) if (TAG_NARR_HOLD[t]) return t;
    return 'playful';
  }

  /**
   * 汎用の続き段。
   *   段1: 地の文 → 話していた子が一歩開く → 友達が被せる
   *   段2: その子（居なければ別の子）がプレイヤーを引き戻す → 締めの地の文
   * どちらも話題の中身には触れないので、どの situation の後でも成立する。
   */
  function _genericStep(thread, state, partyChars, heroineChars) {
    const tag  = _tagOf(thread);
    const step = thread.step + 1;

    // 話していた子: 段0で最後に喋った子を優先し、抜けていたら別の子に振る
    const lastId = thread.usedHeroineIds[thread.usedHeroineIds.length - 1];
    let h = heroineChars.find(x => x.id === lastId && !_isGone(state, x.id));
    if (!h) h = heroineChars.find(x => !_isGone(state, x.id));
    if (!h) return null;                       // 卓に誰も残っていない＝話は終わり

    if (step === 1) {
      const line = (OPEN_ONE_MORE[h.id] || {})[thread.lastType]
                || (OPEN_ONE_MORE[h.id] || {}).kyokan;
      if (!line) return null;
      const friend = partyChars.find(c =>
        !thread.usedFriendNames.includes(_sn(c.name)) && !_friendGone(state, c.id));
      const cutins = TAG_FRIEND_CUTIN[tag] || TAG_FRIEND_CUTIN.playful;
      return {
        addHeroineIds:  [h.id],
        addFriendNames: friend ? [_sn(friend.name)] : [],
        deepenId:       thread.lastType === 'fukagori' ? h.id : null,
        situation: {
          id: thread.topicId, tags: thread.tags || [tag], timing: null,
          bonus: { airDelta: 3, heartTo: h.id, heartDelta: 2,
                   text: TAG_NARR_HOLD[tag] },
          dialogues: [
            { type:'heroine', speaker:_sn(h.name), heroineId:h.id, text: line },
            ...(friend ? [{ type:'friend', speaker:_sn(friend.name),
                            text: cutins[thread.step % cutins.length] }] : []),
          ],
        },
      };
    }

    if (step === 2) {
      const line = PULL_IN[h.id];
      if (!line) return null;
      return {
        addHeroineIds:  [h.id],
        addFriendNames: [],
        deepenId:       thread.lastType === 'fukagori' ? h.id : null,
        situation: {
          id: thread.topicId, tags: thread.tags || [tag], timing: null,
          bonus: { airDelta: 2, heartTo: h.id, heartDelta: 2,
                   text: TAG_NARR_CLOSE[tag] },
          dialogues: [
            { type:'heroine', speaker:_sn(h.name), heroineId:h.id, text: line },
          ],
        },
      };
    }

    return null;   // maxSteps で頭打ち
  }


  // ══════════════════════════════════════════════════
  // ネタ札の話題（2026-09-21）
  //
  // プレイヤーがネタ札で振った話題は、シチュ抽選ではなく札から生えている。
  // 食いついた子が「もっと聞かせて」と返してくるのが段1、
  // そこから先は汎用の続き段（その子が一歩開く／引き戻す）に合流する。
  // ＝話題はプレイヤーが決め、続きは相手が引っ張る。
  // ══════════════════════════════════════════════════

  const CARD_PREFIX = 'CARD:';
  const CARD_TOPIC  = { phaseMax: 4, maxSteps: 4, buildStep: _cardTopicStep };

  /**
   * ネタ札が刺さったときに開くスレッド。
   * @param {string} topicId   card-topics.js のキー
   * @param {number} biterId   食いついた子のヒロインid
   * @param {Array}  tags      その札のタグ（続き段の地の文に使う）
   */
  function openCardTopic(topicId, biterId, tags) {
    return {
      topicId:         CARD_PREFIX + topicId,
      cardTopicId:     topicId,
      biterId:         biterId,
      tags:            (tags || []).slice(),
      generic:         false,
      step:            0,
      alive:           true,
      // 食いついた直後は、次のターン頭に「もっと聞かせて」が来る（2026-09-24）。
      // ここを false にしていたため nextStep が即 null を返し、
      // ネタ札の続き段(_cardTopicStep)が一度も発火していなかった＝
      // 話題を振っても必ず1ターンで終わっていた。
      pendingContinue: true,
      usedHeroineIds:  [biterId],
      usedFriendNames: [],
      data:            {},
    };
  }

  function _cardTopicStep(thread, state, partyChars, heroineChars) {
    const CT = (typeof CardTopics !== 'undefined') ? CardTopics : null;
    if (!CT) return null;
    const topic = CT.get(thread.cardTopicId);
    if (!topic) return null;
    const tag  = _tagOf(thread);
    const step = thread.step + 1;

    // 食いついた子が居なくなっていたら、話題は自然に終わる
    const h = heroineChars.find(x => x.id === thread.biterId && !_isGone(state, x.id));
    if (!h) return null;

    if (step === 1) {
      // 段1: 「もっと聞かせて」——相手から質問が返ってくる（会話が続く芯）
      const line = CT.moreLine(topic, h.id);
      if (!line) return null;
      const friend = partyChars.find(c =>
        !thread.usedFriendNames.includes(_sn(c.name)) && !_friendGone(state, c.id));
      return {
        addHeroineIds:  [h.id],
        addFriendNames: friend ? [_sn(friend.name)] : [],
        deepenId:       h.id,
        situation: {
          id: thread.topicId, tags: thread.tags || [tag], timing: null,
          bonus: { airDelta: 3, heartTo: h.id, heartDelta: 3,
                   text: `（${_sn(h.name)}が、もっと聞きたそうにしている）` },
          dialogues: [
            { type:'heroine', speaker:_sn(h.name), heroineId:h.id, text: line },
            ...(friend && topic.friend
              ? [{ type:'friend', speaker:_sn(friend.name), text: topic.friend }] : []),
          ],
        },
      };
    }

    // 段2以降: 汎用の続き段に合流する（話題はもう立っているので自然に読める）
    return _genericStep(
      { ...thread, step: thread.step - 1, usedHeroineIds: [h.id] },
      state, partyChars, heroineChars
    );
  }

  function _sn(name) {
    const p = (name || '').split(/[\s　]+/);
    return p[p.length - 1] || name;
  }
  function _rand(n) { return Math.floor(Math.random() * n); }

  // 2人の世界で離脱済み or 奪われたヒロインは話者に選ばない
  function _isGone(state, heroineId) {
    if (state.stolenHeroineId === heroineId) return true;
    return Object.values(state.twoWorld || {}).includes(heroineId);
  }

  // 2人の世界に入った友達は話者に選ばない
  function _friendGone(state, friendId) {
    return !!(state.twoWorld || {})[friendId];
  }

  /**
   * 選ばれた situation がスレッド化対象なら thread を開く。
   * step0 の話者を dialogues から抽出し、以降の段で重複させない。
   * @returns {object|null} thread = { topicId, step, alive, pendingContinue, usedHeroineIds, usedFriendNames }
   */
  function open(situation) {
    if (!situation) return null;
    // 2026-09-20: TOPICS に固有の続きが無い話題も、汎用の続き段で続けられるようにした。
    // 以前はここで null を返していたため、26話題中23話題が1ターンで使い捨てになっていた。

    const usedHeroineIds = (situation.dialogues || [])
      .filter(d => d.heroineId != null)
      .map(d => d.heroineId);
    const usedFriendNames = (situation.dialogues || [])
      .filter(d => d.type === 'friend' && d.speaker)
      .map(d => d.speaker);

    // data: 話題ごとの追加コンテキスト（例: SIT_101のhobby分岐キー）。
    // 段0のdialogue要素に付いた meta を拾う（表示側は meta を無視するので無害）
    const metaSource = (situation.dialogues || []).find(d => d.meta);
    const data = metaSource ? { ...metaSource.meta } : {};

    return {
      topicId:         situation.id,
      tags:            (situation.tags || []).slice(),   // 汎用続き段が話題の色を引く
      generic:         !TOPICS[situation.id],
      step:            0,
      alive:           true,
      pendingContinue: false,
      usedHeroineIds,
      usedFriendNames,
      data,
    };
  }

  /**
   * プレイヤーの行動後に呼ぶ。継続なら pendingContinue を立てた新 thread、
   * 終了なら null を返す（呼び出し側が STATE.thread に代入）。
   * lastType は次段の形を決める（深掘り=同じ子が一段深く／共感・ノリ=話題が回る）。
   * @param {object|null} thread
   * @param {string} type        ことだまID（kanshi 含む）
   * @param {string} resultType  calcEffect の resultType（'result bad' = 盛り下がり）
   */
  function afterAction(thread, type, resultType) {
    if (!thread || !thread.alive) return null;
    const isBad = (resultType || '').includes('bad');
    if (isBad || !CONTINUE_TYPES.includes(type)) return null;
    return { ...thread, pendingContinue: true, lastType: type };
  }

  /**
   * ターン頭で呼ぶ。継続予約があり次の段が組めるなら
   * { thread, situation } を返す。組めなければ null（スレッド終了）。
   * situation は SituationManager.select と同形（id/tags/timing/dialogues）。
   */
  function nextStep(thread, phase, state, partyChars, heroineChars) {
    if (!thread || !thread.alive || !thread.pendingContinue) return null;

    const topic = thread.cardTopicId
      ? CARD_TOPIC
      : (TOPICS[thread.topicId] || GENERIC_TOPIC);
    if (!topic) return null;
    if (phase > topic.phaseMax) return null;               // フェーズが進みすぎた（終盤の必須ビートを塞がない）
    if (thread.step + 1 >= topic.maxSteps) return null;    // 段数上限

    const built = topic.buildStep(thread, state, partyChars, heroineChars);
    if (!built) return null;                               // 話者が残っていない

    return {
      thread: {
        ...thread,
        step:            thread.step + 1,
        pendingContinue: false,
        usedHeroineIds:  [...thread.usedHeroineIds, ...built.addHeroineIds],
        usedFriendNames: [...thread.usedFriendNames, ...built.addFriendNames],
        deepenedIds:     built.deepenId != null
          ? [...(thread.deepenedIds || []), built.deepenId]
          : (thread.deepenedIds || []),
      },
      situation: built.situation,
    };
  }

  // ── 休日の話・深掘り本文（一段内側。2026-07-12 バイブル10冊再読の上で執筆）──
  // 設計: 確定稿の答えの「気配」を一歩だけ開く。秘密の核心（小説投稿/作った
  // キャラ/夢の記録/裏アカ/投げ出し衝動/譲った過去/尽くしすぎ/余所者感/空洞/
  // 過去の傷）には触れず、各人の禁止リスト（感情の直接申告なし等）を遵守。
  const HOLIDAY_DEPTH_LINES = {
    101: '「どんな本か……聞きます? ……ミステリを。犯人当てより、この人がどうして嘘をついたんだろう、の方が気になって——……すみません、また本の話を」',
    102: '「え、なんで? ……あー、家おるとダメなんよ、うち。静かなの苦手っていうか。……てか何この話! 暗っ! はい解散!」',
    103: '「夢の続きの観方はね、内緒。……あ、いま、ちゃんと最後まで聞いてたでしょ。途中で『要するに』って言わなかったね」',
    104: '「なんでって、後輩ほっとくと碌なことせぇへんからな。……ま、ほんまは頼まれてもないねんけど。癖やねん、こういうの」',
    105: '「資格は、その、就職に有利なので。計画通りに進むと安心するんです。……予定のない休日って、何をすれば正解なんでしょうね。あ、変な質問でしたね。忘れてください」',
    106: '「わたしの予定……そうだ、この前ね、一人で映画観ようとして——結局、友達の探し物に付き合ってたの。あはは。……ね、こういう話、退屈じゃない? ほんとに?」',
    107: '「……音楽は、ライブとかやなくて、家で聴く用。おすすめ? ……教えてもええけど、たぶん地味って言われるやつやで。……聞く?」',
    108: '「長いって言ったの、聞いてたんだ。……えっと、なんて言うんだろ。予定がない日って、どこにいればいいか分かんなくなるの。……あ、やだ、変な話しちゃった。next topic!」',
    109: '「一人の日のこと、まだ聞く〜? えっとね……テレビつけて、消して……あれ、わたし何してたんやろ。……あはは! 何この話、次いこ次!」',
    110: '「『案外』のところ、拾うんだ。……いい趣味してるね。お茶はね、時間が止まるの。それだけ。……君は? 止めたい時間、ある?」',
  };

  // ── 段の生成: 休日の話（深掘り=同じ子が一段深く／それ以外=別の子に回る）──
  function _holidayStep(thread, state, partyChars, heroineChars) {
    // 直前の手が深掘りなら、いま答えた子が一段だけ内側を見せる（縦の連鎖）
    if (thread.lastType === 'fukagori') {
      const deep = _deepStep(thread, state, heroineChars, HOLIDAY_DEPTH_LINES);
      if (deep) return deep;
      // 深掘り本文が使えない（既出・退場等）場合は横の連鎖にフォールバック
    }
    const LINES = SituationManager.TOPIC_LINES;
    const pool = heroineChars.filter(h =>
      !thread.usedHeroineIds.includes(h.id) && !_isGone(state, h.id)
    );
    if (pool.length === 0) return null;
    const h  = pool[_rand(pool.length)];
    const hn = _sn(h.name);

    const friends = partyChars.filter(c => !_friendGone(state, c.id));
    const f = friends.length ? friends[_rand(friends.length)] : null;
    const intro = f
      ? { type:'friend', speaker: _sn(f.name), text:`「${hn}ちゃんは? 休みの日なにしてるの?」` }
      : { type:'narr',   speaker:'',           text:`話題が${hn}にも回っていく。` };

    return {
      addHeroineIds:  [h.id],
      addFriendNames: [],
      situation: {
        id: thread.topicId, tags: ['emotional'], timing: null,
        // S3: 会話が続いた報酬（場が温まり、話題に乗った子の♥が乗る）。
        // 表示は質的表現のみ（憲法: 生数値を出さない）。適用は司令塔側
        bonus: { airDelta: 3, heartTo: h.id, heartDelta: 3 },
        dialogues: [
          intro,
          { type:'heroine', speaker: hn, heroineId: h.id,
            text: LINES.HEROINE_HOLIDAY_LINES[h.id] || LINES.HEROINE_HOLIDAY_FALLBACK },
        ],
      },
    };
  }

  // ── タイプの話・各人の答え（2026-07-12 バイブル10冊再読の上で執筆）──
  // 表の顔の答え＋本音の気配1割。禁止リスト遵守(欲望の直接申告なし・
  // 弱音を言い切らない・自分から誘わない等)。秘密の核心には触れない。
  const TYPE_LINES = {
    101: '「……ちゃんと、話を聞いてくれる人、でしょうか。……ありきたりですみません」',
    102: '「タイプ? 楽しい人! 以上! ……え、それだけって顔しないでよ、うける」',
    103: '「タイプかあ。……話の着地点まで、いっしょに歩いてくれる人。地図がなくても」',
    104: '「うちに気ぃ遣わんでええ人かな。……あー、でも、そんなん会うたことないわ。あはは」',
    105: '「……間違えたときに、怒らない人、ですかね。あ、えっと、優しい人ってことです」',
    106: '「えー、わたし? ……その、選んでくれる人、って言ったら変かな。……あはは、なんでもない!」',
    107: '「……嘘つかへん人。それだけ。ハードル低いやろ? ……これが案外おらんねん」',
    108: '「みんな『外国の人っぽいのがタイプでしょ』って言うんだけど……普通に、気取らないでいられる人、かな」',
    109: '「タイプ〜? んー、優しくて、面白くて、頼りになる人! ……って、これ、みんなに同じこと言ってるかも。あはは!」',
    110: '「さあ、どうだろうね。……強いて言うなら、わたしを見透かそうとしない人。……ふふ、冗談」',
  };

  // ── 段の生成: 深掘りへの返答（同じ子が一段内側を見せる・話題共通）──
  function _deepStep(thread, state, heroineChars, linesTable, tags) {
    const lastId = thread.usedHeroineIds[thread.usedHeroineIds.length - 1];
    if (lastId == null) return null;
    if ((thread.deepenedIds || []).includes(lastId)) return null;   // 深掘りは1人1回
    if (_isGone(state, lastId)) return null;
    const h = heroineChars.find(x => x.id === lastId);
    const line = linesTable[lastId];
    if (!h || !line) return null;

    return {
      addHeroineIds:  [],           // 話者は変わらない（used二重登録しない）
      addFriendNames: [],
      deepenId:       lastId,
      situation: {
        id: thread.topicId, tags: tags || ['emotional', 'intimate'], timing: null,
        // 深掘りが刺さった報酬は♥寄り（数値は仮置き・質的表現で表示）
        bonus: { airDelta: 2, heartTo: lastId, heartDelta: 5,
                 text: '（話が、少しだけ深いところに触れた）' },
        dialogues: [
          { type:'heroine', speaker: _sn(h.name), heroineId: lastId, text: line },
        ],
      },
    };
  }

  // ── 段の生成: タイプの話（深掘り=その子の本当の答え／回し=別の子に聞く）──
  // 深掘りと回しの両方で TYPE_LINES を使う。回しで答えた子はその場で
  // 具体的な答えを出し切るので deepenedIds にも記録する（深掘りの二重出し防止）
  function _typeStep(thread, state, partyChars, heroineChars) {
    if (thread.lastType === 'fukagori') {
      const deep = _deepStep(thread, state, heroineChars, TYPE_LINES, ['emotional', 'intimate']);
      if (deep) return deep;
    }
    const pool = heroineChars.filter(h =>
      !thread.usedHeroineIds.includes(h.id) && !_isGone(state, h.id) && TYPE_LINES[h.id]
    );
    if (pool.length === 0) return null;
    const h  = pool[_rand(pool.length)];
    const hn = _sn(h.name);

    const friends = partyChars.filter(c => !_friendGone(state, c.id));
    const f = friends.length ? friends[_rand(friends.length)] : null;
    const intro = f
      ? { type:'friend', speaker: _sn(f.name), text:`「${hn}ちゃんは、どんな人がタイプなの?」` }
      : { type:'narr',   speaker:'',           text:`タイプの話が${hn}にも回っていく。` };

    return {
      addHeroineIds:  [h.id],
      addFriendNames: [],
      deepenId:       h.id,   // 具体的な答えを出し切った＝深掘りの二重出し防止
      situation: {
        id: thread.topicId, tags: ['emotional'], timing: null,
        bonus: { airDelta: 3, heartTo: h.id, heartDelta: 3 },
        dialogues: [ intro,
          { type:'heroine', speaker: hn, heroineId: h.id, text: TYPE_LINES[h.id] } ],
      },
    };
  }

  // ── 段の生成: もう一人の友達が武勇伝を被せる ───────
  function _taleStep(thread, state, partyChars, heroineChars) {
    const LINES = SituationManager.TOPIC_LINES;
    const pool = partyChars.filter(c =>
      !thread.usedFriendNames.includes(_sn(c.name)) && !_friendGone(state, c.id)
    );
    if (pool.length === 0) return null;
    const f  = pool[_rand(pool.length)];
    const fn = _sn(f.name);

    const heroines = heroineChars.filter(h => !_isGone(state, h.id));
    const h  = heroines.length ? heroines[_rand(heroines.length)] : null;
    const reaction = LINES.TALE_REACTION_LINES[_rand(LINES.TALE_REACTION_LINES.length)];

    return {
      addHeroineIds:  [],
      addFriendNames: [fn],
      situation: {
        id: thread.topicId, tags: ['playful'], timing: null,
        // S3: 武勇伝の連鎖は場が温まる（友達の話なので♥は動かさない）
        bonus: { airDelta: 3 },
        dialogues: [
          { type:'friend', speaker: fn, text:'「いやいや、俺の話も聞けって」' },
          { type:'friend', speaker: fn,
            text: LINES.FRIEND_TALE_LINES[f.id] || LINES.FRIEND_TALE_FALLBACK },
          ...(h ? [{ type:'heroine', speaker: _sn(h.name), heroineId: h.id, text: reaction }] : []),
        ],
      },
    };
  }

  // ── 架空アニメ話題・縦の深掘りライン（段1〜3。docs/topic-content-spec.md C-2確定稿）──
  // 設計: 段0=スタンス(situations.js C-1と共用)→段1=どこが刺さったか(未視聴は
  // 「なんで観てないか」)→段2=なぜ刺さるのか→段3=本音の気配(核心は明かさない)。
  // 段が深まるほど短く・静かに。禁止リスト遵守はC節セルフレビュー済み。
  const ANIME_DEPTH_LINES = {
    101: [ '「十一話も、ですけど……私は、小春が『先輩の音は、私が覚えてます』って言うところ、で」',
           '「『聴いてた人の中で鳴り続ける』……いい台詞だと思います。本当に、そうだったらいいけど」',
           '「……覚えててもらえたら、いたことになるのかな、って。……すみません、なんでもないです」' ],
    102: [ '「泣いたのは弦切れたとこ!切れてんのに千夏、絶対止まんないの、あそこやばい」',
           '「千夏ってさ、一人だけ『楽しい?』って聞かれてないんだよね、あの部で。……なんて、うちが語るのウケるけど」',
           '「……あの子、止まるのが怖かったんだと思う。止まったら、自分に何が残るか分かんないから」' ],
    103: [ '「みんな十一話で泣くけど、わたしは三話かな。誰も聴いてない音楽室で千夏が一人で弾いてるとこ、あそこが一番鳴ってた」',
           '「誰も聴いてない音って、鳴ってなかったことになるのかな。……わたしは、鳴ってたと思うんだよね、ずっと」',
           '「受信された音は、消えないんだって。……わたしのは、まだ宇宙のどこか、かも」' ],
    104: [ '「バイトと部活で一日終わんねん、うちの生活。……ま、十一話だけは後輩に無理やり見せられたけどな」',
           '「あの主人公、全部一人で背負って弾いとったな。ああいう子は、終わったあと急に静かになるんが一番くるねん」',
           '「……誰か、あの子の音も聴いたれよって思てんな。ずっと聴かせる側やんか、あの子」' ],
    105: [ '「一話観たら絶対止まらなくなるので、課題が全部終わるまで禁止にしてて。……我ながら、つまらない決まりですよね」',
           '「主人公の子、音大を諦めたんですよね。……正しい方を選んだはずの人がずっと苦しいの、観るのが少しこわくて」',
           '「……ちゃんとしなくていい日が来たら、観ます。そういう日って、ほんとに来るのかな」' ],
    106: [ '「わたしは後輩の小春ちゃんが好きだなあ。ずっと千夏先輩を支える側なんだけど、最後にちゃんと自分の音を弾くの」',
           '「小春ちゃんね、十一話まで一回もソロがないんだよ。……誰も気にしてないかもだけど、わたし、数えちゃって」',
           '「最終回でね、千夏が小春ちゃんに『次は、あなたの番』って弓を渡すの。……いいなあって、思っちゃった」' ],
    107: [ '「劇伴がええねん、あれ。……あ、いや、音が本物やったって話」',
           '「千夏、作中でずっと『怖い』って言われてるやろ。あの子、ただ嘘の顔がつくれんだけやのに」',
           '「……分かるやつが一人おったら、それでええねん。あの子には、おった」' ],
    108: [ '「あの部員たち、会話だと全然通じ合えてないんだよね。音を合わせたときだけ、like、ちゃんと会話になるの」',
           '「言葉が喋れるのと話が通じるのは、別なんだなあって。……ううん、アニメの話だよ?」',
           '「……音だけで話せたらいいのにって、ちょっと思った。それなら、わたし、えっと……ううん、忘れて」' ],
    109: [ '「どこで泣いたか?え〜っと……みんなが泣いてたとこ、かな!」',
           '「泣く準備して観たのに、なんかタイミング逃しちゃって。……そういうことって、ない?」',
           '「……ほんとはね、わたし、あそこで泣けんかったと。……それって、変かな」' ],
    110: [ '「わたし?……最終回の、誰もいない音楽室で千夏が譜面台を片付けるところかな」',
           '「あの子、最後まで誰にも『手伝って』を言わないんだよね。言えないんじゃなくて——言わない方が、楽になってしまったの」',
           '「……たまには誰かに、譜面台くらい運ばせてあげたらよかったのにね。……なんてね」' ],
  };

  // ── 段の生成: 架空アニメ話題（chain-core-spec §3・C5第1弾）─────────
  // レーン規則が既存HOLIDAYと逆なのが要点:
  //   共感(kyokan)/深掘り(fukagori) = 縦: 直前に話していた子がそのまま一段深く(段1→2→3)
  //   ノリ(nori)                    = 横: まだスタンスを言っていない別の子の段0に回す
  // 段0(初回situation)+縦3段=同一宛先4発話 → チェイン4連鎖で【二人の温度】頂点に接続する。
  function _animeStep(thread, state, partyChars, heroineChars) {
    if (thread.lastType === 'kyokan' || thread.lastType === 'fukagori') {
      // 縦: 段が尽きた子(段3まで行った)にさらに縦が来たら null=スレッド終了
      //（話題が満ちた、の仮決め。横へのフォールバックはしない=縦の空気を薄めない）
      return _animeDeepStep(thread, state, heroineChars);
    }
    return _animeRotateStep(thread, state, partyChars, heroineChars);
  }

  // 縦: 直前に話していた子の次の段（深度は deepenedIds 内の同一idの出現数で管理）
  function _animeDeepStep(thread, state, heroineChars) {
    const lastId = thread.usedHeroineIds[thread.usedHeroineIds.length - 1];
    if (lastId == null) return null;
    if (_isGone(state, lastId)) return null;
    const lines = ANIME_DEPTH_LINES[lastId];
    if (!lines) return null;
    const depth = (thread.deepenedIds || []).filter(id => id === lastId).length;
    const line  = lines[depth];               // 0→段1 / 1→段2 / 2→段3
    if (!line) return null;                   // 段3の先はない=話題が満ちた（仮決め）
    const h = heroineChars.find(x => x.id === lastId);
    if (!h) return null;

    return {
      addHeroineIds:  [],                     // 話者は変わらない（used二重登録しない）
      addFriendNames: [],
      deepenId:       lastId,                 // 出現数=消化済みの段数
      situation: {
        id: thread.topicId, tags: ['emotional', 'intimate'], timing: null,
        // 縦の報酬はHOLIDAY深掘り相当（♥寄り・値は既存と同じ）
        bonus: { airDelta: 2, heartTo: lastId, heartDelta: 5,
                 text: '（話が、少しだけ深いところに触れた）' },
        dialogues: [
          { type:'heroine', speaker: _sn(h.name), heroineId: lastId, text: line },
        ],
      },
    };
  }

  // 横: まだスタンスを言っていない子の段0。全員済みなら回し用汎用つなぎ
  function _animeRotateStep(thread, state, partyChars, heroineChars) {
    const LINES = SituationManager.TOPIC_LINES;
    const pool = heroineChars.filter(h =>
      !thread.usedHeroineIds.includes(h.id) && !_isGone(state, h.id)
      && LINES.ANIME_STANCE_LINES[h.id]
    );
    if (pool.length === 0) {
      return _animeKawashiStep(thread, state, partyChars, heroineChars);
    }
    const h  = pool[_rand(pool.length)];
    const hn = _sn(h.name);

    return {
      addHeroineIds:  [h.id],
      addFriendNames: [],
      situation: {
        id: thread.topicId, tags: ['emotional'], timing: null,
        // 横の報酬はHOLIDAY回し相当（空気+3/答えた子♥+3・値は既存と同じ）
        bonus: { airDelta: 3, heartTo: h.id, heartDelta: 3 },
        dialogues: [
          { type:'narr',    speaker:'', text:`アニメの話題が${hn}にも回っていく。` },
          { type:'heroine', speaker: hn, heroineId: h.id,
            text: LINES.ANIME_STANCE_LINES[h.id] },
        ],
      },
    };
  }

  // 横（全員スタンス済み）: 回し用汎用つなぎ（話者=友達、いなければ視聴済みのヒロイン）
  function _animeKawashiStep(thread, state, partyChars, heroineChars) {
    const LINES = SituationManager.TOPIC_LINES;
    const line  = LINES.ANIME_KAWASHI_LINES[_rand(LINES.ANIME_KAWASHI_LINES.length)];

    const friends = partyChars.filter(c => !_friendGone(state, c.id));
    if (friends.length > 0) {
      const f = friends[_rand(friends.length)];
      return {
        addHeroineIds:  [],
        addFriendNames: [],   // つなぎは武勇伝と違い話者を消費しない（同じ友達が何度乗ってもよい）
        situation: {
          id: thread.topicId, tags: ['emotional'], timing: null,
          bonus: { airDelta: 3 },   // 場が温まるのみ（答えた子がいないので♥なし）
          dialogues: [ { type:'friend', speaker: _sn(f.name), text: line } ],
        },
      };
    }

    // 友達が全員いない場合は視聴済みヒロインがつなぐ（未視聴組は選ばない）
    const viewers = heroineChars.filter(h =>
      !_isGone(state, h.id) && LINES.ANIME_STANCE_LINES[h.id]
      && !LINES.ANIME_UNWATCHED_IDS.includes(h.id)
    );
    if (viewers.length === 0) return null;
    const h = viewers[_rand(viewers.length)];
    return {
      addHeroineIds:  [h.id],   // 直前に話した子=縦の宛先を彼女に更新する
      addFriendNames: [],
      situation: {
        id: thread.topicId, tags: ['emotional'], timing: null,
        bonus: { airDelta: 3, heartTo: h.id, heartDelta: 3 },
        dialogues: [ { type:'heroine', speaker: _sn(h.name), heroineId: h.id, text: line } ],
      },
    };
  }

  // ── E節: SIT_206続き段（失敗談の顛末。docs/topic-content-spec.md E節確定稿）──
  // 縦(fukagori)=段1→段2で顛末が語られオチる／横(kyokan/nori)=卓が回る（別の友達 or 別のヒロインが乗る）
  // 深度管理: ヒロイン起点ではなくトピック単位なので、疑似マーカー 'TALE_FAIL' を deepenedIds に積む
  const TALE_FAIL_MARKER = 'TALE_FAIL';

  // f0=暴露係／f1=本人。段0の usedFriendNames 先頭2名から復元、取れなければ party 先頭2名
  function _taleFailRoles(thread, partyChars) {
    const [n0, n1] = thread.usedFriendNames;
    const f0 = (n0 && partyChars.find(c => _sn(c.name) === n0)) || partyChars[0];
    const f1 = (n1 && partyChars.find(c => _sn(c.name) === n1)) || partyChars[1] || f0;
    return { f0, f1 };
  }

  function _taleFailStep(thread, state, partyChars, heroineChars) {
    if (thread.lastType === 'fukagori') {
      const deep = _taleFailDeepStep(thread, state, partyChars, heroineChars);
      if (deep) return deep;
      // 段2の先はない（着地済み）→ 横へフォールバック
    }
    return _taleFailRotateStep(thread, state, partyChars, heroineChars);
  }

  // 縦: E-1 段1（3発話・顛末の本体）／段2（2発話・後日談でオチて着地）
  function _taleFailDeepStep(thread, state, partyChars, heroineChars) {
    const { f0, f1 } = _taleFailRoles(thread, partyChars);
    if (!f0 || _friendGone(state, f0.id)) return null;
    if (f1 && _friendGone(state, f1.id)) return null;
    const fn0 = _sn(f0.name), fn1 = _sn(f1.name);
    const depth = (thread.deepenedIds || []).filter(id => id === TALE_FAIL_MARKER).length;

    if (depth === 0) {
      // 段1: 本人が白状 → 暴露係がオチを足す → ヒロインが乗る（宛先ヒロインは段0の最後尾）
      const lastHeroineId = thread.usedHeroineIds[thread.usedHeroineIds.length - 1];
      const h = heroineChars.find(x => x.id === lastHeroineId && !_isGone(state, x.id));
      return {
        addHeroineIds:  [],
        addFriendNames: [],
        deepenId:       TALE_FAIL_MARKER,
        situation: {
          id: thread.topicId, tags: ['playful'], timing: null,
          bonus: { airDelta: 4 },
          dialogues: [
            { type:'friend', speaker: fn1, text:'「……あのあと、司会に『続けて大丈夫?』って心配されて。大丈夫じゃなかったのに『はい!』って言っちゃって」' },
            { type:'friend', speaker: fn0, text:'「で、立ち上がった拍子にマイクのコード引っかけて、司会のカンペ全部床にぶちまけたんだよ」' },
            ...(h ? [{ type:'heroine', speaker: _sn(h.name), heroineId: h.id, text:'「もう完全に主役じゃないですか！」' }] : []),
          ],
        },
      };
    }
    if (depth === 1) {
      // 段2: 後日談でオチて着地（次の手が何でもmaxSteps上限で自然終了する想定）
      return {
        addHeroineIds:  [],
        addFriendNames: [],
        deepenId:       TALE_FAIL_MARKER,
        situation: {
          id: thread.topicId, tags: ['playful'], timing: null,
          bonus: { airDelta: 3 },
          dialogues: [
            { type:'friend', speaker: fn1, text:'「それが後日、その動画が学祭のダイジェストに使われててさ。ナレーションが『名場面』」' },
            { type:'friend', speaker: fn0, text:'「一番ウケてたの、本人の親な」' },
          ],
        },
      };
    }
    return null;   // 段2の先はない＝話は着地済み
  }

  // 横: E-2 卓が回る（別の友達が被せる→なければ別ヒロインが乗る→誰も残っていなければ終了）
  function _taleFailRotateStep(thread, state, partyChars, heroineChars) {
    const friends = partyChars.filter(c =>
      !thread.usedFriendNames.includes(_sn(c.name)) && !_friendGone(state, c.id)
    );
    if (friends.length > 0) {
      const f2 = friends[_rand(friends.length)];
      const heroines = heroineChars.filter(h => !_isGone(state, h.id));
      const h  = heroines.length ? heroines[_rand(heroines.length)] : null;
      return {
        addHeroineIds:  h ? [h.id] : [],
        addFriendNames: [_sn(f2.name)],
        situation: {
          id: thread.topicId, tags: ['playful'], timing: null,
          bonus: { airDelta: 4 },
          dialogues: [
            { type:'friend', speaker: _sn(f2.name), text:'「いや俺なんて成人式で、隣の知らん家族の集合写真に完全に入り込んでたからな」' },
            ...(h ? [{ type:'heroine', speaker: _sn(h.name), heroineId: h.id, text:'「それ、その家のアルバムに永遠に残ってますよ」' }] : []),
          ],
        },
      };
    }

    // 友達が尽きた→別ヒロインが自分のやらかしを乗せる
    const pool = heroineChars.filter(h =>
      !thread.usedHeroineIds.includes(h.id) && !_isGone(state, h.id)
    );
    if (pool.length === 0) return null;   // 誰も残っていない＝スレッドを正常終了する終端
    const h  = pool[_rand(pool.length)];
    const { f0 } = _taleFailRoles(thread, partyChars);
    const f0gone = !f0 || _friendGone(state, f0.id);

    return {
      addHeroineIds:  [h.id],
      addFriendNames: [],
      situation: {
        id: thread.topicId, tags: ['playful'], timing: null,
        bonus: { airDelta: 3, heartTo: h.id, heartDelta: 3 },
        dialogues: [
          { type:'heroine', speaker: _sn(h.name), heroineId: h.id, text:'「わたしも自己紹介でめっちゃ噛んで、開き直って二回言い直したことあります」' },
          ...(f0gone ? [] : [{ type:'friend', speaker: _sn(f0.name), text:'「わかる、二回言うと逆に堂々として見えるよな」' }]),
        ],
      },
    };
  }

  // ── F節: SIT_101続き段（趣味4分岐。docs/topic-content-spec.md F節確定稿）──
  // 分岐キー hobby は段0で確定し thread.data.hobby に保持済み（open()がmetaから拾う）
  // 縦(fukagori)=段1→段2でその趣味の具体が一段深く／横(kyokan/nori)=ヒロイン or 別友達が乗る
  const HOBBY_FAIL_MARKER = 'HOBBY_DEEP';

  const HOBBY_DEEP_LINES = {
    'サッカー': [
      [ { type:'heroine', text:'「フットサルって、初心者でも大丈夫なんですか?」' },
        { type:'friend',  text:'「全然。ミスった方が盛り上がるルールみたいなとこあるから。この前も俺、味方のゴールに蹴り込んだし」' } ],
      [ { type:'friend',  text:'「そのオウンゴール、なぜか一番拍手もらってさ。以来あだ名が『敵将』」' },
        { type:'heroine', text:'「強そうなのにダメな感じ、好きです」' } ],
    ],
    '映画': [
      [ { type:'heroine', text:'「長いやつ、聞きたいです」' },
        { type:'friend',  text:'「一本の映画のために、監督の過去作を全部観直す派なんだよ俺。だから最新作の話に着くまで二時間かかる」' } ],
      [ { type:'friend',  text:'「この前それやってたら、肝心の最新作、公開終わってた」' },
        { type:'heroine', text:'「予習で本番逃すの、テスト勉強みたいですね」' } ],
    ],
    'ゲーム': [
      // 段1は他分岐と異なり3発話（checker申し送り: buildStepは1段あたり可変発話数を前提とする）
      [ { type:'heroine', text:'「え、めっちゃ強い人ですか?」' },
        { type:'friend',  text:'「……先月まで最高ランクにいた。先月まではな」' },
        { type:'heroine', text:'「なんで過去形なんですか」' } ],
      [ { type:'friend',  text:'「テスト期間に一回も触らなかったら、戻ってきたとき指が完全に別人でさ。今は絶賛リハビリ中」' },
        { type:'heroine', text:'「元最高ランクの人がリハビリって、字面が強すぎます」' } ],
    ],
    'カフェ巡り': [
      [ { type:'heroine', text:'「メモ、構えました」' },
        { type:'friend',  text:'「駅裏の、看板出てない古い喫茶店。プリンが固くて、スプーン刺すと音がする。あれのために生きてる時期あった」' } ],
      [ { type:'friend',  text:'「常連なりすぎて、マスターに『今日はいつもの?』って言われた日、正直ガッツポーズしたわ」' },
        { type:'heroine', text:'「"いつもの"が言える店、憧れます」' } ],
    ],
  };

  const HOBBY_ROTATE_LINES = {
    'サッカー':   { hero:'「わたし観る専なんですけど、それは行ってみたいかも」',
                    friend:'「じゃあ人数集まるな。ボール蹴れなくても全然いいから」' },
    '映画':       { hero:'「わたしはエンドロール最後まで残る派です。誰も残ってなくても」',
                    friend:'「それはガチ勢だわ。気が合いそう」' },
    'ゲーム':     { hero:'「わたし全然やらないんですけど、その"別人になる"感じは分かる気がします」',
                    friend:'「久しぶりにやると、まず自分の名前でログインするとこから緊張するもんな」' },
    'カフェ巡り': { hero:'「固いプリン派、わたしもです。とろけるやつ、あれはもうデザートじゃなくて飲み物だと思ってて」',
                    friend:'「その戦争、俺は固い側で参戦する」' },
  };

  // fn=段0で語った友達（usedFriendNames先頭）／hn=段0で食いついたヒロイン（usedHeroineIds先頭）
  function _hobbyRoles(thread, state, partyChars, heroineChars) {
    const fn0 = thread.usedFriendNames[0];
    const f = (fn0 && partyChars.find(c => _sn(c.name) === fn0)) || partyChars[0];
    const hid0 = thread.usedHeroineIds[0];
    const h = heroineChars.find(x => x.id === hid0);
    return { f, h };
  }

  function _hobbyStep(thread, state, partyChars, heroineChars) {
    const hobby = thread.data && thread.data.hobby;
    if (!hobby || !HOBBY_DEEP_LINES[hobby]) return null;   // hobbyキーが復元できない＝スレッド終了

    if (thread.lastType === 'fukagori') {
      const deep = _hobbyDeepStep(thread, state, partyChars, heroineChars, hobby);
      if (deep) return deep;
      // 段2の先はない→横へフォールバック
    }
    return _hobbyRotateStep(thread, state, partyChars, heroineChars, hobby);
  }

  // 縦: F-1〜F-4 段1→段2（fnが具体を一口→オチ）
  function _hobbyDeepStep(thread, state, partyChars, heroineChars, hobby) {
    const { f, h } = _hobbyRoles(thread, state, partyChars, heroineChars);
    if (!f || _friendGone(state, f.id)) return null;
    if (!h || _isGone(state, h.id)) return null;
    const fn = _sn(f.name), hn = _sn(h.name);
    const depth = (thread.deepenedIds || []).filter(id => id === HOBBY_FAIL_MARKER).length;
    const lines = HOBBY_DEEP_LINES[hobby][depth];   // 0→段1 / 1→段2
    if (!lines) return null;                        // 段2の先はない＝具体を出し切った

    return {
      addHeroineIds:  [],
      addFriendNames: [],
      deepenId:       HOBBY_FAIL_MARKER,
      situation: {
        id: thread.topicId, tags: ['playful'], timing: null,
        bonus: { airDelta: 4 },
        dialogues: lines.map(l => l.type === 'heroine'
          ? { type:'heroine', speaker: hn, heroineId: h.id, text: l.text }
          : { type:'friend',  speaker: fn, text: l.text }),
      },
    };
  }

  // 横: ヒロインor別友達が乗る。乗り手が誰もいなければスレッド終了（相互フォールバックの終端）
  function _hobbyRotateStep(thread, state, partyChars, heroineChars, hobby) {
    const rot = HOBBY_ROTATE_LINES[hobby];
    const { f: fn0 } = _hobbyRoles(thread, state, partyChars, heroineChars);

    const heroinePool = heroineChars.filter(h =>
      !thread.usedHeroineIds.includes(h.id) && !_isGone(state, h.id)
    );
    if (heroinePool.length > 0) {
      const hOther = heroinePool[_rand(heroinePool.length)];
      // 台詞のfriendは fn（段0の友達）優先。いなければ別の友達、それも尽きたらナレなしで省く
      const friends = partyChars.filter(c => !_friendGone(state, c.id));
      const fSpeaker = (fn0 && !_friendGone(state, fn0.id))
        ? fn0
        : (friends.length ? friends[_rand(friends.length)] : null);
      return {
        addHeroineIds:  [hOther.id],
        addFriendNames: [],
        situation: {
          id: thread.topicId, tags: ['playful'], timing: null,
          bonus: { airDelta: 3, heartTo: hOther.id, heartDelta: 3 },
          dialogues: [
            { type:'heroine', speaker: _sn(hOther.name), heroineId: hOther.id, text: rot.hero },
            ...(fSpeaker ? [{ type:'friend', speaker: _sn(fSpeaker.name), text: rot.friend }] : []),
          ],
        },
      };
    }

    // ヒロインが尽きた→別の友達だけで乗る（相互フォールバックの終端: 誰もいなければ null で終了）
    const friends = partyChars.filter(c =>
      !thread.usedFriendNames.includes(_sn(c.name)) && !_friendGone(state, c.id)
    );
    if (friends.length === 0) return null;   // 話者が誰も残っていない＝スレッド正常終了
    const fOther = friends[_rand(friends.length)];
    return {
      addHeroineIds:  [],
      addFriendNames: [_sn(fOther.name)],
      situation: {
        id: thread.topicId, tags: ['playful'], timing: null,
        bonus: { airDelta: 3 },
        dialogues: [ { type:'friend', speaker: _sn(fOther.name), text: rot.friend } ],
      },
    };
  }

  // ── public API ───────────────────────────────────
  return { open, openCardTopic, afterAction, nextStep };

})();
