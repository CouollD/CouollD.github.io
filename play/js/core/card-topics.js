// ═══════════════════════════════════════════════════
// js/core/card-topics.js — 「ネタ札」が持つ話題（純粋データ＋判定）
// 依存: なし（DOM操作なし）
//
// 設計（2026-09-22・二度目の作り直し）:
//   前版は「アニメの話」「流行りの話」のように作品名頼みの話題だった。
//   実際には観ているものも見ているチャンネルもばらけるので、
//   「知ってるか知らないか」の運になり、話が繋がらない。
//
//   合コンで実際に伸びるのは “あるある” ——
//   同じバイト、同じ住まい、同じサークルの人にしか分からない話。
//   なので刺さりは手書きの表ではなく【属性の一致】で決める:
//
//     appealBy: [{ when:{ part:'izakaya' }, score:3 },   // 同業 = 前のめり
//                { when:{ part:['cafe','juku'] }, score:1 }]  // 別業種 = 一応拾う
//
//   ヒロインの属性（living/circle/part/hometown）は data/gamedata.js にあるので、
//   人を増やしても表を書き足す必要がない。
//
//   札は2層:
//     入り口（広い）  「バイト何してんの」「実家？一人暮らし？」「地元どこ」
//                     ほぼ全員が拾うが浅い。誰でも持っている。
//     あるある（狭い）「金曜21時」「門限」「朝練」
//                     同じ属性の子にだけ深く刺さる。自分の属性ぶんだけ持つ。
//
//   幅は属性の人数で自動的に決まる（10人中2人なら狭い、4人なら広め）。
// ═══════════════════════════════════════════════════

const CardTopics = (() => {
  'use strict';

  const BITE_MIN = 2;   // これ以上の score を持つ子がいれば「食いついた」

  const TOPICS = {

    // ══ 入り口（広い）: 誰でも持つ3枚。軸を切り出すだけで、伸びは小さい ══

    baito_intro: {
      id:'baito_intro', label:'バイト何してる', kind:'intro',
      tags:['playful','tense'],
      open:'「バイト何してんの。俺けっこう長くてさ」',
      appealBy:[{ when:{ part:['izakaya','cafe','juku'] }, score:2 }],
      bite:{
        101:'「塾で、小学生を。……あの子たち、こわいくらい正直で」',
        102:'「カフェ。まかない目当てで入ったんだけどね」',
        104:'「居酒屋。金曜だけは人間やめてるわ」',
        105:'「塾です。あの、親御さんからの電話がいちばん緊張します」',
        106:'「居酒屋。もう三年いるから、たぶん一番の古株」',
        107:'「……カフェ。座られへんのが一番きつい」',
        109:'「カフェやねん。ラテアート、いまだにハート止まり」',
        110:'「塾。人が分かる瞬間の顔が、けっこう好きで」',
      },
      miss:'「してない。……向いてなくて」',
      missNarr:'（バイトの話は、そこで止まった）',
      moreDefault:'「そっちは？　何年くらいやってるの」',
      friend:'「こいつシフト削られないんだよ、店長に好かれてて」',
    },

    sumai_intro: {
      id:'sumai_intro', label:'実家か一人暮らしか', kind:'intro',
      tags:['emotional','intimate'],
      open:'「実家？　それとも一人暮らし」',
      appealBy:[{ when:{ living:['home','alone_send','alone_nosend'] }, score:2 }],
      bite:{
        101:'「実家です。……門限、まだあります」',
        102:'「一人暮らし。親には内緒でバイト増やしてるけどね」',
        103:'「ひとり。……部屋の音が、たまに大きい気がする」',
        104:'「ひとり暮らし。誰も起こしてくれへんのが誤算やったわ」',
        105:'「実家です。そのほうが、計画が立てやすくて」',
        106:'「ひとりです。……あ、ごはんはちゃんと作ってますよ」',
        107:'「ひとり。……静かでええで」',
        108:'「実家。門限って概念、こっち来てから知ったんだけど」',
        109:'「実家やねん。出たい気持ちはあるんやけどな」',
        110:'「ひとり。……人がいない部屋って、いいよ」',
      },
      miss:null, missNarr:null,
      moreDefault:'「で、それ楽なの。しんどいの」',
      friend:'「こいつ実家なのに全然帰らないからな」',
    },

    jimoto_intro: {
      id:'jimoto_intro', label:'地元どこ', kind:'intro',
      tags:['emotional','playful'],
      open:'「地元どこ。俺けっこう遠くてさ」',
      appealBy:[{ when:{ hometown:['関西','関東','地方'] }, score:2 }],
      bite:{
        101:'「関西です。……あんまり出ないんですけど、たまに」',
        102:'「関西。うっわ、分かる人おった」',
        103:'「地方。……というか、どこにいても同じ気がする」',
        104:'「地方。ど、がつくほうな」',
        105:'「関東です。あまり、遠くには行ったことがなくて」',
        106:'「関東。実家、電車で一時間くらい」',
        107:'「……関西。それ以上は聞かんといて」',
        108:'「日本だと関東。その前は、まあ、いろいろ」',
        109:'「地方やねん。こっち来たとき、電車の多さで泣いた」',
        110:'「関西。……言うと、たいてい喋り方の話になるね」',
      },
      miss:null, missNarr:null,
      moreDefault:'「なんで出てきたの。こっちに」',
      friend:'「こいつ酔うと訛るからな。見とけ」',
    },

    // ══ あるある（狭い）: 同じ属性の子にだけ深く刺さる ══

    // ── バイト先 ──
    izakaya_kinyou: {
      id:'izakaya_kinyou', label:'金曜21時の話', kind:'aruaru',
      require:{ part:'izakaya' },
      tags:['playful','chaotic'],
      open:'「金曜の21時ってさ、あれ何なんだろうな」',
      appealBy:[{ when:{ part:'izakaya' }, score:3 },
                { when:{ part:['cafe','juku'] }, score:1 }],
      bite:{
        104:'「わかる。あれ絶対おかしいって。一斉に来んねん」',
        106:'「わかる〜！　あの時間だけ別の生き物になってる」',
        102:'「カフェだとそこまでじゃないけど、想像はつく」',
        107:'「……カフェは朝な。朝がこわい」',
      },
      miss:'「金曜？　……ふつうの日じゃないんですか」',
      missNarr:'（バイトしていない側には、通じなかった）',
      more:{
        104:'「で、ラスト前に来る団体な。あれどう思う」',
        106:'「ね、ピーク終わったあとの、あの静けさ好きでしょ」',
      },
      moreDefault:'「なにが一番しんどいんですか、その時間」',
      friend:'「金曜のこいつ、目がすわってるからな」',
    },

    cafe_latte: {
      id:'cafe_latte', label:'ラテアートの話', kind:'aruaru',
      require:{ part:'cafe' },
      tags:['playful','intimate'],
      open:'「ラテアート、あれいつできるようになるんだろ」',
      appealBy:[{ when:{ part:'cafe' }, score:3 },
                { when:{ part:['izakaya','juku'] }, score:1 }],
      bite:{
        102:'「ねー！　うちいまだにハート歪むんだけど」',
        107:'「……あれな。失敗したやつ、裏で自分で飲んでる」',
        109:'「うちもやねん！　三年目でまだハートやで、ハート」',
        104:'「ああいう繊細なやつ、うち絶対むりやわ」',
      },
      miss:'「ラテ、アート……？　あ、見るのは好きです」',
      missNarr:'（やったことがない側には、通じなかった）',
      more:{
        102:'「てか誰に教わった？　うち独学でずっと詰んでる」',
        107:'「……失敗したやつ、どうしてる」',
        109:'「ね、リーフできる？　うち憧れやねん」',
      },
      moreDefault:'「一日、何杯くらい作るんですか」',
      friend:'「こいつのラテ、前に見たけど普通に雲だったぞ」',
    },

    juku_tantou: {
      id:'juku_tantou', label:'担当の子の話', kind:'aruaru',
      require:{ part:'juku' },
      tags:['emotional','intimate'],
      open:'「担当の子が受かったときって、あれヤバくない」',
      appealBy:[{ when:{ part:'juku' }, score:3 },
                { when:{ part:['izakaya','cafe'] }, score:1 }],
      bite:{
        101:'「……分かります。自分のことより、ずっと」',
        105:'「わたし、去年ちょっと泣きました。……教室の外でですけど」',
        110:'「あれはね。あの顔を見るために続けてるようなものだよ」',
        106:'「いい話じゃん。そういうの聞くと、こっちまで嬉しい」',
      },
      miss:'「受かった……？　あ、受験の話ですか」',
      missNarr:'（教える側の話は、そこで止まった）',
      more:{
        101:'「……逆に、落ちた子のことは、まだ覚えてますか」',
        105:'「わたし、報告を聞く前の一週間がいちばん無理でした」',
        110:'「で、君は何を教えてるの。教科じゃなくて」',
      },
      moreDefault:'「どのくらい担当してるんですか、その子」',
      friend:'「こいつ生徒の名前、卒業しても覚えてるからな」',
    },

    nobaito_jikan: {
      id:'nobaito_jikan', label:'働いてない話', kind:'aruaru',
      require:{ part:'none' },
      tags:['tense','emotional'],
      open:'「バイトしてないんだよな、いま。時間だけある」',
      appealBy:[{ when:{ part:'none' }, score:3 }],
      bite:{
        103:'「……同じ。時間があるって、案外こわいよ」',
        108:'「わたしも。周りみんな働いてて、ちょっと焦る」',
      },
      miss:'「え、してないんですか。……いいなあ」',
      missNarr:'（働いている側には、羨ましがられて終わった）',
      more:{
        103:'「……その時間、何に使ってるの。そっちが本題でしょ」',
        108:'「ね、暇な日って何する？　わたし本当に分からなくて」',
      },
      moreDefault:'「その時間、どうやって使ってるんですか」',
      friend:'「こいつ暇って言いながら一番寝てるからな」',
    },

    // ── 住まい ──
    home_mongen: {
      id:'home_mongen', label:'門限の話', kind:'aruaru',
      require:{ living:'home' },
      tags:['emotional','playful'],
      open:'「門限ってさ、大学生になっても消えないもんなんだな」',
      appealBy:[{ when:{ living:'home' }, score:3 },
                { when:{ living:['alone_send','alone_nosend'] }, score:1 }],
      bite:{
        101:'「……うちも。十一時なんです、まだ」',
        105:'「あります。でも、あるほうが予定は立てやすくて」',
        108:'「あるある！　っていうか、それ日本だけじゃない？」',
        109:'「うちもやねん！　十時やで、十時。高校生か」',
        110:'「……もう忘れたな、その感覚」',
      },
      miss:'「門限……？　あ、実家だとあるんですね」',
      missNarr:'（一人暮らし組には、遠い話だった）',
      more:{
        101:'「……破ったこと、ありますか」',
        105:'「ちなみに、何時ですか。うちより遅いなら、少し羨ましいです」',
        108:'「で、破ったらどうなるの？　うちは無言なんだけど」',
        109:'「な、延ばす交渉したことある？　うち全敗やねん」',
      },
      moreDefault:'「何時なんですか、ちなみに」',
      friend:'「こいつ終電気にしてるふりして毎回一番残るぞ」',
    },

    send_shiokuri: {
      id:'send_shiokuri', label:'仕送り日の話', kind:'aruaru',
      require:{ living:'alone_send' },
      tags:['playful','intimate'],
      open:'「仕送りの日って、ちょっとだけ気が大きくなるよな」',
      appealBy:[{ when:{ living:'alone_send' }, score:3 },
                { when:{ living:'alone_nosend' }, score:1 }],
      bite:{
        102:'「なるなる！　その日だけ財布ゆるゆるなんだけど」',
        107:'「……その日にええもん食べて、あと三週間は米や」',
        110:'「分かるよ。あの日の自分は、別人だね」',
        104:'「ええなあ。うち、それ無いからな」',
      },
      miss:'「仕送り？　……あ、うち実家なので」',
      missNarr:'（実家組には、ない感覚だった）',
      more:{
        102:'「で、最初の日なに食べる？　うちは絶対に肉」',
        107:'「……で、何日もつん、それ」',
        110:'「その気の大きい日に、君は何を買うの」',
      },
      moreDefault:'「その日、なに食べるんですか」',
      friend:'「こいつ仕送り日の翌日に必ず誘ってくるからな」',
    },

    nosend_denki: {
      id:'nosend_denki', label:'電気代の話', kind:'aruaru',
      require:{ living:'alone_nosend' },
      tags:['tense','chaotic'],
      open:'「電気代の請求くるとき、ちょっと息止めない？」',
      appealBy:[{ when:{ living:'alone_nosend' }, score:3 },
                { when:{ living:'alone_send' }, score:1 }],
      bite:{
        103:'「……止める。数字を見る前に、一回深呼吸する」',
        104:'「わかる。夏はもう、開けるのやめたわ」',
        106:'「え、ちゃんと払えてる？　……そこが心配なんだけど」',
        107:'「……わかるけど、うちはまだマシなほうやと思う」',
      },
      miss:'「電気代……うち、見たことないです」',
      missNarr:'（実家組には、見たことのない紙だった）',
      more:{
        103:'「……で、いくらだった？　わたしのと比べたい」',
        104:'「で、エアコンつけへんのと、金払うの、どっち選んでる」',
        106:'「ちゃんと暖かくしてる？　……お金より、そっちが心配」',
      },
      moreDefault:'「夏と冬、どっちがきついですか」',
      friend:'「こいつの部屋、真夏に行ったら地獄だったからな」',
    },

    // ── サークル ──
    culture_nushi: {
      id:'culture_nushi', label:'部室の主の話', kind:'aruaru',
      require:{ circle:'culture' },
      tags:['playful','intimate'],
      open:'「部室にさ、なんか住んでる先輩っていない？」',
      appealBy:[{ when:{ circle:'culture' }, score:3 },
                { when:{ circle:'sports' }, score:1 }],
      bite:{
        101:'「……います。いつ行っても、いるんです」',
        103:'「いる。あれはもう、部屋の一部だと思ってる」',
        108:'「いるいる！　あの人いつ授業出てるの？」',
        110:'「……その言い方だと、わたしがそうだったな」',
        102:'「うちの部にもおったわ、そういうの」',
      },
      miss:'「部室……？　入ってないので、分からないです」',
      missNarr:'（サークルに入っていない側には、届かなかった）',
      more:{
        101:'「……その先輩、卒業したらどうなるんでしょうね」',
        103:'「で、その人の椅子ってもう決まってるでしょ。あれ何なんだろ」',
        108:'「ね、その人と喋る？　わたし最初こわかったんだけど」',
        110:'「で、君はその人を邪魔だと思ってる？　正直に」',
      },
      moreDefault:'「その人、どんな人なんですか」',
      friend:'「こいつも部室で寝てるとこ見たことあるぞ」',
    },

    sports_asaren: {
      id:'sports_asaren', label:'朝練の話', kind:'aruaru',
      require:{ circle:'sports' },
      tags:['playful','chaotic'],
      open:'「朝練って、起きた瞬間がいちばんきついよな」',
      appealBy:[{ when:{ circle:'sports' }, score:3 },
                { when:{ circle:'culture' }, score:1 }],
      bite:{
        102:'「あれ何なんだろうね！　起きたら終わってたことにならないかな」',
        104:'「起きてまうねん、体が。あれもう呪いやろ」',
        109:'「うち一回だけ寝坊して、いまだに言われんねん」',
        110:'「……朝に何かをする人って、別の生き物だよね」',
      },
      miss:'「朝練……すごいですね。わたし、朝は無理です」',
      missNarr:'（運動をしない側には、遠い話だった）',
      more:{
        102:'「ね、起きるコツある？　うち毎回ギリギリなんだけど」',
        104:'「で、朝終わったあとの一限、寝てるやろ。正直に言え」',
        109:'「朝練のあとのごはん、異常においしない？」',
      },
      moreDefault:'「何時からなんですか、それ」',
      friend:'「こいつ朝練の日だけ前の日に帰るからな」',
    },

    nocircle_sobire: {
      id:'nocircle_sobire', label:'入りそびれた話', kind:'aruaru',
      require:{ circle:'none' },
      tags:['tense','emotional'],
      open:'「サークル入ってないんだよな。入りそびれたまま二年」',
      appealBy:[{ when:{ circle:'none' }, score:3 }],
      bite:{
        105:'「わたしもです。……最初の一週間を逃すと、もう」',
        106:'「うちも入ってない。でも、そのぶん時間はあるよ」',
        107:'「……入ってへん。別に困ってへんし」',
      },
      miss:'「え、入ってないんですか。もったいない」',
      missNarr:'（サークル組には、もったいながられて終わった）',
      more:{
        105:'「後悔、してますか。……わたしはたまにします」',
        106:'「で、友達はどこで作ったの？　そっちのほうが気になる」',
        107:'「……で、いま誰と遊んでんの」',
      },
      moreDefault:'「入らなくて、困ったことありますか」',
      friend:'「こいつ入ってないくせに、よその打ち上げには来るからな」',
    },

    // ══ 一般ネタ: 属性の壁を越える札 ══
    //   あるあるだけだと「自分と同じ境遇の子」としか深くなれない。
    //   一般ネタは誰にでも通じる（score 2）が、持つのに条件が要る。
    //   コミュ力や頭で持てるもの、体育会でないとそもそも知らないもの。
    //   ＝外れない代わりに爆発もしない、安定型のビルドが成立する。

    machi_gyoretsu: {
      id:'machi_gyoretsu', label:'並んでる店の話', kind:'general',
      require:{ param:{ comm:62 } },
      tags:['playful','chaotic'],
      open:'「駅前のあれ、まだ並んでんのかな。一回も入れてない」',
      appealBy:[{ when:{ zemi:'社会' }, score:3 }, { when:{}, score:2 }],
      bite:{
        102:'「行った行った！　写真だけ撮って帰ったけど」',
        103:'「……並んでる列を見にいくのが好き。入らないけど」',
        106:'「あそこ？　並ぶよ。でも平日の15時なら入れる」',
        108:'「ああいうの、日本すごいよね。並ぶこと自体が娯楽になってる」',
        109:'「うち三回行って三回諦めた。もう意地やねん」',
      },
      biteDefault:'「……並んでますね。前を通るたびに思います」',
      miss:null, missNarr:null,
      moreDefault:'「一緒に行く人いないんだよな。平日の昼とか」',
      friend:'「こいつ並ぶの大嫌いなのに、話だけは詳しいからな」',
    },

    yakyuu: {
      id:'yakyuu', label:'野球の話', kind:'general',
      require:{ circle:'sports' },      // 体育会でないと、そもそも話についていけない
      tags:['playful','chaotic'],
      open:'「昨日の試合、九回のあれ見た？」',
      appealBy:[{ when:{ circle:'sports' }, score:3 }, { when:{}, score:2 }],
      bite:{
        102:'「見てない！　けど、なんかやばかったんでしょ？」',
        104:'「見たに決まってるやろ。あれで寝られへんかったわ」',
        109:'「うちルール分からんのやけど、最後だけ一緒に見てた」',
      },
      biteDefault:'「……見てないです。でも、そんなにすごかったんですか」',
      miss:null, missNarr:null,
      moreDefault:'「どこ応援してるの。うち、地元の球団」',
      friend:'「こいつ野球の話になると声でかくなるからな」',
    },

    yononaka: {
      id:'yononaka', label:'世の中の話', kind:'general',
      require:{ param:{ head:70 } },
      tags:['tense','emotional'],
      open:'「あのニュース、あれどう思った？」',
      appealBy:[{ when:{ zemi:'社会' }, score:3 }, { when:{}, score:2 }],
      bite:{
        101:'「……新聞で読みました。少し、考えてしまって」',
        103:'「……あれね。みんなが同じ方を向く感じが、ちょっとこわい」',
        105:'「わたし、ああいうのを人と話すのが苦手で。……でも、聞きたいです」',
        106:'「気になってた。でも、誰に聞いたらいいか分からなくて」',
        109:'「え、なんやったっけそれ。……ごめん、ちゃんと見てへん」',
      },
      biteDefault:'「あー……見ました。あんまり詳しくないですけど」',
      miss:null, missNarr:null,
      moreDefault:'「で、そっちはどう思った。正直なところ」',
      friend:'「出た。こいつ二杯目からこういう話するからな」',
    },

    hon_eiga: {
      id:'hon_eiga', label:'止まってる一冊', kind:'general',
      require:{ param:{ head:64 } },
      tags:['emotional','intimate'],
      open:'「最近なんか読んだ？　俺いま一冊で止まってる」',
      appealBy:[{ when:{ zemi:'文学' }, score:3 }, { when:{}, score:2 }],
      bite:{
        101:'「……読みました。あの、途中で止まってた本を、やっと」',
        107:'「……読んでる。人に言うほどのもんちゃうけど」',
        108:'「読んでる！　日本語だと三倍時間かかるけどね」',
        110:'「読んでるよ。……止まってる一冊があるって、いい言い方だね」',
      },
      biteDefault:'「本……最近は、あんまり」',
      miss:null, missNarr:null,
      moreDefault:'「止まってる一冊、何なの。俺のはずっと同じページ」',
      friend:'「こいつの本棚、読んでない本しかないからな」',
    },

    // ══ 濃いあるある: 二つの属性が両方そろっている人にだけ通じる話 ══
    //   刺さるのは10人中2人だけ。その代わり、刺さり方が一番深い。
    //   持てるのも自分が両方の属性を持つときだけ＝キャラ作成の選択が効く。

    jikka_juku: {
      id:'jikka_juku', label:'実家から塾へ', kind:'deep',
      require:{ living:'home', part:'juku' },
      tags:['emotional','intimate'],
      open:'「実家から塾って、一回家に帰ってから行くじゃん。あれ無駄すぎない？」',
      appealBy:[{ when:{ living:'home', part:'juku' }, score:3 },
                { when:{ part:'juku' }, score:1 },
                { when:{ living:'home' }, score:1 }],
      bite:{
        101:'「……分かります。一回帰ると、もう出たくなくなるんです」',
        105:'「分かります！　なのに帰らないと荷物が持てなくて」',
      },
      miss:'「え、そんなに大変なんですか」',
      missNarr:'（その二つを両方やっている人にしか、分からなかった）',
      more:{
        101:'「……あの、帰ってから出るまでの時間、どうしてますか」',
        105:'「わたし、一回座ると立てなくなります。……対策、ありますか」',
      },
      moreDefault:'「そんなに違うものなんですか」',
      friend:'「こいつ一回帰ったら来ないからな。知ってる」',
    },

    makanai_shiokuri: {
      id:'makanai_shiokuri', label:'まかないと仕送り', kind:'deep',
      require:{ living:'alone_send', part:'cafe' },
      tags:['playful','intimate'],
      open:'「まかないがある月って、仕送りが余るんだよな」',
      appealBy:[{ when:{ living:'alone_send', part:'cafe' }, score:3 },
                { when:{ part:'cafe' }, score:1 },
                { when:{ living:'alone_send' }, score:1 }],
      bite:{
        102:'「それ！　で、余った分で服買って結局なくなるんだけど」',
        107:'「……余らへん。余ったつもりで使ってるだけや」',
      },
      miss:'「まかない……いいですね。うち、ないので」',
      missNarr:'（その二つが揃っている人にしか、通じなかった）',
      more:{
        102:'「で、なに食べてる？　うちの店、選べるのが三種類しかないんだけど」',
        107:'「……で、その余った分、何に消えてる？」',
      },
      moreDefault:'「まかないって、飽きないんですか」',
      friend:'「こいつ月末だけ急に金持ちになるからな」',
    },

    hangaku_seal: {
      id:'hangaku_seal', label:'バイト明けの半額', kind:'deep',
      require:{ living:'alone_nosend', part:'izakaya' },
      tags:['tense','chaotic'],
      open:'「バイト上がりのコンビニ、あの半額シールだけが救いでさ」',
      appealBy:[{ when:{ living:'alone_nosend', part:'izakaya' }, score:3 },
                { when:{ part:'izakaya' }, score:1 },
                { when:{ living:'alone_nosend' }, score:1 }],
      bite:{
        104:'「わかる。あれ狙って上がる時間ずらしてるまであるわ」',
        106:'「分かる。……でも、それだけじゃ体もたないからね」',
      },
      miss:'「半額シール……？　あ、夜のやつですか」',
      missNarr:'（その二つが揃っている人にしか、通じなかった）',
      more:{
        104:'「で、なに買ってんの。うちは絶対に唐揚げやねん」',
        106:'「ねえ、野菜は？　……ごめん、また心配してる」',
      },
      moreDefault:'「それ、毎日なんですか」',
      friend:'「こいつの家の冷蔵庫、半額シールしか入ってないからな」',
    },

    // ══ 日常で覚える札: 月の行動を選ぶと手に入り、以後ずっとデッキに残る ══

    tani: {
      id:'tani', label:'単位の話', kind:'learned', learnedBy:'study',
      require:{ flag:'study' },
      tags:['tense','playful'],
      open:'「あの授業、落としたやつ何人いるんだろ」',
      appealBy:[{ when:{}, score:2 }],
      bite:{
        102:'「うち去年ひとつ落としたわ。まあ、なんとかなるっしょ」',
        105:'「わたし、まだ一つも落としてません。……こわくて」',
        108:'「落単って言葉、最初なんの隠語かと思った」',
      },
      biteDefault:'「……落としたこと、ありますか」',
      miss:null, missNarr:null,
      moreDefault:'「どの授業がやばいとか、情報ある？」',
      friend:'「こいつ先輩の過去問で生きてるからな」',
    },

    karadazukuri: {
      id:'karadazukuri', label:'体づくりの話', kind:'learned', learnedBy:'gym',
      require:{ flag:'gym' },
      tags:['playful','chaotic'],
      open:'「最近走り始めたんだけど、三日で足が終わった」',
      appealBy:[{ when:{ circle:'sports' }, score:3 }, { when:{}, score:2 }],
      bite:{
        102:'「えらい！　うち絶対三日ももたない」',
        104:'「三日？　早ない？　……まあ最初はそんなもんやけど」',
        109:'「うちも始めたけど、ウェア買って満足してもうた」',
      },
      biteDefault:'「すごいですね。わたし、走るのは……」',
      miss:null, missNarr:null,
      moreDefault:'「どうやったら続くと思う？　真剣に聞いてる」',
      friend:'「こいつのランニングシューズ、まだ新品同様だからな」',
    },

    nomi_shippai: {
      id:'nomi_shippai', label:'飲みの失敗談', kind:'learned', learnedBy:'friend_hangout',
      require:{ flag:'friend_hangout' },
      tags:['playful','chaotic'],
      open:'「こないだの飲みでさ、友達が完全に終わってて」',
      appealBy:[{ when:{ part:'izakaya' }, score:3 }, { when:{}, score:2 }],
      bite:{
        102:'「うちもやったことある。翌日の記憶がなかった」',
        104:'「あー、そういうの店側から見てると分かんねん。目でな」',
        106:'「うちも見るよ。あれ、介抱する側がいちばん大変」',
      },
      biteDefault:'「……大丈夫だったんですか、その人」',
      miss:null, missNarr:null,
      moreDefault:'「で、そっちは大丈夫なほう？　それとも」',
      friend:'「お前が言うなよ。あれ介抱したの俺だからな」',
    },
  };

  const _WIDTH_BY_REACH = [
    { min: 7, width: 'wide',   ja: '広く効く' },
    { min: 4, width: 'mid',    ja: 'そこそこ' },
    { min: 0, width: 'narrow', ja: '刺されば大' },
  ];

  /** 話題を引く */
  function get(id) { return TOPICS[id] || null; }

  /**
   * この話題を「持てるか」。持てる条件は3種類あり、どれも require に書く。
   *   属性      require:{ living:'home', part:'juku' }   ← 両方そろって初めて持てる（濃いあるある）
   *   パラメータ require:{ param:{ comm:62 } }            ← コミュ力が高いと持てる（一般ネタ）
   *   覚えた     require:{ flag:'gym' }                   ← 日常でその行動を選ぶと覚える
   * @param {object} self   { living, circle, part, params:{...}, flags:[...] }
   */
  function canHold(topic, self) {
    if (!topic) return false;
    const r = topic.require;
    if (!r) return true;
    for (const k of ['living', 'circle', 'part', 'hometown']) {
      if (r[k] == null) continue;
      const want = r[k], have = self && self[k];
      if (Array.isArray(want) ? want.indexOf(have) < 0 : have !== want) return false;
    }
    if (r.param) {
      const p = (self && self.params) || {};
      for (const k in r.param) if ((p[k] || 0) < r.param[k]) return false;
    }
    if (r.flag) {
      const f = (self && self.flags) || [];
      if (f.indexOf(r.flag) < 0) return false;
    }
    return true;
  }

  /** 自分が持てる話題を、種類で絞って返す */
  function holdable(self, kinds) {
    return Object.keys(TOPICS)
      .map(id => TOPICS[id])
      .filter(t => (!kinds || kinds.indexOf(t.kind) >= 0) && canHold(t, self));
  }

  /**
   * この話題は、この子にどれだけ刺さるか（0..3）。
   * appealBy の上から順に、属性が全部一致した最初のルールを採る。
   * ＝表を手書きしないので、ヒロインを足しても自動で効く。
   */
  function score(topic, h) {
    if (!topic || !h) return 0;
    for (const rule of topic.appealBy || []) {
      let ok = true;
      for (const k in rule.when) {
        const want = rule.when[k], have = h[k];
        if (Array.isArray(want) ? want.indexOf(have) < 0 : have !== want) { ok = false; break; }
      }
      if (ok) return rule.score;
    }
    return 0;
  }

  const _gone = (state, id) => !!((state && state.twoWorld && state.twoWorld[id])
    || (state && state.stolenHeroineId === id));

  /**
   * この話題は誰に刺さるか。一番前のめりになる子を返す。
   * 同点なら♥が高いほう（もう乗っている子が拾う）。
   * @returns {{heroine:object, appeal:number}|null}  null = 誰も食いつかない
   */
  function biter(topic, heroines, state) {
    if (!topic || !heroines) return null;
    let best = null;
    heroines.forEach(h => {
      if (_gone(state, h.id)) return;
      const a = score(topic, h);
      if (a < BITE_MIN) return;
      const heart = (state && state.hearts && state.hearts[h.id]) || 0;
      if (!best || a > best.appeal || (a === best.appeal && heart > best.heart)) {
        best = { heroine: h, appeal: a, heart };
      }
    });
    return best;
  }

  /**
   * 食いついた子の「次点」。卓が一人としか回らないのを防ぐ（2026-09-24）。
   * ここまで拾えれば十分で、3人目まで出すと一手で全員が喋って忙しい。
   * @returns {{heroine, appeal}|null}
   */
  function secondBiter(topic, heroines, state, exceptId) {
    if (!topic || !heroines) return null;
    let best = null;
    heroines.forEach(h => {
      if (h.id === exceptId || _gone(state, h.id)) return;
      const a = score(topic, h);
      if (a < 1) return;                       // かすりもしない子は黙っている
      if (!best || a > best.appeal) best = { heroine: h, appeal: a };
    });
    return best;
  }

  /** 食いついた子が返す一言（個別が無ければ共通） */
  function biteLine(topic, heroineId) {
    return (topic.bite && topic.bite[heroineId]) || topic.biteDefault || null;
  }

  /** 次ターン、その子が「もっと聞かせて」と返してくる一言 */
  function moreLine(topic, heroineId) {
    return (topic.more && topic.more[heroineId]) || topic.moreDefault || null;
  }

  /** 卓にこの話題を拾える子が何人いるか */
  function reach(topic, heroines, state) {
    if (!topic || !heroines) return 0;
    return heroines.filter(h => !_gone(state, h.id) && score(topic, h) >= BITE_MIN).length;
  }

  /**
   * 全10人のうち何人が拾うか → 幅。
   * 札の「広く効く／そこそこ／刺されば大」はここから自動で決まる。
   * @param {Array} allHeroines  data/gamedata.js の HEROINES
   */
  function widthOf(topic, allHeroines) {
    const n = (allHeroines || []).filter(h => score(topic, h) >= BITE_MIN).length;
    const w = _WIDTH_BY_REACH.find(x => n >= x.min) || _WIDTH_BY_REACH[2];
    return { n, width: w.width, ja: w.ja };
  }

  return { get, score, biter, secondBiter, biteLine, moreLine, reach, widthOf,
           canHold, holdable, BITE_MIN, TOPICS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CardTopics;
