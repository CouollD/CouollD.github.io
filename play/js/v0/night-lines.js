// ═══════════════════════════════════════════════════════════════
// js/v0/night-lines.js — 遊べる版（v0）の台詞（2026-09-28・仮）
// 依存: CardTopics（open／bite／biteDefault／miss／more／moreDefault／friend はそちらの台詞を使う）
//
// ここで足したのは、深さ1〜3の台詞・反応・自分の台詞・友達のひとこと・地の文。どれも仮。
// 自分の台詞は goukon-speak-lines の規律（要約で受けない／評価しない／閉じすぎない／w禁止）で書いた。
//
// 会話が不自然にならないための決まり（9/28 の通し読みで見つけたもの）
//   1. ヒロインの台詞には「型」がある: 話す（stmt）／聞き返す（ask）／通じていない（miss）／打ち明ける（deep）。
//      自分の返しは、直前の相手の台詞の型で変わる。質問に「わかる」とは返さない
//   2. ラウンドの最初の発言が、あいづちだけにならない。言うことがなければ、聞き返す（ASKBACK）
//   3. 掘られていない子は深い話をしない（深さはエンジン側で子ごとに出す）
//   4. 友達が割り込むのは1つの話題で1回まで。掘られたら、ちゃんと話をする（story）
//   5. 自分の台詞は、同じ種類の中で順番に回す（すぐ同じ行が出ない）
// ═══════════════════════════════════════════════════════════════
const NightLines = (() => {
  'use strict';

  const NAME = { 101: 'あおい', 102: 'ゆな', 103: 'めい', 1: 'けんた', 4: 'けいた', P: 'あなた' };

  // 話題 → ヒロイン → 深さ → 台詞（その深さで話すたびに次の行）
  const DEEP = {
    baito_intro: {
      101: { 1: ['「塾の子に『先生』って呼ばれるの、まだちょっと慣れなくて」'],
             2: ['「ほんとは、子どもが得意なわけじゃないんです。……得意なふりが上手いだけで」'] },
      102: { 1: ['「まかないのパスタ、いまだに同じのしか頼めないんだけど」'],
             2: ['「うち、バイト先でだけ標準語なの。……ちょっとキャラ作ってる」'] },
    },
    sumai_intro: {
      101: { 1: ['「実家、楽なんです。……楽だから、ずっといちゃうんだと思います」'],
             2: ['「門限、ほんとは誰も守ってないのに、わたしだけ守ってるんです」'] },
      102: { 1: ['「一人暮らし、最初の一週間は毎晩電話してた。親に」'],
             2: ['「仕送り、ほんとはもう断りたいの。……まだ言えてないけど」'] },
      103: { 1: ['「夜、冷蔵庫の音だけする時間がある。あれ、ちょっと好き」'],
             2: ['「誰も来ない部屋にいると、自分が何なのか分かんなくなるときある」'] },
    },
    culture_nushi: {
      101: { 1: ['「……わたしも、ちょっと主になりかけてます。文芸部の」'],
             2: ['「部室にいると、家に帰らなくていい理由になるんです」'] },
      103: { 1: ['「その先輩の椅子に、座ってみたことある。……何も起きなかった」'],
             2: ['「……わたし、たぶん次の主なんだと思う。もう半分住んでる」'] },
    },
    send_shiokuri: {
      102: { 1: ['「仕送りの日だけ、ちょっといいシャンプー買うの。一本だけ」'],
             2: ['「親、ほんとは余裕ないの知ってるんだよね。だから前の日はちょっとへこむ」'],
             3: ['「……振込の通知、毎月スクショしてんの。なんか、捨てられへんくて」'] },
    },
    jimoto_intro: {
      101: { 1: ['「……家では、普通に関西弁なんです。外だと、なんか出なくて」'],
             2: ['「こっちに来たの、半分は逃げたかったからかもしれないです」'] },
      102: { 1: ['「うちも向こう。こっち来てから方言封印してんの」'],
             2: ['「地元の友達、もうみんな落ち着いててさ。なんか置いてかれてる」'] },
      103: { 1: ['「山と田んぼしかないとこ。星だけは、すごい」'],
             2: ['「帰っても、わたしの部屋もうないの。物置になってた」'] },
    },
    hon_eiga: {
      101: { 1: ['「止まってたの、読むと終わっちゃうからで……終わってほしくなくて」'],
             2: ['「最後の章だけ、ずっと読めないんです。好きな本ほど」'] },
      102: { 1: ['「漫画ならめっちゃ読む。小説は表紙で買って積んでる」'],
             2: ['「ほんとは一冊だけ、何回も読んでるやつある。誰にも言ってないけど」'] },
      103: { 1: ['「同じ本を読むと、毎回ちがう話になる。わたしだけかな」'],
             2: ['「読んでる途中で、作者が死んじゃった本がある。続き、まだ待ってる」'] },
    },
    cafe_latte: {
      102: { 1: ['「店長に一回だけ褒められたの。泡だけ。それで続いてる」'],
             2: ['「カフェのバイト、実は辞めようか迷ってて」'],
             3: ['「……うちな、こっち来てから、ちゃんとできたのそれだけやねん」'] },
    },
    sports_asaren: {
      102: { 1: ['「朝練のあと一限でしょ。寝ないの無理じゃない？」'],
             2: ['「ほんとは、なんで続けてんのか自分でも分かんないときある」'],
             3: ['「やめたら、こっちで知り合いゼロになるんよ。それがこわくて」'] },
    },
    juku_tantou: {
      101: { 1: ['「中学生の子を、二年見てて。……わたしより、その子のほうが落ち着いてました」'],
             2: ['「受かったって聞いたとき、トイレで少し泣きました。……内緒です」'],
             3: ['「ほんとは、先生になりたかったんです。……親には、言ってないですけど」'] },
    },
    jikka_juku: {
      101: { 1: ['「家に帰ると、母がいつも何か言いたそうで。それで早めに出ちゃいます」'],
             2: ['「実家、居心地は悪くないんです。……悪くないから、出られなくて」'],
             3: ['「一人暮らし、調べたことあるんです。……まだ誰にも見せてない画面」'] },
    },
    nosend_denki: {
      103: { 1: ['「冬に一回ブレーカー落ちた。それから暖房つけるの、ちょっとこわい」'],
             2: ['「仕送りなしって決めたの、わたし。……意地、みたいなもの」'],
             3: ['「親と、あんまり話してないの。電気代の紙だけが、毎月ちゃんとくる」'] },
    },
    nobaito_jikan: {
      103: { 1: ['「ずっと空見てる日がある。何もしてないのに、夜になってる」'],
             2: ['「働いてないの、ほんとは面接ぜんぶ落ちたからなんだよね」'],
             3: ['「……時間あるのがこわいの、たぶん、ひとりだからだと思う」'] },
    },
  };
  // 刺さっていない話題で、たまたま掘れたとき
  const GENERIC_DEEP = {
    101: { 1: '「……そこまで、考えたことなかったです」', 2: '「……あの。ちょっとだけ、分かる気がします」', 3: '「……こういう話、あんまりしないんです」' },
    102: { 1: '「え、そこ聞く？ まあいいけど」', 2: '「……なんか、ちょっとまじめな話になってない？」', 3: '「うち、こういうの言うの初めてかも」' },
    103: { 1: '「……ふうん。それ、わたしの話？」', 2: '「……考えたことは、ある」', 3: '「……君、変なとこ聞くね」' },
  };
  const ASKBACK = {                  // 言うことがないとき、ラウンドの頭は聞き返しにする
    101: ['「……あなたは、どうなんですか」', '「……あの、そっちは？」'],
    102: ['「てかそっちは？ どうなん」', '「え、そっちはどうなの」'],
    103: ['「……君は？」', '「……そっちの話も、聞きたい」'],
  };
  const BACK = {                     // 話の途中のあいづち
    101: ['「……はい。そうなんです」', '「……ふふ」'],
    102: ['「それな」', '「えー、分かるー」'],
    103: ['「……うん」', '「……そうかも」'],
  };
  const POLITE = { 101: true };     // 丁寧語の汎用行（miss／moreDefault）を言わせていいのは あおい だけ
  const MISS_OWN = { 102: '「え、なにそれ。うち分かんないかも」', 103: '「……それ、わたしの知らない世界」' };
  const REOPEN = { 101: '「……さっきの続き、ですよね」', 102: '「……さっきの話？ まあ、うん」', 103: '「……さっきの、続き」' };
  const THINK = { 101: '（あおいは少し黙って、グラスを置いた）', 102: '（ゆなが、ちょっとだけ真顔になった）', 103: '（めいは、しばらく天井を見ていた）' };
  const STRAINED = { 101: '「……あの、はい」', 102: '「……てか、なんだっけ」', 103: '「……」' };
  const REACT = {
    go: {
      stmt: { 101: '「……ですよね」', 102: '「でしょ！？」', 103: '「……ふふ。同じだ」' },
      ask:  { 101: '「……そうなんですね」', 102: '「え、ウケる」', 103: '「……ふうん」' },
      miss: { 101: '「……ふふ。ありがとうございます」', 102: '「え、優しいじゃん」', 103: '「……気にしてないよ」' },
      deep: { 101: '「……はい」', 102: '「……うん。ありがと」', 103: '「……そっか」' },
    },
    fail:   { 101: '「……ごめんなさい。それは、ちょっと」', 102: '「え、急にどしたん。重っ」', 103: '「……それ、今きく？」' },
    tease:  { 101: '「……もう。笑わせないでください」', 102: '「ちょ、ひど！」', 103: '「……ふっ」' },
    rescue: { 101: '「……いえ。大丈夫です」', 102: '「……まあ、いいけど」', 103: '「……ゆるす」' },
  };
  // 自分の台詞: 相手の直前の台詞の型 → 手
  const PLAYER = {
    stmt: {
      go:    ['「わかる、俺もそれずっと思ってた」', '「え、まじで。俺もまったく同じなんだけど」', '「待って、それ俺もめっちゃある」',
              '「あー、俺もそれで毎回やられる」', '「それ、俺だけじゃなかったんだ」'],
      dig:   ['「え、いつから？ きっかけあったの」', '「待って、それどういうこと。詳しく」', '「それってさ、なんで？ 気になる」'],
      tease: ['「で、オチは？」', '「え、それだけ？」'],
    },
    ask: {
      go:    ['「俺？ いや、ほんと普通だよ」', '「あー、それ聞かれると弱いんだけど」', '「俺はね……まあ、ぼちぼち」'],
      dig:   ['「俺は普通。てか、なんでそれ気になったの」', '「俺は全然。そっちは？ ほんとは」'],
      tease: ['「それ聞く？ 聞いちゃう？」', '「秘密。……って言ったら怒る？」'],
    },
    miss: {
      go:    ['「いや、知らなくて全然いいやつだから」', '「あ、ごめん、狭い話だったわ」'],
      goF:   ['「大丈夫、俺もいまいち分かってない」', '「こいつらの話、たまに狭いんだよ」'],   // 友達が出した話題で置いていかれた子に
      dig:   ['「逆に、そっちはどうなの。そういうの」', '「じゃあ、そっちの話も聞かせてよ」'],
      tease: ['「置いてかないで、俺もたぶん分かってない」', '「今のはなかったことにしよ。な」'],
    },
    deep: {
      go:    ['「……なんか、俺もちょっと分かる」', '「俺も似たようなことあったな」', '「……そっか」'],
      dig:   { 1: ['「なんでそうなったの。聞いていい？」', '「それ、今もずっとそうなの？」'],
               2: ['「……それ、誰かに話したことある？」', '「今は、どう思ってんの。ほんとは」'] },
      tease: ['「いや重い重い、急に深いって」', '「待って、俺ちょっと泣きそうなんだけど」'],
    },
    askedF: {                          // 女子が友達に聞き、友達が答えたあと。その女子に返す
      go:    ['「それ、俺もずっと気になってた」', '「こいつ、それ毎回同じこと言うんだよ」'],
      dig:   ['「てか、なんでそれ気になったの」', '「そっちは？ そういうのある？」'],
      tease: ['「こいつに聞いても、ろくな答え出ないよ」'],
    },
    friend: {
      go:    ['「いや、それはほんとにそう」', '「それな。俺も横で見てたし」'],
      dig:   ['「てかお前、あの話してやれよ」', '「お前のあれ、話してよ。ほら」'],
      tease: ['「お前はちょっと黙っとけ」', '「はいはい、お前の話はいいから」'],
    },
    rescue:  ['「ごめん、今のなし。忘れて」', '「あ、ごめん。変なこと聞いた」'],
  };
  const FRIEND = {
    back:   { 1: ['「それな！ わかるわー」', '「うわ、あるある！」'], 4: ['「あー、あるある」', '「それ、ちょっと分かる」'] },
    dug:    { 1: '「いやそれがさ、聞いてよ」', 4: '「え、俺？ ……まあ、ちょっとだけ」' },
    story:  { 1: ['「こないだ朝まで飲んで、起きたら知らない駅のベンチだった」', '「一回だけ、店長に間違えて客の酒出したことあってさ」'],
              4: ['「……前に店で、お客さんに店長と間違われたことある」', '「……こいつが寝てる間に、俺が全部片付けたこともある」'] },
    backed: { 1: '「だろ！？」', 4: '「……だよね」' },
    teased: { 1: '「なんでだよ！」', 4: '「ひどくない？」' },
  };
  // あるある話題を出す人は、先に自分の事情を言う（唐突にならないように）
  const BRIDGE = {
    juku_tantou:    '「俺も塾で教えてるんだけど。担当の子が受かったときって、あれヤバくない」',
    culture_nushi:  '「俺、文化系のサークルなんだけど。部室にさ、なんか住んでる先輩っていない？」',
    sports_asaren:  '「俺サッカー部なんだけどさ。朝練って、起きた瞬間がいちばんきついよな」',
    send_shiokuri:  '「俺、仕送りもらってんだけど。仕送りの日って、ちょっとだけ気が大きくなるよな」',
    izakaya_kinyou: '「俺居酒屋なんだけど。金曜の21時ってさ、あれ何なんだろうな」',
    cafe_latte:     '「……俺、カフェでバイトしてて。ラテアート、あれいつできるようになるんだろ」',
    nosend_denki:   '「……俺、仕送りなしで一人暮らしなんだけど。電気代の請求くるとき、ちょっと息止めない？」',
  };
  // 女子が友達に聞き返したら、友達が答える（話題 → 友達）
  const FRIEND_ANSWER = {
    baito_intro:    { 1: '「居酒屋。もう三年。店長より詳しい」', 4: '「……カフェ。もう二年くらい」' },
    sumai_intro:    { 1: '「一人暮らし！ 部屋は寝るだけ」', 4: '「……一人暮らし。仕送りなしで、わりとギリ」' },
    jimoto_intro:   { 1: '「地方！ 田んぼしかない」', 4: '「……関東。ここから一時間くらい」' },
    sports_asaren:  { 1: '「ない！ 気合い！ ……嘘、目覚まし五個」' },
    send_shiokuri:  { 1: '「焼肉。一人で。毎回」' },
    izakaya_kinyou: { 1: '「団体の乾杯が、三つ同時にくるんだよ」' },
    cafe_latte:     { 4: '「……多い日は百杯くらい。教わってない、動画で」' },
    nosend_denki:   { 4: '「……言えない。言ったら今日おごられる側になる」' },
  };
  // 友達が掘られたときの小話（話題 → 友達）。ないときは友達ごとの汎用
  const FRIEND_STORY = {
    baito_intro:    { 1: '「居酒屋でさ、団体客の靴を全部そろえたら店長に泣かれた」', 4: '「……カフェで、常連さんに名前覚えられてた。俺のほうが覚えてなかった」' },
    sumai_intro:    { 1: '「一人暮らし初日、カーテンなくて朝四時に起きた」', 4: '「……仕送りなしだと、冬は毛布三枚」' },
    jimoto_intro:   { 1: '「地元の祭り、俺いまだに神輿担ぎに帰ってる」', 4: '「……地元の駅、改札がひとつしかない」' },
    sports_asaren:  { 1: '「朝練で、寝ながら走ってたことある。気づいたら三周してた」' },
    send_shiokuri:  { 1: '「仕送り日の翌日に全部使って、残り一か月もやしだった」' },
    izakaya_kinyou: { 1: '「金曜の21時、生ビール三十杯を一気に出したことある」' },
    cafe_latte:     { 4: '「……ハート作ろうとすると、毎回お尻になる」' },
    nosend_denki:   { 4: '「……真夏にエアコン我慢して、こいつの家に避難してた」' },
    culture_nushi:  { 4: '「……うちの部室の主、たぶん四年目」' },
  };
  // 自分の話題で聞き返されたときの、自分の答え（話題 → 手）
  const PLAYER_ANS = {
    baito_intro:   { go: ['「塾で、もう二年。気づいたら古株」', '「塾。小学生の算数、たまに俺が解けない」'],
                     dig: ['「塾で二年。……そっちは、なんでそこにしたの」'], tease: ['「秘密。……塾だけど。言っちゃった」'] },
    sumai_intro:   { go: ['「実家。楽だけど、帰る時間は毎回聞かれる」', '「実家。飯は出るけど、門限みたいな空気がある」'],
                     dig: ['「実家。……そっちは？ 一人でさみしくない？」'], tease: ['「実家。親が俺より先に寝ない」'] },
    jimoto_intro:  { go: ['「大学がこっちだっただけ。……ってことにしてる」', '「地元、店が全部夜九時に閉まるから」'],
                     dig: ['「なんとなく。……そっちは、なんで？」'], tease: ['「都会に憧れて。……笑うとこだよ、今の」'] },
    juku_tantou:   { go: ['「覚えてる。むしろそっちのほうが覚えてる」', '「二年くらい。途中から、俺のほうが緊張してた」'],
                     dig: ['「覚えてる。……そっちも、忘れられない子いる？」'], tease: ['「それ聞く？ 今日いちばん重いやつ」'] },
    jikka_juku:    { go: ['「ソファで寝落ちして、毎回遅刻しかける」', '「冷蔵庫あけて、閉めて、また開けてる」'],
                     dig: ['「寝落ちしてる。……そっちは、出たくなくなるの、なんで」'], tease: ['「外で時間つぶしてる。ほぼ不審者」'] },
    culture_nushi: { go: ['「決まってる。誰も座らない椅子がある」', '「たぶん、卒業しても来ると思う」'],
                     dig: ['「誰も座らない。……そっちの部室にも、そういう人いる？」'], tease: ['「俺がその先輩になりかけてる」'] },
  };
  const NARR = {
    unknown:  '（知らない話だ。少し聞いてみる）',
    learned:  '（だいたい分かってきた）',
    twoWorld: '（まわりの声が、少し遠くなった）',
    stall:    '（しばらく、グラスの音だけが続いた）',
    slip:     '（……ちょっと、滑った）',
    let:      '（そのまま、流した）',
    cold:     '（場が、すっかり冷えてしまった）',
  };
  const ACT = { open: '話題を出した', go: '乗った', dig: '掘った', tease: '茶化した', rescue: '笑ってごまかした' };

  function create(CardTopics) {
    const T = CardTopics.TOPICS;
    const turn = new Map();                              // 配列ごとに順番に回す
    const pick = arr => { const i = turn.get(arr) || 0; turn.set(arr, i + 1); return arr[i % arr.length]; };
    const lastType = {};                                 // 相手ごとの、直前の台詞の型
    const opener = {};                                   // 話題 → 出した人
    const talkTo = {};                                   // 話題:ヒロイン → 自分が一度でも反応したら、以降は自分に向けて話す
    const ok = x => x && !x.includes('俺');              // 男の口調の行はヒロインに言わせない
    const politeOk = (h, x) => ok(x) && (POLITE[h] || !/(です|ます)/.test(x));
    const once = new Set();                              // 1つの話題で1回だけ使う行
    const first = key => (once.has(key) ? false : (once.add(key), true));

    // → { text, type, act }
    function heroineSay(e) {
      const t = T[e.topic], h = e.who;
      if (e.strained) return { text: STRAINED[h], type: 'stmt', act: '黙った' };
      if (e.depth === 0) {
        if (e.count === 1) {
          if (t.bite && t.bite[h]) return { text: t.bite[h], type: 'stmt', act: e.appeal >= 2 ? '食いついた' : '返した' };
          if (e.appeal >= 2) {
            const x = ok(t.biteDefault) && t.biteDefault;
            if (x) return { text: x, type: 'stmt', act: '食いついた' };
          } else {
            const x = (politeOk(h, t.miss) && t.miss) || (politeOk(h, t.biteDefault) && t.biteDefault) || MISS_OWN[h];
            if (x) return { text: x, type: 'miss', act: '返した' };
          }
        }
        if (e.count === 2 && e.appeal >= 2) {
          if (t.more && t.more[h]) return { text: t.more[h], type: 'ask', act: '聞き返した' };
          if (politeOk(h, t.moreDefault) && first(e.topic + ':moreDefault')) return { text: t.moreDefault, type: 'ask', act: '聞き返した' };
          if (first(e.topic + ':askback:' + h)) return { text: pick(ASKBACK[h]), type: 'ask', act: '聞き返した' };
        }
      } else {
        const rows = DEEP[e.topic] && DEEP[e.topic][h] && DEEP[e.topic][h][e.depth];
        if (rows && rows[e.count - 1]) return { text: rows[e.count - 1], type: 'deep', act: '打ち明けた' };
        if (e.count === 1) return { text: GENERIC_DEEP[h][e.depth], type: 'deep', act: '打ち明けた' };
        if (first(e.topic + ':reopen:' + h)) return { text: REOPEN[h], type: 'deep', act: '話を続けた' };
      }
      if (e.lead && first(e.topic + ':askback:' + h)) return { text: pick(ASKBACK[h]), type: 'ask', act: '聞き返した' };
      return { text: pick(BACK[h]), type: 'stmt', act: 'うなずいた' };
    }

    // 出来事 → 画面に出す1行 { speaker, to, act, text, narr }
    function line(e) {
      switch (e.t) {
        case 'open': {
          opener[e.topic] = e.by;
          if (e.by === 'P') return null;           // 自分が出したときは player 出来事で出す
          return { speaker: e.by, to: 'all', act: ACT.open, text: BRIDGE[e.topic] || T[e.topic].open };
        }
        case 'player': {
          if (e.cmd === 'open') return { speaker: 'P', to: 'all', act: ACT.open, text: BRIDGE[e.topic] || T[e.topic].open };
          if (e.cmd === 'rescue') return { speaker: 'P', to: e.to, act: ACT.rescue, text: pick(PLAYER.rescue) };
          const toF = e.to === 1 || e.to === 4;
          const type = toF ? 'friend' : (lastType[e.to] || 'stmt');
          if (!toF) talkTo[e.topic + ':' + e.to] = 'P';
          let rows = (type === 'miss' && e.cmd === 'go' && opener[e.topic] !== 'P') ? PLAYER.miss.goF : PLAYER[type][e.cmd];
          const mine = opener[e.topic] === 'P' || ['baito_intro', 'sumai_intro', 'jimoto_intro'].includes(e.topic);
          if (type === 'ask' && mine && PLAYER_ANS[e.topic]) rows = PLAYER_ANS[e.topic][e.cmd];
          if (!Array.isArray(rows)) rows = rows[Math.min(Math.max(e.depth, 1), 2)];
          return { speaker: 'P', to: e.to, act: ACT[e.cmd], text: pick(rows) };
        }
        case 'say': {
          const r = heroineSay(e);
          lastType[e.who] = r.type;
          const to = e.to;
          return { speaker: e.who, to, act: r.act, text: r.text };
        }
        case 'react': {
          if (e.kind === 'ok') return { narr: true, text: THINK[e.who] };
          const act = { go: '笑った', fail: '引いた', tease: '笑った', rescue: '許した' }[e.kind];
          const text = e.kind === 'go' ? (REACT.go[lastType[e.who]] || REACT.go.stmt)[e.who] : REACT[e.kind][e.who];
          if (e.kind !== 'go') lastType[e.who] = 'stmt';
          return { speaker: e.who, to: 'P', act, text };
        }
        case 'friend': {
          const f = e.who, t = T[e.topic];
          if (e.mode === 'go') {
            const own = e.first && e.playerOpened && t.friend;          // 「こいつ〜からな」は女子に向けて言う
            return { speaker: f, to: own ? 'all' : (e.playerOpened ? 'P' : 'all'), act: '乗った', text: own ? t.friend : pick(FRIEND.back[f]) };
          }
          if (e.mode === 'story') return { speaker: f, to: 'all', act: '話し出した', text: (FRIEND_STORY[e.topic] && FRIEND_STORY[e.topic][f]) || pick(FRIEND.story[f]) };
          if (e.mode === 'answer') {
            lastType[e.to] = 'askedF';
            const x = (FRIEND_ANSWER[e.topic] && FRIEND_ANSWER[e.topic][f]) || pick(FRIEND.back[f]);
            return { speaker: f, to: e.to, act: '答えた', text: x };
          }
          return { speaker: f, to: 'P', act: { dug: '乗せられた', backed: '乗った', teased: 'つっこんだ' }[e.mode], text: FRIEND[e.mode][f] };
        }
        case 'narr': return NARR[e.key] ? { narr: true, text: NARR[e.key] } : null;
        default: return null;
      }
    }
    return { line, NAME };
  }
  // 台詞の一覧（tools/lines_review.js が docs/lines-v0.md に書き出す）
  const DATA = { DEEP, GENERIC_DEEP, ASKBACK, BACK, REACT, PLAYER, PLAYER_ANS, BRIDGE, FRIEND, FRIEND_ANSWER, FRIEND_STORY, NARR };
  return { create, NAME, NARR, DATA };
})();

if (typeof module !== 'undefined') module.exports = NightLines;
