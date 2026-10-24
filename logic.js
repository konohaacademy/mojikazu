// もじかずクイズ — 判定の中身（画面にもシートにも触らない。node の tests/logic.js でそのまま確かめる）
//
// お題＝「頭の字」＋「字の数」。字の数は【書いた字の数】で数える（きゃべつ＝4・らーめん＝4・きって＝3）。
// 濁点・半濁点はゆるく見る（「か」のお題で「がっこう」も○）。
//
// ⚠ 音声認識は「猫」「カメラ」のように漢字やカタカナで返す。読みは辞書（words.json）で引く。
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

  // 比べるための形：全角半角・空白・句読点・記号を落とす
  function norm(s) {
    var t = String(s || '').normalize('NFKC');
    t = t.replace(/[\s　。、，．,.!！?？・「」『』（）()〜~…:：;；"'“”‘’]/g, '');
    t = t.replace(/[\-−‐―－]/g, 'ー'); // 長音のつもりのハイフン
    return toHira(t).toLowerCase();
  }

  function isKana(s) { return /^[ぁ-ゖー]+$/.test(s); }

  var SMALL = { 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'っ': 'つ', 'ゎ': 'わ' };

  // 頭の字の「もとの字」：が→か・ぱ→は・ゔ→う
  function baseKana(ch) {
    if (!ch) return '';
    var b = ch.normalize('NFD').charAt(0);
    return SMALL[b] || b;
  }

  // 書いた字の数（小さい字・ー も1字）
  function countChars(reading) { return Array.from(String(reading || '')).length; }

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

  // 辞書の索引：表記（ひらがなにそろえたもの）→ 読みの一覧
  // words: [{r: 読み, s: [表記…]}]
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

  // 認識の候補（いちばん確からしい順）をお題に当てる
  //   ok      … 辞書にあって、頭の字も字の数も合う
  //   head    … 辞書にある（か、かなで読みが分かる）が頭の字がちがう
  //   count   … 頭の字は合うが字の数がちがう
  //   unknown … 辞書に無い（かなで読みは分かるときは reading を返す）→ 大人が決める
  //   none    … 何も聞き取れなかった
  function judge(alts, odai, idx) {
    var cands = [];
    for (var a = 0; a < alts.length; a++) {
      var heard = norm(alts[a]);
      if (heard) cands.push({ raw: String(alts[a]), heard: heard });
    }
    if (!cands.length) return { status: 'none' };

    var firstWrong = null;
    // ① まるごと（つなぎ言葉をはずした形も）で辞書を引く
    for (var i = 0; i < cands.length; i++) {
      var vs = talkVariants(cands[i].heard);
      for (var v = 0; v < vs.length; v++) {
        var hits = idx[vs[v]];
        if (!hits) continue;
        for (var h = 0; h < hits.length; h++) {
          var st = verdict(hits[h].r, odai);
          if (st === 'ok') return { status: 'ok', word: hits[h], reading: hits[h].r, heard: cands[i].raw };
          if (!firstWrong) firstWrong = { status: st, word: hits[h], reading: hits[h].r, heard: cands[i].raw };
        }
        // ⚠ 辞書に当たったら、それ以上はずさない（「おばさん」を「おば」と読み替えて○にしない）
        break;
      }
    }
    // ⚠ 長い文の中から言葉を拾うことはしない。「かまきり」の中の「かま」で○にしてしまう。
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
      var vk = verdict(r, odai);
      // 頭の字か字の数がちがうなら、辞書に無くても×と分かる
      if (vk !== 'ok') return { status: vk, reading: r, heard: kanaForm.heard, unlisted: true };
      return { status: 'unknown', reading: r, heard: kanaForm.heard };
    }
    return { status: 'unknown', reading: null, heard: top.raw };
  }

  // ─── お題えらび ───────────────────────────
  var LEVELS = {
    1: { label: 'やさしい', lens: [2, 3], maxStar: 1 },
    2: { label: 'ふつう', lens: [3, 4], maxStar: 2 },
    3: { label: 'むずかしい', lens: [4, 5, 6], maxStar: 3 }
  };
  var HEADS = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわ'.split('');

  // 見せる言葉（例・ヒントに使うもの）だけを、お題ごとにまとめる
  function buildPool(words) {
    var pool = Object.create(null);
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!w.m) continue; // 意味の無い言葉は判定用だけ
      var key = baseKana(w.r.charAt(0)) + countChars(w.r);
      (pool[key] || (pool[key] = [])).push(w);
    }
    return pool;
  }

  // そのお題が出せるか：そのレベル以下の言葉が3つ以上
  function eligible(pool, level) {
    var L = LEVELS[level], out = [];
    for (var h = 0; h < HEADS.length; h++) {
      for (var n = 0; n < L.lens.length; n++) {
        var list = pool[HEADS[h] + L.lens[n]] || [];
        var easy = list.filter(function (w) { return (w.lv || 1) <= L.maxStar; });
        if (easy.length >= 3) out.push({ head: HEADS[h], n: L.lens[n] });
      }
    }
    return out;
  }

  // 直前に出した頭の字は避けて1つ選ぶ
  function pickOdai(list, recentHeads, rnd) {
    rnd = rnd || Math.random;
    var fresh = list.filter(function (o) { return recentHeads.indexOf(o.head) < 0; });
    var from = fresh.length ? fresh : list;
    return from[Math.floor(rnd() * from.length)];
  }

  // 「ほかにも こんな ことば」：まだ見つけていない言葉を先に、やさしい順に少し上も混ぜる
  function examples(pool, odai, foundSet, exclude, k, rnd) {
    rnd = rnd || Math.random;
    var list = (pool[odai.head + odai.n] || []).filter(function (w) { return w.r !== exclude; });
    var shuffled = list.slice().sort(function () { return rnd() - 0.5; });
    shuffled.sort(function (a, b) {
      var fa = foundSet[a.r] ? 1 : 0, fb = foundSet[b.r] ? 1 : 0;
      return fa - fb;
    });
    return shuffled.slice(0, k);
  }

  var api = {
    toHira: toHira, norm: norm, isKana: isKana, baseKana: baseKana, countChars: countChars,
    talkVariants: talkVariants, buildIndex: buildIndex, judge: judge, verdict: verdict,
    LEVELS: LEVELS, HEADS: HEADS, buildPool: buildPool, eligible: eligible, pickOdai: pickOdai, examples: examples
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MK = api;
})(this);
