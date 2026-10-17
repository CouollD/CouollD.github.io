// js/year/year.js — 一周の進行（GDD_v6 §13、10/15 作業2・作業3・作業4・作業5）。screens/year.html から読む
// タイトル（はじめから／つづきから）→ キャラクリ（3問）→ 4月…2月（日常7回・合コン4回）→ 3月 → エンディング（3つ）
// セーブは localStorage 'stamen_year'。画面が変わるたびに書く。どこで閉じても「つづきから」でその画面に戻る
// 合コンの月（5・7・10・2月）：月の画面 →「合コンへ」で at='night' にして night_i.html?loop=1 へ。
//   night_i が結果を lastNight に書いて戻ってきたら、route() の頭で反映して null に戻す（同じ1回の書き込みで。読み込み直しても二重に足さない）
//   7月・2月は月の画面 → 布陣（知っている友達から2人）→ 合コン。選んだ2人は sv.squad に置き、夜の結果を反映するとき仲＋15・went＋1 にして null に戻す
//   灰色版の嘘（§13 ②）：夜の中の友達は選んでもけんた・けいたのまま（night_i には何も渡さない）。夜は5月の台本の使い回し（§13 ⑤の仮）
// 灰色版で新しく書く文は、見出し・ボタンの文字・事実の箇条書きだけ。人物の台詞は書かない（§13 ⑤）
// 見た目（10/16）：design/year.css。画面ごとに html[data-scene]（背景）と、上の1年の帯・左の見出し・右のボタンを出す。
//   顔は座った絵（design/img_sit）の上の方を丸く切る。テストが見る #app h2・h1・.res・.btns button の文字は灰色版と同じ
const Year = (() => {
  'use strict';
  const KEY = 'stamen_year', V = 1;
  const ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
  const GOUKON = [5, 7, 10, 2];
  // 友達は12人。ひろき（5）・だいすけ（8）は外す（10/13 決定。gamedata.js にはまだいる）
  const FRIEND_IDS = [1, 2, 3, 4, 6, 7, 9, 10, 11, 12, 13, 14];
  const KENTA = 1, TOMOYA = 3, KEITA = 4;   // 最初から知っている幼馴染は ともや（10/16 ユーザー：幼馴染は同期に）
  // 数字は仮（10/15 balance-designer の提案）。日常＋5、5月・10月の夜（誘われて行く夜）に連れて行った2人＋5、
  //   7月・2月の布陣で選んだ2人＋15（布陣の無い古いセーブの7月・2月は BOND_NIGHT）。仲間との1年は仲 BOND_CLOSE 以上が2人
  const BOND_DAY = 5, BOND_NIGHT = 5, BOND_SQUAD = 15, BOND_CLOSE = 45;
  // 夜に連れて行った友達：5月・10月は夜の中のけんた・けいた。7月・2月は布陣で選んだ2人（sv.squad）
  const NIGHT_FRIENDS = [KENTA, KEITA];
  const SQUAD_MONTHS = [7, 2];
  const NIGHT_HOST = { 5: 'けんたに誘われた', 7: '自分が幹事', 10: 'けんたが幹事', 2: '自分が幹事' };   // §13 ②の「誘う人」
  const FORK_TEXT = { kanji: '10月の分かれ道：幹事を代わった', yuuki: '10月の分かれ道：ゆうきと話した' };
  // キャラクリの答え → 話のネタの札（night-i.js の I_CARDS のキー）。カフェ・バイトなし・サークルなしは札なし（§13 ⑦の6）
  const CARD = {
    living: { home: 'jikka', alone_send: 'hitori', alone_nosend: 'hitori' },
    circle: { sports: 'futsal', culture: 'keion' },
    part: { izakaya: 'izakaya', juku: 'juku' },
  };
  const ASK = [
    ['living', '住まい'],
    ['circle', 'サークル'],
    ['part', 'バイト'],
    ['bmonth', '誕生日（月）'],   // 10/17 ユーザー「誕生日は最初に設定できるように」。2年なので、誕生日の月までは19歳（夜の最初の一杯がノンアルになる）
  ];
  // 誕生日の月の選択肢（1年の並び＝4月はじまり）。ENV_LABELS には無いのでここに持つ
  const BMONTH = Object.fromEntries(ORDER.map(m => [String(m), `${m}月`]));
  const askLabels = k => k === 'bmonth' ? BMONTH : ENV_LABELS[k];
  const STAGE_TEXT = { 4: '駅まで一緒に帰った', 5: '次の約束をした' };
  const NIGHT_URL = 'night_i.html?loop=1';
  // 顔の絵：友達はこっちを見る絵、ヒロインは正面の座った絵。けんた・けいたは向きの違う名前
  const IMG = '../design/img_sit/';
  const FACE = { 1: 'm1_look', 4: 'm4_look_l' };
  const fface = id => `${IMG}${FACE[id] || `m${id}_look`}.png`;
  const hface = id => `${IMG}h${id}_front.png`;

  const app = document.getElementById('app');
  let sv = null;

  // ── セーブ ──
  const valid = s => !!(s && s.v === V && s.me && s.friends && s.heroines && Array.isArray(s.log) &&
    (ORDER.includes(s.month) || s.month === 'end'));
  const load = () => { let s = null; try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {} return valid(s) ? s : null; };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(sv)); } catch (e) {} };

  const given = full => String(full).split(/\s+/).pop();
  const fname = id => given((CHARACTERS.find(c => c.id === id) || {}).name || id);
  const hname = id => given((HEROINES.find(h => h.id === id) || {}).name || id);
  const char = id => CHARACTERS.find(c => c.id === id) || {};

  function newSave(living, circle, part, bmonth) {
    const cards = [CARD.living[living], CARD.circle[circle], CARD.part[part]].filter(Boolean).slice(0, 3);
    const friends = {};
    FRIEND_IDS.forEach(id => {
      const c = char(id);
      // 最初から知っている：けんた・ともや（幼馴染）と、サークルかバイトが同じ友達（「なし」どうしは同じに数えない）
      const known = id === KENTA || id === TOMOYA || (circle !== 'none' && c.circle === circle) || (part !== 'none' && c.part === part);
      friends[id] = { known, bond: 0, went: 0 };
    });
    const heroines = {};
    // stageM：段階がいちばん上まで上がった夜の月（エンディングの「いちばん進んだ夜の月」。作業3で足した。無いセーブは nights の最後で代用）
    HEROINES.forEach(h => { heroines[h.id] = { met: false, best: 0, last: 0, stage: 0, stageM: null, nights: [] }; });
    return {
      v: V, month: 4, at: 'month',
      me: { living, circle, part, bmonth: +bmonth || 4, params: derivePlayerParams(living, circle, part), cards },   // bmonth：誕生日の月（10/17。無い古いセーブは4月＝もう20歳）
      heroines, friends, flags: { oct: null }, log: [], lastNight: null,
      squad: null,   // 布陣で選んだ2人（7月・2月の夜の前だけ。作業4で足した。無いセーブは null と同じ）
    };
  }

  // ── 画面の部品 ──
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 画面を作り直す。scene は背景（street／izakaya／station／out）。cal=true で上に1年の帯（今の月・過ぎた月・合コンの月）
  function screen(id, html, scene, cal) {
    document.documentElement.dataset.scene = scene || 'street';
    app.innerHTML = (cal ? calBar() : '') + `<section class="lead">${html}</section>`;
    app.dataset.screen = id; window.scrollTo(0, 0);
  }
  function calBar() {
    const now = ORDER.indexOf(sv.month === 'end' ? 3 : sv.month);
    return '<ol class="cal" aria-label="1年の進み">' + ORDER.map((m, i) =>
      `<li class="${i < now ? 'past' : i === now ? 'now' : ''}${GOUKON.includes(m) ? ' go' : ''}"${i === now ? ' aria-current="true"' : ''}>${m}</li>`).join('') + '</ol>';
  }
  // 顔：<i class="face"> に絵を背景で置く（文字を持たない）。名前つきは <figure>
  const faceI = (src, h) => `<i class="face${h ? ' h' : ''}" style="--src:url('${src}')" aria-hidden="true"></i>`;
  const faceFig = (src, name, cls, h) => `<figure class="${cls || ''}">${faceI(src, h)}<figcaption>${esc(name)}</figcaption></figure>`;
  const faces = list => list.length ? `<div class="faces">${list.join('')}</div>` : '';
  // 二度押しの2回目（e.detail が2以上）は捨てる（作業5で直した）。押すたびに画面を作り直すので、
  //   2回目が同じ位置に出た次の画面のボタンに当たっていた（「はじめから」の二度押しで「実家」まで、日常の二度押しで「次の月へ」まで押された）
  //   list の4つ目（任意）：{ k: 印の種類, on: 選んでいる, face: 顔の絵, bond: 仲 0〜100 }。足すのは文字を持たない飾りだけ（ボタンの文字は label のまま）
  function buttons(list, cls) {
    const box = document.createElement('div'); box.className = 'btns' + (cls ? ' ' + cls : list.length === 1 ? ' one' : '');
    list.forEach(([label, fn, disabled, o]) => {
      const b = document.createElement('button'); b.type = 'button';
      o = o || {};
      if (o.face) b.insertAdjacentHTML('beforeend', faceI(o.face));
      // 文字はボタン直下の文字1つのまま（span に包むと、テストの :text-is が span に当たり、flex の子に分けると innerText に改行が入る）
      b.appendChild(document.createTextNode(label));
      if (o.k) b.dataset.k = o.k;
      if (o.on) { b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); } else if (o.face) b.setAttribute('aria-pressed', 'false');
      if (o.bond != null) b.insertAdjacentHTML('beforeend', `<span class="bond" aria-hidden="true"><i style="--w:${Math.max(4, Math.min(100, o.bond))}%"></i></span>`);
      if (disabled) b.disabled = true; else b.addEventListener('click', e => { if (e.detail > 1) return; fn(); });
      box.appendChild(b);
    });
    app.appendChild(box);
    return box;
  }
  const names = ids => ids.map(fname).join('・');
  const hnames = ids => ids.map(hname).join('・');
  const entryOf = m => sv.log.find(e => e.m === m);

  // ── タイトル ──
  function title() {
    const has = load();
    screen('title', '<h1>今夜のスタメン！</h1><p class="sub">大学2年の1年間。合コンは4回だけ</p>' +
      `<div class="trio">${[101, 102, 103].map(id => faceI(hface(id), true)).join('')}</div>` +
      '<p class="note"><a class="quick" href="night_i.html">合コン1回だけ遊ぶ</a></p>', 'street', false);
    buttons([
      ['はじめから', () => chara([])],
      ['つづきから', () => { sv = load(); if (sv) route(); else title(); }, !has],
    ]);
  }

  // ── キャラクリ（3問。答え終わるまでセーブは書かない＝前のセーブは残る） ──
  function chara(ans) {
    if (ans.length === ASK.length) {
      sv = newSave(ans[0], ans[1], ans[2], ans[3]);
      save(); route(); return;
    }
    const [k, label] = ASK[ans.length];
    screen('chara', `<h2>キャラクリ（${ans.length + 1}/${ASK.length}）</h2><p>${esc(label)}</p>` +
      `<div class="steps" aria-hidden="true">${ASK.map((_, i) => `<i class="${i <= ans.length ? 'on' : ''}"></i>`).join('')}</div>`, 'street', false);
    const L = askLabels(k);
    buttons(Object.keys(L).sort((a, b) => k === 'bmonth' ? ORDER.indexOf(+a) - ORDER.indexOf(+b) : 0).map(v => [L[v], () => chara(ans.concat(v))]), k === 'bmonth' ? 'months' : '');
  }

  // ── 画面の振り分け（at と month から） ──
  function route() {
    applyNight();
    if (sv.at === 'ending' || sv.month === 'end') return ending();
    if (sv.month === 3) return march();
    if (GOUKON.includes(sv.month)) {
      if (sv.at === 'night') return toNight();   // 夜の途中で閉じた → 夜をはじめから（夜の中の進み具合は残していない）
      if (sv.at === 'squad' && SQUAD_MONTHS.includes(sv.month) && !entryOf(sv.month)) return squad([]);   // 布陣の途中で閉じた → 選び直し
      return goukon();
    }
    return day();
  }

  // ── 夜の結果（lastNight）を反映する。席の番号 → ヒロインID は cast で置き換える（§13 ⑥） ──
  // 反映と lastNight=null は同じ save() で書く。その月の夜の記録がもうあれば足さずに捨てる（二重に足さない）
  function applyNight() {
    const r = sv.lastNight;
    if (!r) return;
    sv.lastNight = null;
    const m = sv.month;
    const ok = r.month === m && GOUKON.includes(m) && !entryOf(m) && r.cast && r.hearts;
    if (ok) {
      const seats = Object.keys(r.cast).map(Number);
      const has = (list, seat) => Array.isArray(list) && list.includes(seat);
      seats.forEach(seat => {
        const h = sv.heroines[r.cast[seat]];
        if (!h) return;
        const v = Math.round(+r.hearts[seat]) || 0;
        h.met = true; h.last = v; h.best = Math.max(h.best, v);
        if (!h.nights.includes(m)) h.nights.push(m);
        // 段階：会った1／連絡先2／返事3／駅まで4／次の約束5 の高い方。下がらない。上がった夜の月を stageM に
        const st = r.date === seat ? 5 : r.walked === seat ? 4 : has(r.reply, seat) ? 3 : has(r.contact, seat) ? 2 : 1;
        if (st > h.stage) { h.stage = st; h.stageM = m; }
      });
      const q = squadOf(m);
      const took = q || NIGHT_FRIENDS.slice();
      const plus = q ? BOND_SQUAD : BOND_NIGHT;
      took.forEach(id => { const f = sv.friends[id]; if (!f) return; f.known = true; f.bond = Math.min(100, f.bond + plus); f.went += 1; });
      sv.squad = null;
      if (m === 10 && (r.fork === 'kanji' || r.fork === 'yuuki' || r.fork === null)) sv.flags.oct = r.fork;
      sv.log.push({ m, kind: 'night', friends: took, heroines: seats.map(s => r.cast[s]).filter(id => sv.heroines[id]), text: nightLine(r, seats, took) });
    }
    if (sv.at === 'night') sv.at = 'month';
    save();
  }

  // 7月・2月の布陣の2人。布陣の月でない・無い・壊れていれば null（その夜は けんた・けいたを連れて行ったことにして、仲は BOND_NIGHT）
  function squadOf(m) {
    const q = sv.squad;
    const ok = SQUAD_MONTHS.includes(m) && Array.isArray(q) && q.length === 2 && q[0] !== q[1] && q.every(id => sv.friends[id]);
    return ok ? q.slice() : null;
  }

  // 夜の結果の1行（事実だけ）。合コンの月の記録はこの1行だけ（1か月1行）
  function nightLine(r, seats, took) {
    const hid = seat => r.cast[seat];
    const parts = [];
    if (r.date != null && r.cast[r.date]) parts.push(`${hname(hid(r.date))}と${STAGE_TEXT[5]}`);
    else if (r.walked != null && r.cast[r.walked]) parts.push(`${hname(hid(r.walked))}と${STAGE_TEXT[4]}`);
    const contact = (r.contact || []).filter(s => r.cast[s]);
    parts.push(`個別の連絡先：${contact.length ? hnames(contact.map(hid)) : 'なし'}`);
    if (r.month === 10) parts.push(FORK_TEXT[r.fork] || '10月の分かれ道：どちらも選ばなかった');
    parts.push(`${names(took)}と仲が深まった`);
    return `合コン（${names(took)}と／${hnames(seats.map(hid))}）→ ${parts.join('。')}`;
  }

  function toNight() { location.assign(NIGHT_URL); }

  function advance() {
    const i = ORDER.indexOf(sv.month);
    sv.month = ORDER[i + 1]; sv.at = 'month';
    save(); route();
  }

  // ── 日常（4・6・8・9・11・12・1月）：3択と結果1行 ──
  function dayPick(kind) {
    if (entryOf(sv.month)) return;   // その月はもう選んだ（二重に足さない）
    const me = sv.me;
    let label, ids = [];
    if (kind === 'part') {
      if (me.part === 'none') label = '家でだらだらする';
      else { label = 'バイトに出る'; ids = FRIEND_IDS.filter(id => char(id).part === me.part); }
    } else if (kind === 'circle') {
      if (me.circle === 'none') label = '図書館で課題をやる';
      else { label = 'サークルに顔を出す'; ids = FRIEND_IDS.filter(id => char(id).circle === me.circle); }
    } else {
      label = 'けんたと飲む';
      const others = FRIEND_IDS.filter(id => id !== KENTA && sv.friends[id].known);
      others.sort((a, b) => sv.friends[a].bond - sv.friends[b].bond);   // いちばん仲の低い人（同じなら番号の若い方）
      ids = [KENTA].concat(others.slice(0, 1));
    }
    const fresh = ids.filter(id => !sv.friends[id].known);
    const deep = ids.filter(id => sv.friends[id].known);
    ids.forEach(id => { const f = sv.friends[id]; f.known = true; f.bond = Math.min(100, f.bond + BOND_DAY); });
    const res = [fresh.length ? `${names(fresh)}と話すようになった` : '', deep.length ? `${names(deep)}と仲が深まった` : '']
      .filter(Boolean).join('。') || '何も変わらなかった';
    sv.log.push({ m: sv.month, kind: 'day', pick: kind, friends: ids, fresh, text: `${label} → ${res}` });
    save(); day();
  }

  function day() {
    const done = entryOf(sv.month);
    screen('month', `<h2>${sv.month}月</h2>${untilNight()}` + (done ? `<p class="res">${esc(done.text)}</p>` + dayFaces(done) : '<p class="sub">この月にすること</p>' + knownFaces()), 'street', true);
    if (done) { buttons([['次の月へ', advance]]); return; }
    const me = sv.me;
    buttons([
      [me.part === 'none' ? '家でだらだらする' : 'バイトに出る', () => dayPick('part'), false, { k: 'part' }],
      [me.circle === 'none' ? '図書館で課題をやる' : 'サークルに顔を出す', () => dayPick('circle'), false, { k: 'circle' }],
      ['けんたと飲む', () => dayPick('kenta'), false, { k: 'kenta' }],
    ]);
  }

  // 次の合コンまで（事実だけ）。3月の前の月（1月）は「もう合コンは無い」ではなく2月を数える
  function untilNight() {
    const i = ORDER.indexOf(sv.month);
    const j = ORDER.findIndex((m, k) => k > i && GOUKON.includes(m));
    return j < 0 ? '' : `<span class="tag">次の合コンは${ORDER[j]}月${j - i === 1 ? '（来月）' : ''}</span>`;
  }
  // 知っている友達の顔（仲の深い順に8人まで）
  function knownFaces() {
    const ids = FRIEND_IDS.filter(id => sv.friends[id].known).sort((a, b) => sv.friends[b].bond - sv.friends[a].bond || a - b);
    if (!ids.length) return '';
    return `<p class="note">知っている友達 ${ids.length}人</p><div class="faces mini">${ids.slice(0, 8).map(id => faceI(fface(id))).join('')}</div>`;
  }
  // 日常の結果の顔：その月に会った友達（初めて話した人はレモンのふち）。顔の無い古い記録は出さない
  function dayFaces(e) {
    const fresh = e.fresh || [];
    return faces((e.friends || []).map(id => faceFig(fface(id), fname(id), fresh.includes(id) ? 'new' : '')));
  }

  // ── 合コンの月（5・7・10・2月）：夜の前は「合コンへ」、夜のあとは結果1行と「次の月へ」 ──
  function goukon() {
    const done = entryOf(sv.month);
    screen('goukon', `<h2>${sv.month}月</h2><span class="tag night">今月は合コン</span>` +
      (done ? `<p class="res">${esc(done.text)}</p>` +
        faces((done.heroines || []).map(id => faceFig(hface(id), hname(id), '', true)).concat((done.friends || []).map(id => faceFig(fface(id), fname(id)))))
        : `<p class="sub">合コン（${esc(NIGHT_HOST[sv.month])}）</p>`), 'izakaya', true);
    if (done) { buttons([['次の月へ', advance]]); return; }
    if (SQUAD_MONTHS.includes(sv.month)) { buttons([['布陣を決める', () => { sv.at = 'squad'; save(); squad([]); }]]); return; }
    buttons([['合コンへ', () => { sv.at = 'night'; save(); toNight(); }]]);
  }

  // ── 布陣（7月・2月）：知っている友達の名前ボタンから2人。押すと選ぶ／もう一度押すと外す。2人そろうと「合コンへ」 ──
  // 選んでいる途中はセーブに書かない（閉じて開き直したら選び直し）。「合コンへ」で squad と at='night' を同じ save() で書く
  function squad(picked) {
    let pool = FRIEND_IDS.filter(id => sv.friends[id] && sv.friends[id].known);
    if (pool.length < 2) pool = FRIEND_IDS.filter(id => pool.includes(id) || id === KENTA || id === KEITA);   // だれも知らなければ けんた・けいた（§13 ⑦の9）
    screen('squad', `<h2>${sv.month}月　布陣</h2><span class="tag night">今夜は自分が幹事</span><p class="sub">連れて行く友達を2人選ぶ（知っている友達から）</p>` +
      `<p class="note">下の線は今の仲</p>`, 'izakaya', true);
    buttons(pool.map(id => {
      const on = picked.includes(id);
      return [on ? `${fname(id)}（連れて行く）` : fname(id),
        () => squad(on ? picked.filter(x => x !== id) : picked.concat(id)),
        !on && picked.length >= 2, { face: fface(id), on, bond: sv.friends[id].bond }];
    }), 'pick');
    buttons([['合コンへ', () => {
      sv.squad = FRIEND_IDS.filter(id => picked.includes(id));   // 並びは友達の番号順
      sv.at = 'night'; save(); toNight();
    }, picked.length !== 2]], 'go');
  }

  // ── 3月：見出しだけ（3月の場面は台本ができたら） ──
  function march() {
    screen('march', '<h2>3月</h2><p class="sub">1年の終わり</p><p class="note">（3月の場面：台本ができたら入る）</p>', 'station', true);
    buttons([['エンディングへ', () => { sv.month = 'end'; sv.at = 'ending'; save(); ending(); }]]);
  }

  // ── エンディング（上から見て、最初に当たったもの。数字は仮） ──
  function judge(s) {
    const hs = HEROINES.map(h => Object.assign({ id: h.id, name: hname(h.id) }, s.heroines[h.id] || {}));
    const top = hs.filter(h => h.stage >= 4).sort((a, b) => b.stage - a.stage || b.best - a.best)[0];
    if (top) {
      // いちばん進んだ夜の月：段階がいちばん上まで上がった夜（stageM）。無い古いセーブは会った最後の夜で代用
      const m = top.stageM != null ? top.stageM : (top.nights || []).slice(-1)[0];
      return { key: 'yomi', name: '読み切った1年', reason: `${top.name}と${STAGE_TEXT[top.stage] || STAGE_TEXT[4]}`,
        lines: [`いちばん進んだ夜：${m != null ? m + '月' : '—'}`], scene: top.name, hid: top.id };
    }
    const fr = FRIEND_IDS.filter(id => s.friends[id] && s.friends[id].known)
      .map(id => ({ id, bond: s.friends[id].bond })).sort((a, b) => b.bond - a.bond);
    const close = fr.filter(f => f.bond >= BOND_CLOSE).length;
    const kanji = s.flags && s.flags.oct === 'kanji';
    if (kanji || close >= 2) {
      const why = [kanji ? '10月、けんたの後押しで幹事を代わった' : '', close >= 2 ? `仲の深い友達が${close}人いる` : ''].filter(Boolean).join('。');
      return { key: 'nakama', name: '仲間との1年', reason: why, lines: [`仲のいい友達：${names(fr.slice(0, 2).map(f => f.id))}`], fids: fr.slice(0, 2).map(f => f.id) };
    }
    const contact = hs.filter(h => h.stage >= 2).length;
    return { key: 'karamawari', name: '空回りした1年', reason: 'だれとも駅まで一緒に帰らず、仲の深い友達も2人に届かなかった',
      lines: [`個別の連絡先を交換した子：${contact}人`] };
  }

  function ending() {
    const e = judge(sv);
    const me = sv.me;
    const chose = ['living', 'circle', 'part'].map(k => ENV_LABELS[k][me[k]]).join('・') + (me.bmonth ? `・${me.bmonth}月生まれ` : '');
    const rec = sv.log.map(x => `<li>${x.m}月：${esc(x.text)}</li>`).join('');
    const who = e.hid ? faces([faceFig(hface(e.hid), hname(e.hid), 'big', true)])
      : e.fids ? faces(e.fids.map(id => faceFig(fface(id), fname(id), 'big'))) : '';
    screen('ending',
      `<h2>3月　エンディング</h2><h1 data-ending="${e.key}">${esc(e.name)}</h1>` +
      `<p>${esc(e.reason)}</p>` + e.lines.map(l => `<p class="sub">${esc(l)}</p>`).join('') + who +
      (e.scene ? `<p class="note">（ここで${esc(e.scene)}の場面が開く。台本ができたら入る）</p>` : ''), 'out', false);
    app.insertAdjacentHTML('beforeend', `<aside class="rec"><h2>1年の記録</h2><ul><li>キャラクリ：${esc(chose)}</li>${rec}</ul></aside>`);
    buttons([['はじめから', () => chara([])]]);
  }

  // night_i から戻った直後（lastNight あり）は、タイトルを挟まずに反映して合コンの月の画面へ
  function boot() {
    const back = load();
    if (back && back.lastNight) { sv = back; route(); } else { sv = null; title(); }
  }
  boot();
  // ブラウザの「戻る」で、前の画面がメモリからそのまま復元されたとき（iPhone の Safari など）は、開き直したのと同じにする（作業5で直した）。
  //   復元された画面は古い sv を持っていて、押すとその古い中身で上書きしていた（夜の結果が消えて、月が戻る）
  window.addEventListener('pageshow', e => { if (e.persisted) boot(); });
  return { KEY, judge, newSave };
})();
