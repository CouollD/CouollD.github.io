// ═══════════════════════════════════════════════════
// js/goukon-game.js — 合コン当日 司令塔
// core モジュールと ui モジュールをつなぐだけ。
// ゲームロジック自体はここに書かない。
//
// 依存読み込み順:
//   data/gamedata.js → data/gamestate.js
//   js/core/phase.js → js/core/friend-ai.js
//   js/core/kotodama.js → js/core/kotodama-vocab.js → js/core/situations.js
//   js/core/speak-previews.js
//   js/ui/stage.js → js/ui/vn-engine.js
//   js/ui/kotodama-panel.js → js/ui/friend-panel.js → js/ui/hud.js
//   js/goukon-game.js  ← このファイル
// ═══════════════════════════════════════════════════

const GoukonGame = (() => {

  // ── ゲーム状態 ─────────────────────────────────────
  let STATE = {};

  // ── 外部データ（localStorage から）────────────────
  let PARTY_IDS, HEROINE_IDS, INIT_AIR, INIT_HEARTS, SEATING;
  let partyChars, heroineChars;
  let SELF_PARAMS, SYNERGY, BALANCE;
  let DECK;   // 手札制の山・手札・捨て札（DeckCore.createState の戻り）

  // ── 定数 ──────────────────────────────────────────
  const MAX_TURNS    = 8;

  // 12T→8Tの短縮に伴う獲得量の比例補正（12/8 = 1.5）。
  // ことだま分は calcEffect に synergy.turnScale として渡し、表示数値と実効deltaを一致させる
  // （外側では掛けない=二重適用防止）。友達AIのpushは表示に数値が出ないため外側適用のまま。
  const TURN_SCALE   = 1.5;

  // 2026-09-17: プレイヤーの獲得量だけを友達の押しから切り離す。
  // 1.5 のままだと ♥55 の成功ラインに T5〜T6 で届いてしまい、連絡先が押せる T7 との間に
  // 「もう勝っているのに、まだ押せない」区間が生まれる（意思決定の53.7%がそこで行われていた）。
  // 0.8 に下げると到達の重心が T7 に寄り、ライバルの到達（案1でT8へ移動済み）と初めて重なる。
  //
  // 2026-09-20 手札制(第2段)で再調整: 0.6 → 0.50。
  // 札の倍率（質 × 流れ）が calcEffect の turnScale に乗るようになり、
  // 実効倍率の平均が約1.9倍に上がったため、素の係数を下げて釣り合いを戻した。
  // 実測は tools/tune_deck.js（方針別の連絡先GET率で決めている）。
  // 2026-09-21 ネタ札の導入で再調整: 0.44 → 0.64。
  // 6手のうち1〜2手が「話題を振る手」に変わり、直接♥を積む手が減ったぶんを戻した。
  // 実測(tools/tune_deck.js) 連絡先GET: 上手い50.7% / 流れだけ34.5% /
  // 適当30.0% / 強い札を出し続ける24.9% —— 上手い打ち手が naive の約2倍。
  // 2026-09-22 連絡先を「引く札」にしたぶんの再調整: 0.64 → 0.72。
  // 実測(1500周/方針) 連絡先GET: 上手い47.1% / 流れだけ33.3% /
  // 適当24.8% / 強い札を出し続ける22.3%。
  // 札を引けない夜が15%あり、それはそのまま「聞けなかった夜」として残す。
  const PLAYER_GAIN_SCALE = 0.72;

  // タイミング窓の長さ補正（FB「窓が少し短い」対応）。各シチュのwindowMsに掛ける。
  const TIMING_WINDOW_MULT = 1.4;

  // 会話コマンドのセリフ化（仕様: docs/conversation-redesign-spec.md A-2）
  const PLAYER_LINE_WAIT_MS  = 1200;  // 自分のセリフ → 結果表示の間
  const REACTION_WAIT_MS     = 1500;  // 相槌へのヒロインの返し → 結果表示の間
  const THIRD_AIR            = 58;    // 3人目が反応しはじめる場の温度
  const PASS_AIR_COST        = 1;     // パス（引き直し）で落ちる場の温度
  const THIRD_WAIT_MS        = 650;   // 3人目の仕草はログ一行なので短く
  // 「友達に向く」（仕様: 同 B-3）
  const WHISPER_LINE_WAIT_MS = 1200;  // 耳打ちの往復の行間
  const LOOKAWAY_HEART_PENALTY = -3;  // よそ見コスト（狙いの子の♡）
  const WHISPER_EXCHANGE = {
    nadameru: {
      player: '「(小声)ちょっと落ち着け。ゆっくりいこうぜ」',
      friend: '「……お、おう。そうだな」',
    },
    aoru: {
      player: '「(小声)いいぞ、そのまま行け」',
      friend: '「よっしゃ、見とけよ」',
    },
  };

  const ENDINGS = {
    A: { icon:'🎉', title:'全員ハッピー',     sub:'3組全員成立！\n最高の布陣だった。' },
    B: { icon:'😊', title:'みんな盛り上がり',  sub:'カップルはないけど楽しい夜だった。\n場の空気が最後まで続いた。' },
    C: { icon:'😏', title:'俺だけ勝ち逃げ',   sub:'連絡先ゲット！\n友達はどうなったかはまあいいか。' },
    D: { icon:'😐', title:'縁なかったね',     sub:'今夜は縁がなかった。\n次回は布陣を見直してみよう。' },
    E: { icon:'💨', title:'合コン崩壊',       sub:'場の空気が完全に死んだ…\n布陣を見直そう。' },
    F: { icon:'💔', title:'目の前で獲られた', sub:'狙いの子はライバルに連れて行かれた…\n次はレースを制そう。' },
  };

  // ── 初期化エントリーポイント ─────────────────────
  function start() {
    // データ読み込み
    GameState.load();
    const config = loadConfig() || {};
    PARTY_IDS   = JSON.parse(localStorage.getItem('goukon_party')       || '[]');
    HEROINE_IDS = JSON.parse(localStorage.getItem('goukon_heroines')    || '[]');
    INIT_AIR    = JSON.parse(localStorage.getItem('goukon_init_air')    || '50');
    INIT_HEARTS = JSON.parse(localStorage.getItem('goukon_init_hearts') || '{}');
    SEATING     = JSON.parse(localStorage.getItem('goukon_seating')     || '{"selfSeat":0,"friendSeats":{}}');

    partyChars   = PARTY_IDS.map(id => CHARACTERS.find(c => c.id === id)).filter(Boolean);
    heroineChars = HEROINE_IDS.map(id => HEROINES.find(h => h.id === id)).filter(Boolean);
    SELF_PARAMS  = derivePlayerParams(config.living || 'home', config.circle || 'none', config.part || 'none');
    SYNERGY      = calcSynergy(PARTY_IDS, HEROINE_IDS, config);
    BALANCE      = Balance.get();   // 難易度プリセット（normal/easy）

    // 手札制（企画書§17 A）: その夜のデッキを属性×パラメータで組む。
    // 属性が札の「種類」を、パラメータが札の「質」を決める（js/core/deck.js）。
    // 日常で覚えた札（月画面のアクションで増える）
    const learned = JSON.parse(localStorage.getItem('goukon_learned') || '[]');
    DECK = DeckCore.createState(
      DeckCore.buildDeck(
        { living: config.living || 'home', circle: config.circle || 'none', part: config.part || 'none' },
        SELF_PARAMS, undefined, learned
      ).cards
    );

    // STATE 初期化
    STATE = _buildInitialState();

    // UI 初期化
    _initUI();

    // 立ち絵を事前ロード → ゲーム開始
    setTimeout(() => {
      if (heroineChars.length > 0) Stage.setSpeaker(heroineChars[0].id);
      setTimeout(() => _runTurn(), 300);
    }, 100);
  }

  // ── STATE 構築 ────────────────────────────────────
  function _buildInitialState() {
    const hearts        = {};
    const friendHearts  = {};
    const friendTargets = {};
    const twoWorld      = {};
    const revealedTypes = {};
    const heartDisplay  = {};

    heroineChars.forEach(h => {
      hearts[h.id]       = INIT_HEARTS[h.id] || 20;
      revealedTypes[h.id] = null;
      heartDisplay[h.id]  = 'hidden';
    });

    partyChars.forEach(c => {
      friendHearts[c.id]  = {};
      heroineChars.forEach(h => { friendHearts[c.id][h.id] = 10; });

      // 隠しターゲット決定（likes × heroineType マッチング）
      const scores = heroineChars.map(h => {
        let score = 0;
        (c.likes || []).forEach(lt => {
          if (h.type && h.type.includes(lt)) score += 2;
          if (h.likes && h.likes.includes(lt)) score += 1;
        });
        score += (h.params.visu || 50) * 0.01;
        return { h, score };
      });
      scores.sort((a, b) => b.score - a.score);
      friendTargets[c.id] = scores[0]?.h?.id || heroineChars[0]?.id;
    });

    const selfSeatIdx = SEATING.selfSeat ?? 0;
    const targetHeroine = heroineChars[selfSeatIdx] || heroineChars[0] || null;

    // 本気モード: ライバル選定（純粋ロジックは core）＋ターゲット固定。
    // 選定は targetHeroine / friendTargets が揃ったこの時点で行う（解釈: 仕様「開始時のライバル選定」を
    // STATE構築の締めに配置。純粋な選定計算は FriendAI.selectRival に一本化）。
    const rivalId = FriendAI.selectRival({ targetHeroine, friendTargets }, partyChars);
    if (rivalId != null && targetHeroine) {
      friendTargets[rivalId] = targetHeroine.id;   // ライバルは一途に狙いの子を追う
    }

    return {
      phase:          0,
      turn:           1,
      turnInPhase:    1,
      maxTurns:       MAX_TURNS,
      // Balance適用①: 空気初期値（easyは+16）
      airGauge:       Math.min(100, (INIT_AIR || 50) + BALANCE.airInitBonus),

      hearts,
      targetHeroine,
      revealedTypes,
      heartDisplay,

      friendHearts,
      friendTargets,
      twoWorld,
      friendMods:     {},   // { friendId: 'nadameru'|'aoru' } 次の友達AI行動1回で消費

      kotodamaFired:       false,
      lastActionWasKanshi: false,
      timingWindowOpen:    false,
      timingWindowUsed:    false,
      timingBonusActive:   false,

      currentSituation:  null,
      recentSituations:  [],
      usedSituations:    [],
      thread:            null,   // 会話スレッド（S2: docs/heroine-agent-spec.md §2-1）
      engagement:        HeroineAI.initEngagement(heroineChars),   // S1: 会話に乗っているか
      lastKotodamaType:  null,   // 前のターンの手（engagement の関与判定用）
      intents:           {},     // 【意図】ヒロインidごとの「いま待っているもの」。ターン頭に確定し1ターン固定
      chain:             ChainCore.init(),   // C1: 会話チェイン（レーン・連鎖数）
      futariApexDone:    {},   // C2: 【二人の温度】発火済みガード（hid→true。ゲーム開始時のみリセット・断絶では消さない）

      contactSuccess: false,
      contactId:      null,
      gameEnded:      false,
      typeRevealFlashUntil: {},   // hid → flash終了時刻(ms)

      // 本気モード
      rivalId,                    // ライバルの友達id（null=友達不在）
      rivalStolen:    false,      // ライバルが狙いの子を奪ったか
      stolenHeroineId: null,      // 奪われた狙いの子のid
    };
  }

  // ── UI 初期化 ─────────────────────────────────────
  function _initUI() {
    // Stage（奥行きカード）
    const cardEls = [0, 1, 2].map(i => ({
      root:   document.getElementById('h-card-' + i),
      img:    document.getElementById('vn-img-' + i),
      nameEl: document.getElementById('h-name-' + i),
      subEl:  document.getElementById('h-sub-' + i),
    }));
    Stage.init(heroineChars, cardEls, document.getElementById('obs-hint'), {
      selfSeat: SEATING.selfSeat ?? 0,
      targetId: STATE.targetHeroine?.id ?? null,
      stageEl:  document.getElementById('vn-stage'),
      svgEl:    document.getElementById('gaze-svg'),
    });
    Stage.updateHearts(STATE.hearts);

    // 本気モード: 狙いの子カード下にライバル到達バーを設置
    if (STATE.rivalId != null && STATE.targetHeroine) {
      const rival = partyChars.find(c => c.id === STATE.rivalId);
      Stage.initRivalBar(STATE.targetHeroine.id, _shortName(rival?.name || 'ライバル'));
      _updateRivalRace();
    }

    // 友達の影絵は編成人数分だけ表示
    [0, 1].forEach(i => {
      const show = i < partyChars.length;
      document.getElementById('f-sil-' + i)?.classList.toggle('hidden', !show);
      document.getElementById('f-chip-' + i)?.classList.toggle('hidden', !show);
    });

    // VNEngine
    VNEngine.init(
      {
        nameEl:   document.getElementById('vn-name'),
        textEl:   document.getElementById('vn-text'),
        tapEl:    document.getElementById('tap-indicator'),
        friendEl: document.getElementById('friend-indicator'),
        obsEl:    document.getElementById('obs-hint'),
      },
      Stage
    );

    // KotodamaPanel
    KotodamaPanel.init(
      document.getElementById('kotodama-panel'),
      document.getElementById('timing-bar'),
      _onKotodama
    );

    // FriendPanel（「友達に向く」入口＋オーバーレイ）
    FriendPanel.init(
      document.getElementById('friend-strip'),
      document.getElementById('friend-overlay'),
      { onAction: _onFriendAction, getInfo: _friendOverlayInfo }
    );

    // 手札を最初に描く（Phase0のセリフ中も「何が出せるか」は見えている）
    _renderHand();

    // JunctionUI（山場の型カード。一時オーバーレイ）
    JunctionUI.init(document.getElementById('junction-cards'));

    // HUD
    HUD.init({
      nightMeterEl: document.getElementById('night-meter'),
      nightClockEl: document.getElementById('night-clock'),
      nightWordEl:  document.getElementById('night-word'),
      airFillEl:    document.getElementById('air-fill'),
      airNumEl:     document.getElementById('air-num'),
      targetNameEl: document.getElementById('target-name'),
      gameOverEl:   document.getElementById('game-over'),
      goIconEl:     document.getElementById('go-icon'),
      goTitleEl:    document.getElementById('go-title'),
      goSubEl:      document.getElementById('go-sub'),
      hSubEls:      [0, 1, 2].map(i => document.getElementById('h-sub-' + i)),
      fChipEls:     [0, 1].map(i => document.getElementById('f-chip-' + i)),
    });

    // タップイベント（ステージ + テキストボックス）
    document.getElementById('vn-stage')?.addEventListener('click', _onTap);
    document.getElementById('vn-textbox-area')?.addEventListener('click', _onTap);

    // 結果画面ボタン
    document.getElementById('go-result-btn')?.addEventListener('click', () => {
      location.href = 'result.html';
    });

    // 初回 UI 更新
    HUD.updateAir(STATE.airGauge);
    HUD.updateTurn(STATE.turn, STATE.maxTurns);
    HUD.updateTarget(_shortName(STATE.targetHeroine?.name || '—'));
    _renderInfoUI();
  }

  // ── タップハンドラ ─────────────────────────────────
  function _onTap() {
    if (STATE.gameEnded) return;
    VNEngine.tap();
  }

  // ── ターン実行 ────────────────────────────────────
  async function _runTurn() {
    if (STATE.gameEnded) return;

    HUD.updateTurn(STATE.turn, STATE.maxTurns);
    _updateInfoReveal();
    _renderInfoUI();
    // フェーズ確定時に語彙を更新
    KotodamaPanel.setVocab(STATE.phase);
    // 選択の受付はシチュエーション表示が始まるまで閉じる
    // （Phase0・友達ログ中に押せると前ターンの situation で発動し進行が二重に走る）
    // 「友達に向く」入口もことだまと同じ活性制御に乗せる（仕様B-1）
    KotodamaPanel.disable();
    FriendPanel.setEnabled(false);
    // 早とちり見える化: セリフ・ログが流れている間は「…話し中」
    KotodamaPanel.setSpeechState('talking');
    // ターン境界で前ターンの予告/窓バーを確実にリセット（priming/timing-windowの取り残し防止）
    KotodamaPanel.closeTimingWindow();
    STATE.kotodamaFired = false;

    // フェーズ開始ナレーション（turnInPhase === 1 のとき）
    if (STATE.turnInPhase === 1 && STATE.turn > 1) {
      const narr = PhaseManager.phaseStartNarration(STATE.phase);
      if (narr) {
        VNEngine.showImmediate('narr', '', narr);
        await _sleep(800);
      }
    }

    // Phase 0 ターン1: 乾杯
    // Phase 0 ターン2: 自己紹介（1人ずつ）
    if (STATE.phase === 0) {
      await _runPhase0Turn();
      _advanceTurn();
      return;
    }

    // 友達の自律行動（結果を STATE に反映 + ログ表示）
    await _runFriendActions();

    // 2人の世界チェック
    await _check2World();

    // ヒロインの内部状態更新（S1/S4: engagement＋trait能動行動）
    await _runHeroineTick();

    // シチュエーション選択 + 表示
    // 会話スレッド継続中なら次の段（同じ話題が場を回る）を優先。組めなければ通常抽選へ
    const step = ThreadManager.nextStep(STATE.thread, STATE.phase, STATE, partyChars, heroineChars);
    if (step) {
      STATE.thread           = step.thread;
      STATE.currentSituation = step.situation;

      // S3: 会話が続いた報酬（場が温まる＋話題に乗った子の♥）。表示は質的表現のみ
      const bonus = step.situation.bonus;
      if (bonus) {
        STATE.airGauge = Math.min(100, STATE.airGauge + (bonus.airDelta || 0));
        if (bonus.heartTo != null && bonus.heartDelta) {
          STATE.hearts[bonus.heartTo] = Math.min(100,
            (STATE.hearts[bonus.heartTo] || 0) + bonus.heartDelta
          );
        }
        HUD.updateAir(STATE.airGauge);
        Stage.updateHearts(STATE.hearts);
        VNEngine.showImmediate('narr', '', bonus.text || '（話が続いて、場があたたまってきた）');
        await _sleep(900);
      }
    } else {
      STATE.thread = null;
      STATE.currentSituation = SituationManager.select(
        STATE.phase, STATE, partyChars, heroineChars
      );
      STATE.thread = ThreadManager.open(STATE.currentSituation);
      // C1: 話題が切り替わった=会話のリズムが切れた（C2でfuru直後の扱いを再検討）
      // 2026-09-16: 二人チェイン中は話題が変わってもレーンを維持する。
      // ここで毎ターン初期化していたため、1008-1013 の「二人チェイン中はchainを維持」が
      // 実際には機能していなかった（話題切替のほうが先に潰していた）。
      if (!(STATE.chain && STATE.chain.lane === 'futari')) {
        STATE.chain = ChainCore.init();
      }
      // 手札制: ここで DeckCore.breakChain は呼ばない（意図的）。
      // 「流れ」はプレイヤー自身のものにする＝話題が振り直されても momentum は残り、
      // スベる・自分で話題を変える・黙る・目を離す、で初めて切れる。
      // ここで毎ターン切ると、続き段が29中3件しか無い現状では流れが一度も育たない。
      _renderChainFX();   // C4: 二人の空気は話題切替で解ける
    }
    if (!STATE.currentSituation) {
      _advanceTurn();
      return;
    }

    // 使用済み管理
    _markSituationUsed(STATE.currentSituation.id);

    // 観察ヒント
    _showObsHint();

    // タイミング窓あり？
    const timing = STATE.currentSituation.timing;
    if (timing) {
      await _runTimingTurn(STATE.currentSituation);
    } else {
      await _runNormalTurn(STATE.currentSituation);
    }
  }

  // ── Phase 0 専用（乾杯・自己紹介は intro.html で実施済み） ──
  async function _runPhase0Turn() {
    // 再構成(23ed57e: 席決め→intro(乾杯・自己紹介)→本番)以降、乾杯と自己紹介は
    // intro.html が担う。ここで再生すると二重になり「自己紹介がまた始まる＝ループ」に
    // 見えるため、Phase0 はターン番号(T1-2)と開示しきい値(型=T3/好感度=T5)を保つ
    // ための短い導入ビートに留める（乾杯・自己紹介そのものは再生しない）。
    Stage.dimAll();   // intro から引き継ぎ、全員を場に出す（誰もスポットしない）
    if (STATE.turnInPhase === 1) {
      VNEngine.showImmediate('narr', '', 'グラスも空いて、場がほぐれてきた。さあ、ここからが本番だ。');
      await _sleep(1100);
    } else {
      await _sleep(200);
    }
  }

  // ── 通常ターン ────────────────────────────────────
  async function _runNormalTurn(situation) {
    // セリフ中もことだまは押せる（早とちりペナルティ対象）
    KotodamaPanel.enable();
    FriendPanel.setEnabled(true);
    _updateGreyout();

    // セリフ表示
    await VNEngine.showDialogues(situation.dialogues);
    if (STATE.gameEnded) return;

    // 山場(junction)を持つシチュは、6ことだまの通常待ちに戻さず「型の読み合い」に入る
    if (situation.junction && situation.openTag) {
      await _runJunction(situation);
      return;
    }

    // 以降はプレイヤーの選択待ち（ことだま or 静観）。自動進行はしない
    // 早とちり見える化: セリフが終わった＝「今押せる」点灯
    if (!STATE.kotodamaFired) KotodamaPanel.setSpeechState('ready');
  }

  // ── 山場（junction）: 型を読んで選ぶ→着地が見える ────
  // 設計: docs/conversation-metacognition-design.md §3(流れ)/§6(着地演出)/§11(一時カード)。
  // openTag×型を judgeKata で二値判定し、hit/miss どちらも「なぜそうなったか」を必ず言語化する。
  const JUNCTION_HIT_AIR  = 3;    // 届いた（既存「スベった -3」と対称の軽微さ・§6.5）
  const JUNCTION_MISS_AIR = -3;   // 重く受け止めすぎ。連鎖罰はしない・次ビートで即回復

  async function _runJunction(situation) {
    // 山場中は通常パネルを畳む（型は一時カードで選ぶ・§11）
    KotodamaPanel.closeMenu();
    KotodamaPanel.disable();
    FriendPanel.setEnabled(false);
    STATE.kotodamaFired = true;   // このターンの手は「型選択」で確定（通常待ちに戻さない）

    const j = situation.junction;

    // 視線が向くナレーション
    VNEngine.showImmediate('narr', '', j.prompt || '——視線が、こっちに来た。');
    await _sleep(1000);
    if (STATE.gameEnded) return;

    // 型カードを出してクリックを待つ
    const kata   = await JunctionUI.choose(j.cards);
    if (STATE.gameEnded) return;
    const chosen = j.cards.find(c => c.kata === kata);

    // 選んだセリフをログに載せる
    if (chosen) {
      VNEngine.showImmediate('player', 'あなた', chosen.text);
      await _sleep(PLAYER_LINE_WAIT_MS);
      if (STATE.gameEnded) return;
    }

    // 二値判定（効果計算の手前の薄いレイヤー。calcEffect等は不変）
    const verdict = KotodamaCore.judgeKata(situation.openTag, kata);

    if (verdict === 'hit') {
      const h = _reactingHeroine();
      if (j.landing.hit.heroine && h) {
        Stage.setSpeaker(h.id);
        VNEngine.showImmediate('heroine', _shortName(h.name), j.landing.hit.heroine);
        await _sleep(1300);
        if (STATE.gameEnded) return;
      }
      STATE.airGauge = Math.min(100, STATE.airGauge + JUNCTION_HIT_AIR);
      HUD.updateAir(STATE.airGauge);
      VNEngine.showImmediate('result', '', j.landing.hit.narr);
    } else {
      _toneCool();   // 光のトーンを一段冷やす（画面暗転はしない・§6.2）
      // フォローは友達の役目（§6.3・core-loop 規律5）
      const follower = partyChars[1] || partyChars[0];
      if (j.landing.miss.friend && follower) {
        Stage.dimAll();
        VNEngine.showImmediate('friend', _shortName(follower.name), j.landing.miss.friend);
        await _sleep(1400);
        if (STATE.gameEnded) return;
      }
      STATE.airGauge = Math.max(0, STATE.airGauge + JUNCTION_MISS_AIR);
      HUD.updateAir(STATE.airGauge);
      VNEngine.showImmediate('result neutral', '', j.landing.miss.narr);
    }

    // 山場で話題は一区切り。次ビートで通常進行に復帰（即回復・§6.5）
    // 手札制: 外したら流れが切れる。当てたら流れは続く（山場は賭けになる）
    if (verdict !== 'hit') DeckCore.breakChain(DECK);
    STATE.thread = null;
    STATE.chain  = ChainCore.init();
    _renderChainFX();
    await _sleep(1800);
    _toneReset();
    _advanceTurn();
  }

  // 光のトーン制御（かぶり暗転とは別クラス・§6.2）
  function _toneCool()  { document.getElementById('vn-stage')?.classList.add('tone-cool'); }
  function _toneReset() { document.getElementById('vn-stage')?.classList.remove('tone-cool'); }

  // ── タイミング窓ターン ────────────────────────────
  async function _runTimingTurn(situation) {
    STATE.timingWindowOpen = false;
    STATE.timingWindowUsed = false;
    STATE.timingBonusActive = false;

    // グレーアウト更新（窓が開く前は半透明で操作不可）
    KotodamaPanel.disable();
    FriendPanel.setEnabled(false);

    // セリフを自動送り（タップ不要）で流す
    // 実装: showDialogues を Promise で待たずに開始 → 所定のセリフ位置で窓を開く
    const timingAfterIdx = situation.timing.afterDialogue
      ?? Math.max(0, situation.dialogues.length - 2); // デフォルト: 最後から2番目以降

    // 早とちり見える化: 窓が開くまでの残りセリフ時間を「相手が話し終わるまで満ちるバー」で予告する
    // （FB「早とちりの判定基準が見えない」対応。窓が開く瞬間の残り時間バーとは別に、
    //  開く前の待ち時間も #timing-bar 上に質的に見せる＝どちらも同じ要素の色違いで統一）
    const openIdx = Math.min(timingAfterIdx, situation.dialogues.length - 1);
    const preMs   = 300 + Math.max(0, openIdx) * 1200; // 予告sleep300ms + セリフ間隔ぶん

    // 予告アニメーション（バーが満ちていく＝「まだ話の途中」の残り時間表現）
    KotodamaPanel.primeTimingWindow(preMs);
    await _sleep(300);

    // セリフを自動送り
    for (let i = 0; i < situation.dialogues.length; i++) {
      // 発動済みなら残りのセリフで結果表示を上書きしない
      if (STATE.kotodamaFired) break;
      const d = situation.dialogues[i];
      VNEngine.showImmediate(d.type, d.speaker, d.text);
      if (d.heroineId) Stage.setSpeaker(d.heroineId);

      const isLast    = i === situation.dialogues.length - 1;
      const openHere  = i === timingAfterIdx || (timingAfterIdx >= situation.dialogues.length && isLast);

      if (openHere && !STATE.timingWindowUsed) {
        // 窓を開く
        STATE.timingWindowOpen = true;
        KotodamaPanel.enable();
        KotodamaPanel.setSpeechState('ready');   // 窓が開いた＝今押せる
        FriendPanel.setEnabled(true);
        _updateGreyout();
        // タイミング窓は「今すぐ選ばせたい」場面 → 文脈選択肢を中央に自動展開
        // （喋る→手 の2タップを1タップにして緊張感を保つ）
        KotodamaPanel.openMenu();

        await new Promise(resolve => {
          KotodamaPanel.openTimingWindow(Math.round(situation.timing.windowMs * TIMING_WINDOW_MULT), () => {
            // 窓が自然に閉じた
            STATE.timingWindowOpen = false;
            resolve();
          });

          // ことだまが押されたら早期 resolve
          // （_onKotodama 内で timingWindowUsed をセット → _closeTimingWindow 後に resolve）
          _timingResolve = resolve;
        });

        STATE.timingWindowOpen = false;
        KotodamaPanel.closeTimingWindow();
        // 窓が閉じても残りのセリフが流れている間は「…話し中」に戻す
        if (!STATE.kotodamaFired) KotodamaPanel.setSpeechState('talking');
      } else {
        await _sleep(1200); // 通常のセリフ間隔
      }
    }

    // 窓が未使用で過ぎた → 通常のことだま選択へ（プレイヤーの選択待ち）
    // enable→greyout の順で「喋る」の可否をgreyoutに最終決定させる
    if (!STATE.kotodamaFired) {
      KotodamaPanel.enable();
      _updateGreyout();
      KotodamaPanel.setSpeechState('ready');
      FriendPanel.setEnabled(true);
      KotodamaPanel.openMenu();
    }
  }

  let _timingResolve = null;

  // ── 友達の自律行動 ────────────────────────────────
  async function _runFriendActions() {
    // Balance適用②: 空気自然減衰（友達AI事故由来）の倍率。easyは×0.5
    const result = FriendAI.runActions(
      STATE, partyChars, heroineChars,
      (SYNERGY.bonuses.airDecayMult || 1.0) * BALANCE.airDecayMult
    );

    // STATE に反映（pushは8T化の比例補正 TURN_SCALE を掛けて適用）
    Object.keys(result.heartDeltas).forEach(fid => {
      Object.keys(result.heartDeltas[fid]).forEach(hid => {
        if (!STATE.friendHearts[fid]) STATE.friendHearts[fid] = {};
        STATE.friendHearts[fid][hid] = Math.min(100,
          (STATE.friendHearts[fid][hid] || 0) + Math.round(result.heartDeltas[fid][hid] * TURN_SCALE)
        );
      });
    });
    Object.keys(result.targetChanges).forEach(fid => {
      STATE.friendTargets[fid] = result.targetChanges[fid];
    });
    STATE.airGauge = Math.max(0, Math.min(100, STATE.airGauge + result.airDelta));
    STATE.lastActionWasKanshi = false; // リセット

    // C3: 割り込みのレーン別判定（friendMods を読むためクリアの前に組み立てる）
    // push は TURN_SCALE 適用前の生値（heartDeltas の値そのまま）。
    // Object.keys で文字列化された id は partyChars/heroineChars で元の型に戻す
    // （chain.partnerId は数値idのため strict 比較が要る）
    const pushes = [];
    Object.keys(result.heartDeltas).forEach(fid => {
      const friend = partyChars.find(c => String(c.id) === fid);
      const mod    = (STATE.friendMods || {})[fid] || null;
      Object.keys(result.heartDeltas[fid]).forEach(hid => {
        const heroine = heroineChars.find(h => String(h.id) === hid);
        pushes.push({
          friendId: friend ? friend.id : fid,
          targetId: heroine ? heroine.id : hid,
          push:     result.heartDeltas[fid][hid],
          mod,
        });
      });
    });
    const fr = ChainCore.onFriendActions(STATE.chain, pushes);
    STATE.chain = fr.chain;
    _renderChainFX();   // C4: 割り込み断絶なら靄が晴れる（継続なら冪等で変化なし）

    STATE.friendMods = {};             // 耳打ち効果は友達AI行動1回で消費（仕様B-4）

    HUD.updateAir(STATE.airGauge);
    _renderInfoUI();

    // 行動ログ表示（1行ずつ。誰が何をしたかが先、その意味づけ=割り込み/加勢は後）
    for (const log of result.actionLogs) {
      VNEngine.showImmediate('friend', '', log);
      await _sleep(600);
    }

    // C3: 二人チェイン中の割り込み＝断絶（ペナルティは仮決めでチェイン喪失のみ）
    if (fr.interruptedBy != null) {
      const interrupter = partyChars.find(c => String(c.id) === String(fr.interruptedBy));
      const fn = _shortName(interrupter?.name || '友達');
      VNEngine.showImmediate('friend', '', `💥 ${fn}が割り込んできた——二人の空気が散った`);
      await _sleep(600);
    }

    // C3: 場チェイン中は友達の声が加勢＝場が更に温まる
    if (fr.baBoost > 0) {
      STATE.airGauge = Math.max(0, Math.min(100, STATE.airGauge + fr.baBoost));
      HUD.updateAir(STATE.airGauge);
      _log('みんなの声が重なって、卓が一周した');
    }
  }

  // ── ヒロインの内部状態更新（S1/S4） ────────────────
  async function _runHeroineTick() {
    // 前のターンに話題へ関わった子 = 直前situationの発話者 + 相槌の宛先(狙いの子)
    const involved = [];
    (STATE.currentSituation?.dialogues || []).forEach(d => {
      if (d.heroineId != null && !involved.includes(d.heroineId)) involved.push(d.heroineId);
    });
    if (['kyokan', 'fukagori', 'renraku'].includes(STATE.lastKotodamaType) && STATE.targetHeroine) {
      if (!involved.includes(STATE.targetHeroine.id)) involved.push(STATE.targetHeroine.id);
    }

    const r = HeroineAI.tick(STATE, partyChars, heroineChars, involved);
    STATE.engagement = r.engagement;

    // 【意図】このターンの予告を確定させる（ターン中は動かさない＝読んでから出せる）。
    // 効果倍率は kotodama.js calcEffect / _fireTopicCard が同じ値を見る。
    STATE.intents = HeroineAI.intents(STATE, heroineChars);
    Stage.renderIntents(STATE.intents, heroineChars);
    _renderHand();   // 予告が変わった＝どの印が当たりかも変わる

    // 惚れっぽい子が友達に流れた分（TURN_SCALEは掛けない: AI由来の少量加算）
    Object.keys(r.friendHeartDeltas).forEach(fid => {
      Object.keys(r.friendHeartDeltas[fid]).forEach(hid => {
        if (!STATE.friendHearts[fid]) STATE.friendHearts[fid] = {};
        STATE.friendHearts[fid][hid] = Math.min(100,
          (STATE.friendHearts[fid][hid] || 0) + r.friendHeartDeltas[fid][hid]
        );
      });
    });
    if (r.airDelta) {
      STATE.airGauge = Math.max(0, Math.min(100, STATE.airGauge + r.airDelta));
      HUD.updateAir(STATE.airGauge);
    }

    for (const log of r.logs) {
      VNEngine.showImmediate('friend', '', log);
      await _sleep(600);
    }
    _renderInfoUI();
  }

  // ── 2人の世界チェック ─────────────────────────────
  async function _check2World() {
    const result = FriendAI.check2World(STATE, partyChars, heroineChars);

    for (const ev of result.events) {
      STATE.twoWorld[ev.friendId] = ev.heroineId;
      STATE.airGauge = Math.min(100, STATE.airGauge + (ev.airBonus || 0));
      HUD.updateAir(STATE.airGauge);
      _renderInfoUI();

      // 本気モード: ライバルが狙いの子を奪った＝主目的ロス（強い1ビート）
      const isSteal = ev.friendId === STATE.rivalId
        && STATE.targetHeroine && ev.heroineId === STATE.targetHeroine.id
        && !STATE.rivalStolen;
      if (isSteal) {
        await _handleStolen(ev);
      } else {
        VNEngine.showImmediate('narr', '', ev.text);
        await _sleep(800);
      }
    }
  }

  // ── 奪われた（ライバルが72到達）演出 ───────────────
  async function _handleStolen(ev) {
    STATE.rivalStolen     = true;
    STATE.stolenHeroineId = ev.heroineId;

    const rival = partyChars.find(c => c.id === STATE.rivalId);
    const rn = _shortName(rival?.name || 'ライバル');
    const hn = _shortName(STATE.targetHeroine?.name || '彼女');

    Stage.markStolen(ev.heroineId);   // 狙いの子の立ち絵が靄に沈む（退場演出）
    _updateRivalRace();               // バーを「連れて行かれた」表示に

    VNEngine.showImmediate('result bad', '', `${hn}は${rn}と行ってしまった…もう連絡先は聞けない。`);
    _renderInfoUI();
    await _sleep(1600);
  }

  // ── ライバル到達バーの更新 ────────────────────────
  function _updateRivalRace() {
    if (STATE.rivalId == null || !STATE.targetHeroine) return;
    const heart = (STATE.friendHearts[STATE.rivalId] || {})[STATE.targetHeroine.id] || 0;
    Stage.updateRivalRace(heart, FriendAI.TWO_WORLD_THRESHOLD, STATE.rivalStolen);
  }

  // ── 出した札の宛先 ────────────────────────────────
  // 相手に向けて言う手だけが宛先を持つ。ノリ・話題変え・飲もうぜは場に投げる手で、
  // 受け取る相手がいない。札の行き先がそのまま「誰に出したか」の答えになる。
  const ADDRESSED_TYPES = ['kyokan', 'fukagori', 'renraku'];

  function _flyDestHeroineId(type) {
    if (!ADDRESSED_TYPES.includes(type)) return null;
    return _reactingHeroine()?.id ?? null;
  }

  // 札は .played と _renderHand でDOMから消える。飛ばす元の位置と見た目は、
  // 消える前のこの瞬間にしか取れない
  function _grabPlayedCard(id) {
    const el = document.querySelector(`.fan-card[data-id="${id}"]`);
    if (!el) return null;   // 静観・話を振る等の常時手は札ではない
    return { rect: el.getBoundingClientRect(), ghost: el.cloneNode(true), src: el };
  }

  // ── ターンログ（2026-09-24）────────────────────────
  // 第三者視点の要約は会話ウィンドウに出さない。いま目の前で見たものを、
  // もう一度言葉で説明されるのが「説明的」の正体だった。
  // 場に出すのは具体（セリフ・仕草・札の行き先）、要約はこの1行だけ。
  function _log(text) {
    if (!text) return;
    (STATE.logLines = STATE.logLines || []).push(text);
    const el = document.getElementById('turn-log');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('in');
    void el.offsetWidth;          // アニメを再生させるための再フロー
    el.classList.add('in');
  }

  // ── 狙いを変える（2026-09-24）────────────────────
  // 宛先が布陣で決めた1人に固定されていて、予告を読んでも動けなかった。
  // 手番は消費しない自由行動＝読んでから宛先を決められる。
  // 卓に3人しかいないので選択画面は作らず、押すたびに次の子へ回す。
  function _cycleAim() {
    if (STATE.gameEnded) return;
    const live = heroineChars.filter(h =>
      !STATE.twoWorld[h.id] && STATE.stolenHeroineId !== h.id);
    if (live.length < 2) return;
    const cur  = live.findIndex(h => h.id === STATE.targetHeroine?.id);
    const next = live[(cur + 1 + live.length) % live.length];
    if (!next || next.id === STATE.targetHeroine?.id) return;
    STATE.targetHeroine = next;
    Stage.setTarget?.(next.id);
    const tn = document.getElementById('target-name');
    if (tn) tn.textContent = _shortName(next.name);
    KotodamaPanel.setAimTarget(_shortName(next.name));
    // 予告は宛先で変わる（「待ってる」は狙っている子にしか出ない）ので即時に引き直す
    STATE.intents = HeroineAI.intents(STATE, heroineChars);
    Stage.renderIntents(STATE.intents, heroineChars);
    _renderInfoUI();
    _renderHand();
    _log(`狙いを${_shortName(next.name)}に変えた`);
  }

  /**
   * パス（2026-09-24）。出せる札が無いのに何か出して損をする、を無くす。
   * 手札を全部捨てて引き直す。代償は手番1つと流れ（chain）の断絶だけで、
   * 静観のように友達の押しが強まることはない。
   */
  function _doPass() {
    if (STATE.gameEnded) return;
    if (VNEngine.isActive() && !STATE.timingWindowOpen) return;
    if (STATE.timingWindowOpen) {
      KotodamaPanel.closeTimingWindow();
      STATE.timingWindowOpen = false;
      if (_timingResolve) { _timingResolve(); _timingResolve = null; }
    }
    KotodamaPanel.disable();
    const { n } = DeckCore.mulligan(DECK, undefined, _sitTags());
    STATE.thread = null;
    STATE.chain  = ChainCore.init();
    _renderChainFX();
    STATE.lastActionWasKanshi = false;   // 静観と違い、友達の押しは強まらない
    STATE.airGauge = Math.max(0, STATE.airGauge - PASS_AIR_COST);
    HUD.updateAir(STATE.airGauge);
    VNEngine.showImmediate('narr', '', '（言いかけて、やめた）');
    _renderHand();
    _log(`持ちネタを${n}枚入れ替えた`);
    setTimeout(() => _advanceTurn(), 1500);
  }

  // ── ことだまハンドラ ──────────────────────────────
  function _onKotodama(id) {
    if (id === 'aim')  { _cycleAim(); return; }
    if (id === 'pass') { _doPass();   return; }   // 手番を消費しない
    if (STATE.gameEnded || STATE.kotodamaFired) return;

    // 手札制: 山札に入らない常時手（静観/話を振る/連絡先）はIDがそのまま type。
    // それ以外は手札の札ID → 札を引き当てて type と「この手で乗る倍率」を出す。
    let type = id, playedCard = null, chainMult = 1;
    if (!['kanshi', 'furu', 'renraku'].includes(id)) {
      const card = DECK && DECK.hand.find(c => c.id === id);
      if (!card) return;                       // 既に出した札の二度押し等
      if (card.type === 'renraku' && !_renrakuReady()) return;   // まだ切れない
      playedCard = card;
      type = card.type;
      // 倍率は「出す前の流れ」で決まる（自分のlinkは次の札に乗る）
      chainMult = DeckCore.effectMult(card, DECK, _sitTags());
    }

    // 早とちりの罰は廃止（2026-09-24）。7ボタン時代は「セリフ中に押すと空気-4」で
    // 待つことを教えていたが、手札制では見る拍で手札がロックされていて
    // そもそも押せない。物理で防げているものを罰で二重に教える必要はない。
    // セリフ送り中の入力は、黙って捨てる。
    if (VNEngine.isActive() && !STATE.timingWindowOpen) return;

    STATE.kotodamaFired = true;
    STATE.lastKotodamaType = type;   // S1: 次ターンのengagement関与判定に使う
    KotodamaPanel.disable();
    KotodamaPanel.setSpeechState('idle');
    FriendPanel.setEnabled(false);

    const timingBonus = STATE.timingWindowOpen;
    STATE.timingWindowUsed = timingBonus;
    STATE.timingBonusActive = timingBonus;

    // タイミング窓を閉じて resolve
    if (timingBonus) {
      KotodamaPanel.closeTimingWindow();
      STATE.timingWindowOpen = false;
      if (_timingResolve) { _timingResolve(); _timingResolve = null; }
    }

    // 静観（kanshi）: 会話スレッドは静かに終わる（チェインも断絶）
    if (type === 'kanshi') {
      STATE.thread = null;
      STATE.chain  = ChainCore.init();
      DeckCore.breakChain(DECK);   // 黙る＝流れが切れる
      _renderChainFX();   // C4: 静観で二人の空気も解ける
      STATE.lastActionWasKanshi = true;
      STATE.airGauge = Math.max(0, STATE.airGauge - 2);
      HUD.updateAir(STATE.airGauge);
      _log('黙っていた。そのぶん友達が前に出た');
      setTimeout(() => _advanceTurn(), 1800);
      return;
    }

    // 話を振る（S5）: いちばん冷えている子に話題を向ける（1手番消費）
    if (type === 'furu') {
      // 【意図】狙いの子が「よそ見」なら、まずその子を引き戻す。
      // 予告を見た人が当然やりたくなる手が通らないと、予告は飾りになる。
      const cold = _awayHeroine();
      if (!cold) { _advanceTurn(); return; }   // 保険（グレーアウトで通常は来ない）
      STATE.thread = null;                     // 話題はその子に移る
      DeckCore.breakChain(DECK);               // 宛先が変わる＝流れは仕切り直し
      KotodamaPanel.ripple('furu');
      VNEngine.showImmediate('player', 'あなた', `「そういえば、${_shortName(cold.name)}ちゃんはどうなの?」`);
      setTimeout(() => _fireFuruResult(cold), PLAYER_LINE_WAIT_MS);
      return;
    }

    // 本気モード: 奪われた後の連絡先は無効（押しても「もう遅い…」）
    if (type === 'renraku' && STATE.rivalStolen) {
      STATE.thread = null;
      const hn = _shortName(STATE.targetHeroine?.name || '彼女');
      VNEngine.showImmediate('result bad', '', `もう遅い…${hn}はライバルと行ってしまった。`);
      setTimeout(() => _advanceTurn(), 1800);
      return;
    }

    // リップルエフェクト（札の上で光らせてから抜く）
    const played = _grabPlayedCard(id);   // ripple が .played を付ける前に掴む
    KotodamaPanel.ripple(id);

    // ネタ札: 自分から話題を振る。刺されば会話が続き、外せば冷える（専用の解決）
    if (playedCard && playedCard.topic) {
      const flowAtPlay = { accumLink: DECK.accumLink, streak: DECK.streak };
      DeckCore.playCard(DECK, playedCard.id, undefined, _sitTags());
      DeckCore.breakChain(DECK);            // 話題を変えた＝流れは切れる
      setTimeout(_renderHand, 220);
      _fireTopicCard(playedCard, flowAtPlay, played);
      return;
    }

    // 札を場に出す: 手札から抜いて捨て札へ。1枚引く。自分のlinkが流れに積まれる
    if (playedCard) DeckCore.playCard(DECK, playedCard.id, undefined, _sitTags());
    // 出した札を宛先の席へ飛ばす。宛先の無い手は卓の真ん中に落ちて、
    // 誰にも渡らなかったことがそのまま見える
    // Stage.flyCard の有無を見てから呼ぶ。配信でJSが一部だけ古いまま
    // キャッシュされると、ここで例外が出てターンが進まなくなる（＝札が出せない）
    if (played && Stage.flyCard) Stage.flyCard(played.rect, _flyDestHeroineId(type), { el: played.ghost, origin: played.src });
    // 出した札が飛んでいくのを見せてから、引いた札を配る（第2段のUI）
    setTimeout(_renderHand, 220);

    // 自分のセリフを会話ログに載せてから結果を出す（仕様A-2）
    // 手札制: 札の顔に出ていたセリフを、そのまま言う（見たもの＝言うもの）
    const playerLine = (playedCard && playedCard.line)
      || _currentPreviewLine(type)
      || KotodamaVocab.pickLine(type, STATE.phase, STATE.currentSituation?.id);
    if (playerLine) {
      VNEngine.showImmediate('player', 'あなた', playerLine);
      setTimeout(() => _fireKotodamaResult(type, timingBonus, chainMult), PLAYER_LINE_WAIT_MS);
    } else {
      _fireKotodamaResult(type, timingBonus, chainMult);
    }
  }

  // ── ネタ札（話題を持つ札）の解決 ────────────────
  // 「シチュが振った話題に型で反応する」のではなく「自分がネタを出して刺さるか外すか」。
  //   刺さる  → その子が食いつき、♥が大きく動き、次ターン「もっと聞かせて」で会話が続く
  //   外れる  → 場が冷える。流れも切れているので、丸損の手になる
  // 幅の広い札（バイトの話）は外れない代わりに伸びない。狭い札は逆。
  // 刺さり度1あたりの♥。札自身の強さ(power)は倍率に含めない——含めると
  // 「上位札のネタ札」が一手で♥40を出してしまい、他の手が意味を失う。
  // 乗っている流れ（chainMult 最大2.65）だけが倍率として効く。
  const TOPIC_HEART_PER_APPEAL = 7;
  const TOPIC_ASSIST_HEART     = 6;   // 狙い以外に刺さったとき、その子を狙う友達へのアシスト
  const TOPIC_AIR_HIT          = 5;
  const TOPIC_AIR_MISS         = -6;

  async function _fireTopicCard(card, DECK_AT_PLAY, played) {
    // ネタ札は出す時点では誰に刺さるか分からない。だから宛先を持たせず、
    // いったん卓の真ん中へ落とす（食いついた子が出るのはこの後）
    if (played && Stage.flyCard) Stage.flyCard(played.rect, null, { el: played.ghost, origin: played.src });

    const topic = CardTopics.get(card.topic);
    if (!topic) { _advanceTurn(); return; }

    // 振り出しのセリフ（＝札の顔に出ていた一行）
    VNEngine.showImmediate('player', 'あなた', topic.open);
    await _sleep(PLAYER_LINE_WAIT_MS);
    if (STATE.gameEnded) return;

    const hit = CardTopics.biter(topic, heroineChars, STATE);

    if (hit) {
      const h   = hit.heroine;
      const mult = DeckCore.chainMult(DECK_AT_PLAY);
      // 【意図】食いついた子が、いま何を待っていたか。よそ見の子に刺しても薄い
      const iMult = HeroineAI.intentMult((STATE.intents || {})[h.id], 'neta');
      const gain = Math.round(TOPIC_HEART_PER_APPEAL * hit.appeal * PLAYER_GAIN_SCALE * mult * iMult);

      Stage.setSpeaker(h.id);
      VNEngine.showImmediate('heroine', _shortName(h.name), CardTopics.biteLine(topic, h.id));
      await _sleep(REACTION_WAIT_MS);
      if (STATE.gameEnded) return;

      STATE.hearts[h.id] = Math.min(100, (STATE.hearts[h.id] || 0) + gain);
      STATE.airGauge     = Math.min(100, STATE.airGauge + TOPIC_AIR_HIT);

      // 狙い以外に刺さった場合、その子を狙っている友達へのアシストになる。
      // 自分の勝ち筋にはならないが、夜としては無駄にならない（友達の線＝もう一つの勝ち筋）。
      const isTarget = STATE.targetHeroine && h.id === STATE.targetHeroine.id;
      let assisted = null;
      if (!isTarget) {
        const f = partyChars.find(c => !STATE.twoWorld[c.id] && STATE.friendTargets[c.id] === h.id);
        if (f && STATE.friendHearts[f.id]) {
          STATE.friendHearts[f.id][h.id] = Math.min(100,
            (STATE.friendHearts[f.id][h.id] || 0) + TOPIC_ASSIST_HEART);
          assisted = f;
        }
      }
      HUD.updateAir(STATE.airGauge);
      Stage.updateHearts(STATE.hearts);
      _updateRivalRace();

      // 2人目の反応（2026-09-24）。卓に3人いるのに一人としか会話が回らず、
      // 「他の子まで展開しない」状態だった。次点の子が、付き合い度に応じて
      // 乗る／流す／切るで一言返す（heroine-ai.js outOfArea を使い回す＝
      // 新規に書き足さずに卓が動く）。
      const second = CardTopics.secondBiter(topic, heroineChars, STATE, h.id);
      if (second) {
        const sr = HeroineAI.outOfArea(second.heroine, STATE);
        if (sr.say || sr.act) {
          Stage.setSpeaker(second.heroine.id);
          if (sr.say) {
            VNEngine.showImmediate('heroine', _shortName(second.heroine.name), sr.say);
          } else {
            VNEngine.showImmediate('narr', '', `（${_shortName(second.heroine.name)}は${sr.act}）`);
          }
          await _sleep(REACTION_WAIT_MS);
          if (STATE.gameEnded) return;
          if (sr.level === 'norm') {
            STATE.hearts[second.heroine.id] = Math.min(100,
              (STATE.hearts[second.heroine.id] || 0) + 2);
            STATE.airGauge = Math.min(100, STATE.airGauge + 2);
            HUD.updateAir(STATE.airGauge);
            Stage.updateHearts(STATE.hearts);
            _log(`${_shortName(second.heroine.name)}も乗ってきた`);
          }
        }

        // 3人目（2026-09-24）。卓の全員が喋ると1手が重くなるので、
        // 3人目はテキスト窓を開かず「仕草＋ログ一行」だけ。場が温まっている
        // か、話題が広いときだけ出る。
        const wide = CardTopics.widthOf(topic, heroineChars).n >= 3;
        if (STATE.airGauge >= THIRD_AIR || wide) {
          const third = heroineChars.find(t =>
            t.id !== h.id && t.id !== second.heroine.id &&
            !STATE.twoWorld[t.id] && STATE.stolenHeroineId !== t.id);
          if (third) {
            const tr = HeroineAI.outOfArea(third, STATE);
            if (tr.act || tr.say) {
              Stage.setSpeaker(third.id);
              _log(`${_shortName(third.name)}は${tr.act || 'うなずいている'}`);
              if (tr.level === 'norm') {
                STATE.hearts[third.id] = Math.min(100, (STATE.hearts[third.id] || 0) + 1);
                Stage.updateHearts(STATE.hearts);
              }
              await _sleep(THIRD_WAIT_MS);
              if (STATE.gameEnded) return;
            }
          }
        }
      }

      // 話題はここから続く。次ターン、その子が「もっと聞かせて」と返してくる
      STATE.thread = ThreadManager.openCardTopic(topic.id, h.id, card.tags);
      STATE.chain  = ChainCore.onAction(STATE.chain, {
        type: 'fukagori', ok: true, targetId: h.id,
        canFutariNow: ChainCore.canFutari(STATE, h, heroineChars, SEATING.selfSeat ?? 0),
      });
      _renderChainFX();

      const who = _shortName(h.name);
      const assistTxt = assisted ? `　（${_shortName(assisted.name)}が乗っかった）` : '';
      _log(`${who}に${gain >= 14 ? 'ぐっと近づいた' : gain >= 8 ? '距離が縮んだ' : '少し近づいた'}${assistTxt}`);
      setTimeout(() => _advanceTurn(), 1900);
      return;
    }

    // ── 誰の領域でもなかった（2026-09-23）──────────────
    // 以前は topic.miss を1本出して一律に空気-6だった＝誰に振っても同じ顔。
    // いまは狙いの子が「乗る／流す／切る」で返す（heroine-ai.js outOfArea）。
    // 判定は ♥×0.6＋空気×0.4。知らない話に付き合ってくれるかは、
    // 好感度と空気読みの合成で決まる。
    const who = (STATE.targetHeroine && !STATE.twoWorld[STATE.targetHeroine.id]
                 && STATE.stolenHeroineId !== STATE.targetHeroine.id)
      ? STATE.targetHeroine
      : heroineChars.find(h => !STATE.twoWorld[h.id] && STATE.stolenHeroineId !== h.id);

    if (!who) { STATE.thread = null; setTimeout(() => _advanceTurn(), 1200); return; }

    const r = HeroineAI.outOfArea(who, STATE);
    Stage.setSpeaker(who.id);
    if (r.say) {
      VNEngine.showImmediate('heroine', _shortName(who.name), r.say);
      await _sleep(REACTION_WAIT_MS);
      if (STATE.gameEnded) return;
    }
    if (r.act) {
      // 仕草は地の文で出す。感情は書かない＝見えたことだけ（直接情報）
      VNEngine.showImmediate('narr', '', `（${_shortName(who.name)}は${r.act}）`);
      await _sleep(1100);
      if (STATE.gameEnded) return;
    }

    STATE.thread   = null;
    STATE.airGauge = Math.max(0, Math.min(100, STATE.airGauge + r.fx.air));
    STATE.hearts[who.id] = Math.max(0, Math.min(100, (STATE.hearts[who.id] || 0) + r.fx.heart));
    if (r.fx.engage) {
      STATE.engagement = { ...STATE.engagement,
        [who.id]: Math.max(0, Math.min(100, (STATE.engagement[who.id] || 55) + r.fx.engage)) };
      // 予告は1ターン固定が原則だが、ここは「いま冷えた」を見せる必要がある
      STATE.intents = HeroineAI.intents(STATE, heroineChars);
      Stage.renderIntents(STATE.intents, heroineChars);
    }
    if (r.level !== 'norm') DeckCore.breakChain(DECK);
    HUD.updateAir(STATE.airGauge);
    Stage.updateHearts(STATE.hearts);
    _updateRivalRace();
    _renderInfoUI();

    const CLOSE = { norm:'知らない話でも付き合ってくれた',
                    pass:'話は転がらなかった',
                    cut: '届かなかった' };
    _log(CLOSE[r.level]);
    if (STATE.airGauge <= 0) { setTimeout(() => _endGame(), 1200); return; }
    setTimeout(() => _advanceTurn(), 1900);
  }

  // ── ことだま結果表示（効果計算はcalcEffectのまま） ──
  function _fireKotodamaResult(type, timingBonus, chainMult) {
    if (STATE.gameEnded) return;

    // 効果計算
    // Balance適用③: 連絡先成功の♥ライン（easyは48）。値はsynergy経由で渡す
    // turnScale: 8T化補正。calcEffect内でgain計算と表示数値の両方に適用される
    const { resultText, resultType, delta } = KotodamaCore.calcEffect(
      type,
      STATE.currentSituation,
      STATE,
      SELF_PARAMS,
      // turnScale に札の倍率（札の質 × 繋がっている流れ）を掛ける。
      // calcEffect内でgain計算と表示数値の両方に効くので、外側では掛けない（二重適用防止）。
      { ...SYNERGY.bonuses, contactHeartLine: BALANCE.contactHeartLine,
        turnScale: PLAYER_GAIN_SCALE * (chainMult || 1) },
      timingBonus
    );

    // STATE に反映
    _applyDelta(type, delta);

    // 会話スレッド更新: 共感/ノリ/深掘り成功なら次ターンも同じ話題が続く。
    // 話題がえ・失敗（result bad）は盛り下がり＝スレッド終了
    STATE.thread = ThreadManager.afterAction(STATE.thread, type, resultType);

    // 相槌への返し: あなたのセリフで会話が終わらないよう、
    // 話していた子がその場で一言返してから結果を出す（成功時のみ）
    const isBad       = (resultType || '').includes('bad');
    // 手札制: スベった手・話題を変えた手は流れを切る（次の札に倍率が乗らない）
    if (isBad || type === 'change') DeckCore.breakChain(DECK);
    // 【意図】読み当てた手は、札の繋ぎ性能に関係なく流れを伸ばす
    else if (delta && delta.intentHit) DeckCore.boostChain(DECK);
    const convoTarget = _reactingHeroine();   // 会話の宛先（チェイン判定と共用）
    const reactor = !isBad && ['kyokan', 'nori', 'fukagori'].includes(type)
      ? convoTarget : null;
    const reaction = reactor ? HeroineAI.pickReaction(reactor.id, type) : null;

    // C1: チェイン更新（同じ子への共感/深掘り2連続+席+♥で「二人の空気」）
    STATE.chain = ChainCore.onAction(STATE.chain, {
      type,
      ok: !isBad,
      targetId: convoTarget ? convoTarget.id : null,
      canFutariNow: convoTarget
        ? ChainCore.canFutari(STATE, convoTarget, heroineChars, SEATING.selfSeat ?? 0)
        : false,
    });

    // C2: 頂点判定【二人の温度】（二人チェイン4連鎖・その子で未発火のときだけ）
    const apexPartner = ChainCore.isApex(STATE.chain) && STATE.chain.partnerId != null
        && !STATE.futariApexDone[STATE.chain.partnerId]
      ? STATE.chain.partnerId : null;
    if (apexPartner != null) {
      // 発火確定と同時にガード（1人1回）+ チェインは頂点で昇華=リセット（仮決め）
      STATE.futariApexDone = { ...STATE.futariApexDone, [apexPartner]: true };
      STATE.chain          = ChainCore.init();
    }
    _renderChainFX();   // C4: 成立/深度上昇/断絶/頂点後リセットをここで一括反映

    if (reaction) {
      Stage.setSpeaker(reactor.id);
      VNEngine.showImmediate('heroine', _shortName(reactor.name), reaction);
      setTimeout(() => _showKotodamaResult(resultText, resultType, delta, timingBonus, apexPartner, type),
        REACTION_WAIT_MS);
    } else {
      _showKotodamaResult(resultText, resultType, delta, timingBonus, apexPartner, type);
    }
  }

  // ── 結果表示 → ターン進行（返しビートの後段） ──────
  // apexPartnerId: C2【二人の温度】の相手hid（発火時のみ非null。結果表示の後に頂点ビートを挟む）
  function _showKotodamaResult(resultText, resultType, delta, timingBonus, apexPartnerId = null, type = null) {
    if (STATE.gameEnded) return;

    // タイミングボーナステキスト付加
    const bonusPrefix = timingBonus && resultType !== 'result bad' ? '✨ BEST TIMING! ' : '';
    // 連絡先は「結末」なので本文に出す。それ以外の結果は要約なのでログへ
    if (type === 'renraku' || delta.contactResult) {
      VNEngine.showImmediate(resultType, '', bonusPrefix + resultText);
    } else {
      _log((bonusPrefix + resultText).replace(/\n/g, ' ').replace(/^[（(]|[）)]$/g, ''));
    }
    HUD.updateAir(STATE.airGauge);
    Stage.updateHearts(STATE.hearts);
    _renderInfoUI();

    // 連絡先成功 → 即終了
    if (delta.contactResult?.success) {
      setTimeout(() => _endGame(), 1200);
      return;
    }

    // C2: 頂点ビート【二人の温度】（結果表示の後・ターン進行の前）
    if (apexPartnerId != null) {
      setTimeout(() => _playFutariApex(apexPartnerId), APEX_BEAT_WAIT_MS);
      return;
    }

    setTimeout(() => _advanceTurn(), 1800);
  }

  // ── 相槌に返す子（直前に話していたヒロイン→いなければ狙いの子） ──
  function _reactingHeroine() {
    const ds = STATE.currentSituation?.dialogues || [];
    for (let i = ds.length - 1; i >= 0; i--) {
      const hid = ds[i].heroineId;
      if (hid != null && hid !== STATE.stolenHeroineId
          && !Object.values(STATE.twoWorld).includes(hid)) {
        return heroineChars.find(h => h.id === hid) || null;
      }
    }
    return STATE.targetHeroine || null;
  }

  // ── 頂点イベント【二人の温度】（C2: 数値・本音は仮置き） ──
  const FUTARI_APEX_HEART   = 10;     // ♥大（仮置き。テストプレイで確定）
  const APEX_BEAT_WAIT_MS   = 1800;   // 頂点ビートの1行あたりの間

  async function _playFutariApex(heroineId) {
    if (STATE.gameEnded) return;
    const heroine = heroineChars.find(h => h.id === heroineId);
    if (!heroine) { _advanceTurn(); return; }
    const hn = _shortName(heroine.name);

    // 1. 二人だけの空気（周囲ぼかし等の演出はC4。ここはテキストビートのみ）
    VNEngine.showImmediate('result', '', '（周りの声が、少し遠くなった——二人だけの空気だ）');
    await _sleep(APEX_BEAT_WAIT_MS);
    if (STATE.gameEnded) return;

    // 2. 彼女の本音一行（C5: D節確定稿の個別版。未定義idのみ共通仮テキストにフォールバック）
    Stage.setSpeaker(heroineId);
    const apexLine = HeroineAI.pickApexLine(heroineId) || '「……ね。今日、来てよかったかも」';
    VNEngine.showImmediate('heroine', hn, apexLine);
    await _sleep(APEX_BEAT_WAIT_MS);
    if (STATE.gameEnded) return;

    // 3. ♥大（連絡先成功率への明示ボーナスは付けない=spec§5未決。♥+10の自然増のみ）
    STATE.hearts = {
      ...STATE.hearts,
      [heroineId]: Math.max(0, Math.min(100, (STATE.hearts[heroineId] || 0) + FUTARI_APEX_HEART)),
    };
    Stage.updateHearts(STATE.hearts);
    _renderInfoUI();
    VNEngine.showImmediate('result', '',
      `【二人の温度】 ${hn}との距離が縮まった。♥が大きく上がった!`);
    await _sleep(APEX_BEAT_WAIT_MS);
    if (STATE.gameEnded) return;

    _advanceTurn();
  }

  // ── 「話を振る」の結果（S5: 数値は仮置き・表示は空気のみ） ──
  const FURU_AIR_BONUS    = 5;    // 場が上がる
  const FURU_HEART_BONUS  = 2;    // 振られた子の♥（通常より大きくはしない）
  const FURU_ENGAGE_GAIN  = 30;   // 冷えていた子が輪に戻る

  function _fireFuruResult(heroine) {
    if (STATE.gameEnded) return;
    // C1: 話を振る=場レーンの一手
    STATE.chain = ChainCore.onAction(STATE.chain,
      { type: 'furu', ok: true, targetId: heroine.id, canFutariNow: false });
    _renderChainFX();   // C4: 話を振る=場レーンへ（二人の空気は解ける）
    STATE.engagement = {
      ...STATE.engagement,
      [heroine.id]: Math.min(100, (STATE.engagement[heroine.id] || 0) + FURU_ENGAGE_GAIN),
    };
    STATE.airGauge = Math.min(100, STATE.airGauge + FURU_AIR_BONUS);
    STATE.hearts[heroine.id] = Math.min(100, (STATE.hearts[heroine.id] || 0) + FURU_HEART_BONUS);

    HUD.updateAir(STATE.airGauge);
    Stage.updateHearts(STATE.hearts);
    Stage.setSpeaker(heroine.id);
    _renderInfoUI();
    _log(`${_shortName(heroine.name)}が輪の中に戻ってきた`);
    setTimeout(() => _advanceTurn(), 1800);
  }

  // ── 「友達に向く」ハンドラ（なだめる/煽る=手番消費） ──
  function _onFriendAction(friendId, action) {
    if (STATE.gameEnded || STATE.kotodamaFired) return;
    if (!WHISPER_EXCHANGE[action]) return;

    // 早とちりの罰は廃止（2026-09-24。ことだま側と同じ扱い）
    if (VNEngine.isActive() && !STATE.timingWindowOpen) return;

    // ことだま発動と同じフラグ処理（二重発動防止）
    STATE.kotodamaFired = true;
    KotodamaPanel.disable();
    KotodamaPanel.setSpeechState('idle');
    FriendPanel.setEnabled(false);

    // タイミング窓が開いていたら閉じて resolve（ボーナスは付かない）
    if (STATE.timingWindowOpen) {
      KotodamaPanel.closeTimingWindow();
      STATE.timingWindowOpen = false;
      if (_timingResolve) { _timingResolve(); _timingResolve = null; }
    }

    // 効果は次ターンの友達AI行動に反映（仕様B-3/B-4）
    STATE.friendMods = { ...STATE.friendMods, [friendId]: action };

    // 友達に向いた＝卓の会話スレッドは静かに終わる。
    // バランス確定(C5・§7発見2): 二人チェイン成立中は chain を維持し thread のみ終える
    // （耳打ち=なだめる/煽るはヒロインとの会話自体を中断しない、として対抗策を機能させる）。
    // なだめる/煽るはどちらも WHISPER_EXCHANGE の同一往復・同じ手番消費のため action で区別せず、
    // lane==='futari' のときは両者とも chain を維持する（特例分岐を足さない=KISS）。
    DeckCore.breakChain(DECK);   // 手札制: 目を離した＝流れは切れる
    // 場チェイン/未成立は従来通りチェインも断絶。
    if (STATE.chain && STATE.chain.lane === 'futari') {
      STATE.thread = null;               // スレッドのみ終わる。chainは維持
    } else {
      STATE.thread = null;
      STATE.chain  = ChainCore.init();   // 場チェイン/未成立は従来通り
    }
    _renderChainFX();   // C4: よそ見で二人の空気も解ける

    _playWhisperSequence(friendId, action);
  }

  // ── 耳打ちの往復 → よそ見コスト → ターン進行 ──────
  async function _playWhisperSequence(friendId, action) {
    const friend = partyChars.find(c => c.id === friendId);
    const fname  = _shortName(friend?.name || '友達');
    const lines  = WHISPER_EXCHANGE[action];

    VNEngine.showImmediate('player', 'あなた', lines.player);
    await _sleep(WHISPER_LINE_WAIT_MS);
    if (STATE.gameEnded) return;

    VNEngine.showImmediate('friend', fname, lines.friend);
    await _sleep(WHISPER_LINE_WAIT_MS);
    if (STATE.gameEnded) return;

    // よそ見コスト: 狙いの子の♡が小さく減る + 通知（仕様B-3）
    if (STATE.targetHeroine) {
      const tid = STATE.targetHeroine.id;
      STATE.hearts[tid] = Math.max(0, Math.min(100,
        (STATE.hearts[tid] || 0) + LOOKAWAY_HEART_PENALTY
      ));
      Stage.updateHearts(STATE.hearts);
      Stage.showObsHint(`${_shortName(STATE.targetHeroine.name)}: 視線が外れた…?`);
      _renderInfoUI();
    }

    // 以降はことだま発動後と同じターン進行
    setTimeout(() => _advanceTurn(), 1800);
  }

  // ── 「友達に向く」オーバーレイ用の情報 ────────────
  function _friendOverlayInfo(friendId) {
    const friend = partyChars.find(c => c.id === friendId);
    if (!friend) return null;
    const tid = STATE.friendTargets[friendId];
    const th  = heroineChars.find(h => h.id === tid);
    return {
      name:       _shortName(friend.name),
      traits:     friend.traits || [],
      targetName: th ? _shortName(th.name) : '？',
    };
  }

  // ── STATE への delta 適用 ─────────────────────────
  function _applyDelta(type, delta) {
    // 空気
    if (delta.airDelta) {
      STATE.airGauge = Math.max(0, Math.min(100, STATE.airGauge + delta.airDelta));
    }

    // ターゲット好感度（TURN_SCALEはcalcEffect内で適用済み。ここでは掛けない=二重適用防止）
    if (delta.heartDelta && STATE.targetHeroine) {
      STATE.hearts[STATE.targetHeroine.id] = Math.min(100,
        (STATE.hearts[STATE.targetHeroine.id] || 0) + delta.heartDelta
      );
    }

    // 全員好感度（同上）
    if (delta.allHeartDelta) {
      heroineChars.forEach(h => {
        STATE.hearts[h.id] = Math.min(100, (STATE.hearts[h.id] || 0) + delta.allHeartDelta);
      });
    }

    // 友達のheart（話題チェンジ・飲もうぜ）
    if (delta.friendHeartDelta) {
      partyChars.forEach(c => {
        const tid = STATE.friendTargets[c.id];
        if (tid && STATE.friendHearts[c.id]) {
          STATE.friendHearts[c.id][tid] = Math.max(0, Math.min(100,
            (STATE.friendHearts[c.id][tid] || 0) + delta.friendHeartDelta
          ));
        }
      });
    }

    // 連絡先
    if (delta.contactResult) {
      STATE.contactSuccess = delta.contactResult.success;
      STATE.contactId      = delta.contactResult.heroineId;
    }
  }

  // ── ターン進行 ────────────────────────────────────
  function _advanceTurn() {
    if (STATE.gameEnded) return;

    // 空気 0 → 即終了
    if (STATE.airGauge <= 0) { _endGame(); return; }

    // フェーズ遷移チェック
    if (PhaseManager.shouldTransition(STATE.phase, STATE.turnInPhase, STATE)) {
      STATE.phase++;
      STATE.turnInPhase = 1;
      if (STATE.phase > 4) { _endGame(); return; }
      // 夜が中盤に入ったら、連絡先札が山に一枚混ざる。
      // 引けたら切れる／引けなければ、その夜は聞けない（常時ボタンを廃した）
      if (STATE.phase === 1) {
        const c = DeckCore.injectLate(DECK);
        if (c) VNEngine.showImmediate('narr', '',
          '（……連絡先。頭のどこかに、その二文字が浮かんだ）');
      }
    } else {
      STATE.turnInPhase++;
    }

    STATE.turn++;
    if (STATE.turn > STATE.maxTurns) { _endGame(); return; }

    setTimeout(() => _runTurn(), 600);
  }

  // ── エンディング判定 ──────────────────────────────
  function _endGame() {
    if (STATE.gameEnded) return;
    STATE.gameEnded = true;
    KotodamaPanel.disable();
    KotodamaPanel.setSpeechState('idle');
    FriendPanel.setEnabled(false);
    FriendPanel.closeOverlay();

    const twoWorldCount = Object.values(STATE.twoWorld).filter(Boolean).length;
    const avgHeart = heroineChars.reduce((s, h) => s + (STATE.hearts[h.id] || 0), 0)
      / Math.max(1, heroineChars.length);

    let ending = 'D';
    if (STATE.airGauge <= 0)                              ending = 'E';
    else if (STATE.contactSuccess && twoWorldCount === 2) ending = 'A';
    else if (STATE.contactSuccess)                        ending = 'C';
    else if (STATE.rivalStolen)                           ending = 'F';  // 本気モード: 獲られ
    else if (STATE.airGauge >= 55 && avgHeart >= 38)      ending = 'B';

    HUD.showGameOver(ENDINGS[ending]);

    // 結果データをlocalStorageに保存
    const heroineStatus = {};
    heroineChars.forEach(h => {
      heroineStatus[h.id] = { heart: Math.round(STATE.hearts[h.id] || 0) };
    });
    localStorage.setItem('goukon_result', JSON.stringify({
      heroineStatus,
      contactId:       STATE.contactId || null,
      nijikaiSuccess:  STATE.contactSuccess,
      ending,
      finalAir:        Math.round(STATE.airGauge),
      twoWorldCount,
      stolenHeroineId: STATE.stolenHeroineId || null,   // 本気モード: 獲られた狙いの子
    }));

    GameState.startGoukon && GameState.startGoukon(PARTY_IDS);
  }

  // ── 観察ヒント ────────────────────────────────────
  function _showObsHint() {
    const obs = SELF_PARAMS.head || 0;
    if (obs < 40) return;

    const hints = [];
    if (obs >= 40) {
      partyChars.forEach(c => {
        const tid = STATE.friendTargets[c.id];
        const th  = heroineChars.find(h => h.id === tid);
        if (th && !STATE.twoWorld[c.id]) {
          hints.push(`なんとなく、${_shortName(c.name)}は${_shortName(th.name)}のことが気になってる気がする…`);
        }
      });
    }
    if (obs >= 60) {
      partyChars.forEach(c => {
        const tid = STATE.friendTargets[c.id];
        const th  = heroineChars.find(h => h.id === tid);
        if (th && !STATE.twoWorld[c.id]) {
          hints.push(`[観察] ${_shortName(c.name)} → ${_shortName(th.name)} を狙っている`);
        }
      });
    }
    if (obs >= 80) {
      heroineChars.forEach(h => {
        const top = [...partyChars].sort((a, b) =>
          (STATE.friendHearts[b.id]?.[h.id] || 0) - (STATE.friendHearts[a.id]?.[h.id] || 0)
        )[0];
        if (top && (STATE.friendHearts[top.id]?.[h.id] || 0) > 40) {
          hints.push(`[観察] ${_shortName(h.name)} → ${_shortName(top.name)} に興味`);
        }
      });
    }

    if (hints.length) {
      Stage.showObsHint(hints[Math.floor(Math.random() * hints.length)]);
    }
  }

  // ── グレーアウト更新 ──────────────────────────────
  function _updateGreyout() {
    const greyMap = {};
    ['kyokan','nori','fukagori','change','nomiyo','renraku','kanshi'].forEach(t => {
      greyMap[t] = t === 'kanshi' ? false : KotodamaCore.isGreyedOut(t, STATE.phase, STATE);
    });
    // 連絡先は札になったので、常時手としては常に非表示
    greyMap.renraku = true;
    // 話を振る（S5）: 「↗よそ見」が出ている子がいるときに点灯（Phase0は不可）。
    // 2026-09-23: 以前は coldest(engagement<30) を条件にしていたため、
    // 頭上に「よそ見」が出ているのにボタンが灰色、という状態が起きていた。
    // 予告に対する答えが押せないなら、その予告は嘘になる。判定を予告そのものに合わせる。
    const away = _awayHeroine();
    greyMap.furu = STATE.phase < 1 || !away;
    KotodamaPanel.setGreyout(greyMap);
    KotodamaPanel.setFuruTarget(away ? _shortName(away.name) : '');
    KotodamaPanel.setAimTarget(STATE.targetHeroine ? _shortName(STATE.targetHeroine.name) : '');
    _renderHand();
  }

  // 今の話題の色（situation.tags）。札が「今の話に効くか」の判定に使う
  function _sitTags() {
    return (STATE.currentSituation && STATE.currentSituation.tags) || [];
  }

  // ── 手札の描画（手札制・第2段） ───────────────────
  // 札の「顔」だけを渡す。強さ/繋ぎの生の数値はUIに出さない（企画書§16）。
  // 連絡先札がいま切れるか（夜が終盤に入っていて、♥が最低ラインを越えている）。
  // 満たしていない間は手札に見えているが押せない＝「まだ早い」が見える。
  function _renrakuReady() {
    return !STATE.rivalStolen && !KotodamaCore.isGreyedOut('renraku', STATE.phase, STATE);
  }

  // 「よそ見」が出ている子。狙いの子を優先し、いなければ他の誰か
  function _awayHeroine() {
    const map = STATE.intents || {};
    const tgt = STATE.targetHeroine;
    if (tgt && map[tgt.id] === 'yoso') return tgt;
    return heroineChars.find(h => map[h.id] === 'yoso')
        || HeroineAI.coldest(STATE, heroineChars);
  }

  // 卓で多数派の予告（kotodama.js _roomIntent と同じ決め方）
  function _roomIntent() {
    const map = STATE.intents || {};
    const count = {};
    Object.keys(map).forEach(k => { count[map[k]] = (count[map[k]] || 0) + 1; });
    let best = null, bestN = 0;
    ['akita', 'yoso', 'kiki', 'matte'].forEach(id => {
      if ((count[id] || 0) > bestN) { bestN = count[id]; best = id; }
    });
    return best;
  }

  function _renderHand() {
    if (!DECK) return;
    const tags = _sitTags();
    KotodamaPanel.setHand(
      DECK.hand.map(c => {
        const f = DeckCore.face(c, tags);
        if (f && c.type === 'renraku') {
          f.locked   = !_renrakuReady();
          f.lockNote = STATE.rivalStolen ? 'もう遅い'
                     : STATE.phase < 3   ? 'まだ早い'
                     : 'まだ距離がある';
        }
        return f;
      }),
      { accumLink: DECK.accumLink, streak: DECK.streak, left: DECK.draw.length,
        // 【意図】いまどの印が「当たり」かを札側にも渡す（印が光る）
        targetIntent: STATE.targetHeroine ? (STATE.intents || {})[STATE.targetHeroine.id] : null,
        roomIntent:   _roomIntent() }
    );
  }

  // ── セリフプレビュー方式 Phase 1（手札制では未使用） ──
  // 札の顔にセリフが出ている＝プレビューと実発言が同一になったため、
  // speak-menu 向けのこの経路は呼ばれない。話を振る/連絡先の文言生成にのみ残す。
  // 現在のシチュエーション/段に対応するプレビューを speak-menu に反映する。
  // 未定義のシチュエーション/コマンドは null を渡し、既存の .kdm-sub 表示にフォールバックする。
  function _updatePreview() {
    if (typeof SpeakPreviews === 'undefined') return;
    const sit = STATE.currentSituation;
    if (!sit) { KotodamaPanel.setPreview(null); return; }

    const answerLabel = sit.id === 'SIT_104' ? _typeAnswerLabel(sit) : null;
    const previewMap = {};
    ['kyokan','nori','fukagori','change','nomiyo'].forEach(cmd => {
      previewMap[cmd] = SpeakPreviews.getPreview(sit.id, cmd, STATE.thread, answerLabel);
    });
    KotodamaPanel.setPreview(previewMap);
  }

  // SIT_104段0のヒロイン回答テキスト（dialogues[1]）から答え語を抜き出す（深掘り続き段の可変テンプレ用）
  function _typeAnswerLabel(sit) {
    const line = (sit.dialogues || []).find(d => d.type === 'heroine');
    return line ? SpeakPreviews.extractTypeAnswer(line.text) : null;
  }

  // 発動された手にプレビューが表示されていた場合、そのセリフを返す（プレビュー=実発言の一致）
  function _currentPreviewLine(type) {
    if (typeof SpeakPreviews === 'undefined') return null;
    const sit = STATE.currentSituation;
    if (!sit) return null;
    const answerLabel = sit.id === 'SIT_104' ? _typeAnswerLabel(sit) : null;
    return SpeakPreviews.getPreview(sit.id, type, STATE.thread, answerLabel);
  }

  // ── 情報開示更新（ターン経過） ────────────────────
  function _updateInfoReveal() {
    const turn = STATE.turn;

    // ターン3以降: ヒロインタイプ開示（観察によって精度が変わる）
    if (turn >= 3) {
      heroineChars.forEach(h => {
        if (!STATE.revealedTypes[h.id]) {
          const obs = SELF_PARAMS.head || 0;
          STATE.revealedTypes[h.id] = obs >= 40 ? h.type : (h.type.split('・')[0] + '?');
          STATE.typeRevealFlashUntil[h.id] = Date.now() + 1600;
        }
      });
    }

    // ターン5以降: 好感度表示
    if (turn >= 5) {
      heroineChars.forEach(h => {
        const v = STATE.hearts[h.id] || 0;
        STATE.heartDisplay[h.id] = v >= 55 ? 'high' : v >= 35 ? 'mid' : 'low';
      });
    }
  }

  // ── C4: 二人の空気の演出（STATE.chain → Stage。冪等＝何度呼んでも安全） ──
  function _renderChainFX() {
    Stage.renderChain(STATE.chain);
  }

  // ── 情報開示UIの描画（STATE → HUD） ─────────────
  function _renderInfoUI() {
    const obs = SELF_PARAMS.head || 0;

    // ヒロイン行
    const heroItems = heroineChars.map(h => {
      const rt = STATE.revealedTypes[h.id];
      let typeLabel, typeClass;
      if (!rt)                  { typeLabel = '??系';                typeClass = 'unknown'; }
      else if (rt.endsWith('?')){ typeLabel = rt;                    typeClass = 'uncertain'; }
      else                      { typeLabel = rt.split('・')[0];     typeClass = 'known'; }
      return {
        name: _shortName(h.name),
        typeLabel, typeClass,
        justRevealed: (STATE.typeRevealFlashUntil[h.id] || 0) > Date.now(),
        hearts: STATE.heartDisplay[h.id] || 'hidden',
        engLevel: HeroineAI.level((STATE.engagement || {})[h.id]),   // S1: バッジのくすみ
      };
    });
    HUD.updateHeroineInfo(heroItems);

    // 友達行
    const friendItems = partyChars.map(c => {
      const twoWorldHid = STATE.twoWorld[c.id];
      if (twoWorldHid) {
        const h = heroineChars.find(x => x.id === twoWorldHid);
        return { name: _shortName(c.name), mode: 'twoworld',
                 targetLabel: h ? _shortName(h.name) : '?', heartGlyphs: '' };
      }
      const isQuiet = c.id !== STATE.rivalId && (c.traits || []).some(t => t.includes('譲れる'))
        && STATE.friendTargets[c.id] === STATE.targetHeroine?.id;
      if (isQuiet) {
        return { name: _shortName(c.name), mode: 'quiet', targetLabel: '', heartGlyphs: '' };
      }
      const tid = STATE.friendTargets[c.id];
      const th  = heroineChars.find(x => x.id === tid);
      let heartGlyphs = '';
      if (STATE.turn >= 7 && tid) {           // 仕様§7.2: friendHeartはターン7以降
        const v = (STATE.friendHearts[c.id] || {})[tid] || 0;
        heartGlyphs = v >= 60 ? '♥♥♥' : v >= 40 ? '♥♥' : '♥';
      }
      return {
        name: _shortName(c.name), mode: 'normal',
        targetLabel: (obs >= 60 && th) ? _shortName(th.name) : '???',  // 仕様§7.1: 観察60+
        heartGlyphs,
      };
    });
    HUD.updateFriendIndicators(friendItems);

    // 視線レイヤー（開示ルールはチップと同じ: 友達の狙いは観察60+のみ）
    const gazes = [];
    if (STATE.targetHeroine) {
      gazes.push({ kind: 'self', heroineId: STATE.targetHeroine.id });
    }
    if (obs >= 60) {
      partyChars.forEach((c, i) => {
        if (STATE.twoWorld[c.id]) return;
        const isQuiet = c.id !== STATE.rivalId && (c.traits || []).some(t => t.includes('譲れる'))
          && STATE.friendTargets[c.id] === STATE.targetHeroine?.id;
        if (isQuiet) return;
        const tid = STATE.friendTargets[c.id];
        const head = document.querySelector('#f-sil-' + i + ' .f-head');
        if (tid && head) gazes.push({ kind: 'rival', heroineId: tid, fromEl: head });
      });
    }
    Stage.renderGaze(gazes);

    // C4: 二人の空気の演出も毎回同期（冪等なので呼び忘れの保険を兼ねる）
    _renderChainFX();

    // 「友達に向く」入口ストリップ（2人の世界で離脱済みの友達は出さない）
    FriendPanel.renderStrip(
      partyChars
        .filter(c => !STATE.twoWorld[c.id])
        .map(c => ({ id: c.id, name: _shortName(c.name) }))
    );

    // 本気モード: ライバル到達バーを毎回同期
    _updateRivalRace();
  }

  // ── 使用済みシチュエーション管理 ─────────────────
  function _markSituationUsed(id) {
    if (!STATE.usedSituations.includes(id)) STATE.usedSituations.push(id);
    STATE.recentSituations.push(id);
    if (STATE.recentSituations.length > 4) STATE.recentSituations.shift();
  }

  // ── ユーティリティ ────────────────────────────────
  function _shortName(name) {
    if (!name) return '—';
    const p = name.split(/[\s　]+/);
    return p[p.length - 1] || name;
  }

  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── public API ────────────────────────────────────
  return { start };

})();
