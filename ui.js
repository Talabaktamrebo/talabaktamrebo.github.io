/* ============================================================
   طلبك تم — نظام النوافذ والتنبيهات (بديل alert / confirm / prompt)
   نوافذ HTML أنيقة بستايل الموقع، أيقونات SVG، بلا إيموجي.
   واجهة: window.uiToast / uiAlert / uiConfirm / uiForm
   ============================================================ */
(function () {
  'use strict';
  if (window.uiToast) return; // حقن مرّة واحدة

  var I = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    question:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    close:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
  };
  var COLOR = { success: '#16a34a', error: '#ef4444', info: '#F6921E', question: '#F6921E' };

  var css = ''
    + '.u-ov{position:fixed;inset:0;z-index:12000;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;padding:16px;direction:rtl;font-family:inherit}'
    + '.u-ov.show{display:flex}'
    + '.u-card{background:#fff;border-radius:20px;width:100%;max-width:380px;padding:26px 22px;box-shadow:0 30px 80px rgba(0,0,0,.32);text-align:center;animation:uPop .2s ease}'
    + '@keyframes uPop{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}'
    + '.u-ic{width:62px;height:62px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}'
    + '.u-ic svg{width:32px;height:32px}'
    + '.u-title{font-size:1.18rem;font-weight:800;color:#0f172a;margin:0 0 6px}'
    + '.u-msg{font-size:.92rem;color:#64748b;line-height:1.7;margin:0 0 20px;white-space:pre-line}'
    + '.u-acts{display:flex;gap:10px}'
    + '.u-btn{flex:1;padding:13px;border:none;border-radius:13px;font-size:.96rem;font-weight:800;cursor:pointer;font-family:inherit;transition:opacity .15s,background .15s}'
    + '.u-btn:hover{opacity:.92}'
    + '.u-btn.primary{background:#F6921E;color:#fff}'
    + '.u-btn.danger{background:#ef4444;color:#fff}'
    + '.u-btn.ghost{background:#f1f5f9;color:#475569}'
    /* الحقول داخل نافذة النموذج */
    + '.u-form{text-align:right;margin-bottom:18px}'
    + '.u-field{margin-bottom:12px}'
    + '.u-field label{display:block;font-size:.8rem;font-weight:700;color:#334155;margin-bottom:6px}'
    + '.u-field input{width:100%;box-sizing:border-box;padding:12px 13px;border:1.5px solid #e2e8f0;border-radius:11px;font-size:.93rem;font-family:inherit;outline:none;transition:border-color .15s}'
    + '.u-field input:focus{border-color:#F6921E}'
    /* التنبيهات (Toasts) */
    + '.u-toasts{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:12500;display:flex;flex-direction:column;gap:10px;align-items:center;pointer-events:none;direction:rtl;font-family:inherit;width:calc(100% - 32px);max-width:420px}'
    + '.u-toast{display:flex;align-items:center;gap:11px;background:#fff;border-radius:14px;padding:13px 16px;box-shadow:0 12px 40px rgba(0,0,0,.18);font-size:.9rem;font-weight:700;color:#0f172a;width:100%;box-sizing:border-box;border-right:5px solid #94a3b8;animation:uSlide .25s ease}'
    + '@keyframes uSlide{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}'
    + '.u-toast.out{opacity:0;transform:translateY(-14px);transition:.25s}'
    + '.u-toast .ti{width:24px;height:24px;flex-shrink:0}.u-toast .ti svg{width:24px;height:24px}'
    + '.u-toast .tx{flex:1;line-height:1.5}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var ov = document.createElement('div'); ov.className = 'u-ov'; ov.id = 'uOv';
  ov.innerHTML = '<div class="u-card" id="uCard"></div>';
  var toasts = document.createElement('div'); toasts.className = 'u-toasts'; toasts.id = 'uToasts';
  function mount() { document.body.appendChild(ov); document.body.appendChild(toasts); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
  var _resolve = null;
  function close(val) { ov.classList.remove('show'); var r = _resolve; _resolve = null; if (r) r(val); }

  // نافذة عامّة (alert/confirm)
  function modal(opts) {
    return new Promise(function (resolve) {
      _resolve = resolve;
      var type = opts.type || 'info';
      var col = COLOR[type] || COLOR.info;
      var btns = opts.buttons.map(function (b) {
        return '<button class="u-btn ' + (b.cls || 'primary') + '" data-v="' + b.val + '">' + esc(b.text) + '</button>';
      }).join('');
      document.getElementById('uCard').innerHTML =
        '<div class="u-ic" style="background:' + col + '1a;color:' + col + '">' + (I[type] || I.info) + '</div>'
        + (opts.title ? '<h3 class="u-title">' + esc(opts.title) + '</h3>' : '')
        + '<p class="u-msg">' + esc(opts.msg) + '</p>'
        + '<div class="u-acts">' + btns + '</div>';
      ov.classList.add('show');
      var nodes = document.querySelectorAll('#uCard .u-btn');
      nodes.forEach(function (n) { n.onclick = function () { close(n.getAttribute('data-v') === 'true' ? true : (n.getAttribute('data-v') === 'false' ? false : n.getAttribute('data-v'))); }; });
    });
  }

  window.uiAlert = function (msg, opts) {
    opts = opts || {};
    return modal({ type: opts.type || 'info', title: opts.title || '', msg: msg, buttons: [{ text: opts.okText || 'حسناً', cls: 'primary', val: 'true' }] });
  };
  window.uiConfirm = function (msg, opts) {
    opts = opts || {};
    return modal({
      type: opts.type || 'question', title: opts.title || 'تأكيد', msg: msg,
      buttons: [
        { text: opts.cancelText || 'إلغاء', cls: 'ghost', val: 'false' },
        { text: opts.okText || 'تأكيد', cls: opts.danger ? 'danger' : 'primary', val: 'true' }
      ]
    });
  };

  // نافذة نموذج (بديل prompt المتعدّد)
  window.uiForm = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      _resolve = resolve;
      var fields = (opts.fields || []).map(function (f) {
        return '<div class="u-field"><label>' + esc(f.label) + (f.optional ? ' <span style="color:#94a3b8;font-weight:600">(اختياري)</span>' : '') + '</label>'
          + '<input id="uF_' + f.id + '" type="' + (f.type || 'text') + '" value="' + esc(f.value == null ? '' : f.value) + '" placeholder="' + esc(f.placeholder || '') + '"'
          + (f.numeric ? ' inputmode="numeric" dir="ltr" oninput="this.value=this.value.replace(/[^0-9]/g,\'\')"' : '') + '></div>';
      }).join('');
      document.getElementById('uCard').innerHTML =
        '<div class="u-ic" style="background:#F6921E1a;color:#F6921E">' + I.info + '</div>'
        + (opts.title ? '<h3 class="u-title">' + esc(opts.title) + '</h3>' : '')
        + '<div class="u-form">' + fields + '</div>'
        + '<div class="u-acts"><button class="u-btn ghost" id="uFx">إلغاء</button><button class="u-btn primary" id="uFok">' + esc(opts.submitText || 'حفظ') + '</button></div>';
      ov.classList.add('show');
      document.getElementById('uFx').onclick = function () { close(null); };
      document.getElementById('uFok').onclick = function () {
        var out = {}, ok = true;
        (opts.fields || []).forEach(function (f) {
          var v = (document.getElementById('uF_' + f.id).value || '').trim();
          if (!f.optional && !v) ok = false;
          out[f.id] = v;
        });
        if (!ok) { window.uiToast('يرجى تعبئة الحقول المطلوبة', 'error'); return; }
        close(out);
      };
    });
  };

  window.uiToast = function (msg, type) {
    type = type || 'info'; var col = COLOR[type] || COLOR.info;
    var t = document.createElement('div'); t.className = 'u-toast'; t.style.borderRightColor = col;
    t.innerHTML = '<span class="ti" style="color:' + col + '">' + (I[type] || I.info) + '</span><span class="tx">' + esc(msg) + '</span>';
    toasts.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 260); }, 3200);
  };

  // إغلاق بالخلفية للنوافذ غير الإجبارية (alert فقط)
  ov.addEventListener('click', function (e) { if (e.target === ov && _resolve) close(false); });
})();
