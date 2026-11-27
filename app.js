(function () {
'use strict';
var API = (window.HW_API || '').replace(/\/$/, '');
var ORIGIN = API.replace(/\/api\/v1$/, '');
var $app = document.getElementById('app');
var KEY = 'hw_auth_v1';
var auth = null;
try { auth = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { auth = null; }
var cache = {};
var A = window.A = {};

/* ---------- helpers ---------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function $(id) { return document.getElementById(id); }
function val(id) { var e = $(id); return e ? e.value.trim() : ''; }
function media(u) { if (!u) return ''; return /^https?:/.test(u) ? u : ORIGIN + (u[0] === '/' ? '' : '/') + u; }
function dt(s) { if (!s) return '—'; try { return new Date(s).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return s; } }
function d(s) { if (!s) return '—'; try { return new Date(s).toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo', dateStyle: 'medium' }); } catch (e) { return s; } }
function tag(c, t) { return '<span class="tag ' + c + '">' + esc(t) + '</span>'; }
function toast(m, err) { var t = document.createElement('div'); t.className = 'toast' + (err ? ' e' : ''); t.textContent = m; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3500); }
function busy(btn, on) { if (btn) { btn.disabled = !!on; } }
var ROLE_AR = { volunteer: 'متطوع', disabled_user: 'صاحب همة', association: 'جمعية', company: 'شركة', admin: 'مدير النظام' };
var STATUS = {
  unverified: ['tn', 'لم يبدأ التحقق'], pending: ['tw', 'قيد المراجعة'], interview_scheduled: ['tb', 'مقابلة محجوزة'],
  approved: ['tg', 'معتمد'], rejected: ['tr', 'مرفوض'], active: ['tg', 'نشط'], suspended: ['tr', 'موقوف'], pending_approval: ['tw', 'بانتظار الاعتماد'],
  resolved: ['tg', 'تم'], completed: ['tg', 'تم'], draft: ['tn', 'مسودة'], available: ['tg', 'متاح'], booked: ['tb', 'محجوز'], cancelled: ['tn', 'ملغي']
};
function st(s) { var x = STATUS[s]; return x ? tag(x[0], x[1]) : tag('tn', s || '—'); }
var ERR = {
  INVALID_CREDENTIALS: 'البريد/الهاتف أو كلمة المرور غير صحيحة.', ACCOUNT_SUSPENDED: 'الحساب موقوف.', EMAIL_ALREADY_EXISTS: 'البريد مستخدم بالفعل.',
  PHONE_ALREADY_EXISTS: 'رقم الهاتف مستخدم بالفعل.', OTP_INVALID: 'الكود غير صحيح.', OTP_EXPIRED: 'انتهت صلاحية الكود.', OTP_TOO_MANY_ATTEMPTS: 'محاولات كثيرة، ابدأ من جديد.',
  OTP_RESEND_TOO_SOON: 'استنى شوية قبل إعادة الإرسال.', REGISTRATION_EXPIRED: 'انتهت صلاحية التسجيل، سجّل من جديد.', RATE_LIMITED: 'طلبات كثيرة، حاول بعد شوية.',
  DOCUMENTS_MISSING: 'ناقص مستندات مطلوبة.', PROFILE_INCOMPLETE: 'بيانات الملف ناقصة.', ORGANIZATION_ALREADY_SUBMITTED: 'الطلب مُرسل بالفعل.',
  DELETION_REQUEST_ALREADY_PENDING: 'عندك طلب حذف مفتوح بالفعل.', FILE_TOO_LARGE: 'الملف كبير.', FILE_TYPE_NOT_ALLOWED: 'نوع الملف غير مسموح.',
  INTERVIEW_SLOT_UNAVAILABLE: 'الموعد ده اتحجز أو مش متاح.', INTERVIEW_ALREADY_BOOKED: 'عندك حجز بالفعل.', INVALID_STATE: 'العملية غير مسموحة في الحالة الحالية.',
  VERIFICATION_INCOMPLETE: 'خطوات التحقق ناقصة.', FORBIDDEN: 'غير مسموح لك.', NOT_FOUND: 'غير موجود.'
};

/* ---------- api ---------- */
function save() { if (auth) localStorage.setItem(KEY, JSON.stringify(auth)); else localStorage.removeItem(KEY); }
var refreshing = null;
function refresh() {
  if (!auth || !auth.refreshToken) return Promise.reject(new Error('no'));
  if (!refreshing) {
    refreshing = fetch(API + '/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: auth.refreshToken }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.success) throw new Error('refresh'); auth.accessToken = j.data.accessToken; auth.refreshToken = j.data.refreshToken; save(); })
      .finally(function () { refreshing = null; });
  }
  return refreshing;
}
function api(path, o, retried) {
  o = o || {};
  var h = {}; var body;
  if (auth && auth.accessToken && !o.anon) h.Authorization = 'Bearer ' + auth.accessToken;
  if (o.form) body = o.form; else if (o.body !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(o.body); }
  return fetch(API + path, { method: o.method || 'GET', headers: h, body: body }).then(function (r) {
    if (r.status === 401 && !retried && !o.anon && auth && auth.refreshToken && path.indexOf('/auth/') !== 0) {
      return refresh().then(function () { return api(path, o, true); }, function () { logout(true); throw apiErr('UNAUTHORIZED', 'انتهت الجلسة، سجّل دخولك تاني.'); });
    }
    if (r.status === 204) return null;
    return r.text().then(function (t) {
      var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { }
      if (r.ok && (!j || j.success !== false)) return j && 'data' in j ? j.data : j;
      var er = (j && j.error) || {};
      throw apiErr(er.code || ('HTTP_' + r.status), ERR[er.code] || er.message || 'حصلت مشكلة، حاول تاني.', er.fields);
    });
  }, function () { throw apiErr('NETWORK', 'تعذّر الاتصال بالسيرفر. السيرفر المجاني ممكن ياخد دقيقة يصحى، جرّب تاني.'); });
}
function apiErr(code, msg, fields) { var e = new Error(msg); e.code = code; e.fields = fields; return e; }
function fail(e) { toast(e && e.message ? e.message : 'حصلت مشكلة', true); }
function act(btn, fn, ok) {
  busy(btn, true);
  return Promise.resolve().then(fn).then(function (r) { if (ok) toast(ok); return r; }).catch(function (e) { fail(e); throw e; }).finally(function () { busy(btn, false); });
}
function meta(name) { if (cache['m' + name]) return Promise.resolve(cache['m' + name]); return api('/meta/' + name, { anon: true }).then(function (r) { cache['m' + name] = r; return r; }); }
function items(r) { return Array.isArray(r) ? r : (r && r.items) || []; }

/* ---------- session ---------- */
function setSession(a) {
  auth = { accessToken: a.accessToken, refreshToken: a.refreshToken, role: a.role, displayName: a.displayName, userId: a.userId, email: a.email, accountStatus: a.accountStatus };
  save();
}
function logout(silent) {
  var rt = auth && auth.refreshToken; var at = auth && auth.accessToken;
  if (rt && !silent) { fetch(API + '/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at }, body: JSON.stringify({ refreshToken: rt }) }).catch(function () { }); }
  auth = null; save(); cache = {}; applyA11y(null); location.hash = '#/login'; route();
}
A.logout = function () { logout(false); };
function applyA11y(p) {
  var b = document.body;
  b.classList.toggle('hc', !!(p && (p.highContrast || p.theme === 'high_contrast')));
  b.classList.toggle('rm', !!(p && p.reducedMotion));
  document.documentElement.style.fontSize = p && p.fontScale ? (16 * Math.min(2, Math.max(1, +p.fontScale))) + 'px' : '';
  if (window.HWA) { if (p) HWA.fromServer(p); else HWA.reset(); }
}

/* ---------- auth screens ---------- */
function authShell(inner) {
  $app.innerHTML = '<div class="auth"><div class="hero"><img src="img/logo.png" alt=""><h2>همزة وصل</h2><p>لوحة التحكم: تابع حسابك، وخلّص خطواتك، وابقَ على تواصل مع المنصة في مكان واحد.</p><a href="' + esc(window.HW_LANDING || '#') + '" style="color:#fff;opacity:.85">← الرجوع للموقع</a></div><div class="form"><div class="card box">' + inner + '</div></div></div>';
}
function loginPage() {
  authShell('<h3>تسجيل الدخول</h3><label class="fld">البريد الإلكتروني أو رقم الهاتف<input id="lg_id" autocomplete="username" inputmode="email"></label><label class="fld">كلمة المرور<input id="lg_pw" type="password" autocomplete="current-password"></label><div id="lg_err" class="note e" style="display:none"></div><button class="btn" id="lg_go" style="padding:12px">دخول</button><div style="font-size:14px">معندكش حساب؟ <a href="#/register">إنشاء حساب</a> · <a href="#/forgot">نسيت كلمة المرور؟</a></div>');
  var go = function () {
    var b = $('lg_go'); busy(b, true);
    api('/auth/login', { method: 'POST', anon: true, body: { emailOrPhone: val('lg_id'), password: $('lg_pw').value } })
      .then(function (a) { setSession(a); location.hash = '#/home'; route(); })
      .catch(function (e) { var x = $('lg_err'); x.style.display = 'block'; x.textContent = e.message; })
      .finally(function () { busy(b, false); });
  };
  $('lg_go').onclick = go; $('lg_pw').onkeydown = function (e) { if (e.key === 'Enter') go(); };
}
var reg = {};
function registerPage() {
  authShell('<h3>إنشاء حساب</h3><div class="fld">نوع الحساب<div class="chips" id="rg_roles"></div></div><label class="fld"><span id="rg_namelbl">الاسم</span><input id="rg_name"></label><label class="fld">البريد الإلكتروني<input id="rg_email" type="email"></label><label class="fld">رقم الهاتف<input id="rg_phone" inputmode="tel" placeholder="01xxxxxxxxx"></label><label class="fld">كلمة المرور<input id="rg_pw" type="password" autocomplete="new-password"></label><label class="fld">تأكيد كلمة المرور<input id="rg_pw2" type="password" autocomplete="new-password"></label><label style="font-size:14px"><input type="checkbox" id="rg_terms"> أوافق على <a href="' + esc((window.HW_LANDING || '') + 'terms.html') + '" target="_blank">الشروط</a> و<a href="' + esc((window.HW_LANDING || '') + 'privacy.html') + '" target="_blank">الخصوصية</a></label><div id="rg_err" class="note e" style="display:none"></div><button class="btn" id="rg_go" style="padding:12px">متابعة</button><div style="font-size:14px">عندك حساب؟ <a href="#/login">دخول</a></div>');
  reg.role = reg.role || 'volunteer';
  var rolesEl = $('rg_roles');
  function paint() {
    rolesEl.innerHTML = ['volunteer', 'disabled_user', 'association', 'company'].map(function (r) { return '<span class="chip ' + (reg.role === r ? 'on' : '') + '" data-r="' + r + '">' + ROLE_AR[r] + '</span>'; }).join('');
    $('rg_namelbl').textContent = (reg.role === 'association' || reg.role === 'company') ? 'اسم الجهة' : 'الاسم';
  }
  rolesEl.onclick = function (e) { var r = e.target.getAttribute && e.target.getAttribute('data-r'); if (r) { reg.role = r; paint(); } };
  paint();
  $('rg_go').onclick = function () {
    var org = reg.role === 'association' || reg.role === 'company';
    var body = { role: reg.role, email: val('rg_email'), phone: val('rg_phone'), password: $('rg_pw').value, confirmPassword: $('rg_pw2').value, termsAccepted: $('rg_terms').checked, policyVersion: '1.0' };
    if (org) body.organizationName = val('rg_name'); else body.name = val('rg_name');
    var b = $('rg_go'); busy(b, true);
    api('/auth/register', { method: 'POST', anon: true, body: body }).then(function (r) { reg.ticket = r.registrationTicket; reg.phone = r.phone; otpPage(); })
      .catch(function (e) { var x = $('rg_err'); x.style.display = 'block'; var f = e.fields ? Object.keys(e.fields).map(function (k) { return (e.fields[k] || []).join(' '); }).join(' ') : ''; x.textContent = e.message + (f ? ' ' + f : ''); })
      .finally(function () { busy(b, false); });
  };
}
function otpPage() {
  authShell('<h3>تأكيد رقم الهاتف</h3><p style="margin:0;color:var(--muted)">بعتنا كود لرقم <b dir="ltr">' + esc(reg.phone || '') + '</b></p><label class="fld">الكود<input id="ot_code" inputmode="numeric" maxlength="6" style="font-size:24px;text-align:center;letter-spacing:6px"></label><div id="ot_err" class="note e" style="display:none"></div><button class="btn" id="ot_go" style="padding:12px">تأكيد وإنشاء الحساب</button><button class="btn g" id="ot_re">إعادة إرسال الكود</button>');
  $('ot_go').onclick = function () {
    var b = $('ot_go'); busy(b, true);
    api('/auth/register/complete', { method: 'POST', anon: true, body: { registrationTicket: reg.ticket, code: val('ot_code') } })
      .then(function (a) { setSession(a); reg = {}; location.hash = '#/home'; route(); })
      .catch(function (e) { var x = $('ot_err'); x.style.display = 'block'; x.textContent = e.message; })
      .finally(function () { busy(b, false); });
  };
  $('ot_re').onclick = function () { act($('ot_re'), function () { return api('/auth/register/resend', { method: 'POST', anon: true, body: { registrationTicket: reg.ticket } }); }, 'تم إرسال كود جديد'); };
}
function resetPage() {
  authShell('<h3>كلمة مرور جديدة</h3><label class="fld">البريد الإلكتروني<input id="rs_email" type="email" value="' + esc(reg.fpEmail || '') + '"></label><label class="fld">الكود اللي وصلك<input id="rs_tok" dir="ltr"></label><label class="fld">كلمة المرور الجديدة<input id="rs_pw" type="password"></label><label class="fld">تأكيد كلمة المرور<input id="rs_pw2" type="password"></label><button class="btn" id="rs_go" style="padding:12px">حفظ</button><div style="font-size:14px"><a href="#/login">رجوع لتسجيل الدخول</a></div>');
  $('rs_go').onclick = function () { act($('rs_go'), function () { return api('/auth/reset-password', { method: 'POST', anon: true, body: { email: val('rs_email'), token: val('rs_tok'), newPassword: $('rs_pw').value, confirmPassword: $('rs_pw2').value } }); }, 'تم تغيير كلمة المرور، سجّل دخول').then(function () { location.hash = '#/login'; }, function () { }); };
}
function forgotPage() {
  authShell('<h3>استرجاع كلمة المرور</h3><label class="fld">البريد الإلكتروني<input id="fp_email" type="email"></label><button class="btn" id="fp_go" style="padding:12px">إرسال</button><div id="fp_msg" class="note ok" style="display:none">لو الحساب موجود هيوصلك كود على بريدك.</div><div style="font-size:14px"><a href="#/login">رجوع</a></div>');
  $('fp_go').onclick = function () { act($('fp_go'), function () { return api('/auth/forgot-password', { method: 'POST', anon: true, body: { email: val('fp_email') } }); }).then(function () { reg.fpEmail = val('fp_email'); $('fp_msg').style.display = 'block'; $('fp_msg').innerHTML += ' <a href="#/reset"><b>عندي الكود</b></a>'; }, function () { }); };
}

/* ---------- layout ---------- */
var NAV = {
  volunteer: [['home', 'الرئيسية'], ['verification', 'حالة التحقق'], ['interview', 'المقابلة'], ['availability', 'مواعيد التطوع'], ['training', 'التدريب'], ['open', 'طلبات مفتوحة'], ['mine', 'عروضي ومحادثاتي'], ['profile', 'ملفي الشخصي'], ['notifications', 'الإشعارات'], ['settings', 'الإعدادات']],
  disabled_user: [['home', 'الرئيسية'], ['needs', 'احتياجاتي وإعدادات الوصول'], ['requests', 'طلبات المساعدة'], ['profile', 'ملفي الشخصي'], ['notifications', 'الإشعارات'], ['settings', 'الإعدادات']],
  association: [['home', 'الرئيسية'], ['org', 'بيانات الجمعية'], ['media', 'اللوجو والغلاف'], ['docs', 'المستندات'], ['status', 'حالة الاعتماد'], ['notifications', 'الإشعارات'], ['settings', 'الإعدادات']],
  company: [['home', 'الرئيسية'], ['org', 'بيانات الشركة'], ['media', 'اللوجو والغلاف'], ['docs', 'المستندات'], ['status', 'حالة الاعتماد'], ['notifications', 'الإشعارات'], ['settings', 'الإعدادات']],
  admin: [['home', 'نظرة عامة'], ['vreviews', 'مراجعة المتطوعين'], ['oreviews', 'مراجعة الجهات'], ['slots', 'مواعيد المقابلات'], ['users', 'المستخدمون'], ['deletions', 'طلبات حذف الحساب'], ['leads', 'طلبات الموقع'], ['audit', 'سجل العمليات'], ['notifications', 'الإشعارات'], ['settings', 'الإعدادات']]
};
var unread = 0;
function layout(page, title, sub, actionsHtml) {
  var nav = NAV[auth.role] || [];
  var side = '<div class="side" id="side"><div class="lg"><img src="img/logo.png" alt=""><span>همزة وصل<small>' + (auth.role === 'admin' ? 'لوحة الإدارة' : 'لوحة التحكم') + '</small></span></div>' +
    nav.map(function (n) { return '<a class="nav ' + (n[0] === page ? 'on' : '') + '" href="#/' + n[0] + '"><i></i>' + n[1] + (n[0] === 'notifications' && unread ? '<b>' + unread + '</b>' : '') + '</a>'; }).join('') +
    '<div class="me"><div class="av">' + esc((auth.displayName || 'م').slice(0, 1)) + '</div><div style="flex:1;min-width:0">' + esc(auth.displayName || '') + '<br><small style="opacity:.7">' + (ROLE_AR[auth.role] || '') + '</small></div><a class="nav" style="padding:6px 10px" onclick="A.logout()" title="خروج">خروج</a></div></div>';
  $app.innerHTML = '<div class="layout">' + side + '<div class="main"><div class="top"><button class="menu" onclick="document.getElementById(\'side\').classList.toggle(\'open\')">☰</button><h1>' + esc(title) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</h1>' + (actionsHtml || '') + '</div><div id="body" class="col"><div class="empty">جاري التحميل…</div></div></div></div>';
}
function body(html) { var b = $('body'); if (b) b.innerHTML = html; }
function errBox(e) { body('<div class="note e">' + esc(e.message || 'حصلت مشكلة') + ' <button class="btn s" onclick="location.reload()">إعادة المحاولة</button></div>'); }
function kpi(n, l, dd) { return '<div class="card kpi"><div class="n">' + esc(n) + '</div><div class="l">' + esc(l) + '</div><div class="d">' + esc(dd || '') + '</div></div>'; }
function empty(m) { return '<div class="empty">' + esc(m) + '</div>'; }
function table(heads, rows) { if (!rows.length) return ''; return '<div class="scroll"><table><tr>' + heads.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>'; }
function modal(html) { var o = document.createElement('div'); o.className = 'ov'; o.innerHTML = '<div class="modal">' + html + '</div>'; o.onclick = function (e) { if (e.target === o) o.remove(); }; document.body.appendChild(o); return o; }
A.closeModal = function () { var o = document.querySelector('.ov'); if (o) o.remove(); };
function loadUnread() { return api('/me/notifications?page=1&pageSize=50').then(function (r) { unread = items(r).filter(function (n) { return !n.isRead; }).length; }).catch(function () { }); }

/* ---------- shared pages ---------- */
function notificationsPage() {
  layout('notifications', 'الإشعارات', '');
  api('/me/notifications?page=1&pageSize=50').then(function (r) {
    var l = items(r);
    body('<div class="card nlist">' + (l.length ? l.map(function (n) {
      return '<div><div style="flex:1" class="' + (n.isRead ? '' : 'un') + '"><b>' + esc(n.titleAr) + '</b><div style="color:var(--muted);font-size:13px;font-weight:400">' + esc(n.bodyAr) + ' · ' + dt(n.createdAt) + '</div></div>' + (n.isRead ? tag('tn', 'مقروء') : '<button class="btn s g" onclick="A.read(\'' + n.id + '\',this)">تعليم كمقروء</button>') + '</div>';
    }).join('') : empty('مفيش إشعارات.')) + '</div>');
  }).catch(errBox);
}
A.read = function (id, b) { act(b, function () { return api('/me/notifications/' + id + '/read', { method: 'PUT' }); }).then(function () { unread = Math.max(0, unread - 1); notificationsPage(); }); };

function settingsPage() {
  layout('settings', 'الإعدادات', 'الحساب والخصوصية');
  var del = auth.role === 'admin' ? '' : '<div class="card col" style="border-color:#f4c1b3"><h3 style="color:#b83a1b">حذف الحساب</h3><p style="color:var(--muted);margin:0">هيتبعت طلب للأدمن، وبعد الموافقة بياناتك بتتمسح نهائيًا. الحساب بيفضل شغال لحد الموافقة.</p><button class="btn o" id="st_del" style="width:max-content">طلب حذف الحساب</button></div>';
  api('/auth/session').then(function (ss) { if (ss && ss.emailVerified === false && $('body')) { var h = document.createElement('div'); h.innerHTML = emailCard(); $('body').insertBefore(h.firstChild, $('body').firstChild); bindEmail(settingsPage); } }).catch(function () { });
  body('<div class="row"><div class="card col"><h3>تغيير كلمة المرور</h3><label class="fld">كلمة المرور الحالية<input id="st_cur" type="password"></label><label class="fld">كلمة مرور جديدة<input id="st_new" type="password"></label><label class="fld">تأكيد كلمة المرور الجديدة<input id="st_new2" type="password"></label><button class="btn" id="st_go" style="width:max-content">تغيير</button></div>' + del + '</div>');
  $('st_go').onclick = function () {
    act($('st_go'), function () { return api('/auth/change-password', { method: 'POST', body: { currentPassword: $('st_cur').value, newPassword: $('st_new').value, confirmNewPassword: $('st_new2').value, confirmPassword: $('st_new2').value } }); }, 'تم تغيير كلمة المرور');
  };
  if ($('st_del')) $('st_del').onclick = function () {
    var m = modal('<h3>طلب حذف الحساب؟</h3><div style="color:var(--muted)">الطلب بيروح للأدمن، ولما يوافق بيانات حسابك بتتمسح ومفيش رجوع.</div><div style="display:flex;gap:10px"><button class="btn o" id="md_ok" style="flex:1">تأكيد الطلب</button><button class="btn g" onclick="A.closeModal()" style="flex:1">إلغاء</button></div>');
    document.getElementById('md_ok').onclick = function () { act(this, function () { return api('/me/deletion-request', { method: 'POST' }); }, 'تم إرسال الطلب').then(function () { m.remove(); }, function () { m.remove(); }); };
  };
}

function profilePage() {
  var isVol = auth.role === 'volunteer';
  layout('profile', 'ملفي الشخصي', isVol ? 'البيانات والمهارات والموقع' : 'البيانات والاهتمامات');
  Promise.all([api('/me/profile'), meta('interests'), isVol ? meta('skills') : null, isVol ? api('/me/volunteer-profile').catch(function () { return {}; }) : null, isVol ? api('/me/volunteer-location').catch(function () { return {}; }) : null, isVol ? meta('governorates') : null])
    .then(function (r) {
      var p = r[0] || {}, ints = r[1] || [], skills = r[2] || [], vp = r[3] || {}, vl = r[4] || {}, govs = r[5] || [];
      var vpSkills = (vp.skills || []).map(function (s) { return s.id; });
      var h = '<div class="row"><div class="card col" style="flex:1.3"><div style="display:flex;gap:14px;align-items:center"><div class="av" style="width:64px;height:64px;font-size:26px">' + (p.avatarUrl ? '<img src="' + esc(media(p.avatarUrl)) + '" alt="">' : esc((p.displayName || 'م').slice(0, 1))) + '</div><label class="btn g s">تغيير الصورة<input type="file" id="pf_av" accept="image/png,image/jpeg" hidden></label></div>' +
        '<label class="fld">الاسم<input id="pf_name" value="' + esc(p.displayName) + '"></label><label class="fld">نبذة<textarea id="pf_bio">' + esc(p.bio) + '</textarea></label><label class="fld">المدينة<input id="pf_city" value="' + esc(p.city) + '"></label>' +
        '<label class="fld">من يقدر يشوف ملفي<select id="pf_vis">' + [['public', 'الكل'], ['followers', 'المتابعين'], ['private', 'أنا بس']].map(function (o) { return '<option value="' + o[0] + '"' + (p.visibility === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
        '<div class="fld">الاهتمامات<div class="chips" id="pf_ints">' + ints.map(function (i) { return '<span class="chip" data-id="' + i.id + '">' + esc(i.nameAr) + '</span>'; }).join('') + '</div></div><button class="btn" id="pf_save" style="width:max-content">حفظ</button></div>';
      if (isVol) {
        h += '<div class="col"><div class="card col"><h3>بيانات التطوع</h3><label class="fld">مقدمة عنك<textarea id="vp_intro">' + esc(vp.introduction) + '</textarea></label>' +
          '<label class="fld">نوع المساعدة<select id="vp_mode"><option value="online_only"' + (vp.helpMode === 'online_only' ? ' selected' : '') + '>أونلاين فقط</option><option value="online_and_field"' + (vp.helpMode === 'online_and_field' ? ' selected' : '') + '>أونلاين وميداني</option></select></label>' +
          '<label class="fld">المستوى<select id="vp_lvl">' + [['beginner', 'مبتدئ'], ['intermediate', 'متوسط'], ['advanced', 'متقدم']].map(function (o) { return '<option value="' + o[0] + '"' + (vp.skillLevel === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
          '<label class="fld">ساعات أسبوعيًا<input id="vp_hrs" type="number" min="1" max="168" value="' + esc(vp.weeklyHours || '') + '"></label><label class="fld">خبرات<textarea id="vp_exp">' + esc(vp.experienceNotes) + '</textarea></label>' +
          '<div class="fld">المهارات<div class="chips" id="vp_skills">' + skills.map(function (s) { return '<span class="chip ' + (vpSkills.indexOf(s.id) >= 0 ? 'on' : '') + '" data-id="' + s.id + '">' + esc(s.nameAr) + '</span>'; }).join('') + '</div></div><button class="btn" id="vp_save" style="width:max-content">حفظ بيانات التطوع</button></div>' +
          '<div class="card col"><h3>منطقة الخدمة</h3><label class="fld">المحافظة<select id="vl_gov"><option value="">اختار</option>' + govs.map(function (g) { return '<option value="' + esc(g.key) + '"' + (vl.governorate === g.key || vl.governorate === g.nameAr ? ' selected' : '') + '>' + esc(g.nameAr) + '</option>'; }).join('') + '</select></label><label class="fld">المنطقة<select id="vl_area"></select></label><label class="fld">نطاق الخدمة (كم، من 1 إلى 100)<input id="vl_rad" type="number" min="1" max="100" value="' + esc(vl.serviceRadiusKm || '') + '"></label><button class="btn" id="vl_save" style="width:max-content">حفظ المنطقة</button></div></div>';
      }
      h += '</div>';
      body(h);
      // interests
      api('/me/profile').then(function () { });
      var chosenInts = []; document.querySelectorAll('#pf_ints .chip').forEach(function (c) { c.onclick = function () { c.classList.toggle('on'); }; });
      document.querySelectorAll('#vp_skills .chip').forEach(function (c) { c.onclick = function () { c.classList.toggle('on'); }; });
      $('pf_av').onchange = function () { var f = this.files[0]; if (!f) return; var fd = new FormData(); fd.append('file', f); api('/me/profile/avatar', { method: 'PUT', form: fd }).then(function () { toast('تم تحديث الصورة'); profilePage(); }).catch(fail); };
      $('pf_save').onclick = function () {
        var ids = [].map.call(document.querySelectorAll('#pf_ints .chip.on'), function (c) { return +c.getAttribute('data-id'); });
        act($('pf_save'), function () { return api('/me/profile', { method: 'PUT', body: { displayName: val('pf_name'), bio: val('pf_bio'), city: val('pf_city'), visibility: $('pf_vis').value } }).then(function () { return ids.length ? api('/me/interests', { method: 'PUT', body: { interestIds: ids } }) : null; }); }, 'تم الحفظ').then(function () { auth.displayName = val('pf_name'); save(); });
      };
      if (isVol) {
        var fillAreas = function () { var g = govs.filter(function (x) { return x.key === $('vl_gov').value; })[0]; $('vl_area').innerHTML = (g ? g.areas : []).map(function (a) { return '<option value="' + esc(a.key) + '"' + (vl.serviceArea === a.key || vl.serviceArea === a.nameAr ? ' selected' : '') + '>' + esc(a.nameAr) + '</option>'; }).join(''); };
        $('vl_gov').onchange = fillAreas; fillAreas();
        $('vp_save').onclick = function () {
          var ids = [].map.call(document.querySelectorAll('#vp_skills .chip.on'), function (c) { return +c.getAttribute('data-id'); });
          act($('vp_save'), function () { return api('/me/volunteer-profile', { method: 'PUT', body: { introduction: val('vp_intro'), helpMode: $('vp_mode').value, skillLevel: $('vp_lvl').value, weeklyHours: +val('vp_hrs') || 1, experienceNotes: val('vp_exp'), skillIds: ids } }); }, 'تم الحفظ');
        };
        $('vl_save').onclick = function () {
          var rad = val('vl_rad');
          act($('vl_save'), function () { return api('/me/volunteer-location', { method: 'PUT', body: { governorate: $('vl_gov').value, serviceArea: $('vl_area').value, serviceRadiusKm: rad ? +rad : null } }); }, 'تم حفظ المنطقة');
        };
      }
    }).catch(errBox);
}


function emailCard() {
  return '<div class="card col" id="em_card"><h3>تأكيد البريد الإلكتروني</h3><p style="margin:0;color:var(--muted)">لازم تأكد بريدك قبل رفع الأدلة. هنبعتلك كود من 6 أرقام.</p><button class="btn g" id="em_send" style="width:max-content">إرسال الكود</button><div class="row"><label class="fld">الكود<input id="em_code" inputmode="numeric" maxlength="6"></label></div><button class="btn" id="em_ok" style="width:max-content">تأكيد</button></div>';
}
function bindEmail(done) {
  var s = $('em_send'); if (!s) return;
  s.onclick = function () { act(s, function () { return api('/auth/email/send-code', { method: 'POST', body: {} }); }, 'تم إرسال الكود لبريدك').catch(function () { }); };
  $('em_ok').onclick = function () { act($('em_ok'), function () { return api('/auth/email/verify', { method: 'POST', body: { code: val('em_code') } }); }, 'تم تأكيد البريد').then(done, function () { }); };
}

/* ---------- volunteer ---------- */
var STEP_AR = { email: 'تأكيد البريد', phone: 'تأكيد الهاتف', national_id_front: 'الهوية (وجه)', national_id_back: 'الهوية (خلف)', social_links: 'حسابات التواصل', face_photo: 'سيلفي', interview: 'حجز المقابلة', decision: 'قرار الأدمن' };
function volHome() {
  layout('home', 'أهلًا يا ' + (auth.displayName || ''), 'ملخص حسابك');
  Promise.all([api('/me/verification'), api('/me/training').catch(function () { return null; }), api('/me/availability').catch(function () { return []; })]).then(function (r) {
    var v = r[0], tr = r[1], av = items(r[2]);
    var mods = Array.isArray(tr) ? tr : (tr ? [tr] : []);
    var passed = mods.filter(function (m) { return (m.attempts || []).some(function (a) { return a.result === 'passed'; }); }).length;
    body('<div class="row">' + kpi(({ unverified: 'لم يبدأ', pending: 'قيد المراجعة', interview_scheduled: 'مقابلة محجوزة', approved: 'معتمد', rejected: 'مرفوض' })[v.status] || v.status, 'حالة التحقق', 'الخطوة الحالية: ' + (STEP_AR[v.currentStep] || ({ admin_review: 'مراجعة الأدمن', completed: 'مكتمل', reapply: 'إعادة التقديم' })[v.currentStep] || '')) +
      kpi(v.interviewAt ? dt(v.interviewAt) : '—', 'موعد المقابلة') + kpi(av.length, 'فترات التطوع المحددة') + kpi(passed + '/' + (mods.length || 1), 'وحدات التدريب المنجزة') + '</div>' +
      '<div class="row"><div class="card" style="flex:1.4"><h3>خطوات التحقق</h3><div class="tl">' + (v.steps || []).map(function (s) { return '<div>' + (s.completed ? '✓ ' : '') + (s.completed ? '' : '<b>') + esc(s.titleAr || STEP_AR[s.key] || s.key) + (s.completed ? '' : '</b>') + '<small>' + (s.completed ? 'تم' : (s.required ? 'مطلوب' : 'اختياري')) + '</small></div>'; }).join('') + '</div></div>' +
      '<div class="card"><h3>إجراءات سريعة</h3><div class="col" style="gap:10px"><a class="btn" href="#/verification" style="text-align:center">أكمل التحقق</a><a class="btn g" href="#/interview" style="text-align:center">المقابلة</a><a class="btn g" href="#/availability" style="text-align:center">مواعيد تطوعي</a><a class="btn g" href="#/training" style="text-align:center">التدريب</a></div></div></div>');
  }).catch(errBox);
}
var EVID = [['national_id_front', 'الهوية (وجه)'], ['national_id_back', 'الهوية (خلف)'], ['face_photo', 'صورة شخصية (سيلفي)']];
function volVerification() {
  layout('verification', 'حالة التحقق', 'الهوية والأدلة');
  api('/me/verification').then(function (v) {
    var up = v.uploadedEvidenceTypes || [];
    var sl = {}; (v.socialLinks || []).forEach(function (s) { sl[s.platform] = s.url; });
    var emDone = (v.steps || []).some(function (x) { return x.key === 'email' && x.completed; });
    body((emDone ? '' : emailCard()) + '<div class="note ' + ({ approved: 'ok', rejected: 'e' }[v.status] || 'i') + '">' + st(v.status) + ' ' + ({ approved: 'حسابك معتمد.', rejected: 'تم رفض الطلب، تقدر تقدّم من جديد.', interview_scheduled: 'الأدمن هيراجع الأدلة بعد المقابلة وتوصلك النتيجة كإشعار.' }[v.status] || 'كمّل الخطوات وارفع الأدلة.') + '</div>' +
      '<div class="row"><div class="card" style="flex:1.4"><h3>الأدلة المرفوعة</h3><div class="row">' + EVID.map(function (e) { var ok = up.indexOf(e[0]) >= 0; return '<div class="col" style="gap:8px"><div class="ph" style="min-height:90px">' + e[1] + '</div>' + (ok ? tag('tg', 'مرفوعة') : tag('tw', 'مطلوبة')) + '<label class="btn g s" style="text-align:center">' + (ok ? 'استبدال' : 'رفع') + '<input type="file" accept="image/*" hidden data-ev="' + e[0] + '"></label></div>'; }).join('') + '</div><p style="color:var(--muted);font-size:13px">صور حتى 10MB (PNG/JPG). بتتشاف للأدمن بس.</p></div>' +
      '<div class="card col"><h3>حسابات التواصل</h3>' + ['facebook', 'linkedin', 'instagram'].map(function (p) { return '<label class="fld">' + p + '<input dir="ltr" id="sl_' + p + '" value="' + esc(sl[p] || '') + '" placeholder="https://…"></label>'; }).join('') + '<button class="btn" id="sl_save" style="width:max-content">حفظ</button></div></div>');
    document.querySelectorAll('input[data-ev]').forEach(function (i) {
      i.onchange = function () { var f = i.files[0]; if (!f) return; var fd = new FormData(); fd.append('evidenceType', i.getAttribute('data-ev')); fd.append('file', f); api('/me/verification/evidence', { method: 'POST', form: fd }).then(function () { toast('تم الرفع'); volVerification(); }).catch(fail); };
    });
    bindEmail(volVerification);
    $('sl_save').onclick = function () {
      var links = ['facebook', 'linkedin', 'instagram'].map(function (p) { return { platform: p, url: val('sl_' + p) }; }).filter(function (x) { return x.url; });
      act($('sl_save'), function () { return api('/me/verification/social-links', { method: 'PUT', body: { links: links } }); }, 'تم الحفظ');
    };
  }).catch(errBox);
}
function volInterview() {
  layout('interview', 'حجز المقابلة', 'اختار الوقت المناسب');
  Promise.all([api('/me/verification'), api('/interview-slots').catch(function (e) { return { _err: e }; })]).then(function (r) {
    var v = r[0], sl = r[1]; var sel = null;
    var list = sl && sl._err ? [] : items(sl);
    var cur = v.interviewAt ? '<div class="note i">' + tag('tb', 'مقابلتك') + ' ' + dt(v.interviewAt) + '</div>' : '';
    var locked = v.status === 'approved';
    body(cur + '<div class="row"><div class="card" style="flex:1.6"><h3>المواعيد المتاحة (30 دقيقة)</h3>' + (sl && sl._err ? '<div class="note e">' + esc(sl._err.message) + '</div>' : (list.length ? '<div class="slots" id="slots">' + list.map(function (s) { var ok = s.status === 'available'; return '<div class="slot ' + (ok ? '' : 'off') + '" data-id="' + s.interviewSlotId + '">' + dt(s.startsAt) + (ok ? '' : '<br><small>' + (s.status === 'booked' ? 'محجوز' : s.status) + '</small>') + '</div>'; }).join('') + '</div>' : empty('مفيش مواعيد متاحة حاليًا. هتوصلك إشعار لما يتضاف.'))) +
      '<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn" id="iv_book" disabled>' + (v.interviewAt ? 'تغيير الموعد' : 'تأكيد الحجز') + '</button>' + (v.interviewAt && !locked ? '<button class="btn g" id="iv_cancel">إلغاء الحجز</button>' : '') + '</div></div><div class="card"><h3>ملاحظات</h3><p style="line-height:1.9;color:var(--muted)">المقابلة مكالمة قصيرة مع فريق المراجعة. تقدر تعدّل أو تلغي قبل الاعتماد.</p></div></div>');
    document.querySelectorAll('.slot:not(.off)').forEach(function (e) { e.onclick = function () { document.querySelectorAll('.slot').forEach(function (x) { x.classList.remove('on'); }); e.classList.add('on'); sel = e.getAttribute('data-id'); $('iv_book').disabled = false; }; });
    $('iv_book').onclick = function () { act($('iv_book'), function () { return api('/me/verification/interview', { method: v.interviewAt ? 'PUT' : 'POST', body: { interviewSlotId: sel } }); }, 'تم الحجز').then(volInterview); };
    if ($('iv_cancel')) $('iv_cancel').onclick = function () { act($('iv_cancel'), function () { return api('/me/verification/interview', { method: 'DELETE' }); }, 'تم إلغاء الحجز').then(volInterview); };
  }).catch(errBox);
}
var avDraft = [];
function volAvailability() {
  layout('availability', 'مواعيد التطوع', 'حدد أوقاتك المتاحة (بتوقيت القاهرة)');
  api('/me/availability').then(function (r) {
    avDraft = items(r).map(function (s) { return { startsAt: s.startsAt, endsAt: s.endsAt, timezone: s.timezone || 'Africa/Cairo' }; });
    paintAv();
  }).catch(errBox);
}
function paintAv() {
  avDraft.sort(function (a, b) { return new Date(a.startsAt) - new Date(b.startsAt); });
  body('<div class="row"><div class="card" style="flex:1.6"><h3>فتراتك المتاحة</h3>' + (avDraft.length ? '<div class="scroll"><table><tr><th>من</th><th>إلى</th><th></th></tr>' + avDraft.map(function (s, i) { return '<tr><td>' + dt(s.startsAt) + '</td><td>' + dt(s.endsAt) + '</td><td><button class="btn s g" onclick="A.avDel(' + i + ')">حذف</button></td></tr>'; }).join('') + '</table></div>' : empty('لسه ما حددتش فترات.')) + '<div style="margin-top:14px"><button class="btn" id="av_save">حفظ الفترات</button></div></div>' +
    '<div class="card col"><h3>إضافة فترة</h3><label class="fld">من<input type="datetime-local" id="av_s"></label><label class="fld">إلى<input type="datetime-local" id="av_e"></label><button class="btn g" id="av_add">إضافة</button><div class="note i">الفترات لازم تكون في المستقبل وما تتداخلش.</div></div></div>');
  $('av_add').onclick = function () {
    var s = $('av_s').value, e = $('av_e').value; if (!s || !e) return toast('اختار البداية والنهاية', true);
    var a = new Date(s), b = new Date(e); if (!(b > a) || a < new Date()) return toast('الفترة لازم تكون في المستقبل والنهاية بعد البداية', true);
    avDraft.push({ startsAt: a.toISOString(), endsAt: b.toISOString(), timezone: 'Africa/Cairo' }); paintAv();
  };
  $('av_save').onclick = function () { act($('av_save'), function () { return api('/me/availability', { method: 'PUT', body: { slots: avDraft } }); }, 'تم الحفظ').then(volAvailability); };
}
A.avDel = function (i) { avDraft.splice(i, 1); paintAv(); };
var QUIZ = [
  ['إيه أفضل طريقة تعرض بيها المساعدة على شخص من ذوي الهمم؟', ['أسأله هو محتاج إيه قبل ما أساعد', 'أساعده مباشرة من غير سؤال'], 0],
  ['لو شخص عنده إعاقة سمعية، إزاي تتواصل معاه؟', ['أتكلم بصوت عالي جدًا', 'أواجهه وأتكلم بوضوح أو أكتب له'], 1],
  ['لو مستخدم كرسي متحرك، الأنسب إنك:', ['تسأله قبل ما تدفع الكرسي', 'تدفع الكرسي مباشرة'], 0],
  ['الخصوصية مع المستفيد معناها:', ['أحافظ على بياناته ومشاركة ما يلزم بس', 'أشارك قصته على السوشيال'], 0]
];
function volTraining() {
  layout('training', 'التدريب', 'وحدة قبل بدء التطوع');
  api('/me/training').then(function (r) {
    var mods = Array.isArray(r) ? r : (r ? [r] : []);
    var m = mods[0];
    if (!m) { body('<div class="card">' + empty('مفيش وحدات تدريب متاحة حاليًا.') + '</div>'); return; }
    var att = m.attempts || [];
    body('<div class="row"><div class="card col"><h3>' + esc(m.title) + ' <small style="color:var(--muted)">v' + esc(m.version) + '</small></h3>' + (att.length ? table(['المحاولة', 'النتيجة', 'التاريخ'], att.map(function (a, i) { return [i + 1, (a.score != null ? a.score + '% ' : '') + (a.result === 'passed' ? tag('tg', 'نجاح') : tag('tr', 'لم ينجح')), dt(a.completedAt)]; })) : empty('لسه ما حاولتش.')) + '<div class="note i">النجاح من 70% فما فوق.</div></div>' +
      '<div class="card col" style="flex:1.4"><h3>الاختبار</h3>' + QUIZ.map(function (q, i) { return '<div><b>' + (i + 1) + '. ' + q[0] + '</b>' + q[1].map(function (o, j) { return '<label style="display:block;padding:4px 0"><input type="radio" name="q' + i + '" value="' + j + '"> ' + o + '</label>'; }).join('') + '</div>'; }).join('') + '<button class="btn" id="tr_go" style="width:max-content">إرسال الإجابات</button></div></div>');
    $('tr_go').onclick = function () {
      var right = 0;
      for (var i = 0; i < QUIZ.length; i++) { var c = document.querySelector('input[name=q' + i + ']:checked'); if (!c) return toast('جاوب على كل الأسئلة', true); if (+c.value === QUIZ[i][2]) right++; }
      var score = Math.round(right / QUIZ.length * 100);
      act($('tr_go'), function () { return api('/me/training/' + m.moduleId + '/attempts', { method: 'POST', body: { score: score } }); }, 'نتيجتك: ' + score + '%').then(volTraining);
    };
  }).catch(errBox);
}

/* ---------- disabled user ---------- */
var NEEDS = [['visual', 'بصرية'], ['motor', 'حركية'], ['hearing', 'سمعية']];
function duHome() {
  layout('home', 'أهلًا يا ' + (auth.displayName || ''), 'ملخص حسابك');
  api('/me/accessibility').catch(function (e) { return e.code === 'NOT_FOUND' ? null : Promise.reject(e); }).then(function (a) {
    var p = a && a.effectivePreset;
    body('<div class="row">' + kpi(a ? a.needTypes.map(function (n) { return (NEEDS.filter(function (x) { return x[0] === n; })[0] || [0, n])[1]; }).join(' + ') : 'لم تُحدد', 'احتياجاتي') + kpi(p ? Math.round(p.fontScale * 100) + '%' : '—', 'حجم الخط') + kpi(p ? (p.highContrast || p.theme === 'high_contrast' ? 'مفعّل' : 'متوقف') : '—', 'التباين العالي') + kpi(p ? p.interactionMode : '—', 'طريقة التفاعل') + '</div>' +
      '<div class="row"><div class="card"><h3>' + (a ? 'إعدادات الوصول مفعّلة' : 'ابدأ بتحديد احتياجك') + '</h3><p style="color:var(--muted)">' + (a ? 'الإعدادات بتتطبق على الشاشة دي تلقائيًا.' : 'اختار نوع الاحتياج عشان نظبط لك التطبيق.') + '</p><a class="btn" href="#/needs">' + (a ? 'تعديل' : 'تحديد الاحتياج') + '</a></div><div class="card"><h3>طلبات المساعدة</h3><p style="color:var(--muted)">قريبًا في المرحلة الثانية.</p><a class="btn g" href="#/requests">تفاصيل</a></div></div>');
  }).catch(errBox);
}
function duNeeds() {
  layout('needs', 'احتياجاتي وإعدادات الوصول', 'بتتطبق على كل الشاشات');
  api('/me/accessibility').catch(function (e) { return e.code === 'NOT_FOUND' ? null : Promise.reject(e); }).then(function (a) {
    a = a || { needType: 'visual', needTypes: ['visual'], theme: 'system', fontScale: 1, reducedMotion: false, interactionMode: 'touch', notificationMode: 'in_app', _new: true };
    var sel = a.needTypes.slice();
    body('<div class="row"><div class="card col" style="flex:1.3"><h3>نوع الاحتياج (من 1 إلى 3)</h3><div class="chips" id="ac_needs">' + NEEDS.map(function (n) { return '<span class="chip ' + (sel.indexOf(n[0]) >= 0 ? 'on' : '') + '" data-n="' + n[0] + '">' + n[1] + '</span>'; }).join('') + '</div><div class="lbl">أول واحد تختاره هو الأساسي.</div>' +
      '<label class="fld">المظهر<select id="ac_theme">' + [['system', 'حسب الجهاز'], ['light', 'فاتح'], ['dark', 'داكن'], ['high_contrast', 'تباين عالي']].map(function (o) { return '<option value="' + o[0] + '"' + (a.theme === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="fld">حجم الخط: <b id="ac_fv">' + Math.round(a.fontScale * 100) + '%</b><input type="range" id="ac_font" min="1" max="2" step="0.05" value="' + a.fontScale + '"></label>' +
      '<label><input type="checkbox" id="ac_rm"' + (a.reducedMotion ? ' checked' : '') + '> تقليل الحركة</label>' +
      '<label class="fld">طريقة التفاعل<select id="ac_im">' + [['touch', 'لمس'], ['keyboard', 'كيبورد'], ['screen_reader', 'قارئ شاشة'], ['voice', 'صوت']].map(function (o) { return '<option value="' + o[0] + '"' + (a.interactionMode === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="fld">طريقة الإشعارات<select id="ac_nm">' + [['in_app', 'داخل التطبيق'], ['push', 'إشعار'], ['visual_alert', 'تنبيه مرئي'], ['vibration', 'اهتزاز']].map(function (o) { return '<option value="' + o[0] + '"' + (a.notificationMode === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" id="ac_save">حفظ</button>' + (a._new ? '' : '<button class="btn g" id="ac_del">حذف إعداداتي (سحب الموافقة)</button>') + '</div></div>' +
      '<div class="card"><h3>معاينة</h3><div id="ac_prev" style="background:var(--teal);color:#fff;border-radius:20px;padding:24px;font-weight:800;line-height:1.6;font-size:' + (1.5 * a.fontScale) + 'rem">نص تجريبي بالإعدادات اللي اخترتها<br><span class="btn t">زرار</span></div></div></div>');
    document.querySelectorAll('#ac_needs .chip').forEach(function (c) {
      c.onclick = function () { var n = c.getAttribute('data-n'); var i = sel.indexOf(n); if (i >= 0) { if (sel.length > 1) sel.splice(i, 1); } else if (sel.length < 3) sel.push(n); document.querySelectorAll('#ac_needs .chip').forEach(function (x) { x.classList.toggle('on', sel.indexOf(x.getAttribute('data-n')) >= 0); }); };
    });
    $('ac_font').oninput = function () { $('ac_fv').textContent = Math.round(this.value * 100) + '%'; $('ac_prev').style.fontSize = (1.5 * this.value) + 'rem'; };
    $('ac_save').onclick = function () {
      act($('ac_save'), function () { return api('/me/accessibility', { method: 'PUT', body: { needType: sel[0], needTypes: sel, theme: $('ac_theme').value, fontScale: +$('ac_font').value, reducedMotion: $('ac_rm').checked, interactionMode: $('ac_im').value, notificationMode: $('ac_nm').value } }); }, 'تم الحفظ').then(function (r) { if (r && r.effectivePreset) applyA11y(r.effectivePreset); duNeeds(); });
    };
    if ($('ac_del')) $('ac_del').onclick = function () { if (!confirm('هتتمسح إعدادات الوصول بتاعتك. متأكد؟')) return; act($('ac_del'), function () { return api('/me/accessibility', { method: 'DELETE' }); }, 'تم الحذف').then(function () { applyA11y(null); duNeeds(); }); };
  }).catch(errBox);
}
var HCAT = { reading: 'قراءة', accompaniment: 'مرافقة', explanation: 'شرح', other: 'أخرى' };
var HSTAT = { open: ['tw', 'مفتوح'], assigned: ['tg', 'اتقبل'], in_progress: ['tg', 'شغال'], completed: ['tg', 'مكتمل'], cancelled: ['tn', 'ملغي'], canceled: ['tn', 'ملغي'] };
function hst(s) { var x = HSTAT[s]; return x ? tag(x[0], x[1]) : tag('tn', s || '—'); }
function reqCard(r, href) { return '<a class="card" href="' + href + '" style="display:block;color:inherit;text-decoration:none"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>' + esc(HCAT[r.category] || r.category) + '</b>' + hst(r.status) + (r.urgency === 'urgent' ? tag('tr', 'مستعجل') : '') + tag('tn', r.helpMode === 'field' ? 'ميداني' : 'أونلاين') + '</div><p style="margin:8px 0">' + esc(r.description || '') + '</p><small style="color:var(--muted)">' + esc(r.approximateArea) + ' · ' + dt(r.createdAt) + ' · ' + (r.offersCount || 0) + ' عرض</small></a>'; }
function duRequests() {
  layout('requests', 'طلبات المساعدة', 'اطلب مساعدة من متطوع معتمد', '<button class="btn" id="hr_new">+ طلب جديد</button>');
  $('hr_new').onclick = function () {
    var o = modal('<h3>طلب مساعدة جديد</h3><div class="col" style="gap:10px"><label class="fld">النوع<select id="hr_mode"><option value="online">أونلاين</option><option value="field">ميداني (وجهًا لوجه)</option></select></label><label class="fld">التصنيف<select id="hr_cat">' + Object.keys(HCAT).map(function (k) { return '<option value="' + k + '">' + HCAT[k] + '</option>'; }).join('') + '</select></label><label class="fld">وصف الطلب<textarea id="hr_desc" rows="3"></textarea></label><label class="fld">المنطقة التقريبية (من غير عنوان تفصيلي)<input id="hr_area" placeholder="مثال: مدينة نصر، القاهرة"></label><label class="fld">الاستعجال<select id="hr_urg"><option value="normal">عادي</option><option value="urgent">مستعجل</option></select></label><button class="btn" id="hr_go">إرسال الطلب</button></div>');
    $('hr_go').onclick = function () { act($('hr_go'), function () { return api('/help/requests', { method: 'POST', body: { helpMode: val('hr_mode'), category: val('hr_cat'), description: val('hr_desc') || null, approximateArea: val('hr_area'), urgency: val('hr_urg') } }); }, 'تم إرسال الطلب').then(function () { o.remove(); duRequests(); }, function () { }); };
  };
  api('/help/requests/mine?page=1&pageSize=50').then(function (r) {
    var l = items(r);
    body(l.length ? '<div class="col" style="gap:12px">' + l.map(function (x) { return reqCard(x, '#/request/' + x.requestId); }).join('') + '</div>' : empty('لسه مفيش طلبات. اضغط "طلب جديد".'));
  }).catch(errBox);
}
function volOpen() {
  layout('open', 'طلبات المساعدة المفتوحة', 'اختار طلب وقدّم عرضك');
  api('/help/requests/open?page=1&pageSize=50').then(function (r) {
    var l = items(r);
    body(l.length ? '<div class="col" style="gap:12px">' + l.map(function (x) { return reqCard(x, '#/request/' + x.requestId); }).join('') + '</div>' : empty('مفيش طلبات مفتوحة حاليًا. هيوصلك إشعار لما يجي طلب.'));
  }).catch(function (e) { body('<div class="note e">' + esc(e.message) + (auth.role === 'volunteer' ? ' (لازم حسابك يكون معتمد كمتطوع)' : '') + '</div>'); });
}
function volMine() {
  layout('mine', 'عروضي ومحادثاتي', 'الطلبات اللي اشتغلت عليها');
  api('/help/requests/mine?page=1&pageSize=50').then(function (r) {
    var l = items(r);
    body(l.length ? '<div class="col" style="gap:12px">' + l.map(function (x) { return reqCard(x, '#/request/' + x.requestId); }).join('') + '</div>' : empty('لسه ما قدمتش عروض.'));
  }).catch(errBox);
}
function requestPage(id) {
  var home = auth.role === 'volunteer' ? 'open' : 'requests';
  layout(home, 'تفاصيل الطلب', '');
  api('/help/requests/' + id).then(function (d) {
    var r = d.request, isDu = auth.role === 'disabled_user', mine = (d.assignedVolunteerName != null);
    var h = '<a href="#/' + home + '">← رجوع</a>' + reqCard(r, '#/request/' + id).replace('<a ', '<div ').replace('</a>', '</div>').replace(/href="[^"]*"/, '');
    if (isDu && r.status === 'open') {
      h += '<div class="card"><h3>العروض (' + d.offers.length + ')</h3>' + (d.offers.length ? d.offers.map(function (o) { return '<div style="padding:10px 0;border-top:1px solid var(--line,#eee)"><b>' + esc(o.volunteerName) + '</b> ' + (o.averageRating ? '⭐ ' + o.averageRating.toFixed(1) + ' (' + o.ratingsCount + ')' : '') + '<p>' + esc(o.message || '') + '</p><button class="btn s" data-acc="' + o.offerId + '">اقبل العرض</button></div>'; }).join('') : empty('لسه مفيش عروض.')) + '</div><button class="btn g" id="hr_cancel">إلغاء الطلب</button>';
    }
    if (!isDu && r.status === 'open') {
      h += r.hasOffered ? '<div class="note i">قدّمت عرض على الطلب ده، مستني رد صاحب الطلب.</div>' : '<div class="card col"><h3>قدّم عرضك</h3><label class="fld">رسالة قصيرة<textarea id="of_msg" rows="2"></textarea></label><button class="btn" id="of_go">إرسال العرض</button></div>';
    }
    if (d.chatOpen) {
      h += '<div class="card"><h3>المحادثة' + (d.assignedVolunteerName ? ' مع ' + esc(isDu ? d.assignedVolunteerName : r.requesterName) : '') + '</h3><div id="ch_list" class="col" style="gap:8px;max-height:320px;overflow:auto"></div><div style="display:flex;gap:8px;margin-top:10px"><input id="ch_txt" style="flex:1" placeholder="اكتب رسالة…"><button class="btn" id="ch_send">إرسال</button></div></div>';
      h += '<div class="card col"><h3>بعد المساعدة</h3>' + (isDu && r.status !== 'completed' ? '<button class="btn" id="hr_done">تم إنجاز المساعدة</button>' : '') + (r.status === 'completed' ? '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select id="fb_r"><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select><input id="fb_c" placeholder="تعليق (اختياري)" style="flex:1"><button class="btn s" id="fb_go">تقييم</button></div>' : '') + '<button class="btn g s" id="sr_go" style="width:max-content">إبلاغ عن مشكلة أمان</button></div>';
    }
    body('<div class="col" style="gap:12px">' + h + '</div>');
    document.querySelectorAll('[data-acc]').forEach(function (b) { b.onclick = function () { act(b, function () { return api('/help/requests/' + id + '/accept', { method: 'POST', body: { offerId: b.getAttribute('data-acc') } }); }, 'تم قبول العرض').then(function () { requestPage(id); }, function () { }); }; });
    if ($('hr_cancel')) $('hr_cancel').onclick = function () { if (!confirm('إلغاء الطلب؟')) return; act($('hr_cancel'), function () { return api('/help/requests/' + id + '/cancel', { method: 'POST' }); }, 'تم الإلغاء').then(function () { location.hash = '#/requests'; }, function () { }); };
    if ($('of_go')) $('of_go').onclick = function () { act($('of_go'), function () { return api('/help/requests/' + id + '/offers', { method: 'POST', body: { message: val('of_msg') || null } }); }, 'تم إرسال العرض').then(function () { requestPage(id); }, function () { }); };
    if ($('hr_done')) $('hr_done').onclick = function () { act($('hr_done'), function () { return api('/help/requests/' + id + '/complete', { method: 'POST' }); }, 'تم').then(function () { requestPage(id); }, function () { }); };
    if ($('fb_go')) $('fb_go').onclick = function () { act($('fb_go'), function () { return api('/help/requests/' + id + '/feedback', { method: 'POST', body: { rating: +val('fb_r'), comment: val('fb_c') || null } }); }, 'شكرًا على تقييمك').then(function () { $('fb_go').disabled = true; }, function () { }); };
    if ($('sr_go')) $('sr_go').onclick = function () { var t = prompt('اوصف المشكلة:'); if (!t) return; api('/help/requests/' + id + '/safety-report', { method: 'POST', body: { description: t } }).then(function () { toast('وصل بلاغك للإدارة'); }).catch(fail); };
    if (d.chatOpen) {
      var load = function () { api('/help/requests/' + id + '/messages').then(function (m) { var el = $('ch_list'); if (!el) return; el.innerHTML = items(m).map(function (x) { var me = x.senderId === auth.userId; return '<div style="align-self:' + (me ? 'flex-start' : 'flex-end') + ';background:' + (me ? '#E7F2ED' : '#FBF8F5') + ';border-radius:12px;padding:8px 12px;max-width:80%"><small style="color:var(--muted)">' + esc(x.senderName) + '</small><br>' + esc(x.text) + '</div>'; }).join('') || empty('ابدأ المحادثة.'); el.scrollTop = el.scrollHeight; }).catch(function () { }); };
      load();
      $('ch_send').onclick = function () { var t = val('ch_txt'); if (!t) return; act($('ch_send'), function () { return api('/help/requests/' + id + '/messages', { method: 'POST', body: { text: t } }); }).then(function () { $('ch_txt').value = ''; load(); }, function () { }); };
    }
  }).catch(errBox);
}

/* ---------- organization ---------- */
var DOCS = [['commercial_register', 'السجل التجاري'], ['tax_card', 'البطاقة الضريبية'], ['address_proof', 'إثبات العنوان'], ['license', 'ترخيص (اختياري)']];
function orgHome() {
  layout('home', 'أهلًا بـ ' + (auth.displayName || ''), auth.role === 'company' ? 'لوحة الشركة' : 'لوحة الجمعية');
  Promise.all([api('/me/organization'), api('/me/organization/review-status')]).then(function (r) {
    var o = r[0], s = r[1];
    var steps = [['بيانات الجهة', (o.profileCompletionPercent || 0) >= 100], ['اللوجو', !!o.logoUrl], ['المستندات المطلوبة', !(o.missingDocuments || []).length], ['الإرسال للمراجعة', !!s.reviewId], ['قرار الأدمن', o.approvalStatus === 'approved']];
    body('<div class="row">' + kpi(({ pending: 'قيد المراجعة', approved: 'معتمدة', rejected: 'مرفوضة' })[o.approvalStatus] || o.approvalStatus, 'حالة الاعتماد') + kpi((o.documents || []).filter(function (x) { return x.documentType !== 'license'; }).length + ' / 3', 'المستندات المطلوبة المرفوعة') + kpi((o.profileCompletionPercent || 0) + '%', 'اكتمال الملف') + '</div>' +
      '<div class="row"><div class="card" style="flex:1.4"><h3>خطوات الاعتماد</h3><div class="tl">' + steps.map(function (x) { return '<div>' + (x[1] ? '✓ ' : '') + (x[1] ? esc(x[0]) : '<b>' + esc(x[0]) + '</b>') + '<small>' + (x[1] ? 'تمت' : 'لسه') + '</small></div>'; }).join('') + '</div></div>' +
      '<div class="card"><h3>إجراءات سريعة</h3><div class="col" style="gap:10px"><a class="btn" href="#/org" style="text-align:center">تعديل البيانات</a><a class="btn g" href="#/docs" style="text-align:center">المستندات</a><a class="btn g" href="#/status" style="text-align:center">حالة الاعتماد</a></div></div></div>');
  }).catch(errBox);
}
function orgForm() {
  var isC = auth.role === 'company';
  layout('org', isC ? 'بيانات الشركة' : 'بيانات الجمعية', 'بتظهر للمتطوعين بعد الاعتماد');
  Promise.all([api('/me/organization'), meta('governorates'), meta('business-fields'), meta('employee-ranges')]).then(function (r) {
    var o = r[0], govs = r[1], bf = r[2], er = r[3];
    var opt = function (list, v, k) { return '<option value="">اختار</option>' + list.map(function (x) { return '<option value="' + esc(x.key) + '"' + (v === x.key || v === x.nameAr ? ' selected' : '') + '>' + esc(x.nameAr) + '</option>'; }).join(''); };
    body('<div class="card col"><div class="row"><label class="fld">الاسم<input id="og_name" value="' + esc(o.name) + '"></label><label class="fld">مجال النشاط<select id="og_field">' + opt(bf, o.field) + '</select></label><label class="fld">الموقع الإلكتروني<input id="og_web" dir="ltr" value="' + esc(o.website) + '" placeholder="https://"></label></div><label class="fld">الوصف<textarea id="og_desc">' + esc(o.description) + '</textarea></label><div class="row"><label class="fld">المحافظة<select id="og_gov">' + opt(govs, o.governorate) + '</select></label><label class="fld">المدينة / المنطقة<select id="og_city"></select></label><label class="fld">عدد العاملين<select id="og_emp">' + opt(er, o.employeeCountRange) + '</select></label></div><label class="fld">وسيلة التواصل<input id="og_contact" value="' + esc(o.contactInformation) + '"></label><button class="btn" id="og_save" style="width:max-content">حفظ</button></div>');
    var fill = function () { var g = govs.filter(function (x) { return x.key === $('og_gov').value; })[0]; $('og_city').innerHTML = '<option value="">اختار</option>' + (g ? g.areas : []).map(function (a) { return '<option value="' + esc(a.key) + '"' + (o.city === a.key || o.city === a.nameAr ? ' selected' : '') + '>' + esc(a.nameAr) + '</option>'; }).join(''); };
    $('og_gov').onchange = fill; fill();
    $('og_save').onclick = function () { act($('og_save'), function () { return api('/me/organization', { method: 'PUT', body: { name: val('og_name'), field: $('og_field').value || null, description: val('og_desc') || null, governorate: $('og_gov').value || null, city: $('og_city').value || null, website: val('og_web') || null, employeeCountRange: $('og_emp').value || null, contactInformation: val('og_contact') || null } }); }, 'تم الحفظ'); };
  }).catch(errBox);
}
function orgMedia() {
  layout('media', 'اللوجو والغلاف', '');
  api('/me/organization').then(function (o) {
    body('<div class="card"><div class="cover">' + (o.coverUrl ? '<img src="' + esc(media(o.coverUrl)) + '" alt="">' : '<div class="ph" style="height:100%">صورة الغلاف</div>') + '</div><div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><div class="logo-sm">' + (o.logoUrl ? '<img src="' + esc(media(o.logoUrl)) + '" alt="">' : 'لوجو') + '</div><label class="btn g s">تغيير اللوجو<input type="file" id="md_logo" accept="image/png,image/jpeg" hidden></label><label class="btn g s">تغيير الغلاف<input type="file" id="md_cover" accept="image/png,image/jpeg" hidden></label></div><p style="color:var(--muted);font-size:13px">PNG أو JPG حتى 5MB. اللوجو مطلوب قبل الإرسال للمراجعة.</p></div>');
    var up = function (id, path) { $(id).onchange = function () { var f = this.files[0]; if (!f) return; var fd = new FormData(); fd.append('file', f); api(path, { method: 'PUT', form: fd }).then(function () { toast('تم الرفع'); orgMedia(); }).catch(fail); }; };
    up('md_logo', '/me/organization/logo'); up('md_cover', '/me/organization/cover');
  }).catch(errBox);
}
function orgDocs() {
  layout('docs', 'المستندات', 'ارفع المطلوب وابعت للمراجعة');
  api('/me/organization').then(function (o) {
    var have = {}; (o.documents || []).forEach(function (x) { have[x.documentType] = x.uploadedAt; });
    body('<div class="row">' + DOCS.map(function (dd) { return '<div class="card col"><div class="ph">' + dd[1] + '</div>' + (have[dd[0]] ? tag('tg', 'مرفوع · ' + d(have[dd[0]])) : tag(dd[0] === 'license' ? 'tn' : 'tw', dd[0] === 'license' ? 'اختياري' : 'مطلوب')) + '<label class="btn g s" style="text-align:center">' + (have[dd[0]] ? 'استبدال' : 'رفع') + '<input type="file" hidden accept=".pdf,image/png,image/jpeg" data-doc="' + dd[0] + '"></label></div>'; }).join('') + '</div><div class="card" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap"><span style="flex:1">لما تخلص البيانات واللوجو والمستندات، ابعت الطلب للأدمن.' + ((o.missingDocuments || []).length ? '<br><small style="color:var(--muted)">ناقص: ' + o.missingDocuments.map(function (m) { return esc((DOCS.filter(function (x) { return x[0] === m; })[0] || [0, m])[1]); }).join('، ') + '</small>' : '') + '</span><button class="btn" id="dc_sub"' + (o.canSubmit ? '' : ' disabled') + '>' + (!o.canSubmit && !(o.missingDocuments || []).length ? 'تم الإرسال' : 'إرسال للمراجعة') + '</button></div>');
    document.querySelectorAll('input[data-doc]').forEach(function (i) { i.onchange = function () { var f = i.files[0]; if (!f) return; var fd = new FormData(); fd.append('file', f); api('/me/organization/documents/' + i.getAttribute('data-doc'), { method: 'PUT', form: fd }).then(function () { toast('تم الرفع'); orgDocs(); }).catch(fail); }; });
    $('dc_sub').onclick = function () { act($('dc_sub'), function () { return api('/me/organization/submit', { method: 'POST' }); }, 'تم إرسال الطلب').then(function () { location.hash = '#/status'; }); };
  }).catch(errBox);
}
function orgStatus() {
  layout('status', 'حالة الاعتماد', '');
  api('/me/organization/review-status').then(function (s) {
    var ap = s.approvalStatus;
    body('<div class="row"><div class="card" style="text-align:center;padding:28px"><div class="ph" style="width:100px;height:100px;border-radius:50%;margin:auto;font-size:38px">' + (ap === 'approved' ? '✓' : ap === 'rejected' ? '✗' : '⏳') + '</div><h3 style="margin-top:14px">' + ({ approved: 'معتمدة', rejected: 'مرفوضة', pending: s.reviewId ? 'قيد المراجعة' : 'لم تُرسل بعد' })[ap] + '</h3><div style="color:var(--muted)">' + (s.requestedAt ? 'أُرسل الطلب ' + dt(s.requestedAt) : 'لسه ما بعتّش الطلب') + (s.decidedAt ? '<br>القرار: ' + dt(s.decidedAt) : '') + '</div></div><div class="col">' +
      (s.decisionNotes ? '<div class="card"><h3>ملاحظات الأدمن</h3><p style="margin:0">' + esc(s.decisionNotes) + '</p></div>' : '') + ((s.missingDocuments || []).length ? '<div class="note w">مستندات ناقصة: ' + s.missingDocuments.map(function (m) { return esc((DOCS.filter(function (x) { return x[0] === m; })[0] || [0, m])[1]); }).join('، ') + '</div>' : '') +
      '<div class="card"><h3>لو اترفض</h3><p style="margin:0;color:var(--muted)">تقدر تعدّل البيانات والمستندات وتعيد الإرسال.</p><div style="margin-top:10px"><a class="btn g" href="#/docs">المستندات</a></div></div></div></div>');
  }).catch(errBox);
}

/* ---------- admin ---------- */
function admHome() {
  layout('home', 'أهلًا يا مدير 👋', 'ملخص اليوم');
  var c = function (p) { return api(p).then(function (r) { return r && r.totalCount != null ? r.totalCount : items(r).length; }).catch(function () { return '—'; }); };
  Promise.all([c('/admin/volunteer-reviews?status=pending&pageSize=1'), c('/admin/organization-reviews?status=pending&pageSize=1'), c('/admin/deletion-requests?status=pending&pageSize=1'), c('/admin/interview-slots'), api('/landing/stats', { anon: true }).catch(function () { return null; }), api('/admin/volunteer-reviews?pageSize=5').catch(function () { return {}; }), api('/admin/organization-reviews?pageSize=5').catch(function () { return {}; })]).then(function (r) {
    var ls = r[4] || {};
    body('<div class="row">' + kpi(r[0], 'متطوعون بانتظار المراجعة') + kpi(r[1], 'جهات بانتظار الاعتماد') + kpi(r[2], 'طلبات حذف مفتوحة') + kpi(r[3], 'مواعيد المقابلات') + '</div><div class="row">' + kpi(ls.interests != null ? ls.interests : '—', 'طلبات اهتمام من الموقع') + kpi(ls.subscribers != null ? ls.subscribers : '—', 'مشتركو التحديثات') + '</div>' +
      '<div class="row"><div class="card"><h3>آخر طلبات المتطوعين</h3>' + (table(['الاسم', 'الحالة', ''], items(r[5]).map(function (x) { return [esc(x.volunteerName || x.email), st(x.status), '<a href="#/vreview/' + x.reviewId + '">مراجعة</a>']; })) || empty('مفيش.')) + '</div><div class="card"><h3>آخر طلبات الجهات</h3>' + (table(['الجهة', 'الحالة', ''], items(r[6]).map(function (x) { return [esc(x.organizationName), st(x.status), '<a href="#/oreview/' + x.reviewId + '">مراجعة</a>']; })) || empty('مفيش.')) + '</div></div>');
  }).catch(errBox);
}
var fl = { v: '', o: '', dl: '' };
function admList(kind, page, title) {
  layout(page, title, 'التحقق والاعتماد');
  var key = kind === 'volunteer' ? 'v' : 'o';
  var tabs = [['', 'الكل'], ['pending', 'قيد المراجعة'], ['approved', 'مقبول'], ['rejected', 'مرفوض']];
  api('/admin/' + kind + '-reviews?pageSize=50' + (fl[key] ? '&status=' + fl[key] : '')).then(function (r) {
    var l = items(r);
    body('<div class="tabs">' + tabs.map(function (t) { return '<span class="' + (fl[key] === t[0] ? 'on' : '') + '" data-s="' + t[0] + '">' + t[1] + '</span>'; }).join('') + '</div><div class="card">' +
      (l.length ? (kind === 'volunteer' ? table(['المتطوع', 'البريد', 'موعد المقابلة', 'الحالة', ''], l.map(function (x) { return [esc(x.volunteerName || '—'), '<span dir="ltr">' + esc(x.email) + '</span>', dt(x.interviewAt), st(x.status), '<a class="btn s" href="#/vreview/' + x.reviewId + '">مراجعة</a>']; })) :
        table(['الجهة', 'النوع', 'الحالة', 'تاريخ الطلب', ''], l.map(function (x) { return [esc(x.organizationName), x.organizationType === 'company' ? 'شركة' : 'جمعية', st(x.status), d(x.requestedAt), '<a class="btn s" href="#/oreview/' + x.reviewId + '">مراجعة</a>']; }))) : empty('مفيش طلبات.')) + '</div>');
    document.querySelectorAll('.tabs span').forEach(function (e) { e.onclick = function () { fl[key] = e.getAttribute('data-s'); admList(kind, page, title); }; });
  }).catch(errBox);
}
function evUrl(u) { return u ? media(u) : ''; }
function decisionBox(kind, id, needNotes) {
  return '<div class="card col"><h3>القرار</h3><label class="fld">ملاحظات' + (needNotes ? ' (مطلوبة عند الرفض)' : ' (اختياري)') + '<textarea id="dc_notes"></textarea></label><div style="display:flex;gap:10px"><button class="btn" id="dc_ok" style="flex:1">' + (kind === 'volunteer' ? 'قبول' : 'اعتماد الجهة') + '</button><button class="btn o" id="dc_no" style="flex:1">رفض</button></div><div class="lbl">القرار بيتسجل في سجل العمليات ويوصل صاحب الحساب كإشعار.</div></div>';
}
function bindDecision(kind, id, back) {
  var go = function (approve) {
    if (!approve && kind === 'organization' && !val('dc_notes')) return toast('اكتب سبب الرفض', true);
    if (!confirm(approve ? 'تأكيد القبول؟' : 'تأكيد الرفض؟')) return;
    act(approve ? $('dc_ok') : $('dc_no'), function () { return api('/admin/' + kind + '-reviews/' + id + '/decision', { method: 'POST', body: { approve: approve, notes: val('dc_notes') || null } }); }, 'تم تسجيل القرار').then(function () { location.hash = back; });
  };
  $('dc_ok').onclick = function () { go(true); }; $('dc_no').onclick = function () { go(false); };
}
function admVReview(id) {
  layout('vreviews', 'تفاصيل متطوع', '', '<a class="btn g" href="#/vreviews">رجوع</a>');
  api('/admin/volunteer-reviews/' + id).then(function (v) {
    body('<div class="row"><div class="col" style="flex:1.5"><div class="card"><div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><div class="av" style="width:60px;height:60px;font-size:24px">' + esc((v.volunteerName || '؟').slice(0, 1)) + '</div><div style="flex:1"><div style="font-size:20px;font-weight:800">' + esc(v.volunteerName || '—') + '</div><div style="color:var(--muted)" dir="ltr">' + esc(v.email) + ' · ' + esc(v.phone || '') + '</div></div>' + st(v.status) + '</div><div class="row" style="margin-top:12px"><div class="fld">نوع المساعدة<b>' + esc(v.helpMode === 'online_and_field' ? 'أونلاين وميداني' : 'أونلاين') + '</b></div><div class="fld">منطقة الخدمة<b>' + esc(v.serviceArea) + '</b></div><div class="fld">المستوى<b>' + esc(v.skillLevel) + '</b></div><div class="fld">ساعات أسبوعيًا<b>' + esc(v.weeklyHours) + '</b></div></div></div>' +
      '<div class="card"><h3>الأدلة (روابط مؤقتة 10 دقائق)</h3><div class="row">' + (v.evidence || []).map(function (e) { return '<div class="col" style="gap:6px"><div class="ph"><img src="' + esc(evUrl(e.shortLivedUrl)) + '" alt=""></div><a href="' + esc(evUrl(e.shortLivedUrl)) + '" target="_blank" rel="noopener">' + esc((EVID.filter(function (x) { return x[0] === e.evidenceType; })[0] || [0, e.evidenceType])[1]) + '</a></div>'; }).join('') + '</div></div>' +
      '<div class="card"><h3>حسابات التواصل</h3>' + ((v.socialLinks || []).map(function (s) { return '<div><b>' + esc(s.platform) + '</b> <a dir="ltr" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.url) + '</a></div>'; }).join('') || '—') + '</div></div>' +
      '<div class="col"><div class="card"><h3>المقابلة</h3>' + dt(v.interviewAt) + '</div>' + decisionBox('volunteer', id, false) + '</div></div>');
    bindDecision('volunteer', id, '#/vreviews');
  }).catch(errBox);
}
function admOReview(id) {
  layout('oreviews', 'تفاصيل جهة', '', '<a class="btn g" href="#/oreviews">رجوع</a>');
  api('/admin/organization-reviews/' + id).then(function (o) {
    body('<div class="row"><div class="col" style="flex:1.5"><div class="card"><div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><div style="flex:1"><div style="font-size:20px;font-weight:800">' + esc(o.organizationName) + '</div><div style="color:var(--muted)">' + (o.organizationType === 'company' ? 'شركة' : 'جمعية') + ' · ' + esc(o.field || '') + '</div></div>' + st(o.status) + '</div><p style="color:var(--muted);line-height:1.9">' + esc(o.description || '') + '</p><div class="row"><div class="fld">المحافظة<b>' + esc(o.governorate || '—') + '</b></div><div class="fld">المدينة<b>' + esc(o.city || '—') + '</b></div><div class="fld">الموقع<b dir="ltr">' + esc(o.website || '—') + '</b></div><div class="fld">التواصل<b>' + esc(o.contactInformation || '—') + '</b></div></div></div>' +
      '<div class="card"><h3>المستندات (روابط مؤقتة 10 دقائق)</h3><div class="row">' + (o.documents || []).map(function (x) { return '<div class="col" style="gap:6px"><div class="ph">' + esc((DOCS.filter(function (z) { return z[0] === x.documentType; })[0] || [0, x.documentType])[1]) + '</div><a class="btn g s" style="text-align:center" href="' + esc(evUrl(x.shortLivedUrl)) + '" target="_blank" rel="noopener">فتح</a></div>'; }).join('') + '</div></div></div><div class="col">' + (o.decisionNotes ? '<div class="note i">ملاحظات سابقة: ' + esc(o.decisionNotes) + '</div>' : '') + decisionBox('organization', id, true) + '</div></div>');
    if (o.ownerUserId) { var hb = document.querySelector('.top'); if (hb) { var sb = document.createElement('button'); sb.className = 'btn g'; sb.textContent = 'إيقاف حساب الجهة'; sb.onclick = function () { A.suspend(o.ownerUserId, o.organizationName || '', true); }; hb.appendChild(sb); } }
    bindDecision('organization', id, '#/oreviews');
  }).catch(errBox);
}
function admSlots() {
  layout('slots', 'مواعيد المقابلات', 'إضافة وحذف المواعيد المتاحة');
  api('/admin/interview-slots').then(function (r) {
    var l = items(r).sort(function (a, b) { return new Date(a.startsAt) - new Date(b.startsAt); });
    body('<div class="row"><div class="card" style="flex:2">' + (l.length ? table(['الموعد', 'المدة', 'الحالة', ''], l.map(function (s) { return [dt(s.startsAt), s.durationMinutes + ' د', st(s.status), s.status === 'available' ? '<button class="btn s g" onclick="A.slotDel(\'' + s.interviewSlotId + '\',this)">حذف</button>' : '']; })) : empty('مفيش مواعيد.')) + '</div><div class="card col"><h3>إضافة موعد</h3><label class="fld">التاريخ والوقت<input type="datetime-local" id="sl_when"></label><label class="fld">المدة (دقيقة)<input type="number" id="sl_dur" value="30" min="10" max="240"></label><button class="btn" id="sl_add">إضافة</button><div class="lbl">المواعيد المحجوزة لا تُحذف.</div></div></div>');
    $('sl_add').onclick = function () { var w = $('sl_when').value; if (!w) return toast('اختار الوقت', true); act($('sl_add'), function () { return api('/admin/interview-slots', { method: 'POST', body: { startsAt: new Date(w).toISOString(), durationMinutes: +val('sl_dur') || 30 } }); }, 'تمت الإضافة').then(admSlots); };
  }).catch(errBox);
}
A.slotDel = function (id, b) { if (!confirm('حذف الموعد؟')) return; act(b, function () { return api('/admin/interview-slots/' + id, { method: 'DELETE' }); }, 'تم الحذف').then(admSlots); };
var uf = { role: '', status: '', q: '' };
function admUsers() {
  layout('users', 'المستخدمون', 'إيقاف وإعادة تفعيل الحسابات');
  var qs = '?pageSize=100' + (uf.role ? '&role=' + uf.role : '') + (uf.status ? '&status=' + uf.status : '') + (uf.q ? '&search=' + encodeURIComponent(uf.q) : '');
  api('/admin/users' + qs).then(function (r) {
    var l = items(r);
    var opt = function (o, cur) { return o.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === cur ? ' selected' : '') + '>' + x[1] + '</option>'; }).join(''); };
    var bar = '<div class="card" style="display:flex;gap:10px;flex-wrap:wrap"><input id="uf_q" placeholder="بحث بالاسم أو البريد" value="' + esc(uf.q) + '" style="flex:1;min-width:160px"><select id="uf_r">' + opt([['', 'كل الأنواع'], ['volunteer', 'متطوع'], ['disabled_user', 'صاحب همة'], ['association', 'جمعية'], ['company', 'شركة'], ['admin', 'مدير']], uf.role) + '</select><select id="uf_s">' + opt([['', 'كل الحالات'], ['active', 'نشط'], ['suspended', 'موقوف']], uf.status) + '</select><button class="btn" id="uf_go">بحث</button></div>';
    body(bar + '<div class="card">' + (l.length ? table(['المستخدم', 'النوع', 'البريد', 'الحالة', 'الإجراء'], l.map(function (x) { var nm = esc((x.displayName || x.email).replace(/[\'"]/g, '')); var sus = x.accountStatus === 'suspended'; return [esc(x.displayName || '—'), esc(ROLE_AR[x.role] || x.role), '<span dir="ltr">' + esc(x.email) + '</span>', sus ? tag('tr', 'موقوف') : tag('tg', 'نشط'), x.role === 'admin' ? '—' : (sus ? '<button class="btn s" onclick="A.suspend(\'' + x.userId + '\',\'\',false)">إعادة تفعيل</button>' : '<button class="btn s g" onclick="A.suspend(\'' + x.userId + '\',\'' + nm + '\',true)">إيقاف</button>')]; })) : empty('مفيش مستخدمين بالمواصفات دي.')) + '</div>');
    var go = function () { uf.q = val('uf_q'); uf.role = val('uf_r'); uf.status = val('uf_s'); admUsers(); };
    $('uf_go').onclick = go; $('uf_q').onkeydown = function (e) { if (e.key === 'Enter') go(); };
  }).catch(errBox);
}
A.suspend = function (id, name, on) {
  if (!on) { if (!confirm('إعادة تفعيل الحساب؟')) return; api('/admin/users/' + id + '/suspension', { method: 'PUT', body: { suspend: false } }).then(function () { toast('تمت إعادة التفعيل'); }).catch(fail); return; }
  modal('<h3>إيقاف حساب ' + esc(name) + '؟</h3><div style="color:var(--muted)">هيتسجّل خروجه ومش هيقدر يدخل لحد ما تعيد تفعيله. السبب بيظهر في سجل العمليات.</div><label class="fld">السبب (مطلوب)<textarea id="su_r"></textarea></label><div style="display:flex;gap:10px"><button class="btn o" id="su_ok" style="flex:1">تأكيد الإيقاف</button><button class="btn g" onclick="A.closeModal()" style="flex:1">إلغاء</button></div>');
  $('su_ok').onclick = function () { if (!val('su_r')) return toast('اكتب السبب', true); act(this, function () { return api('/admin/users/' + id + '/suspension', { method: 'PUT', body: { suspend: true, reason: val('su_r') } }); }, 'تم الإيقاف').then(A.closeModal); };
};
function admDeletions() {
  layout('deletions', 'طلبات حذف الحساب', 'حق المستخدم في حذف بياناته');
  api('/admin/deletion-requests?pageSize=50' + (fl.dl ? '&status=' + fl.dl : '')).then(function (r) {
    var l = items(r);
    body('<div class="tabs">' + [['', 'الكل'], ['pending', 'مفتوح'], ['approved', 'تم'], ['rejected', 'مرفوض']].map(function (t) { return '<span class="' + (fl.dl === t[0] ? 'on' : '') + '" data-s="' + t[0] + '">' + t[1] + '</span>'; }).join('') + '</div><div class="card">' + (l.length ? table(['الحساب', 'الحالة', 'تاريخ الطلب', 'الإجراء'], l.map(function (x) { return ['<span dir="ltr">' + esc(x.email) + '</span>', st(x.status), d(x.requestedAt), x.status === 'pending' ? '<button class="btn s" onclick="A.resolve(\'' + x.deletionRequestId + '\',true)">موافقة</button> <button class="btn s o" onclick="A.resolve(\'' + x.deletionRequestId + '\',false)">رفض</button>' : '—']; })) : empty('مفيش طلبات.')) + '</div><div class="note w">الموافقة على الحذف نهائية ولا يمكن التراجع عنها.</div>');
    document.querySelectorAll('.tabs span').forEach(function (e) { e.onclick = function () { fl.dl = e.getAttribute('data-s'); admDeletions(); }; });
  }).catch(errBox);
}
A.resolve = function (id, ok) { if (!confirm(ok ? 'موافقة نهائية على الحذف؟ ما فيش رجوع.' : 'رفض الطلب؟')) return; api('/admin/deletion-requests/' + id + '/resolve', { method: 'POST', body: { approve: ok } }).then(function () { toast('تم'); admDeletions(); }).catch(fail); };
var leadTab = 'interests';
function admLeads() {
  layout('leads', 'طلبات صفحة اللاندنج', 'من نماذج الموقع العام');
  api('/landing/admin/' + leadTab).then(function (l) {
    l = items(l);
    var heads = { interests: ['الاسم', 'الدور', 'البريد', 'الهاتف', 'المدينة', 'ملاحظة', 'التاريخ'], messages: ['الاسم', 'البريد', 'الرسالة', 'التاريخ'], subscribers: ['البريد', 'التاريخ'] }[leadTab];
    var rows = l.map(function (x) { return ({ interests: [x.name, ROLE_AR[x.role] || x.role, x.email, x.phone, x.city, x.note, dt(x.createdAt)], messages: [x.name, x.email, x.message, dt(x.createdAt)], subscribers: [x.email, dt(x.createdAt)] })[leadTab].map(function (c) { return esc(c == null ? '' : c); }); });
    body('<div class="tabs">' + [['interests', 'اهتمام بالانضمام'], ['messages', 'رسائل التواصل'], ['subscribers', 'المشتركون']].map(function (t) { return '<span class="' + (leadTab === t[0] ? 'on' : '') + '" data-s="' + t[0] + '">' + t[1] + '</span>'; }).join('') + '</div><div class="card">' + (table(heads, rows) || empty('مفيش بيانات.')) + '</div>');
    document.querySelectorAll('.tabs span').forEach(function (e) { e.onclick = function () { leadTab = e.getAttribute('data-s'); admLeads(); }; });
  }).catch(errBox);
}
function admAudit() {
  layout('audit', 'سجل العمليات', 'كل قرار إداري مسجَّل');
  api('/admin/audit?pageSize=100').then(function (r) {
    var l = items(r);
    body('<div class="card">' + (l.length ? table(['الوقت', 'العملية', 'الهدف', 'النتيجة'], l.map(function (x) { return [dt(x.occurredAt), esc(x.action), esc(x.targetType) + ' <small dir="ltr">' + esc(String(x.targetId || '').slice(0, 8)) + '</small>', x.outcome === 'success' ? tag('tg', 'نجحت') : tag('tr', 'فشلت')]; })) : empty('مفيش عمليات.')) + '</div>');
  }).catch(errBox);
}

/* ---------- router ---------- */
var PAGES = {
  volunteer: { home: volHome, verification: volVerification, interview: volInterview, availability: volAvailability, training: volTraining, open: volOpen, mine: volMine, profile: profilePage, notifications: notificationsPage, settings: settingsPage },
  disabled_user: { home: duHome, needs: duNeeds, requests: duRequests, profile: profilePage, notifications: notificationsPage, settings: settingsPage },
  association: { home: orgHome, org: orgForm, media: orgMedia, docs: orgDocs, status: orgStatus, notifications: notificationsPage, settings: settingsPage },
  company: { home: orgHome, org: orgForm, media: orgMedia, docs: orgDocs, status: orgStatus, notifications: notificationsPage, settings: settingsPage },
  admin: { home: admHome, vreviews: function () { admList('volunteer', 'vreviews', 'مراجعة المتطوعين'); }, oreviews: function () { admList('organization', 'oreviews', 'مراجعة الجمعيات والشركات'); }, slots: admSlots, users: admUsers, deletions: admDeletions, leads: admLeads, audit: admAudit, notifications: notificationsPage, settings: settingsPage }
};
function route() {
  var h = (location.hash || '').replace(/^#\/?/, '');
  var parts = h.split('/'); var p = parts[0] || '';
  if (!auth) {
    if (p === 'register') return registerPage();
    if (p === 'forgot') return forgotPage();
    if (p === 'reset') return resetPage();
    return loginPage();
  }
  if (p === 'login' || p === 'register' || p === 'forgot' || !p) { location.hash = '#/home'; return; }
  if (p === 'request' && parts[1] && (auth.role === 'volunteer' || auth.role === 'disabled_user')) return loadUnread().then(function () { requestPage(parts[1]); }, function () { requestPage(parts[1]); });
  if (auth.role === 'admin' && p === 'vreview') return admVReview(parts[1]);
  if (auth.role === 'admin' && p === 'oreview') return admOReview(parts[1]);
  var fn = (PAGES[auth.role] || {})[p];
  if (!fn) { location.hash = '#/home'; return; }
  loadUnread().then(fn, fn);
}
window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', function (e) { e.preventDefault(); });
(function boot() {
  if (!auth) { route(); return; }
  api('/auth/session').then(function (s) {
    if (s) { auth.role = s.role || auth.role; auth.displayName = s.displayName || auth.displayName; save(); }
    return auth.role === 'disabled_user' ? api('/me/accessibility').then(function (a) { applyA11y(a && a.effectivePreset); }).catch(function () { }) : null;
  }).catch(function () { if (!auth) return; }).then(route);
})();
})();
