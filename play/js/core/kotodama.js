// ═══════════════════════════════════════════════════
// js/core/kotodama.js — ことだま効果計算（純粋ロジック）
// 依存: なし（DOM操作なし）
// ═══════════════════════════════════════════════════

const KotodamaCore = (() => {

  // ── コンテキストタグとことだまの相性 ────────────────
  // contextMultiplier[tag][kotodamaType] = 倍率
  const CONTEXT_MULT = {
    emotional: { kyokan:1.3, nori:1.0, fukagori:1.3, change:1.0, nomiyo:0.7, renraku:1.0 },
    playful:   { kyokan:1.0, nori:1.3, fukagori:0.7, change:1.0, nomiyo:1.3, renraku:1.0 },
    tense:     { kyokan:1.0, nori:1.0, fukagori:0.7, change:1.3, nomiyo:1.3, renraku:1.0 },
    intimate:  { kyokan:1.3, nori:0.7, fukagori:1.3, change:0.7, nomiyo:0.7, renraku:1.3 },
    chaotic:   { kyokan:0.7, nori:1.3, fukagori:0.7, change:1.3, nomiyo:1.3, renraku:0.7 },
    closing:   { kyokan:1.3, nori:1.0, fukagori:1.0, change:0.7, nomiyo:0.7, renraku:1.3 },
  };

  // ── ヒロインタイプとことだまの相性補正 ─────────────
  // typeBonus[heroineType][kotodamaType] = 加算値
  const TYPE_BONUS = {
    '穏やか系':   { kyokan:+3, nori: 0, fukagori:+2, change: 0, nomiyo:-2, renraku: 0 },
    'ノリ系':     { kyokan: 0, nori:+4, fukagori:-1, change: 0, nomiyo:+3, renraku: 0 },
    '知的系':     { kyokan: 0, nori:-2, fukagori:+5, change: 0, nomiyo:-1, renraku: 0 },
    '体育会系':   { kyokan: 0, nori:+3, fukagori: 0, change: 0, nomiyo:+4, renraku: 0 },
    'しっかり系': { kyokan:+2, nori: 0, fukagori:+3, change: 0, nomiyo: 0, renraku: 0 },
    '草食系':     { kyokan:+4, nori:-2, fukagori: 0, change: 0, nomiyo:-1, renraku: 0 },
    '面白い系':   { kyokan: 0, nori:+2, fukagori:+2, change: 0, nomiyo: 0, renraku: 0 },
    'ワル系':     { kyokan:-1, nori:+2, fukagori: 0, change: 0, nomiyo:+2, renraku: 0 },
  };

  // ── コマンド分類メタ（型 / 場アクション）─────────────
  // 設計: docs/kaiwa-command-design.md §1・§5。
  // 「型」＝相手の開いた口にどう応じるか（山場=junctionの読み合いの対象）。
  // 「場アクション」＝山場と無関係にいつでも打てる、場の流れを動かす手。
  // UIが両者を視覚的にグルーピングし、山場実装時に「型」だけを機械的に絞るための分類ラベル。
  // ここでは効果計算・グレーアウト条件は一切変えない（分類のみ）。
  const KOTODAMA_KIND = {
    kyokan:   'kata',   // 型: 共感
    fukagori: 'kata',   // 型: 質問（掘る）
    nori:     'kata',   // 型: ボケ（笑いに変換）
    change:   'ba',     // 場アクション: 話題転換
    nomiyo:   'ba',     // 場アクション: 飲もうぜ
    renraku:  'ba',     // 場アクション: 連絡先
    furu:     'ba',     // 場アクション: 話を振る（＝将来の「話題の弾」の発射台）
  };

  // ── 山場（junction）の型 ─────────────────────────────
  // 設計: docs/conversation-metacognition-design.md §4・§5。
  // プロトv15で確定した「型の一本軸」＝質問／共感／自分の話／ボケ。
  // junction限定の一時カードであり常設パネル（6ことだま）は増やさない（同§11）。
  // 各型が「効果計算で流用することだま」を指す。自分の話は共感(kyokan)の式を流用しUI上のみ独立。
  const JUNCTION_KATA = {
    question: 'fukagori', // 質問: 続きを促す
    empathy:  'kyokan',   // 共感: トーンに合わせる
    selftalk: 'kyokan',   // 自分の話: 対等な経験を差し出す（kyokan計算式を流用）
    boke:     'nori',     // ボケ: 笑いに変換する
  };

  // ── 開き方タグ × 型のマッチ表（§5の叩き台を符号化）───────
  // 各openTagに対し「はっきりズレる型」の集合だけを持つ。それ以外は全て通る（hit）。
  // §5規律: どのopenTagも miss を1つ以上・全ミスにはしない（詰み＝慈悲の否定）。
  // 数値・確率はbalance-designerの領分。ここは calcEffect の“手前”に挟む二値判定の構造のみ。
  // 場アクション(change等)はjunctionカードに載せない前提のため、型4種のみを対象にする。
  // NOTE(要game-designer/balance-designer確認): §5のplay行は共感を best と miss に両掲している。
  //   「必ず1つ以上はっきりズレる型を持たせる」規律を優先し、play の miss=共感（重く受け止めすぎ）とした。
  //   「ボケ／共感どちらでも」の“共感”は軽い相槌を指す解釈。差し戻しがあればここだけ直せば済む。
  const KATA_OPEN_MATCH = {
    'vulnerable-self': { miss: ['empathy'] },            // 自虐・オチ待ち。重く受けると外す
    'serious':         { miss: ['boke', 'selftalk'] },   // 本音。茶化す/話を奪うで外す
    'pride':           { miss: ['selftalk', 'boke'] },   // 自慢。マウント返し/冷やかしで外す
    'play':            { miss: ['empathy'] },            // ノリ。重い共感で外す（上記NOTE参照）
  };

  /**
   * 山場で選んだ型が、相手の開き方(openTag)にマッチしたか二値判定する。
   * 効果計算の手前に挟むレイヤー（calcEffect/CONTEXT_MULT/TYPE_BONUSは変更しない）。
   * @param {string} openTag  相手の開き方タグ（vulnerable-self/serious/pride/play）
   * @param {string} kata     選んだ型キー（JUNCTION_KATA のキー）
   * @returns {'hit'|'miss'}  未定義のopenTag/型は 'hit'（判定を挟まない従来ビート＝安全側）
   */
  function judgeKata(openTag, kata) {
    const rule = KATA_OPEN_MATCH[openTag];
    if (!rule) return 'hit';
    return rule.miss.includes(kata) ? 'miss' : 'hit';
  }

  /**
   * ことだまの効果を計算する（DOM操作なし）。
   *
   * @param {string} type         ことだまID (kyokan/nori/fukagori/change/nomiyo/renraku)
   * @param {object} situation    現在のシチュエーション（tags, effects）
   * @param {object} state        ゲーム状態スナップショット（airGauge, hearts, friendHearts等）
   * @param {object} selfParams   プレイヤーパラメータ（comm, air, head, mental, sake等）
   * @param {object} synergy      シナジーボーナス（noriMult, fukagoriRateBonus等）
   * @param {boolean} timingBonus タイミング窓内で発動したか
   * @returns {{ resultText, resultType, stateDelta }}
   *   stateDelta: { airDelta, heartDelta(targetのみ), allHeartDelta, friendHeartDelta, contactResult }
   */
  function calcEffect(type, situation, state, selfParams, synergy, timingBonus = false) {
    const tags         = situation ? (situation.tags || []) : [];
    const target       = state.targetHeroine;
    // 2026-09-17: 「〜系」の語彙を持つのは type ではなく likes（type は「清楚・図書委員」等）。
    // 従来は type だけを見ていたため TYPE_BONUS のキーが10人中0人に一致せず、
    // ヒロイン別の相性が数値上まったく効いていなかった。likes を主、type を従として見る。
    const targetType   = target ? [...(target.likes || []), target.type || ''].join('｜') : '';
    const airGauge     = state.airGauge || 50;

    // ── 共通係数 ─────────────────────────────────────
    const contextMult  = _contextMult(type, tags);
    const airMult      = airGauge >= 60 ? 1.0 : airGauge >= 40 ? 0.85 : 0.65;
    const timingMult   = timingBonus ? 1.5 : 1.0;
    const typeBonus    = _typeBonus(type, targetType);
    // 【意図】相手がいま待っているものに合っているか（2026-09-22）。
    // 予告(heroine-ai.js intent)を数字に接続するのはここ一箇所。
    // 狙いの子に向く手(共感/深掘り/連絡先)はその子の意図、
    // 場に向く手(ノリ/話題変え/飲もうぜ)は卓で多数派の意図を見る。
    const intentId     = target ? ((state.intents || {})[target.id] || null) : null;
    const roomIntentId = _roomIntent(state);
    const intentMult   = _intentMult(intentId, type);
    const roomMult     = _intentMult(roomIntentId, type);
    // 8T化の比例補正（goukon-game.jsのTURN_SCALEをsynergy経由で受け取る。未指定=1.0）。
    // heartDelta/allHeartDelta の計算と resultText の表示数値の両方に同じ値を使い、
    // 「表示 +N == 実効delta」を保証する（適用はここに一本化。外側では掛けない）
    const turnScale    = synergy.turnScale || 1.0;

    const delta = { airDelta: 0, heartDelta: 0, allHeartDelta: 0, friendHeartDelta: 0, contactResult: null,
      // 【意図】相手が待っていたものを出せたか。呼び出し側が流れを伸ばす判定に使う
      intentHit: ['nori', 'change', 'nomiyo'].includes(type) ? roomMult >= 1.3 : intentMult >= 1.3 };
    let resultText = '';
    let resultType = 'result';

    switch (type) {

      case 'kyokan': {
        const comm  = selfParams.comm || 50;
        const base  = 6 + comm * 0.10;
        const gain  = Math.round((base * contextMult + typeBonus) * airMult * timingMult * turnScale * intentMult);
        delta.heartDelta = gain;
        delta.airDelta   = 2;
        // 【意図】待っていないものを差し出した＝外し。減るだけでなく流れが切れる
        // （resultType 'bad' が DeckCore.breakChain を呼ぶ）。予告を読まない打ち手はここで損をする
        if (intentMult <= 0.6) {
          delta.airDelta = -4;
          resultText = `「うん……」${_tn(target)}は、それきり手元に目を落とした。${_qAir(-4)}`;
          resultType = 'result bad';
          break;
        }
        resultText = timingBonus
          ? `「わかる！」——差し込んだ間が、きれいに嵌まった。${_tn(target)}との距離が${_qHeart(gain)}`
          : `${_tn(target)}が、こちらを見て頷いた。${_qHeart(gain)}`;
        break;
      }

      case 'nori': {
        const airP     = selfParams.air || 50;
        const noriMult = synergy.noriMult || 1.0;
        const base     = 8 + airP * 0.12;
        const gain     = Math.round((base * contextMult + typeBonus) * airMult * noriMult * timingMult * roomMult);
        delta.airDelta      = gain;
        delta.allHeartDelta = Math.round(2 * turnScale);

        const spNote = noriMult > 1.0 ? '💪 ' : '';
        // contextMult < 1 = スベった
        if (contextMult < 0.9) {
          delta.airDelta = -3;
          delta.allHeartDelta = 0;
          resultText = '——笑い待ちの一拍が、そのまま空いた。' + _qAir(-3);
          resultType = 'result bad';
        } else {
          resultText = `${spNote}卓の声がいっぺんに重なった。${_qAir(gain)}`;
        }
        break;
      }

      case 'fukagori': {
        const comm           = selfParams.comm   || 50;
        const mental         = selfParams.mental || 50;
        const rateBonus      = synergy.fukagoriRateBonus || 0;
        const sameCircle     = synergy.sameCircleWith && target && synergy.sameCircleWith[target.id];
        const fukaMult       = sameCircle ? 0.7 : 1.0;
        const successRate    = Math.min(0.9,
          0.5 + mental * 0.004
              + (airGauge >= 50 ? 0.15 : -0.10)
              + (timingBonus ? 0.15 : 0)
              + rateBonus
              + (intentMult - 1) * 0.25      // 前のめりなら通りやすく、飽きていれば重い
        );
        if (intentMult <= 0.6) {
          // 飽きている相手・よそ見の相手に踏み込むと、場が止まる
          delta.airDelta = -8;
          resultText = `「……うん」——そこで会話が止まった。${_qAir(-8)}`;
          resultType = 'result bad';
          break;
        }
        if (Math.random() < successRate) {
          const base = 12 + comm * 0.15;
          const gain = Math.round((base * contextMult + typeBonus) * airMult * fukaMult * timingMult * turnScale * intentMult);
          delta.heartDelta = gain;
          const sameNote = sameCircle ? '（顔見知り補正）' : '';
          resultText = `${_tn(target)}が、一段だけ内側を話した${sameNote}。${_qHeart(gain)}`;
        } else {
          const loss = mental >= 60 ? 5 : 10;
          delta.airDelta = -loss;
          resultText = `「それは…」——言葉が続かなかった。${_qAir(-loss)}`;
          resultType = 'result bad';
        }
        break;
      }

      case 'change': {
        delta.friendHeartDelta = -8; // 全友達のターゲットへのheart
        if (roomIntentId === 'akita') {
          // 卓がだれている＝話題を変えてほしがっている。ここが話題変えの本命
          delta.airDelta = Math.round(10 * roomMult / 1.6);
          resultText = `別の話を出した瞬間、待っていたように全員が乗った。${_qAir(delta.airDelta)}\n——友達たちの勢いが削がれた。`;
        } else if (roomIntentId === 'kiki') {
          // まだ聞きたがっている話を切った
          delta.airDelta = -6;
          resultText = '「え、その話もっと聞きたかったのに」——まだ途中だった。' + _qAir(-6) + '\n——それでも、友達たちの勢いは削がれた。';
          resultType = 'result bad';
        } else if (airGauge < 40) {
          delta.airDelta = 8;
          resultText = '別の話を出した。息が継げた。' + _qAir(8) + '\n——友達たちの勢いが削がれた。';
        } else if (contextMult < 0.9) {
          // 不一致（intimate等）
          delta.airDelta = -5;
          resultText = '「え、急に？」——振り出しが空回りした。' + _qAir(-5) + '\n——それでも、友達たちの勢いは削がれた。';
          resultType = 'result bad';
        } else {
          delta.airDelta = -2;
          resultText = '別の話に移った。友達たちの勢いが目に見えて落ちた。' + _qAir(-2);
          resultType = 'result neutral';
        }
        break;
      }

      case 'nomiyo': {
        const sake        = selfParams.sake || 50;
        const izakaya     = (synergy.synergies || []).some(s => s.label === '居酒屋仲間シナジー');
        const base        = 5 + sake * 0.05;
        const gain        = Math.round((base * contextMult + typeBonus) * airMult * timingMult);
        delta.airDelta    = Math.round((5 + Math.random() * 5 + (timingBonus ? 3 : 0)) * roomMult);
        delta.friendHeartDelta = 4; // 友達のターゲットへのheart
        if (izakaya) delta.allHeartDelta = Math.round(5 * turnScale);
        const izNote      = izakaya ? '🍺 居酒屋組が一気に温まった。' : '';
        resultText = `「もう一杯！」——注文の声で卓がほどけた。${izNote}${_qAir(delta.airDelta)}\n——友達たちも勢いづいた。`;
        break;
      }

      case 'renraku': {
        const heart     = target ? (state.hearts[target.id] || 0) : 0;
        const airReq    = synergy.contactAirReq || 45;
        const airOk     = airGauge >= airReq;
        // 成功♥ラインは難易度Balanceからsynergy経由で受け取る（未指定=現行値55）
        // 【意図】「待ってる」が出ている＝こっちを見ている。ここが本当の窓。
        // よそ見のときは、♥がいくつあっても通らない（見てもいない相手に聞いている）。
        const line      = (synergy.contactHeartLine || 55) + (intentId === 'matte' ? -8 : 0);
        const heartOk   = heart >= line && intentId !== 'yoso';

        if (heartOk && airOk) {
          delta.contactResult = { success: true, heroineId: target ? target.id : null };
          resultText = '📱「LINE教えてもいい？」「…いいですよ！」連絡先GET！';
        } else if (heart >= 40 && airOk) {
          delta.airDelta   = -3;
          delta.heartDelta = Math.round(5 * turnScale);
          resultText = `「え、まだ早くないですか…？」——断られてはいない。${_qHeart(delta.heartDelta)}`;
          resultType = 'result neutral';
        } else {
          delta.airDelta = -8;
          resultText = '「え…（苦笑）」——そこは、まだ早かった。' + _qAir(-8);
          resultType = 'result bad';
        }
        break;
      }

    }

    return { resultText, resultType, delta };
  }

  /**
   * ことだまをグレーアウトすべきか判定する。
   * @param {string} type       ことだまID
   * @param {number} phase      現在のフェーズ (0-4)
   * @param {object} state      ゲーム状態
   * @returns {boolean}         true = グレーアウト
   */
  function isGreyedOut(type, phase, state) {
    const target     = state.targetHeroine;
    const targetHeart = target ? (state.hearts[target.id] || 0) : 0;

    switch (type) {
      case 'fukagori':
        return phase === 0;

      case 'change':
        return phase === 0 || phase === 4;

      case 'nomiyo':
        return phase === 4;

      case 'renraku':
        // 2026-09-22: 連絡先が「引く札」になったので窓を広げた（phase<3 → phase<2）。
        // T7-T8の2手だけだと、札を引けても切れずに夜が終わる周が多すぎた。
        // 早く切ること自体は可能にし、♥が足りなければ断られる＝賭けとして残す。
        return phase < 2 || targetHeart < 30;

      default:
        return false;
    }
  }

  // ── private ──────────────────────────────────────

  // ── 結果の言い方（2026-09-24）────────────────────────
  // 「好感度 +15」は、いま画面で起きたことの説明であって、起きたことではない。
  // 数値は§16で出さない決まりでもあるのに、結果行にだけ残っていた。
  // 動いた幅を質で言い換える。何が起きたかは、その前のセリフと表情が言っている。
  function _qHeart(v) {
    if (v >= 14) return 'ぐっと近づいた';
    if (v >= 8)  return '距離が縮んだ';
    if (v >= 3)  return '少し近づいた';
    return '手応えは薄い';
  }
  function _qAir(v) {
    if (v >= 8)  return '場が跳ねた';
    if (v >= 3)  return '場が軽くなった';
    if (v > 0)   return '場がほどけた';
    if (v >= -4) return '場が少し重くなった';
    return '場が冷えた';
  }

  // 卓で多数派の意図（場に向く手が見るもの）。同数なら「飽きてきた」を優先＝場は重い方に引っぱられる
  const _ROOM_PRIORITY = ['akita', 'yoso', 'kiki', 'matte'];
  function _roomIntent(state) {
    const map = state.intents || {};
    const ids = Object.keys(map);
    if (!ids.length) return null;
    const count = {};
    ids.forEach(k => { count[map[k]] = (count[map[k]] || 0) + 1; });
    let best = null, bestN = -1;
    _ROOM_PRIORITY.forEach(id => {
      const n = count[id] || 0;
      if (n > bestN) { bestN = n; best = id; }
    });
    return bestN > 0 ? best : null;
  }

  function _intentMult(intentId, type) {
    if (!intentId) return 1.0;
    if (typeof HeroineAI === 'undefined' || !HeroineAI.intentMult) return 1.0;
    return HeroineAI.intentMult(intentId, type);
  }

  function _contextMult(type, tags) {
    // 2026-09-17: 以前は Math.max(1.0, m) だったため 0.7 の不利倍率が一度も適用されず、
    // 「スベった」「白けた」の分岐に到達できなかった。一致したタグの倍率を平均して採用する。
    const ms = [];
    tags.forEach(tag => {
      const m = (CONTEXT_MULT[tag] || {})[type];
      if (m !== undefined) ms.push(m);
    });
    if (!ms.length) return 1.0;
    return ms.reduce((a, b) => a + b, 0) / ms.length;
  }

  function _typeBonus(type, heroineType) {
    // heroineType は例: '清楚・図書委員' のような複合文字列。各タイプキーを含むか判定
    let bonus = 0;
    Object.keys(TYPE_BONUS).forEach(key => {
      if (heroineType.includes(key)) {
        bonus += (TYPE_BONUS[key][type] || 0);
      }
    });
    return bonus;
  }

  function _tn(target) {
    if (!target) return '相手';
    const parts = target.name.split(/[\s　]+/);
    return parts[parts.length - 1] || target.name;
  }

  // ── public API ───────────────────────────────────
  return { calcEffect, isGreyedOut, KOTODAMA_KIND, JUNCTION_KATA, KATA_OPEN_MATCH, judgeKata };

})();
