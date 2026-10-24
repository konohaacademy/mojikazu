// もじかずクイズ — 判定の中身（画面にもシートにも触らない。node の tests/logic.js でそのまま確かめる）
//
// お題＝「頭の字」＋「字の数」。字の数は【書いた字の数】で数える（きゃべつ＝4・らーめん＝4・きって＝3）。
// 濁点・半濁点はゆるく見る（「か」のお題で「がっこう」も○）。
// 答えは【名詞だけ】。動詞・形容詞など（はしる・かわいい）は「ものの なまえで」と返す（辞書の x の印）。
//
// ⚠ 音声認識は「猫」「カメラ」「globe」のように漢字・カタカナ・英語で返す。読みは辞書（words.json）で引く。
//   カタカナとひらがなだけの答えは辞書に無くても読みが分かるが、でたらめも通ってしまうので
//   「じしょに ない」として大人に回す（○を押せば次から辞書に入る）。
(function (root) {
  'use strict';

  // カタカナ → ひらがな（ー はそのまま。ヴ は ゔ）
  function toHira(s) {
    return String(s || '').replace(/[ァ-ヶ]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0x60);
    });
  }
  // ひらがな → カタカナ
  function toKata(s) {
    return String(s || '').replace(/[ぁ-ゖ]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) + 0x60);
    });
  }

  // 比べるための形：全角半角・空白・句読点・記号を落とす（英語は小文字に）
  function norm(s) {
    var t = String(s || '').normalize('NFKC');
    t = t.replace(/[\s　。、，．,.!！?？・「」『』（）()〜~…:：;；"'“”‘’]/g, '');
    t = t.replace(/[\-−‐―－]/g, 'ー'); // 長音のつもりのハイフン
    return toHira(t).toLowerCase();
  }

  function isKana(s) { return /^[ぁ-ゖー]+$/.test(s); }
  function isKataStr(s) { return /^[ァ-ヺー]+$/.test(s); }
  function isLatin(s) { return /[a-z]/i.test(String(s || '').normalize('NFKC')) && !/[ぁ-ゖァ-ヺ一-龯]/.test(s); }

  var SMALL = { 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'っ': 'つ', 'ゎ': 'わ' };

  // 頭の字の「もとの字」：が→か・ぱ→は・ゔ→う
  function baseKana(ch) {
    if (!ch) return '';
    var b = ch.normalize('NFD').charAt(0);
    return SMALL[b] || b;
  }

  // 書いた字の数（小さい字・ー も1字）
  function countChars(reading) { return Array.from(String(reading || '')).length; }

  // 画面に出す形：カタカナでしか書かない言葉（カメラ・グローブ）はカタカナ、ほかはひらがな
  // ⚠ 英語のつづり（globe）は「書き方」に数えない
  function kanaOf(w) {
    if (!w) return '';
    var s = (w.s || []).filter(function (x) { return !/[a-z]/i.test(x); });
    if (s.length && s.every(isKataStr)) return toKata(w.r);
    return w.r;
  }
  // 漢字の書き方（熟語を見せるとき）
  function kanjiOf(w) {
    var s = (w && w.s) || [];
    for (var i = 0; i < s.length; i++) if (/[一-龯々]/.test(s[i])) return s[i];
    return '';
  }

  // 「えーと きりん です」→ きりん。前後のつなぎ言葉をはずした形を全部返す
  var LEAD = ['えーとね', 'えーと', 'ええと', 'えっと', 'あのね', 'あのー', 'あの', 'うーんと', 'うーん', 'んーと', 'んー', 'えー'];
  var TAIL = ['でした', 'です', 'だよ', 'だね', 'かな', 'ちゃん', 'さん', 'くん'];
  function talkVariants(s) {
    var out = [s];
    var t = s, changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < LEAD.length; i++) {
        if (t.indexOf(LEAD[i]) === 0 && t.length > LEAD[i].length + 1) { t = t.slice(LEAD[i].length); changed = true; out.push(t); }
      }
      for (var j = 0; j < TAIL.length; j++) {
        var k = TAIL[j];
        if (t.length > k.length && t.slice(-k.length) === k) { t = t.slice(0, -k.length); changed = true; out.push(t); }
      }
    }
    return out;
  }

  // 辞書の索引：表記（ひらがなにそろえたもの・英語は小文字）→ 言葉の一覧
  // words: [{r: 読み, s: [表記…], x: 名詞でないときの種類}]
  function buildIndex(words) {
    var idx = Object.create(null);
    function put(key, w) {
      if (!key) return;
      var list = idx[key] || (idx[key] = []);
      if (list.indexOf(w) < 0) list.push(w);
    }
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      put(norm(w.r), w);
      var s = w.s || [];
      for (var j = 0; j < s.length; j++) put(norm(s[j]), w);
    }
    return idx;
  }

  function fits(reading, odai) {
    return baseKana(reading.charAt(0)) === odai.head && countChars(reading) === odai.n;
  }

  // 1つの読みをお題に当てた結果
  function verdict(reading, odai) {
    if (baseKana(reading.charAt(0)) !== odai.head) return 'head';
    if (countChars(reading) !== odai.n) return 'count';
    return 'ok';
  }

  // 聞こえた言葉の「見せる形」（ひらがなかカタカナ）。辞書に無い漢字・英語はそのまま返す
  function display(text, idx) {
    var raw = String(text || '').trim();
    var heard = norm(raw);
    if (!heard) return '';
    var vs = talkVariants(heard);
    for (var v = 0; v < vs.length; v++) {
      var hits = idx && idx[vs[v]];
      if (!hits) continue;
      var noun = hits.filter(function (w) { return !w.x; })[0] || hits[0];
      return kanaOf(noun);
    }
    var nk = raw.normalize('NFKC').replace(/[\s　。、！？!?]/g, '');
    if (/^[ぁ-ゖァ-ヺー]+$/.test(nk)) return nk; // かなは言ったとおり（カタカナのまま）
    return raw;
  }

  // 認識の候補（いちばん確からしい順）をお題に当てる
  //   ok      … 辞書の名詞で、頭の字も字の数も合う
  //   notnoun … 頭の字も字の数も合うが、名詞ではない（はしる・かわいい）
  //   head    … 辞書にある（か、かなで読みが分かる）が頭の字がちがう
  //   count   … 頭の字は合うが字の数がちがう
  //   unknown … 辞書に無い（かなで読みは分かるときは reading を返す）→ 大人が決める。英語なら latin
  //   none    … 何も聞き取れなかった
  function judge(alts, odai, idx) {
    var cands = [];
    for (var a = 0; a < alts.length; a++) {
      var heard = norm(alts[a]);
      if (heard) cands.push({ raw: String(alts[a]), heard: heard });
    }
    if (!cands.length) return { status: 'none' };

    var firstWrong = null, firstNotNoun = null;
    // ① まるごと（つなぎ言葉をはずした形も）で辞書を引く
    for (var i = 0; i < cands.length; i++) {
      var vs = talkVariants(cands[i].heard);
      for (var v = 0; v < vs.length; v++) {
        var hits = idx[vs[v]];
        if (!hits) continue;
        for (var h = 0; h < hits.length; h++) {
          var w = hits[h], st = verdict(w.r, odai);
          var res = { status: st, word: w, reading: w.r, show: kanaOf(w), heard: cands[i].raw };
          if (w.x) {
            res.kind = w.x;
            if (st === 'ok') { if (!firstNotNoun) { res.status = 'notnoun'; firstNotNoun = res; } }
            else if (!firstWrong) firstWrong = res; // 「走る」で き3 → 頭の字がちがう（名詞でもない）
            continue;
          }
          if (st === 'ok') return res;
          if (!firstWrong) firstWrong = res;
        }
        // ⚠ 辞書に当たったら、それ以上はずさない（「おばさん」を「おば」と読み替えて○にしない）
        break;
      }
    }
    // ⚠ 長い文の中から言葉を拾うことはしない。「かまきり」の中の「かま」で○にしてしまう。
    if (firstNotNoun) return firstNotNoun;
    if (firstWrong) return firstWrong;

    // ② 辞書に無い。かなだけなら読みは分かる
    var top = cands[0];
    var kanaForm = null;
    for (var k = 0; k < cands.length && !kanaForm; k++) {
      // お題に合う形があればそれ、無ければはずす前の形（「ぱんだ」を「ぱん」と読まない）
      var tv = talkVariants(cands[k].heard).filter(isKana);
      if (!tv.length) continue;
      var fit = tv.filter(function (x) { return fits(x, odai); })[0];
      kanaForm = { heard: cands[k].raw, reading: fit || tv[0] };
    }
    if (kanaForm) {
      var r = kanaForm.reading;
      var kraw = kanaForm.heard.normalize('NFKC').replace(/[\s　。、！？!?]/g, '');
      var show = /^[ァ-ヺー]+$/.test(kraw) && toHira(kraw) === r ? kraw : r;
      var vk = verdict(r, odai);
      // 頭の字か字の数がちがうなら、辞書に無くても×と分かる
      if (vk !== 'ok') return { status: vk, reading: r, show: show, heard: kanaForm.heard, unlisted: true };
      return { status: 'unknown', reading: r, show: show, heard: kanaForm.heard };
    }
    return { status: 'unknown', reading: null, heard: top.raw, latin: isLatin(top.raw) };
  }

  // ─── ことばの レベル（ひとごと）と 字の数 ─────────────
  // ⚠ 字が多い＝むずかしい ではない。レベルは「どんな言葉を知っていそうか」で、字の数とは別に選ぶ。
  var VOCAB = {
    1: { label: 'みぢか', sub: 'たべもの・いきもの・からだ・いえの もの', age: '年長〜小1' },
    2: { label: 'くらし', sub: 'がっこう・あそび・のりもの・しぜん', age: '小1〜2' },
    3: { label: 'ものしり', sub: 'すこし むずかしい ことば', age: '小3〜4' },
    4: { label: 'じゅくご', sub: '「整頓」「経緯」のような 漢字の ことば', age: '小5〜' }
  };
  var LENS = {
    s: { label: 'みじかい', lens: [2, 3], show: '2・3' },
    m: { label: 'ふつう', lens: [3, 4], show: '3・4' },
    l: { label: 'ながい', lens: [4, 5, 6], show: '4〜6' },
    a: { label: 'まぜる', lens: [2, 3, 4, 5], show: '2〜5' }
  };
  // 前の版の「むずかしさ」（1〜3）からの読みかえ
  var OLD_LEVEL = { 1: { vlv: 1, len: 's' }, 2: { vlv: 2, len: 'm' }, 3: { vlv: 3, len: 'l' } };
  var HEADS = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわ'.split('');

  // 見せる言葉（例・ヒントに使うもの）だけを、お題ごとにまとめる
  function buildPool(words) {
    var pool = Object.create(null);
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!w.m || w.x) continue; // 意味の無い言葉・名詞でない言葉は判定用だけ
      var key = baseKana(w.r.charAt(0)) + countChars(w.r);
      (pool[key] || (pool[key] = [])).push(w);
    }
    return pool;
  }

  // そのお題が出せるか：そのレベル以下の言葉が3つ以上。
  // ものしり・じゅくご は、そのレベルに近い言葉（レベル−1 以上）が1つも無いお題を外す（やさしい言葉だけのお題ばかりにしない）
  function eligible(pool, vlv, lensKey) {
    var lens = (LENS[lensKey] || LENS.s).lens, out = [], loose = [];
    for (var h = 0; h < HEADS.length; h++) {
      for (var n = 0; n < lens.length; n++) {
        var list = pool[HEADS[h] + lens[n]] || [];
        var mine = list.filter(function (w) { return (w.lv || 1) <= vlv; });
        if (mine.length < 3) continue;
        var o = { head: HEADS[h], n: lens[n] };
        loose.push(o);
        if (vlv < 3 || mine.some(function (w) { return (w.lv || 1) >= vlv - 1; })) out.push(o);
      }
    }
    return out.length >= 20 ? out : loose;
  }

  // お題を1つ選ぶ。history はこれまでに出したお題（"き3" の形・新しいものが後ろ）。
  //   まず頭の字を選び（字の数の多い頭の字ばかりにならないように）、それから字の数を選ぶ。
  //   最近8問の頭の字と、最近40問と同じお題は避ける。避けると何も残らなければ少しずつゆるめる。
  function pickOdai(list, history, rnd) {
    rnd = rnd || Math.random;
    history = history || [];
    var recentHeads = history.slice(-8).map(function (k) { return String(k).charAt(0); });
    var recentKeys = history.slice(-40);
    var tries = [
      function (o) { return recentHeads.indexOf(o.head) < 0 && recentKeys.indexOf(o.head + o.n) < 0; },
      function (o) { return recentHeads.slice(-4).indexOf(o.head) < 0 && recentKeys.slice(-15).indexOf(o.head + o.n) < 0; },
      function (o) { return recentKeys.slice(-1).indexOf(o.head + o.n) < 0; },
      function () { return true; }
    ];
    for (var t = 0; t < tries.length; t++) {
      var from = list.filter(tries[t]);
      if (!from.length) continue;
      var heads = [];
      from.forEach(function (o) { if (heads.indexOf(o.head) < 0) heads.push(o.head); });
      var head = heads[Math.floor(rnd() * heads.length)];
      var same = from.filter(function (o) { return o.head === head; });
      return same[Math.floor(rnd() * same.length)];
    }
    return list[0];
  }

  // 「ほかにも こんな ことば」・ヒント：まだ見つけていない言葉を先に、その人のレベルに近いものから。
  // レベルより上の言葉は、足りないときだけ出す（年長さんに「整頓」を見せない）。
  function examples(pool, odai, foundSet, exclude, k, rnd, vlv) {
    rnd = rnd || Math.random;
    vlv = vlv || 4;
    var list = (pool[odai.head + odai.n] || []).filter(function (w) { return w.r !== exclude; });
    var scored = list.map(function (w) {
      var lv = w.lv || 1;
      var s = (foundSet && foundSet[w.r] ? 10 : 0) + (lv > vlv ? 5 + lv - vlv : vlv - lv) + rnd() * 0.9;
      return { w: w, s: s };
    });
    scored.sort(function (a, b) { return a.s - b.s; });
    return scored.slice(0, k).map(function (x) { return x.w; });
  }

  var api = {
    toHira: toHira, toKata: toKata, norm: norm, isKana: isKana, isLatin: isLatin, baseKana: baseKana, countChars: countChars,
    kanaOf: kanaOf, kanjiOf: kanjiOf, display: display,
    talkVariants: talkVariants, buildIndex: buildIndex, judge: judge, verdict: verdict,
    VOCAB: VOCAB, LENS: LENS, OLD_LEVEL: OLD_LEVEL, HEADS: HEADS,
    buildPool: buildPool, eligible: eligible, pickOdai: pickOdai, examples: examples
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MK = api;
})(this);
