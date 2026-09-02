/* saju-ui.js — 오늘의 사주 화면 로직
   원칙: 전문용어 노출 금지(접어두기 제외) / 생년월일은 localStorage에만, 서버 전송 없음 */
(function () {
  'use strict';
  var KEY = 'dct_birth_v1';
  var HOURS = [
    ['모르겠어요', null], ['23~01시', 0], ['01~03시', 2], ['03~05시', 4], ['05~07시', 6],
    ['07~09시', 8], ['09~11시', 10], ['11~13시', 12], ['13~15시', 14],
    ['15~17시', 16], ['17~19시', 18], ['19~21시', 20], ['21~23시', 22],
  ];
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var ev = function (n, p) { if (window.gtag) gtag('event', n, p || {}); };

  var picked = null;   // 선택된 시각(정시). null이면 모름
  var calMode = 'solar';   // 'solar' | 'lunar'
  var pickedDream = null;  // 사용자가 화면에서 고른 꿈 {c,k,s}

  /* ── 유입한 꿈 맥락 (차별점 ①) ── */
  var CATS = ['animal', 'nature', 'money', 'people', 'loss', 'blocked', 'body', 'change'];
  function dreamContext() {
    if (pickedDream) return { dreamCat: pickedDream.c, dreamKw: pickedDream.k, dreamSlug: pickedDream.s };
    var p = new URLSearchParams(location.search);
    var cat = (p.get('cat') || '').trim();
    var kw = (p.get('kw') || '').trim().slice(0, 40);
    if (CATS.indexOf(cat) < 0) return null;
    return { dreamCat: cat, dreamKw: kw || null };
  }

  /* ── 꿈 선택기 — 꿈 없이 들어온 사용자도 차별점을 경험하게 한다 ── */
  function initDreamPicker() {
    var box = $('dreamPick'); if (!box) return;
    if (dreamContext()) return;              // 이미 꿈 맥락이 있으면 불필요
    box.style.display = '';
    var input = $('dreamSearch'), out = $('dreamResults');
    var IDX = window.DREAM_INDEX || [];

    function suggest() {                      // 기본 제안 4개 (날짜 시드로 매일 바뀜)
      var d = new Date(), seed = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate();
      var picks = [], used = {};
      for (var i = 0; i < 4 && IDX.length; i++) {
        var j = (seed * (i + 7) * 31) % IDX.length;
        while (used[j]) j = (j + 1) % IDX.length;
        used[j] = 1; picks.push(IDX[j]);
      }
      return picks;
    }
    function row(x) {
      return '<button type="button" class="chip" data-s="' + x.s + '" style="width:100%;text-align:left;padding:12px 14px;border-radius:11px;font-size:13.5px;">' +
        x.e + ' ' + esc(x.k) + '</button>';
    }
    function draw(list, isSuggest) {
      out.innerHTML = (isSuggest ? '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:2px;">이런 꿈은 어떠세요</div>' : '') +
        (list.length ? list.map(row).join('') : '<div style="font-size:13px;color:var(--text-muted);padding:8px 2px;">그 꿈은 아직 준비 중이에요. 다른 말로 찾아보시겠어요?</div>');
    }
    draw(suggest(), true);
    input.addEventListener('input', function () {
      var q = this.value.trim();
      if (!q) { draw(suggest(), true); return; }
      draw(IDX.filter(function (x) { return x.k.indexOf(q) >= 0; }).slice(0, 6), false);
    });
    out.addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      var f = IDX.filter(function (x) { return x.s === b.dataset.s; })[0];
      if (!f) return;
      pickedDream = f;
      ev('saju_dream_picked', { slug: f.s, cat: f.c });
      box.innerHTML = '<div class="who" style="font-size:13.5px;color:var(--text);">🌙 <b style="color:var(--gold-light)">' +
        esc(f.k) + '</b>을 고르셨어요. 이 꿈과 오늘의 흐름을 함께 읽어드릴게요.</div>';
      $('formCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    var skip = $('skipDream');
    if (skip) skip.addEventListener('click', function () {
      ev('saju_dream_skipped', {});
      box.style.display = 'none';
      $('formCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /* ── 폼 초기화 ── */
  function initForm() {
    var y = $('by'), m = $('bm'), d = $('bd');
    var now = new Date().getFullYear();
    var h = '';
    for (var i = now; i >= 1930; i--) h += '<option value="' + i + '">' + i + '년</option>';
    y.innerHTML = h;
    h = ''; for (var j = 1; j <= 12; j++) h += '<option value="' + j + '">' + j + '월</option>';
    m.innerHTML = h;
    fillDays();
    y.value = 1990; m.value = 1;
    y.addEventListener('change', fillDays); m.addEventListener('change', fillDays);

    var ch = HOURS.map(function (x, i) {
      return '<button type="button" class="chip' + (i === 0 ? ' wide on' : '') + '" data-h="' + (x[1] === null ? '' : x[1]) + '">' + x[0] + '</button>';
    }).join('');
    $('hourChips').innerHTML = ch;
    $('hourChips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      [].forEach.call(this.querySelectorAll('.chip'), function (c) { c.classList.remove('on'); });
      b.classList.add('on');
      picked = b.dataset.h === '' ? null : parseInt(b.dataset.h, 10);
    });
    var cc = $('calChips');
    if (cc) cc.addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      [].forEach.call(this.querySelectorAll('.chip'), function (c) { c.classList.remove('on'); });
      b.classList.add('on');
      calMode = b.dataset.cal;
      $('leapWrap').style.display = calMode === 'lunar' ? '' : 'none';
      $('calHelp').textContent = calMode === 'lunar'
        ? '음력(생일을 음력으로 쇠는 경우) 날짜를 넣어주세요. 윤달이면 아래를 체크해주세요.'
        : '주민등록에 적힌 날짜를 넣어주세요.';
      fillDays();
    });
    var lp = $('isLeap'); if (lp) lp.addEventListener('change', fillDays);
    $('goBtn').addEventListener('click', submit);
  }

  function fillDays() {
    var y = +$('by').value, m = +$('bm').value, cur = +$('bd').value || 1;
    var last;
    if (calMode === 'lunar') {
      // 음력 달은 29일 또는 30일 — 실제 길이를 구한다
      var leap = $('isLeap') && $('isLeap').checked;
      last = 29;
      try { if (window.Saju.lunarToSolar(y, m, 30, leap)) last = 30; } catch (e) {}
    } else {
      last = new Date(y, m, 0).getDate();
    }
    var h = ''; for (var i = 1; i <= last; i++) h += '<option value="' + i + '">' + i + '일</option>';
    $('bd').innerHTML = h;
    $('bd').value = Math.min(cur, last);
  }

  /* ── 저장/복원 ── */
  function save(b) { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) {} }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }

  function submit() {
    var sy = +$('by').value, sm = +$('bm').value, sd = +$('bd').value;
    var lunarSrc = null;
    if (calMode === 'lunar') {
      var leap = $('isLeap') && $('isLeap').checked;
      var conv = window.Saju.lunarToSolar(sy, sm, sd, leap);
      if (!conv) {
        alert('그 날짜의 음력이 없어요. 날짜나 윤달 여부를 다시 확인해주세요.');
        return;
      }
      lunarSrc = { y: sy, m: sm, d: sd, leap: !!leap };
      sy = conv.y; sm = conv.m; sd = conv.d;
    }
    var b = {
      y: sy, m: sm, d: sd,
      h: picked === null ? 12 : picked, mi: 0, unknownHour: picked === null,
      lunarSrc: lunarSrc,
    };
    save(b);
    ev('saju_submit', { unknownHour: b.unknownHour ? 1 : 0, cal: calMode });
    render(b, true);
  }

  /* ── 결과 렌더 ── */
  function render(b, scroll) {
    var ctx = dreamContext() || {};
    var r;
    try { r = window.Saju.buildReading(b, ctx); }
    catch (e) { $('result').innerHTML = '<div class="saju-card"><p class="res-body">결과를 만드는 중 문제가 생겼어요. 새로고침 후 다시 시도해주세요.</p></div>'; return; }

    var H = '';
    if (r.warnings && r.warnings.length) {
      H += '<div class="warn">' + r.warnings.map(esc).join('<br>') + '</div>';
    }

    // 차별점 ① — 꿈 × 오늘
    if (r.bridge) {
      H += '<div class="bridge"><div style="font-size:11.5px;letter-spacing:.08em;color:var(--gold);font-weight:700;margin-bottom:9px;">당신이 본 꿈 × 오늘의 흐름</div><div class="dream">' +
        (r.bridge.dreamKw ? '어젯밤 <b style="color:var(--gold-light)">' + esc(r.bridge.dreamKw) + '</b>을 꾸셨네요. ' : '') +
        esc(r.bridge.mood) + ' 꿈입니다.</div>' +
        '<div class="arrow">→ ' + esc(r.bridge.advice) + '</div></div>';
    }

    // 오늘
    H += '<div class="saju-card"><h2>오늘은 어떤 날</h2>' +
      '<div class="res-title">' + esc(r.today.label) + '</div>' +
      '<p class="res-body">' + esc(r.today.body) + '</p>' +
      '<div class="res-kv">' + esc(r.today.tip) + '</div></div>';

    // 나
    H += '<div class="saju-card"><h2>타고난 결</h2>' +
      '<div class="res-title">' + esc(r.me.title) + '</div>' +
      '<p class="res-body">' + esc(r.me.body) + '</p>' +
      '<div class="res-kv"><b>잘하는 것</b> ' + esc(r.me.strength) + '</div>' +
      '<div class="res-kv"><b>살펴볼 것</b> ' + esc(r.me.care) + '</div></div>';

    // 기운 분포
    var counts = r.ohaeng.counts, flow = '';
    Object.keys(counts).forEach(function (k) {
      flow += '<div class="' + (counts[k] === 0 ? 'zero' : '') + '"><span class="v">' + counts[k] + '</span><span class="n">' + esc(k) + '</span></div>';
    });
    H += '<div class="saju-card"><h2>타고난 기운의 균형</h2><div class="flow">' + flow + '</div>' +
      '<div class="res-kv" style="margin-top:14px;"><b>강한 기운 · ' + esc(r.ohaeng.strongest.name) + '</b><br>' + esc(r.ohaeng.strongest.text) + '</div>';
    r.ohaeng.missing.forEach(function (m) {
      H += '<div class="res-kv"><b>적은 기운 · ' + esc(m.name) + '</b><br>' + esc(m.text) + '</div>';
    });
    // 접어두기 — 용어는 여기에만
    H += '<details class="term"><summary>사주 용어로 보기</summary><div class="in">' +
      esc(r.details.note) + '<br><br>' +
      '<b>사주팔자</b> ' + esc(r.details.palja) + '<br>' +
      esc(r.details.ilganTerm) + '<br>' + esc(r.details.todayPillar) + ' · ' + esc(r.details.ttiAnimal) +
      '</div></details></div>';

    // 공유 + 역회유
    H += '<div class="saju-card"><h2>오늘의 흐름 공유하기</h2>' +
      '<div class="eng-share-buttons" style="display:flex;gap:8px;">' +
      '<button class="eng-share-btn kakao" style="flex:1;background:#FEE500;color:#000;border:none;border-radius:10px;padding:12px;font-size:13.5px;font-weight:700;cursor:pointer;" id="shBtn">💬 카카오톡</button>' +
      '<button class="eng-share-btn copy" style="flex:1;background:rgba(255,255,255,.07);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:12px;font-size:13.5px;cursor:pointer;" id="cpBtn">🔗 링크 복사</button>' +
      '</div></div>';

    H += '<div class="saju-card"><h2>오늘 꾸면 좋은 꿈</h2>' +
      '<p class="res-body">꿈은 오늘의 마음을 비춥니다. 어젯밤 꾼 꿈이 궁금하시다면 찾아보세요.</p>' +
      '<a href="index.html" class="service-btn" style="margin-top:14px;">🌙 내 꿈 찾아보기</a>' +
      '<button class="again" id="againBtn">다른 생년월일로 다시 보기</button></div>';

    $('result').innerHTML = H;
    $('formCard').style.display = 'none';
    renderSaved(b);
    bindResult(r, b);
    ev('saju_view', { hasDream: r.bridge ? 1 : 0, flow: r.today.label });
    if (scroll) $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function bindResult(r, b) {
    var url = location.origin + '/saju.html';
    var text = r.bridge && r.bridge.dreamKw
      ? '어젯밤 ' + r.bridge.dreamKw + ' × 오늘의 내 흐름: ' + r.today.label
      : '오늘 나의 흐름: ' + r.today.label;
    var copy = function () {
      var done = function () { alert('링크가 복사됐어요!'); ev('share_click', { method: 'copy', page: '/saju.html' }); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(function () { prompt('아래 주소를 복사해주세요', url); });
      } else { prompt('아래 주소를 복사해주세요', url); }
    };
    var cp = $('cpBtn'); if (cp) cp.addEventListener('click', copy);
    var sh = $('shBtn');
    if (sh) sh.addEventListener('click', function () {
      try {
        if (window.Kakao && Kakao.isInitialized() && Kakao.Share) {
          Kakao.Share.sendDefault({
            objectType: 'feed',
            content: {
              title: text, description: r.today.body.slice(0, 70),
              imageUrl: location.origin + '/og-default.png',
              link: { mobileWebUrl: url, webUrl: url },
            },
            buttons: [{ title: '내 흐름 보기', link: { mobileWebUrl: url, webUrl: url } }],
          });
          ev('share_click', { method: 'kakao', page: '/saju.html' });
        } else copy();
      } catch (e) { copy(); }
    });
    var ag = $('againBtn');
    if (ag) ag.addEventListener('click', function () {
      $('formCard').style.display = ''; $('result').innerHTML = '';
      $('savedBox').innerHTML = '';
      $('formCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function renderSaved(b) {
    var t = b.y + '년 ' + b.m + '월 ' + b.d + '일생';
    if (b.lunarSrc) {
      t = '음력 ' + b.lunarSrc.y + '년 ' + (b.lunarSrc.leap ? '윤' : '') + b.lunarSrc.m + '월 ' +
          b.lunarSrc.d + '일생 (양력 ' + b.y + '.' + b.m + '.' + b.d + ')';
    }
    $('savedBox').innerHTML = '<div class="saved-box"><div class="who">🔒 <b>' + esc(t) +
      '</b>으로 보고 있어요. 이 정보는 이 기기에만 저장되고 서버로 가지 않아요.</div>' +
      '<button type="button" id="wipeBtn" style="width:100%;margin-top:10px;background:rgba(255,255,255,.05);' +
      'border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--text-muted);' +
      'font-size:12.5px;cursor:pointer;font-family:inherit;">저장된 정보 지우기</button></div>';
    var wipe = $('wipeBtn');
    if (wipe) wipe.addEventListener('click', function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
      ev('saju_wipe', {});
      alert('저장된 생년월일을 지웠어요.');
      location.href = 'saju.html';
    });
  }

  /* ── 시작 ── */
  document.addEventListener('DOMContentLoaded', function () {
    try { if (window.Kakao && !Kakao.isInitialized()) Kakao.init('46d3fff922c9ecbd41f4131001e7647f'); } catch (e) {}
    initForm();
    initDreamPicker();
    var saved = load();
    if (saved && saved.y) {
      // 재방문 — 원탭으로 바로 결과
      var src = saved.lunarSrc || saved;
      $('by').value = src.y; fillDays(); $('bm').value = src.m; $('bd').value = src.d;
      if (saved.lunarSrc) {
        calMode = 'lunar';
        var lb = document.querySelector('.chip[data-cal="lunar"]');
        if (lb) { [].forEach.call($('calChips').querySelectorAll('.chip'), function(c){c.classList.remove('on');}); lb.classList.add('on'); }
        $('leapWrap').style.display = ''; if ($('isLeap')) $('isLeap').checked = !!saved.lunarSrc.leap;
      }
      ev('saju_revisit', {});
      render(saved, false);
      if (!dreamContext() && $('dreamPick')) $('dreamPick').style.display = '';
    } else {
      ev('saju_open', { hasDream: dreamContext() ? 1 : 0 });
    }
  });
})();
