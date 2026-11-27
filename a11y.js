/* Hamzet Wasl adaptive accessibility layer: presets for visual / motor / hearing, merged by rule */
(function () {
  var KEY = 'hw_a11y';
  var NEEDS = [['visual', 'بصرية'], ['motor', 'حركية'], ['hearing', 'سمعية']];
  var st = { types: [], font: 0, contrast: false, motion: false, voice: false, manual: false };
  try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) st = Object.assign(st, s); } catch (e) { }
  var server = null;
  function has(t) { return st.types.indexOf(t) >= 0; }
  /* merge rules: largest font, largest target, contrast if visual, voice if visual or motor, captions/flash if hearing; manual choice wins */
  function eff() {
    var v = has('visual'), m = has('motor'), h = has('hearing');
    var font = Math.max(st.font || 0, v ? 1.4 : 0, m ? 1.15 : 0, server && server.fontScale ? +server.fontScale : 0, 1);
    return { vis: v, mot: m, hear: h, hc: !!st.contrast || v || !!(server && (server.highContrast || server.theme === 'high_contrast')), rm: !!st.motion || !!(server && server.reducedMotion), voice: !!st.voice || v || m, font: Math.min(2, font) };
  }
  function apply() {
    var e = eff(), b = document.body; if (!b) return;
    b.classList.toggle('a-vis', e.vis); b.classList.toggle('a-mot', e.mot); b.classList.toggle('a-hear', e.hear);
    b.classList.toggle('hc', e.hc); b.classList.toggle('rm', e.rm); b.classList.toggle('a-voice', e.voice);
    document.documentElement.style.fontSize = e.font > 1 ? (16 * e.font) + 'px' : '';
    var sk = document.getElementById('hw-read'); if (sk) sk.style.display = e.voice ? '' : 'none';
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { } apply(); }
  window.HWA = {
    fromServer: function (p) { server = p || null; if (p && p.needTypes && !st.manual && !st.types.length) { st.types = p.needTypes.filter(function (t) { return t === 'visual' || t === 'motor' || t === 'hearing'; }); } apply(); },
    apply: apply, eff: eff, reset: function () { server = null; apply(); }
  };
  function el(h) { var d = document.createElement('div'); d.innerHTML = h; return d.firstChild; }
  function panel() {
    var old = document.getElementById('hw-pn'); if (old) { old.remove(); document.getElementById('hw-fab').focus(); return; }
    var p = el('<div id="hw-pn" role="dialog" aria-label="أدوات الإتاحة"><b>أدوات الإتاحة</b><div class="hw-sub">اختار نوع احتياجك (ممكن أكتر من نوع). التغيير بيتطبق فورًا.</div>' +
      NEEDS.map(function (n) { return '<label class="hw-r"><input type="checkbox" data-t="' + n[0] + '"' + (has(n[0]) ? ' checked' : '') + '> ' + n[1] + '</label>'; }).join('') +
      '<label class="hw-r"><input type="checkbox" id="hw-c"' + (st.contrast ? ' checked' : '') + '> تباين عالٍ</label>' +
      '<label class="hw-r"><input type="checkbox" id="hw-m"' + (st.motion ? ' checked' : '') + '> تقليل الحركة</label>' +
      '<label class="hw-r"><input type="checkbox" id="hw-v"' + (st.voice ? ' checked' : '') + '> قراءة صوتية للصفحة</label>' +
      '<label class="hw-r">حجم الخط <input type="range" id="hw-f" min="1" max="2" step="0.1" value="' + (st.font || 1) + '"></label>' +
      '<div class="hw-sub" id="hw-sum"></div><button class="btn s" id="hw-x">إغلاق</button> <button class="btn g s" id="hw-z">إعادة الضبط</button></div>');
    document.body.appendChild(p);
    function sum() { var e = eff(); document.getElementById('hw-sum').textContent = 'الحالي: خط ' + Math.round(e.font * 100) + '%' + (e.hc ? ' · تباين عالٍ' : '') + (e.mot ? ' · أزرار كبيرة' : '') + (e.hear ? ' · تنبيه بوميض واهتزاز' : '') + (e.voice ? ' · صوت' : ''); }
    p.onchange = function (ev) {
      var t = ev.target;
      if (t.dataset && t.dataset.t) { st.types = [].filter.call(p.querySelectorAll('[data-t]'), function (i) { return i.checked; }).map(function (i) { return i.dataset.t; }); }
      st.contrast = document.getElementById('hw-c').checked; st.motion = document.getElementById('hw-m').checked; st.voice = document.getElementById('hw-v').checked; st.font = +document.getElementById('hw-f').value > 1 ? +document.getElementById('hw-f').value : 0; st.manual = true; save(); sum();
    };
    p.oninput = p.onchange;
    document.getElementById('hw-x').onclick = panel;
    document.getElementById('hw-z').onclick = function () { st = { types: [], font: 0, contrast: false, motion: false, voice: false, manual: true }; save(); panel(); panel(); };
    p.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') panel(); });
    sum(); p.querySelector('input').focus();
  }
  function speak() {
    try { var t = (document.getElementById('body') || document.querySelector('.auth .form') || document.body).innerText; speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(t.slice(0, 1500)); u.lang = 'ar-EG'; speechSynthesis.speak(u); } catch (e) { }
  }
  function init() {
    var css = document.createElement('style');
    css.textContent = '#hw-fab{position:fixed;left:18px;bottom:18px;width:58px;height:58px;border-radius:50%;border:0;background:#B6734A;color:#fff;font-size:28px;cursor:pointer;z-index:200;box-shadow:0 6px 18px rgba(0,0,0,.3)}' +
      '#hw-read{position:fixed;left:86px;bottom:26px;z-index:200;border:0;border-radius:30px;background:#174B4E;color:#fff;padding:10px 18px;font:700 14px Cairo,sans-serif;cursor:pointer}' +
      '#hw-pn{position:fixed;left:18px;bottom:86px;width:310px;max-width:92vw;background:#fff;color:#172B2C;border:2px solid #174B4E;border-radius:20px;padding:16px;z-index:201;display:flex;flex-direction:column;gap:8px;box-shadow:0 10px 30px rgba(0,0,0,.25)}' +
      '.hw-sub{font-size:13px;color:#5F6675}.hw-r{display:flex;align-items:center;gap:8px;font-weight:600}' +
      '#hw-skip{position:fixed;top:-60px;right:10px;background:#000;color:#ffec00;padding:10px 16px;z-index:300;border-radius:0 0 12px 12px;font-weight:700}#hw-skip:focus{top:0}' +
      ':focus-visible{outline:3px solid #ff8a00;outline-offset:2px}' +
      'body.a-vis{--bg:#000;--card:#000;--ink:#ffec00;--muted:#fff;--line:#ffec00;--green:#111;--beige:#000;--teal:#ffec00;background:#000;color:#ffec00}' +
      'body.a-vis .card,body.a-vis .box{border:3px solid #ffec00;background:#000;color:#ffec00}body.a-vis h1,body.a-vis h2,body.a-vis h3,body.a-vis td,body.a-vis th,body.a-vis label,body.a-vis small{color:#ffec00}' +
      'body.a-vis .hero{background:#000!important;color:#ffec00!important;border-inline-end:3px solid #ffec00}body.a-vis .hero *{color:#ffec00!important}body.a-vis .tag{background:#000;color:#ffec00;border:2px solid #ffec00}body.a-vis .btn{background:#ffec00;color:#000!important;font-size:1.1rem}body.a-vis .btn.g{background:#000;color:#ffec00!important;border-color:#ffec00}body.a-vis .side{background:#000;border-inline-start:3px solid #ffec00}body.a-vis .side a.nav{color:#ffec00}body.a-vis .side a.nav.on{background:#ffec00;color:#000}' +
      'body.a-vis input,body.a-vis select,body.a-vis textarea{background:#000;color:#ffec00;border:3px solid #ffec00}body.a-vis .row{flex-direction:column}' +
      'body.a-mot .btn,body.a-mot button{min-height:56px;min-width:56px;font-size:1.05rem}body.a-mot input,body.a-mot select,body.a-mot textarea{min-height:56px;font-size:1.05rem}body.a-mot .side a.nav{padding:18px 14px;font-size:1.1rem}body.a-mot td,body.a-mot th{padding:16px 10px}body.a-mot .col,body.a-mot .row{gap:22px}' +
      'body.a-mot #hw-fab{width:76px;height:76px}' +
      '@keyframes hwflash{0%,100%{box-shadow:inset 0 0 0 0 rgba(228,80,42,0)}50%{box-shadow:inset 0 0 0 14px rgba(228,80,42,.8)}}body.hw-fl{animation:hwflash .6s 2}' +
      'body.a-hear .toast{font-size:1.15rem;padding:16px 28px;border:3px solid #fff}';
    document.head.appendChild(css);
    var sk = el('<a id="hw-skip" href="#" tabindex="0">تخطي إلى المحتوى الرئيسي</a>');
    sk.onclick = function (e) { e.preventDefault(); var m = document.getElementById('body') || document.querySelector('.auth .form'); if (m) { m.setAttribute('tabindex', '-1'); m.focus(); } };
    document.body.appendChild(sk);
    var f = el('<button id="hw-fab" aria-label="أدوات الإتاحة" title="أدوات الإتاحة">♿</button>'); f.onclick = panel; document.body.appendChild(f);
    var r = el('<button id="hw-read" aria-label="اقرأ الصفحة صوتيًا">🔊 اقرأ الصفحة</button>'); r.onclick = speak; document.body.appendChild(r);
    /* hearing: flash + vibration on every toast/notification */
    new MutationObserver(function (ms) {
      if (!document.body.classList.contains('a-hear')) return;
      ms.forEach(function (m) { [].forEach.call(m.addedNodes, function (n) { if (n.classList && n.classList.contains('toast')) { document.body.classList.add('hw-fl'); setTimeout(function () { document.body.classList.remove('hw-fl'); }, 1300); try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { } n.setAttribute('role', 'alert'); } }); });
    }).observe(document.body, { childList: true });
    apply();
  }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);
})();
