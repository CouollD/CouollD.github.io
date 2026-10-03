// ═══════════════════════════════════════════════════
// js/core/speak-previews.js — セリフプレビュー方式 Phase 1（純粋データ+ロジック）
// 依存: なし（DOM操作なし）
//
// 「喋る」メニューの各コマンドに、実際に発動時流れるセリフの冒頭を併記する。
// プレビュー=実発言が一致することが最優先原則（docs/speak-preview-spec.md）。
// 文言の正: docs/speak-preview-draft.md（scenario-writer執筆 → scenario-checker承認済み）
// 対象（Phase 1）: SIT_101（休みの日）/ SIT_104（タイプの話）/ SIT_206（失敗談）
// ═══════════════════════════════════════════════════

const SpeakPreviews = (() => {

  // 段: 'first'=初段（thread.step === 0 or スレッド未開始）/ 'next'=続き段（thread.step >= 1）
  const PREVIEW_LINES = {
    SIT_101: {
      first: {
        kyokan:   '「わかる、俺もそれで土日溶けてる」',
        nori:     '「待って、それ一日何時間やってんの」',
        fukagori: '「いつから？ なんかきっかけあったの」',
        change:   '「あ、ごめん全然関係ないんだけど」',
        nomiyo:   '「そういえば、なんか頼も。なに飲む」',
      },
      next: {
        kyokan:   '「聞いてたら俺もやりたくなってきた」',
        nori:     '「ちょっと、みんなにも今の聞かせて」',
        fukagori: '「で、どこが一番おもしろいのそれ」',
      },
    },
    SIT_104: {
      first: {
        kyokan:   '「あー、俺もだいたいそこ見てるかも」',
        nori:     '「ぜったい今のいいやつ言ったって」',
        fukagori: '「たとえば？ 誰か思い浮かべてる？」',
        change:   '「ごめん、急に全然違うこと聞くけど」',
      },
      next: {
        kyokan: '「今の、ちょっと本音出てたでしょ」',
        nori:   '「じゃあ逆に、絶対無理なタイプは」',
        // fukagori続き段は可変テンプレ（下記 _typeDeepPreview で組み立てる）
      },
    },
    SIT_206: {
      first: {
        kyokan:   '「俺だったら絶対その場で帰ってる」',
        nori:     '「え、待って。そのまま自己紹介いったの」',
        fukagori: '「で、どうなったの結局。誰か気づいた？」',
        change:   '「ごめん、全然関係ない話していい？」',
        nomiyo:   '「もう飲も。みんな、なんか頼もう」',
      },
      next: {
        kyokan:   '「俺その場にいたら一生いじってる」',
        nori:     '「ちょっと、それもう一回最初から」',
        fukagori: '「まだオチあるだろ。で、続きは？」',
      },
    },
  };

  // SIT_104 深掘り続き段の可変テンプレ（checkerの組込条件）:
  // 段0のヒロイン回答語に応じて「その"◯◯"って、どういうの？」を組み立てる。
  // 「優しい」だけ執筆メモどおりの微調整形（「どこがいい？」）を使う。
  const TYPE_ANSWER_ADJUST = {
    '優しい': '"優しい"って、どこがいいの？',
  };

  /**
   * SIT_104段0のヒロイン回答テキストから答え語（優しい/面白い/頼れる/一緒にいて楽）を抜き出す。
   * 例: 「うーん…優しい人かな〜」 → 「優しい」
   * @param {string} answerText
   * @returns {string|null}
   */
  function extractTypeAnswer(answerText) {
    if (!answerText) return null;
    const m = answerText.match(/うーん…(.+?)(?:人|かな)/);
    if (!m) return null;
    return m[1].replace(/人$/, '');
  }

  /**
   * SIT_104深掘り続き段のセリフを組み立てる（可変テンプレ）。
   * @param {string|null} answerLabel  extractTypeAnswer() の返り値
   * @returns {string}
   */
  function buildTypeDeepLine(answerLabel) {
    if (!answerLabel) return '"タイプ"って、たとえばどんな？';
    if (TYPE_ANSWER_ADJUST[answerLabel]) return TYPE_ANSWER_ADJUST[answerLabel];
    return `"${answerLabel}"って、たとえばどういうの？`;
  }

  /**
   * 段種別を判定する。
   * @param {object|null} thread   STATE.thread
   * @param {string} sitId         現在のシチュエーションID
   * @returns {'first'|'next'}
   */
  function stageOf(thread, sitId) {
    if (thread && thread.topicId === sitId && thread.step >= 1) return 'next';
    return 'first';
  }

  /**
   * 現在のシチュエーション/段/コマンドに対応するプレビューを返す。
   * 未定義のシチュエーション・コマンドは null（呼び出し側でフォールバック）。
   * @param {string} sitId    現在のシチュエーションID（STATE.currentSituation.id）
   * @param {string} command  ことだまID
   * @param {object|null} thread STATE.thread
   * @param {string|null} [answerLabel]  SIT_104用: 段0のヒロイン回答語
   * @returns {string|null}
   */
  function getPreview(sitId, command, thread, answerLabel) {
    const table = PREVIEW_LINES[sitId];
    if (!table) return null;
    const stage = stageOf(thread, sitId);

    // SIT_104 深掘り続き段のみ可変テンプレ
    if (sitId === 'SIT_104' && command === 'fukagori' && stage === 'next') {
      return buildTypeDeepLine(answerLabel);
    }

    const stageTable = table[stage] || {};
    return stageTable[command] || null;
  }

  // ── public API ───────────────────────────────────
  return { getPreview, extractTypeAnswer, stageOf };

})();
