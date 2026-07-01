/* ============================================================
   طلبك تم — المصادقة (بريد+كلمة مرور) + الدردشة اللحظية مع الآدمن
   مستقلّ تماماً: يحقن واجهته (CSS + DOM) بنفسه.
   يعتمد على supabaseClient من supabase-config.js (محمّل قبله).
   يستبدل التواصل عبر واتساب: app.js يستدعي window.openChat(adId).
   ============================================================ */
(function () {
  'use strict';
  if (typeof supabaseClient === 'undefined') { console.error('[auth-chat] supabaseClient غير محمّل'); return; }

  var sb = supabaseClient;
  // التقاط مبكّر لرمز الاستعادة من الرابط (قبل أن يمسحه Supabase) لفتح نافذة كلمة المرور
  var _recoveryInUrl = /(?:^|[#&?])type=recovery(?:&|$)/.test((window.location.hash || '') + '&' + (window.location.search || ''));
  var _user = null;          // المستخدم الحالي
  var _conv = null;          // المحادثة المفتوحة
  var _channel = null;       // اشتراك Realtime (رسائل)
  var _rt = null;            // قناة البثّ (كتابة/جلسة)
  var _typingHide = null;    // مؤقّت إخفاء "جاري الكتابة"
  var _lastTyped = 0;        // تحديد معدّل بثّ الكتابة
  var _autoReplied = false;  // هل أُرسل الردّ التلقائي بهذه الجلسة
  var _notifyCh = null;      // اشتراك إشعارات العميل (رسائل جديدة في أي محادثة)
  var _unread = 0;           // عدّاد الرسائل غير المقروءة
  var SUPPORT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M20 17.5a2 2 0 0 1-2 2h-3.5"/><rect x="2" y="14.5" width="3.5" height="5.5" rx="1.5"/><rect x="18.5" y="14.5" width="3.5" height="5.5" rx="1.5"/></svg>';
  var X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var EYE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  var _pendingAdId = null;   // إعلان ننتظر الدخول لفتح دردشته
  var _pendingMsg = null;    // رسالة محجوزة (تفاصيل حجز) تُعبّأ بعد الدخول
  var _pendingBooking = null;// طلب حجز ننتظر الدخول لإرساله

  /* ---------- 1) حقن الأنماط ---------- */
  var css = ''
    + '.ac-overlay{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;padding:16px}'
    + '.ac-overlay.show{display:flex}'
    + '.ac-card{background:#fff;border-radius:20px;width:100%;max-width:400px;padding:26px 22px;box-shadow:0 30px 80px rgba(0,0,0,.3);font-family:inherit;direction:rtl}'
    + '.ac-card h3{margin:0 0 2px;font-size:1.12rem;font-weight:800;color:#0f172a;text-align:center}'
    + '.ac-card p.sub{margin:0 0 8px;font-size:.78rem;color:#64748b;text-align:center}'
    + '.ac-field{margin-bottom:6px}'
    + '.ac-field label{display:block;font-size:.74rem;font-weight:700;color:#334155;margin-bottom:2px}'
    + '.ac-field input{width:100%;box-sizing:border-box;padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:.9rem;font-family:inherit;outline:none;transition:border-color .15s}'
    + '.ac-field input:focus{border-color:#F6921E}'
    + '.ac-btn{width:100%;padding:11px;border:none;border-radius:11px;background:#F6921E;color:#fff;font-size:.95rem;font-weight:800;cursor:pointer;font-family:inherit;transition:opacity .15s;margin-top:4px}'
    + '.ac-btn:disabled{opacity:.6;cursor:default}'
    + '.ac-switch{margin-top:9px;text-align:center;font-size:.83rem;color:#64748b}'
    + '.ac-switch a{color:#F6921E;font-weight:700;cursor:pointer;text-decoration:none}'
    + '.ac-msg{display:none;margin:0 0 14px;padding:10px 12px;border-radius:10px;font-size:.82rem;font-weight:600;text-align:center}'
    + '.ac-msg.err{display:block;background:#fee2e2;color:#b91c1c}'
    + '.ac-msg.ok{display:block;background:#dcfce7;color:#15803d}'
    + '.ac-close{position:absolute;top:14px;left:14px;background:none;border:none;font-size:1.5rem;color:#94a3b8;cursor:pointer;line-height:1}'
    /* إظهار/إخفاء كلمة المرور */
    + '.ac-pass-wrap{position:relative}'
    + '.ac-pass-wrap input{padding-left:42px}'
    + '.ac-eye{position:absolute;top:50%;left:8px;transform:translateY(-50%);background:none;border:none;color:#94a3b8;cursor:pointer;padding:5px;display:flex;align-items:center;justify-content:center;line-height:0}'
    + '.ac-eye:hover{color:#64748b}'
    + '.ac-eye svg{width:20px;height:20px}'
    /* سطر الموافقة على الشروط */
    + '.ac-terms-agree{margin:10px 0 2px}'
    + '.ac-agree-lbl{display:flex;align-items:flex-start;gap:9px;cursor:pointer;font-size:.83rem;font-weight:600;color:#475569;line-height:1.6}'
    + '.ac-agree-lbl input{margin-top:3px;width:17px;height:17px;flex-shrink:0;accent-color:#F6921E;cursor:pointer}'
    + '.ac-terms-link{color:#F6921E;font-weight:800;text-decoration:underline;text-underline-offset:2px;cursor:pointer}'
    /* نافذة عرض الشروط فوق فورم الحساب */
    + '.ac-terms-ov{position:fixed;inset:0;z-index:10100;background:rgba(15,23,42,.6);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;padding:16px;direction:rtl;font-family:inherit}'
    + '.ac-terms-ov.show{display:flex}'
    + '.ac-terms-card{background:#fff;border-radius:18px;width:100%;max-width:560px;max-height:86vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.35)}'
    + '.ac-terms-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid #eef2f7;flex-shrink:0}'
    + '.ac-terms-head h3{margin:0;font-size:1.05rem;font-weight:900;color:#0f172a}'
    + '.ac-terms-head .ac-close{position:static}'
    + '.ac-terms-body{padding:14px 18px 22px;overflow-y:auto;-webkit-overflow-scrolling:touch}'
    /* لوحة الدردشة */
    + '.ac-chat{position:fixed;z-index:10000;bottom:0;left:0;right:0;height:80vh;max-height:640px;background:#f8fafc;border-radius:20px 20px 0 0;box-shadow:0 -20px 60px rgba(0,0,0,.25);display:none;flex-direction:column;direction:rtl;font-family:inherit}'
    + '.ac-chat.show{display:flex}'
    + '@media(min-width:600px){.ac-chat{left:auto;width:400px;right:20px;bottom:20px;border-radius:18px;height:600px}}'
    + '.ac-chat-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:#fff;border-bottom:1px solid #eef2f7;border-radius:20px 20px 0 0}'
    + '.ac-chat-head .t{font-weight:800;color:#0f172a;font-size:.98rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.ac-chat-head .s{font-size:.72rem;color:#16a34a;font-weight:600}'
    + '.ac-chat-head button{background:none;border:none;font-size:1.4rem;color:#94a3b8;cursor:pointer}'
    + '.ac-chat-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px}'
    + '.ac-bubble{max-width:78%;padding:10px 13px;border-radius:14px;font-size:.9rem;line-height:1.5;word-wrap:break-word;white-space:pre-wrap}'
    + '.ac-bubble.me{align-self:flex-start;background:#F6921E;color:#fff;border-bottom-right-radius:4px}'
    + '.ac-bubble.them{align-self:flex-end;background:#fff;color:#0f172a;border:1px solid #eef2f7;border-bottom-left-radius:4px}'
    + '.ac-bubble .time{display:block;font-size:.62rem;opacity:.7;margin-top:3px}'
    + '.ac-chat-foot{display:flex;gap:8px;padding:12px;background:#fff;border-top:1px solid #eef2f7}'
    + '.ac-chat-foot input{flex:1;min-width:0;padding:12px 14px;border:1.5px solid #e2e8f0;border-radius:24px;font-size:.92rem;font-family:inherit;outline:none}'
    + '.ac-chat-foot input:focus{border-color:#F6921E}'
    + '.ac-chat-foot button{flex-shrink:0;width:46px;height:46px;min-width:46px;border-radius:50%;border:none;background:#F6921E;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;-webkit-tap-highlight-color:transparent;touch-action:manipulation;transition:transform .12s,filter .15s}'
    + '.ac-chat-foot button:active{transform:scale(.9)}.ac-chat-foot button:hover{filter:brightness(1.05)}'
    + '.ac-chat-foot button svg{width:20px;height:20px;display:block;pointer-events:none}'
    + '.ac-empty{margin:auto;text-align:center;color:#94a3b8;font-size:.85rem;padding:20px}'
    /* كتلة الحساب في القائمة الجانبية */
    + '.ac-acct{display:flex;align-items:center;gap:10px;padding:12px 14px;margin-bottom:6px;background:linear-gradient(135deg,#fff7ed,#ffedd5);border-radius:14px}'
    + '.ac-acct-av{width:42px;height:42px;border-radius:50%;background:#F6921E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.1rem;flex-shrink:0}'
    + '.ac-acct-nm{font-weight:800;color:#0f172a;font-size:.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.ac-acct-sub{font-size:.72rem;color:#94a3b8;font-weight:600}'
    /* قائمة محادثاتي */
    + '.ac-mylist{flex:1;overflow-y:auto;padding:6px 0}'
    + '.ac-myitem{padding:13px 16px;border-bottom:1px solid #f1f5f9;cursor:pointer;display:flex;flex-direction:column;gap:3px}'
    + '.ac-myitem:hover{background:#f8fafc}'
    + '.ac-myitem .t{font-weight:700;color:#0f172a;font-size:.9rem}'
    + '.ac-myitem .d{font-size:.72rem;color:#94a3b8}'
    + '.ac-guest-hint{margin-top:10px;text-align:center;font-size:.78rem;color:#94a3b8}'
    + '.ac-guest-hint a{color:#F6921E;font-weight:700;cursor:pointer}'
    /* ملء الشاشة: الدردشة + قائمة محادثاتي */
    + '.ac-chat{inset:0;height:100%;max-height:none;border-radius:0;box-shadow:none}'
    + '@media(min-width:600px){.ac-chat{inset:0;width:auto;height:100%;max-height:none;border-radius:0;box-shadow:none}}'
    + '.ac-chat-head{border-radius:0}'
    + '.ac-chat-body,.ac-mylist{max-width:760px;width:100%;margin:0 auto}'
    + '.ac-chat-foot{max-width:760px;width:100%;margin:0 auto;box-sizing:border-box}'
    /* الدخول وإنشاء الحساب: تمرير النافذة كاملة (مضمون على كل المتصفّحات) */
    + '#acAuthOverlay{align-items:flex-start;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:18px 16px calc(40px + env(safe-area-inset-bottom,0px))}'
    + '#acAuthOverlay .ac-card{max-height:none;overflow:visible;margin:auto;padding:16px 20px}'
    /* اللابتوب فقط: توسيط نافذة الدخول/الإنشاء عمودياً في منتصف الشاشة (الموبايل يبقى كما هو) */
    + '@media(min-width:1024px){#acAuthOverlay{align-items:center}#acAuthOverlay .ac-card{margin:auto}}'
    /* سبنر الترحيب (يظهر لحظة الدخول/الإنشاء قبل إغلاق الفورم) */
    + '.ac-spin-ov{position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;direction:rtl;font-family:inherit}'
    + '.ac-spin-ov.show{display:flex}'
    + '.ac-spin-card{background:#fff;border-radius:20px;padding:30px 38px;box-shadow:0 30px 80px rgba(0,0,0,.3);display:flex;flex-direction:column;align-items:center;gap:16px}'
    + '.ac-spin{width:48px;height:48px;border:4px solid #fde7cf;border-top-color:#F6921E;border-radius:50%;animation:acSpin .8s linear infinite}'
    + '@keyframes acSpin{to{transform:rotate(360deg)}}'
    + '.ac-spin-tx{font-size:.92rem;font-weight:800;color:#0f172a}'
    /* أيقونة البروفايل في الهيدر (لابتوب فقط) */
    + '.header-profile-btn{display:flex;background:transparent;border:none;cursor:pointer;width:46px;height:46px;border-radius:50%;align-items:center;justify-content:center;flex-shrink:0;transition:background .25s,transform .25s;padding:0;box-shadow:none}'
    + '.header-profile-btn svg{width:34px;height:34px;display:block;transition:transform .3s cubic-bezier(.34,1.56,.64,1)}'
    + '.header-profile-btn:hover{background:rgba(246,146,30,.12)}'
    + '.header-profile-btn:hover svg{transform:scale(1.16) rotate(-6deg)}'
    + '.header-profile-btn:active svg{transform:scale(.92)}'
    /* ترتيب الموبايل: القائمة يمين، اللوغو وسط، الحساب يسار */
    + '.hdr-actions{display:flex;align-items:center;gap:8px}'
    + '@media(max-width:1023px){.hdr-actions{display:contents}.header .menu-btn{order:0}.header .logo{order:1;flex:1;justify-content:center}.header .header-profile-btn{order:2}.header .desktop-nav{order:3}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ---------- 1.5) ترقية شكل الدردشة (مواصفات عالمية) ---------- */
  var css2 = ''
    + '.ac-chat{background:#eef2f6}'
    + '.ac-chat-head{gap:12px;padding:13px 16px;align-items:center;box-shadow:0 1px 3px rgba(15,23,42,.05)}'
    + '.ac-h-av{width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#F6921E,#fb923c);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.92rem;flex-shrink:0;box-shadow:0 3px 10px rgba(246,146,30,.35)}'
    + '.ac-h-av svg{width:24px;height:24px}'
    /* أيقونة الدعم بجانب الاسم داخل الفقاعة */
    + '.ac-sender{display:flex;align-items:center;gap:6px}'
    + '.ac-sender-ic{width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,#F6921E,#fb923c);color:#fff;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}'
    + '.ac-sender-ic svg{width:12px;height:12px}'
    /* قائمة محادثاتي — متجاوبة وأنيقة (بطاقات) */
    + '.ac-mylist{padding:18px 16px;display:flex;flex-direction:column;gap:12px}'
    + '@media(min-width:1024px){.ac-mylist{padding:26px 16px;gap:14px}}'
    + '.ac-myitem{flex-direction:row !important;align-items:center;gap:12px;border:1px solid #eef2f7 !important;border-radius:16px;background:#fff;box-shadow:0 2px 10px rgba(15,23,42,.05);padding:12px !important;transition:transform .12s,box-shadow .12s}'
    + '.ac-myitem:hover{background:#fff;transform:translateY(-2px);box-shadow:0 10px 26px rgba(15,23,42,.1)}'
    + '.ac-my-img{width:58px;height:58px;border-radius:13px;object-fit:cover;flex-shrink:0}'
    + '.ac-my-noimg{background:linear-gradient(135deg,#fff7ed,#ffedd5);color:#F6921E;display:flex;align-items:center;justify-content:center}'
    + '.ac-my-noimg svg{width:24px;height:24px}'
    + '.ac-my-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}'
    + '.ac-my-info .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.ac-my-ref{font-size:.72rem;color:#F6921E;font-weight:700}'
    /* تسجيل عبر مزوّد خارجي */
    + '.ac-or{display:flex;align-items:center;gap:10px;color:#94a3b8;font-size:.8rem;font-weight:700;margin:15px 0}'
    + '.ac-or::before,.ac-or::after{content:"";flex:1;height:1px;background:#e2e8f0}'
    + '.ac-social{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:12px;border:1.5px solid #e2e8f0;border-radius:12px;background:#fff;font-size:.9rem;font-weight:700;color:#334155;cursor:pointer;font-family:inherit;margin-bottom:10px;transition:background .15s}'
    + '.ac-social:hover{background:#f8fafc}'
    + '.ac-social svg{width:20px;height:20px;flex-shrink:0}'
    + '.ac-h-info{flex:1;min-width:0}'
    + '.ac-h-info .t{font-weight:800;color:#0f172a;font-size:.98rem}'
    + '.ac-h-info .s{font-size:.72rem;color:#16a34a;font-weight:700;display:flex;align-items:center;gap:5px;margin-top:2px}'
    + '.ac-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.18);flex-shrink:0}'
    + '.ac-chat-body{background:#eef2f6;gap:10px;padding:18px 16px}'
    + '.ac-bubble{box-shadow:0 1px 2px rgba(15,23,42,.07);animation:acPop .18s ease}'
    + '@keyframes acPop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}'
    + '.ac-bubble.them{border-radius:16px 16px 16px 4px}'
    + '.ac-bubble.me{border-radius:16px 16px 4px 16px}'
    + '.ac-sender{font-size:.68rem;font-weight:800;color:#F6921E;margin-bottom:3px}'
    + '.ac-sys{align-self:center;background:rgba(15,23,42,.07);color:#475569;font-size:.72rem;font-weight:700;padding:5px 13px;border-radius:20px;margin:3px 0;animation:acPop .18s ease}'
    + '.ac-typing{align-self:flex-end;background:#fff;border:1px solid #eef2f7;border-radius:16px 16px 16px 4px;padding:12px 15px;display:none}'
    + '.ac-typing.show{display:flex;gap:4px;align-items:center}'
    + '.ac-typing span{width:7px;height:7px;border-radius:50%;background:#cbd5e1;animation:acTy 1.2s infinite}'
    + '.ac-typing span:nth-child(2){animation-delay:.2s}.ac-typing span:nth-child(3){animation-delay:.4s}'
    + '@keyframes acTy{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-5px);opacity:1}}'
    + '.ac-chat-foot{padding:12px 14px;gap:10px;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px))}'
    + '.ac-chat-foot input{background:#f1f5f9;border-color:transparent}'
    + '.ac-chat-foot input:focus{background:#fff;border-color:#F6921E}'
    /* أزرار الإغلاق الحمراء الواضحة (X) */
    + '.ac-xbtn{width:38px;height:38px;border-radius:50%;background:#fef2f2;color:#ef4444;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s,transform .1s}'
    + '.ac-xbtn:hover{background:#fee2e2}.ac-xbtn:active{transform:scale(.92)}'
    + '.ac-xbtn svg{width:20px;height:20px}'
    + '.ac-close{width:38px;height:38px;border-radius:50%;background:#fef2f2;color:#ef4444;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;top:14px;left:14px;z-index:3;transition:background .15s}'
    + '.ac-close:hover{background:#fee2e2}'
    + '.ac-close svg{width:20px;height:20px}'
    /* بطاقة "حسابي" */
    + '.acp-head{display:flex;align-items:center;gap:13px;margin:12px 0 10px;padding-bottom:12px;border-bottom:1px solid #eef2f7;text-align:right}'
    + '.acp-h-txt{flex:1;min-width:0}'
    + '.acp-avatar{position:relative;width:50px;height:50px;flex-shrink:0}'
    + '.acp-av-img{width:50px;height:50px;border-radius:50%;object-fit:cover;border:2.5px solid #F6921E;background:#fdebd5;display:flex;align-items:center;justify-content:center;color:#F6921E;font-weight:900;font-size:1.15rem;overflow:hidden}'
    + '.acp-cam{position:absolute;bottom:-2px;left:-2px;width:30px;height:30px;border-radius:50%;background:#F6921E;border:3px solid #fff;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;box-shadow:0 2px 6px rgba(246,146,30,.4);transition:filter .15s,transform .12s}'
    + '.acp-cam:hover{filter:brightness(1.05)}.acp-cam:active{transform:scale(.9)}.acp-cam svg{width:14px;height:14px}'
    + '.acp-name{font-weight:900;color:#0f172a;font-size:1.04rem}'
    + '.acp-email{font-size:.8rem;color:#94a3b8;direction:ltr;text-align:right;overflow-wrap:anywhere;margin-top:2px}'
    + '.acp-field{margin-bottom:6px}'
    + '.acp-flabel{font-size:.76rem;font-weight:700;color:#64748b;margin-bottom:3px;text-align:right}'
    + '.acp-fbox{display:flex;align-items:center;gap:9px;padding:7px 12px;border:1.5px solid #e8edf3;border-radius:11px;background:#fff}'
    + '.acp-fval{flex:1;font-size:.95rem;font-weight:700;color:#0f172a;text-align:right;overflow-wrap:anywhere}'
    + '.acp-fval[dir="ltr"]{text-align:left}'
    + '.acp-ficon{display:flex;flex-shrink:0;color:#9aa7b8}.acp-ficon svg{width:19px;height:19px}'
    + '.acp-edit{width:100%;margin-top:4px;padding:11px;border:none;background:linear-gradient(135deg,#F6921E,#fb923c);color:#fff;border-radius:13px;font-size:.92rem;font-weight:800;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:9px;box-shadow:0 6px 18px rgba(246,146,30,.32);transition:filter .15s,transform .15s}'
    + '.acp-edit:hover{filter:brightness(1.04)}.acp-edit:active{transform:scale(.98)}'
    + '.acp-actions{margin-top:8px;border-top:1px solid #eef2f7}'
    + '.acp-action{width:100%;display:flex;align-items:center;gap:10px;padding:11px 4px;background:none;border:none;border-bottom:1px solid #f1f5f9;cursor:pointer;font-family:inherit}'
    + '.acp-action:last-child{border-bottom:none}'
    + '.acp-act-ic{display:flex;flex-shrink:0;color:#F6921E;margin-inline-start:auto}.acp-act-ic svg{width:20px;height:20px}'
    + '.acp-action.danger .acp-act-ic{color:#ef4444}'
    + '.acp-act-txt{text-align:right;font-size:.92rem;font-weight:800;color:#0f172a}'
    + '.acp-action.danger .acp-act-txt{color:#ef4444}'
    + '.acp-act-chev{display:flex;flex-shrink:0;color:#cbd5e1}.acp-act-chev svg{width:18px;height:18px}'
    /* تبويبات الحساب + تمرير داخلي */
    + '#acProfOverlay{align-items:flex-start;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:22px 16px calc(40px + env(safe-area-inset-bottom,0px))}'
    + '#acProfOverlay .ac-card{display:block;padding:12px 18px 14px;margin:0 auto;max-height:none;overflow:visible}'
    + '#acProfOverlay .ac-close{width:30px;height:30px;top:9px;left:9px}'
    + '#acProfOverlay .ac-close svg{width:17px;height:17px}'
    + '.acp-toptitle{margin:26px 0 8px;font-size:1.05rem;font-weight:900;color:#0f172a;text-align:center;flex-shrink:0}'
    + '.acp-tabs{display:flex;gap:0;margin:28px 0 4px;flex-shrink:0;border-bottom:1px solid #eef2f7}'
    + '.acp-tab{flex:1;padding:0 4px 13px;background:none;border:none;font-family:inherit;font-size:.93rem;font-weight:800;color:#94a3b8;cursor:pointer;position:relative;transition:color .18s}'
    + '.acp-tab:active{transform:scale(.97)}'
    + '.acp-tab.active{color:#F6921E}'
    + '.acp-tab.active::after{content:"";position:absolute;bottom:-1px;left:12%;right:12%;height:3px;background:#F6921E;border-radius:3px}'
    + '.acp-body{padding:2px 2px 4px}'
    + '.acp-pane{display:none}.acp-pane.active{display:block;animation:acFade .2s ease}'
    + '@keyframes acFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}'
    + '.acp-listitem{display:flex;align-items:center;gap:12px;padding:10px;border:1px solid #eef2f7;border-radius:14px;margin-bottom:10px;cursor:pointer;background:#fff;transition:transform .12s,box-shadow .12s}'
    + '.acp-listitem:active{transform:scale(.98)}'
    + '.acp-listitem>img,.acp-li-noimg{width:54px;height:54px;border-radius:12px;object-fit:cover;flex-shrink:0;background:#f1f5f9}'
    + '.acp-li-noimg{display:flex;align-items:center;justify-content:center;color:#cbd5e1}.acp-li-noimg svg{width:24px;height:24px}'
    + '.acp-li-info{flex:1;min-width:0}'
    + '.acp-li-info .t{font-weight:800;color:#0f172a;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.acp-li-info .p{font-weight:800;color:#F6921E;font-size:.85rem;margin-top:3px}'
    + '.acp-li-info .d{font-size:.72rem;color:#94a3b8;margin-top:2px}'
    /* نافذة المفضلة/المحادثات المستقلّة (ملء الشاشة) */
    + '#acListOverlay{padding:0;align-items:stretch;justify-content:center}'
    + '.ac-sheet-card{display:flex;flex-direction:column;padding:0;width:100%;max-width:620px;height:100%;border-radius:0;overflow:hidden}'
    + '.ac-sheet-head{display:flex;align-items:center;gap:12px;padding:15px 18px;border-bottom:1px solid #eef2f7;flex-shrink:0}'
    + '.ac-sheet-head h3{margin:0;font-size:1.12rem;font-weight:900;color:#0f172a;flex:1;text-align:right}'
    + '#acListOverlay .ac-close{position:static;flex-shrink:0}'
    + '.ac-sheet-body{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:14px 16px;background:#f8fafc}'
    + '.ac-sheet-body .acp-listitem{background:#fff}'
    + '@media(min-width:600px){#acListOverlay{padding:16px;align-items:center}.ac-sheet-card{height:86dvh;max-height:780px;border-radius:18px}}'
    /* بطاقات «طلباتي» */
    + '.req-card{background:#fff;border:1px solid #eef2f7;border-radius:16px;padding:14px;margin-bottom:12px;box-shadow:0 2px 10px rgba(0,0,0,.04)}'
    + '.req-head{display:flex;align-items:center;gap:11px}'
    + '.req-img{width:52px;height:52px;border-radius:11px;object-fit:cover;flex-shrink:0}'
    + '.req-type{font-size:.72rem;font-weight:800;color:#F6921E;background:#fff7ed;display:inline-block;padding:2px 9px;border-radius:20px;margin-bottom:3px}'
    + '.req-title{font-size:.95rem;font-weight:800;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.req-date{font-size:.72rem;color:#94a3b8;font-weight:600;flex-shrink:0}'
    + '.req-steps{display:flex;align-items:center;margin-top:14px}'
    + '.req-step{display:flex;flex-direction:column;align-items:center;gap:5px;flex-shrink:0;width:64px;text-align:center}'
    + '.req-dot{width:26px;height:26px;border-radius:50%;background:#e5e9f0;color:#94a3b8;font-size:.8rem;font-weight:800;display:flex;align-items:center;justify-content:center}'
    + '.req-slbl{font-size:.66rem;font-weight:700;color:#94a3b8;line-height:1.3}'
    + '.req-line{flex:1;height:3px;background:#e5e9f0;border-radius:3px;margin:0 -6px;margin-bottom:19px}'
    + '.req-step.done .req-dot,.req-step.cur .req-dot{background:#16a34a;color:#fff}'
    + '.req-step.cur .req-dot{background:#F6921E}'
    + '.req-step.done .req-slbl,.req-step.cur .req-slbl{color:#0f172a}'
    + '.req-wa{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:13px;background:#16a34a;color:#fff;text-decoration:none;font-weight:800;font-size:.9rem;padding:11px;border-radius:12px}'
    + '.req-rejected{margin-top:12px;background:#fef2f2;color:#b91c1c;font-weight:700;font-size:.8rem;padding:10px 12px;border-radius:11px;text-align:center}'
    + '.req-approved{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:12px;background:#f0fdf4;color:#15803d;font-weight:800;font-size:.85rem;padding:11px 12px;border-radius:11px;text-align:center}'
    + '.req-approved svg{width:18px;height:18px;flex-shrink:0}';
  var st2 = document.createElement('style'); st2.textContent = css2; document.head.appendChild(st2);

  /* ---------- 2) حقن DOM ---------- */
  var authHtml = ''
    + '<div class="ac-card" style="position:relative">'
    + '  <button class="ac-close" onclick="window._acCloseAuth()" aria-label="إغلاق">' + X_SVG + '</button>'
    + '  <h3 id="acTitle">تسجيل الدخول</h3>'
    + '  <p class="sub" id="acSub">سجّل دخولك لتتواصل مع الإدارة عبر الدردشة</p>'
    + '  <div class="ac-msg" id="acMsg"></div>'
    + '  <div id="acStep1" style="display:none">'
    + '    <div class="ac-field"><label>الاسم</label><input id="acName" type="text" placeholder="اسمك الأول"></div>'
    + '    <div class="ac-field"><label>الكنية</label><input id="acLast" type="text" placeholder="كنيتك"></div>'
    + '    <div class="ac-field"><label>رقم الهاتف</label><input id="acPhone" type="tel" inputmode="numeric" placeholder="09xxxxxxxx" dir="ltr" oninput="this.value=this.value.replace(/[^0-9]/g,\'\')"></div>'
    + '    <div class="ac-field"><label>العنوان <span style="color:#94a3b8;font-weight:600">(اختياري)</span></label><input id="acAddress" type="text" placeholder="المدينة، الحي"></div>'
    + '  </div>'
    + '  <div id="acStep2">'
    + '    <div class="ac-field"><label>البريد الإلكتروني</label><input id="acEmail" type="email" placeholder="you@email.com" dir="ltr"></div>'
    + '    <div class="ac-field"><label>كلمة المرور</label><div class="ac-pass-wrap"><input id="acPass" type="password" placeholder="••••••••" dir="ltr"><button type="button" class="ac-eye" onclick="window._acTogglePass(\'acPass\',this)" aria-label="إظهار كلمة المرور">' + EYE_SVG + '</button></div></div>'
    + '    <div class="ac-field" id="acConfirmField" style="display:none"><label>تأكيد كلمة المرور</label><div class="ac-pass-wrap"><input id="acPass2" type="password" placeholder="••••••••" dir="ltr"><button type="button" class="ac-eye" onclick="window._acTogglePass(\'acPass2\',this)" aria-label="إظهار كلمة المرور">' + EYE_SVG + '</button></div></div>'
    + '    <div class="ac-terms-agree" id="acTermsRow" style="display:none"><label class="ac-agree-lbl"><input type="checkbox" id="acAgree"><span>أوافق على <a class="ac-terms-link" onclick="window._acOpenTerms()">الشروط وسياسة الخصوصية</a> لطلبك تم</span></label></div>'
    + '  </div>'
    + '  <button class="ac-btn" id="acSubmit" onclick="window._acSubmit()">دخول</button>'
    + '  <button class="ac-btn" id="acBack" onclick="window._acBackStep()" style="display:none;background:#f1f5f9;color:#475569;box-shadow:none;margin-top:8px">← السابق</button>'
    + '  <div class="ac-switch" id="acForgotRow" style="margin-top:14px"><a onclick="window._acForgot()">نسيت كلمة المرور؟</a></div>'
    + '  <div class="ac-switch" id="acSwitch">ليس لديك حساب؟ <a onclick="window._acToggle()">أنشئ حساباً</a></div>'
    + '  <div class="ac-guest-hint">أو <a onclick="window._acCloseAuth()">تابع التصفّح كزائر</a></div>'
    + '</div>';
  var authOverlay = document.createElement('div');
  authOverlay.className = 'ac-overlay'; authOverlay.id = 'acAuthOverlay'; authOverlay.innerHTML = authHtml;
  document.body.appendChild(authOverlay);

  // سبنر الترحيب
  var spinOverlay = document.createElement('div');
  spinOverlay.className = 'ac-spin-ov'; spinOverlay.id = 'acSpinOv';
  spinOverlay.innerHTML = '<div class="ac-spin-card"><div class="ac-spin"></div><div class="ac-spin-tx" id="acSpinTx">جارٍ تجهيز حسابك...</div></div>';
  document.body.appendChild(spinOverlay);
  function _acShowSpinner(txt) { var t = document.getElementById('acSpinTx'); if (t) t.textContent = txt || 'جارٍ تجهيز حسابك...'; document.getElementById('acSpinOv').classList.add('show'); }
  function _acHideSpinner() { document.getElementById('acSpinOv').classList.remove('show'); }

  var chatEl = document.createElement('div');
  chatEl.className = 'ac-chat'; chatEl.id = 'acChat';
  chatEl.innerHTML = ''
    + '<div class="ac-chat-head">'
    + '  <div class="ac-h-av">' + SUPPORT_SVG + '</div>'
    + '  <div class="ac-h-info"><div class="t" id="acChatTitle">الدعم — طلبك تم</div><div class="s"><span class="ac-dot"></span> متصل الآن</div></div>'
    + '  <button class="ac-xbtn" onclick="window._acCloseChat()" aria-label="إغلاق">' + X_SVG + '</button></div>'
    + '<div class="ac-chat-body" id="acChatBody"></div>'
    + '<div class="ac-chat-foot"><input id="acChatInput" placeholder="اكتب رسالتك..." oninput="window._acTyping&&window._acTyping()" onkeydown="if(event.key===\'Enter\')window._acSend()"><button type="button" class="ac-send-btn" onmousedown="event.preventDefault()" onclick="window._acSend()" aria-label="إرسال"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg></button></div>';
  document.body.appendChild(chatEl);

  // نافذة "حسابي" — بطاقة احترافية: جدول مقفل + زر تعديل (قلم)
  var pencilSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:17px;height:17px"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
  var IC_PERSON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  var IC_PHONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  var IC_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>';
  var IC_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  var IC_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  var IC_LOGOUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
  var IC_CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
  var IC_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  var profHtml = ''
    + '<div class="ac-card ac-prof" style="position:relative">'
    + '  <button class="ac-close" onclick="window._acCloseProfile()" aria-label="إغلاق">' + X_SVG + '</button>'
    + '  <div class="acp-toptitle">الملف الشخصي</div>'
    + '  <div class="acp-body">'
    + '  <div class="acp-pane active" id="acpPaneprofile">'
    + '  <div class="acp-head">'
    + '    <div class="acp-h-txt"><div class="acp-name" id="acpFullName">حسابي</div><div class="acp-email" id="acProfEmail"></div></div>'
    + '    <div class="acp-avatar"><div class="acp-av-img" id="acpAv">؟</div></div>'
    + '  </div>'
    + '  <div class="ac-msg" id="acProfMsg"></div>'
    /* وضع العرض: جدول مقفل */
    + '  <div id="acpView">'
    + '    <div class="acp-field"><div class="acp-flabel">الاسم</div><div class="acp-fbox"><span class="acp-fval" id="acpVName">—</span><span class="acp-ficon">' + IC_PERSON + '</span></div></div>'
    + '    <div class="acp-field"><div class="acp-flabel">الكنية</div><div class="acp-fbox"><span class="acp-fval" id="acpVLast">—</span><span class="acp-ficon">' + IC_PERSON + '</span></div></div>'
    + '    <div class="acp-field"><div class="acp-flabel">رقم الهاتف</div><div class="acp-fbox"><span class="acp-fval" id="acpVPhone" dir="ltr">—</span><span class="acp-ficon">' + IC_PHONE + '</span></div></div>'
    + '    <div class="acp-field"><div class="acp-flabel">البريد</div><div class="acp-fbox"><span class="acp-fval" id="acpVEmail" dir="ltr">—</span><span class="acp-ficon">' + IC_MAIL + '</span></div></div>'
    + '    <div class="acp-field"><div class="acp-flabel">العنوان</div><div class="acp-fbox"><span class="acp-fval" id="acpVAddr">—</span><span class="acp-ficon">' + IC_PIN + '</span></div></div>'
    + '    <button class="acp-edit" onclick="window._acEditProfile()">' + pencilSvg + ' تعديل المعلومات</button>'
    + '  </div>'
    /* وضع التعديل: حقول */
    + '  <div id="acpEdit" style="display:none">'
    + '    <div class="ac-field"><label>الاسم</label><input id="acProfName" type="text" placeholder="اسمك الأول"></div>'
    + '    <div class="ac-field"><label>الكنية</label><input id="acProfLast" type="text" placeholder="كنيتك"></div>'
    + '    <div class="ac-field"><label>رقم الهاتف</label><input id="acProfPhone" type="tel" inputmode="numeric" dir="ltr" oninput="this.value=this.value.replace(/[^0-9]/g,\'\')"></div>'
    + '    <div class="ac-field"><label>العنوان <span style="color:#94a3b8;font-weight:600">(اختياري)</span></label><input id="acProfAddress" type="text" placeholder="المدينة، الحي"></div>'
    + '    <div style="display:flex;gap:10px"><button class="ac-btn" style="background:#f1f5f9;color:#475569" onclick="window._acCancelEdit()">إلغاء</button><button class="ac-btn" id="acProfSave" onclick="window._acSaveProfile()">حفظ</button></div>'
    + '  </div>'
    + '  <div class="acp-actions" id="acpActions">'
    + '    <button class="acp-action" onclick="window._acChangePassword()"><span class="acp-act-txt">تغيير كلمة المرور</span><span class="acp-act-chev">' + IC_CHEV + '</span><span class="acp-act-ic">' + IC_LOCK + '</span></button>'
    + '    <button class="acp-action danger" onclick="window._acLogout()"><span class="acp-act-txt">تسجيل الخروج</span><span class="acp-act-chev">' + IC_CHEV + '</span><span class="acp-act-ic">' + IC_LOGOUT + '</span></button>'
    + '  </div>'
    + '  </div>'
    + '  </div>'
    + '</div>';
  var profOverlay = document.createElement('div');
  profOverlay.className = 'ac-overlay'; profOverlay.id = 'acProfOverlay'; profOverlay.innerHTML = profHtml;
  document.body.appendChild(profOverlay);

  // نافذة "كلمة مرور جديدة" — تظهر تلقائياً عند فتح رابط إعادة التعيين من الإيميل
  var resetHtml = ''
    + '<div class="ac-card" style="position:relative">'
    + '  <h3>كلمة مرور جديدة</h3>'
    + '  <p class="sub">أدخل كلمة مرور جديدة لحسابك</p>'
    + '  <div class="ac-msg" id="acResetMsg"></div>'
    + '  <div class="ac-field"><label>كلمة المرور الجديدة</label><input id="acResetPass" type="password" placeholder="••••••••" dir="ltr"></div>'
    + '  <button class="ac-btn" id="acResetBtn" onclick="window._acDoReset()">حفظ كلمة المرور</button>'
    + '</div>';
  var resetOverlay = document.createElement('div');
  resetOverlay.className = 'ac-overlay'; resetOverlay.id = 'acResetOverlay'; resetOverlay.innerHTML = resetHtml;
  document.body.appendChild(resetOverlay);

  // قائمة "محادثاتي"
  var myChats = document.createElement('div');
  myChats.className = 'ac-chat'; myChats.id = 'acMyChats';
  myChats.innerHTML = ''
    + '<div class="ac-chat-head">'
    + '  <div class="ac-h-av">' + SUPPORT_SVG + '</div>'
    + '  <div class="ac-h-info"><div class="t">محادثاتي</div><div class="s">دردشاتك مع الإدارة</div></div>'
    + '  <button class="ac-xbtn" onclick="window._acCloseMyChats()" aria-label="إغلاق">' + X_SVG + '</button></div>'
    + '<div class="ac-mylist" id="acMyList"></div>';
  document.body.appendChild(myChats);

  /* ---------- 3) أدوات ---------- */
  var _signupMode = false;
  function showAuthMsg(t, ok) { var m = document.getElementById('acMsg'); m.textContent = t; m.className = 'ac-msg ' + (ok ? 'ok' : 'err'); }
  function clearAuthMsg() { var m = document.getElementById('acMsg'); m.className = 'ac-msg'; m.textContent = ''; }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
  function cleanEmail(v) { return (v || '').replace(/[​-\u200F\u202A-\u202E\u2066-\u2069﻿]/g, '').trim().toLowerCase(); }
  function fmtTime(ts) { try { return new Date(ts).toLocaleString('ar', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' }); } catch (e) { return ''; } }

  /* ---------- 4) المصادقة ---------- */
  window._acOpenAuth = function (adId, prefill) { _pendingAdId = adId || null; _pendingMsg = prefill || null; _signupMode = false; _signupStep = 1; try { _acApplyMode(); } catch (e) {} clearAuthMsg(); var _a = document.getElementById('acAgree'); if (_a) _a.checked = false; ['acPass', 'acPass2'].forEach(function (id) { var i = document.getElementById(id); if (i) i.type = 'password'; }); document.querySelectorAll('#acAuthOverlay .ac-eye').forEach(function (b) { b.innerHTML = EYE_SVG; }); document.getElementById('acAuthOverlay').classList.add('show'); };

  // إظهار/إخفاء كلمة المرور
  window._acTogglePass = function (id, btn) {
    var inp = document.getElementById(id); if (!inp) return;
    var show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    btn.innerHTML = show ? EYE_OFF_SVG : EYE_SVG;
    btn.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
  };

  // عرض «الشروط وسياسة الخصوصية» (نفس محتوى صفحة الشروط) فوق فورم الحساب دون فقدان البيانات
  window._acOpenTerms = function () {
    var modal = document.getElementById('acTermsOverlay');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'acTermsOverlay'; modal.className = 'ac-terms-ov';
      modal.innerHTML = '<div class="ac-terms-card"><div class="ac-terms-head"><h3>الشروط وسياسة الخصوصية</h3><button class="ac-close" onclick="window._acCloseTerms()" aria-label="إغلاق">' + X_SVG + '</button></div><div class="ac-terms-body" id="acTermsBody"></div></div>';
      document.body.appendChild(modal);
      modal.addEventListener('click', function (e) { if (e.target === modal) window._acCloseTerms(); });
    }
    var src = document.querySelector('#page-terms .info-content');
    document.getElementById('acTermsBody').innerHTML = src ? src.innerHTML : 'تعذّر تحميل الشروط حالياً.';
    modal.classList.add('show');
  };
  window._acCloseTerms = function () { var m = document.getElementById('acTermsOverlay'); if (m) m.classList.remove('show'); };
  window._acCloseAuth = function () {
    document.getElementById('acAuthOverlay').classList.remove('show');
    try { sessionStorage.setItem('ac_welcomed', '1'); } catch (e) {}
  };
  var _signupStep = 1;
  function _acApplyMode() {
    var g = function (id) { return document.getElementById(id); };
    var swHtml = _signupMode
      ? 'لديك حساب؟ <a onclick="window._acToggle()">سجّل الدخول</a>'
      : 'ليس لديك حساب؟ <a onclick="window._acToggle()">أنشئ حساباً</a>';
    g('acSwitch').innerHTML = swHtml;
    if (!_signupMode) {                       // تسجيل الدخول
      g('acTitle').textContent = 'تسجيل الدخول';
      g('acSubmit').textContent = 'دخول';
      g('acStep1').style.display = 'none';
      g('acStep2').style.display = '';
      g('acConfirmField').style.display = 'none';
      g('acTermsRow').style.display = 'none';
      g('acBack').style.display = 'none';
      g('acForgotRow').style.display = 'block';
    } else if (_signupStep === 1) {           // إنشاء حساب — الخطوة 1
      g('acTitle').textContent = 'إنشاء حساب · 1 من 2';
      g('acSubmit').textContent = 'التالي ←';
      g('acStep1').style.display = '';
      g('acStep2').style.display = 'none';
      g('acBack').style.display = 'none';
      g('acForgotRow').style.display = 'none';
    } else {                                   // إنشاء حساب — الخطوة 2
      g('acTitle').textContent = 'إنشاء حساب · 2 من 2';
      g('acSubmit').textContent = 'إنشاء الحساب';
      g('acStep1').style.display = 'none';
      g('acStep2').style.display = '';
      g('acConfirmField').style.display = 'block';
      g('acTermsRow').style.display = 'block';
      g('acBack').style.display = 'block';
      g('acForgotRow').style.display = 'none';
    }
    clearAuthMsg();
  }
  window._acToggle = function () { _signupMode = !_signupMode; _signupStep = 1; _acApplyMode(); };
  window._acBackStep = function () { _signupStep = 1; _acApplyMode(); };

  window._acSubmit = async function () {
    // تنظيف البريد من الأحرف الخفيّة (علامات اتجاه RTL / مسافات صفرية) ثم توحيده
    var email = document.getElementById('acEmail').value
      .replace(/[​-\u200F\u202A-\u202E\u2066-\u2069﻿]/g, '')
      .trim().toLowerCase();
    var pass = document.getElementById('acPass').value;
    var name = document.getElementById('acName').value.trim();
    var last = document.getElementById('acLast').value.trim();
    var phone = document.getElementById('acPhone').value.trim();
    var address = document.getElementById('acAddress').value.trim();
    // إنشاء حساب — الخطوة 1: تحقّق من البيانات الشخصية ثم انتقل للخطوة 2
    if (_signupMode && _signupStep === 1) {
      if (!name || !last || !phone) { showAuthMsg('أدخل الاسم والكنية ورقم الهاتف'); return; }
      _signupStep = 2; _acApplyMode();
      setTimeout(function () { var e = document.getElementById('acEmail'); if (e) e.focus(); }, 60);
      return;
    }
    if (!email || !pass) { showAuthMsg('أدخل البريد وكلمة المرور'); return; }
    if (_signupMode && (!name || !last || !phone)) { _signupStep = 1; _acApplyMode(); showAuthMsg('أدخل الاسم والكنية ورقم الهاتف'); return; }
    if (_signupMode) {
      var pass2 = document.getElementById('acPass2').value;
      if (pass.length < 6) { showAuthMsg('كلمة المرور يجب ألا تقل عن 6 أحرف'); return; }
      if (pass !== pass2) { showAuthMsg('كلمتا المرور غير متطابقتين'); return; }
      var _agree = document.getElementById('acAgree');
      if (!_agree || !_agree.checked) { showAuthMsg('يرجى الموافقة على الشروط وسياسة الخصوصية لإنشاء الحساب'); return; }
    }
    var btn = document.getElementById('acSubmit'); btn.disabled = true; var lbl = btn.textContent; btn.textContent = 'جارٍ...';
    try {
      if (_signupMode) {
        var r = await sb.auth.signUp({ email: email, password: pass, options: { data: { first_name: name, last_name: last, full_name: (name + ' ' + last).trim(), phone: phone, address: address } } });
        if (r.error) throw r.error;
        if (!r.data.session) { _signupMode = false; _signupStep = 1; _acApplyMode(); showAuthMsg('أرسلنا رابط تأكيد إلى بريدك. افتح الرابط لتأكيد بريدك ويكتمل إنشاء حسابك، ثم سجّل الدخول.', true); }
        else { onLoggedIn(r.data.user, true); }
      } else {
        var r2 = await sb.auth.signInWithPassword({ email: email, password: pass });
        if (r2.error) throw r2.error;
        onLoggedIn(r2.data.user, false);
      }
    } catch (e) {
      console.error('[auth-chat] login/signup error:', e);
      var c = (e && (e.message || e.error_description || e.msg)) || '';
      // رسائل واضحة بلغة بسيطة للعميل — دون أي مصطلحات تقنية
      if (/Invalid login/i.test(c)) showAuthMsg('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
      else if (/Email not confirmed/i.test(c)) showAuthMsg('لم يتم تفعيل بريدك بعد. افتح رسالة التفعيل في بريدك الإلكتروني ثم سجّل الدخول.');
      else if (/already registered|already exists|User already/i.test(c)) showAuthMsg('هذا البريد مسجّل لدينا مسبقاً. يمكنك تسجيل الدخول مباشرةً.');
      else if (/at least 6|password/i.test(c)) showAuthMsg('كلمة المرور يجب ألا تقل عن 6 أحرف.');
      else if (/rate|too many|seconds/i.test(c)) showAuthMsg('محاولات كثيرة خلال وقت قصير. انتظر قليلاً ثم أعد المحاولة.');
      else if (!c || /fetch|network|load failed|timeout|connection/i.test(c)) showAuthMsg('تعذّر الاتصال بالإنترنت. تحقّق من اتصالك ثم أعد المحاولة.');
      else showAuthMsg('تعذّر إتمام العملية حالياً. يرجى المحاولة مرة أخرى.');
    } finally { btn.disabled = false; btn.textContent = lbl; }
  };

  // إرسال رابط إعادة تعيين كلمة المرور إلى البريد
  window._acForgot = async function () {
    var email = cleanEmail(document.getElementById('acEmail').value);
    if (!email) { showAuthMsg('أدخل بريدك الإلكتروني في الحقل أعلاه ثم اضغط "نسيت كلمة المرور؟"'); return; }
    var btn = document.getElementById('acSubmit'); btn.disabled = true;
    try {
      var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
      if (r.error) throw r.error;
      showAuthMsg('أرسلنا رابط إعادة التعيين إلى بريدك ✓\nافتح الرابط لتعيين كلمة مرور جديدة.', true);
    } catch (e) {
      var c = (e && (e.message || e.msg)) || '';
      if (/rate|seconds|too many/i.test(c)) showAuthMsg('أرسلنا رابطاً منذ قليل — انتظر دقيقة ثم أعد المحاولة.');
      else showAuthMsg('تعذّر إرسال الرابط حالياً. يرجى المحاولة لاحقاً.');
    } finally { btn.disabled = false; }
  };

  // حفظ كلمة المرور الجديدة (بعد فتح رابط الإيميل — الجلسة مفتوحة مؤقتاً)
  window._acDoReset = async function () {
    var pass = document.getElementById('acResetPass').value;
    var m = document.getElementById('acResetMsg');
    if (!pass || pass.length < 6) { m.textContent = 'كلمة المرور يجب ألا تقل عن 6 أحرف'; m.className = 'ac-msg err'; return; }
    var btn = document.getElementById('acResetBtn'); btn.disabled = true; btn.textContent = 'جارٍ الحفظ...';
    try {
      var r = await sb.auth.updateUser({ password: pass });
      if (r.error) throw r.error;
      m.textContent = 'تم تغيير كلمة المرور ✓'; m.className = 'ac-msg ok';
      _user = r.data.user;
      // نظّف رمز الاستعادة من الرابط ثم أغلق النافذة
      try { history.replaceState(null, '', window.location.pathname); } catch (e) {}
      setTimeout(function () { document.getElementById('acResetOverlay').classList.remove('show'); renderAccountBlock(); }, 1200);
    } catch (e) {
      m.textContent = 'تعذّر تغيير كلمة المرور حالياً. يرجى المحاولة مرة أخرى.'; m.className = 'ac-msg err';
    } finally { btn.disabled = false; btn.textContent = 'حفظ كلمة المرور'; }
  };

  // فحص الحظر: إن كان الحساب محظوراً سجّل خروجه فوراً
  async function checkBlocked() {
    if (!_user) return false;
    try {
      var r = await sb.from('profiles').select('blocked').eq('user_id', _user.id).maybeSingle();
      if (r.data && r.data.blocked) {
        await sb.auth.signOut(); _user = null; renderAccountBlock();
        window.uiAlert('تم حظر حسابك. للاستفسار يرجى التواصل مع الإدارة.', { type: 'error', title: 'الحساب محظور' });
        return true;
      }
    } catch (e) {}
    return false;
  }

  async function onLoggedIn(user, isNew) {
    _user = user;
    if (await checkBlocked()) return;
    renderAccountBlock();
    var _md = user.user_metadata || {};
    var _nm = (_md.first_name || _md.full_name || (user.email || '').split('@')[0] || '').trim();
    // 1) سبنر لمدة ثانيتين، 2) إغلاق فورم الحساب، 3) رسالة ترحيب احترافية خارج الفورم
    clearAuthMsg();
    _acShowSpinner(isNew ? 'جارٍ تجهيز حسابك...' : 'جارٍ تسجيل دخولك...');
    await new Promise(function (r) { setTimeout(r, 2000); });
    _acHideSpinner();
    window._acCloseAuth();
    var _greet = isNew
      ? ('تم إنشاء حسابك بنجاح. يسعدنا انضمامك إلينا يا ' + _nm + '.')
      : ('سعداء برؤيتك من جديد يا ' + _nm + '.');
    var _gtitle = isNew ? 'مرحباً بك في طلبك تم' : 'أهلاً بعودتك';
    var _hasPending = !!_pendingBooking || _pendingAdId != null;
    if (_hasPending) {
      // عند وجود إجراء معلّق (حجز/دردشة): ترحيب غير معطِّل ثم إكمال الإجراء
      window.uiToast(_greet, 'success');
    } else {
      window.uiAlert(_greet, { type: 'success', title: _gtitle, okText: 'تابع' });
    }
    if (_pendingBooking) { var b = _pendingBooking; _pendingBooking = null; window.submitBookingRequest(b); return; }
    if (_pendingAdId != null) { var id = _pendingAdId; var msg = _pendingMsg; _pendingAdId = null; _pendingMsg = null; openChat(id, msg); }
  }

  // إرسال طلب حجز إلى الإدارة (سجلّ في جدول bookings) + فتح الدردشة للتواصل
  window.submitBookingRequest = async function (data) {
    if (!_user) { var s = await sb.auth.getSession(); _user = (s.data && s.data.session) ? s.data.session.user : null; }
    if (!_user) { _pendingBooking = data; window._acOpenAuth(data.adId); return; }
    if (await checkBlocked()) return;
    var md = _user.user_metadata || {};
    var row = {
      ad_id: data.adId != null ? data.adId : null, user_id: _user.id,
      ad_ref: data.adRef || '', ad_title: data.adTitle || '', ad_cat_id: data.adCatId || '', ad_image: data.adImage || '',
      client_name: data.clientName || md.full_name || '',
      client_last: data.clientLast || '',
      client_phone: data.clientPhone || md.phone || '',
      client_email: data.clientEmail || _user.email || '',
      client_address: data.clientAddress || md.address || '',
      deal_type: data.dealType || 'rent',
      date_from: data.dateFrom || null, date_to: data.dateTo || null,
      days: data.days || null, months: data.months || null,
      price_daily: data.priceDaily || null, total_price: data.totalPrice || null,
      status: 'pending'
    };
    var r = await sb.from('bookings').insert(row);
    if (r.error) { window.uiToast('تعذّر إرسال الطلب: ' + r.error.message, 'error'); return; }
    window.uiAlert(data.dealType === 'sale'
      ? 'تم إرسال طلب الشراء للإدارة بنجاح.\nسنتواصل معك قريباً.'
      : 'تم إرسال طلب الحجز للإدارة بنجاح.\nسنؤكّده لك قريباً.',
      { type: 'success', title: 'تم الإرسال' });
  };

  window._acLogout = async function () {
    var ok = await window.uiConfirm('هل تريد تسجيل الخروج من حسابك؟', { title: 'تسجيل الخروج', okText: 'تسجيل الخروج', cancelText: 'إلغاء', danger: true });
    if (!ok) return;
    await sb.auth.signOut({ scope: 'local' }); _user = null;
    window._acCloseChat(); window._acCloseProfile && window._acCloseProfile();
    renderAccountBlock();
  };

  /* ---------- معلومات المستخدم (للتعبئة التلقائية في الحجز) ---------- */
  window.currentUserInfo = function () {
    if (!_user) return null;
    var md = _user.user_metadata || {};
    var first = md.first_name || (md.full_name || '').trim().split(/\s+/)[0] || '';
    var last = md.last_name || (md.full_name || '').trim().split(/\s+/).slice(1).join(' ') || '';
    return { name: md.full_name || (first + ' ' + last).trim(), first: first, last: last, phone: md.phone || '', address: md.address || '', email: _user.email || '' };
  };
  window.isLoggedIn = function () { return !!_user; };
  // زرّ الحساب في الهيدر: يفتح "حسابي" إن كان داخلاً، وإلا نافذة الدخول
  window._acAccount = function () { if (_user) window._acOpenProfile(); else window._acOpenAuth(); };

  /* ---------- كتلة "حسابي" في القائمة الجانبية ---------- */
  function svgIcon(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>'; }
  function renderAccountBlock() {
    // الحساب صار عبر أيقونة الهيدر — أزل أي كتلة قديمة من القائمة الجانبية
    var blk = document.getElementById('acAccountBlock'); if (blk) blk.remove();
  }

  /* ---------- نافذة "حسابي" (جدول مقفل + تعديل بالقلم) ---------- */
  window._acOpenProfile = function () {
    if (!_user) { window._acOpenAuth(); return; }
    var i = window.currentUserInfo() || {};
    var fullName = (i.first + ' ' + i.last).trim() || 'حسابي';
    document.getElementById('acpFullName').textContent = fullName;
    document.getElementById('acProfEmail').textContent = i.email || '';
    if (window._acRenderAvatar) window._acRenderAvatar();
    document.getElementById('acpVName').textContent = i.first || '—';
    document.getElementById('acpVLast').textContent = i.last || '—';
    document.getElementById('acpVPhone').textContent = i.phone || '—';
    document.getElementById('acpVEmail').textContent = i.email || '—';
    document.getElementById('acpVAddr').textContent = i.address || '—';
    // حقول التعديل
    document.getElementById('acProfName').value = i.first || '';
    document.getElementById('acProfLast').value = i.last || '';
    document.getElementById('acProfPhone').value = i.phone || '';
    document.getElementById('acProfAddress').value = i.address || '';
    document.getElementById('acProfMsg').className = 'ac-msg';
    document.getElementById('acpView').style.display = '';
    document.getElementById('acpEdit').style.display = 'none';
    if (window._acTab) window._acTab('profile');
    document.getElementById('acProfOverlay').classList.add('show');
  };
  window._acEditProfile = function () { document.getElementById('acpView').style.display = 'none'; document.getElementById('acpEdit').style.display = ''; };
  window._acCancelEdit = function () { document.getElementById('acpEdit').style.display = 'none'; document.getElementById('acpView').style.display = ''; document.getElementById('acProfMsg').className = 'ac-msg'; };
  window._acCloseProfile = function () { var o = document.getElementById('acProfOverlay'); if (o) o.classList.remove('show'); };

  /* ---------- صورة الحساب: أوّل حرف من الاسم دائماً (لا رفع صور) ---------- */
  window._acRenderAvatar = function () {
    var el = document.getElementById('acpAv'); if (!el) return;
    var i = window.currentUserInfo() || {};
    el.textContent = (i.first || i.email || '؟').charAt(0).toUpperCase();
  };

  /* ---------- تبويبات الحساب: الملف الشخصي / المفضلة / محادثاتي ---------- */
  window._acTab = function (name) {
    ['profile', 'fav', 'chats'].forEach(function (t) {
      var btn = document.querySelector('.acp-tab[data-t="' + t + '"]');
      var pane = document.getElementById('acpPane' + t);
      if (btn) btn.classList.toggle('active', t === name);
      if (pane) pane.classList.toggle('active', t === name);
    });
    var ov = document.getElementById('acProfOverlay'); if (ov) ov.scrollTop = 0;
    if (name === 'fav') _acRenderFav();
    else if (name === 'chats') _acRenderMyChatsPane();
  };
  function _acRenderFav(box) {
    box = box || document.getElementById('acpPanefav'); if (!box) return;
    var favs = (typeof getFavs === 'function') ? getFavs() : [];
    var all = (typeof listings !== 'undefined' && listings) ? listings : [];
    var items = all.filter(function (l) { return favs.indexOf(String(l.id)) > -1; });
    if (!items.length) { box.innerHTML = '<div class="ac-empty">لا توجد إعلانات في المفضلة بعد</div>'; return; }
    box.innerHTML = items.map(function (l) {
      var img = (l.images && l.images.length) ? l.images[0] : '';
      var price = (typeof fmtPrice === 'function') ? fmtPrice(l.price) : ((l.price || 0) + ' ل.س');
      return '<div class="acp-listitem" onclick="window._acGoDetail(\'' + l.id + '\')">'
        + (img ? '<img src="' + esc(img) + '" alt="">' : '<div class="acp-li-noimg">' + SUPPORT_SVG + '</div>')
        + '<div class="acp-li-info"><div class="t">' + esc(l.title || 'إعلان') + '</div><div class="p">' + price + '</div></div></div>';
    }).join('');
  }
  async function _acRenderMyChatsPane(box) {
    box = box || document.getElementById('acpPanechats'); if (!box) return;
    if (!_user) { box.innerHTML = '<div class="ac-empty">سجّل الدخول لعرض محادثاتك</div>'; return; }
    box.innerHTML = '<div class="ac-empty">جارٍ التحميل...</div>';
    var r = await sb.from('conversations').select('*').eq('user_id', _user.id).order('last_message_at', { ascending: false });
    if (r.error) { box.innerHTML = '<div class="ac-empty">تعذّر التحميل</div>'; return; }
    if (!r.data || !r.data.length) { box.innerHTML = '<div class="ac-empty">لا توجد محادثات بعد</div>'; return; }
    var all = (typeof listings !== 'undefined' && listings) ? listings : [];
    box.innerHTML = r.data.map(function (c) {
      var l = null; try { l = all.find(function (x) { return String(x.id) === String(c.ad_id); }); } catch (e) {}
      var title = (l && l.title) || c.subject || 'الدردشة مع الإدارة';
      var img = (l && l.images && l.images.length) ? l.images[0] : '';
      return '<div class="acp-listitem" onclick="window._acChatFromPane(' + (c.ad_id != null ? c.ad_id : 'null') + ')">'
        + (img ? '<img src="' + esc(img) + '" alt="">' : '<div class="acp-li-noimg">' + SUPPORT_SVG + '</div>')
        + '<div class="acp-li-info"><div class="t">' + esc(title) + '</div><div class="d">' + fmtTime(c.last_message_at || c.created_at) + '</div></div></div>';
    }).join('');
  }
  window._acGoDetail = function (id) { window._acCloseProfile && window._acCloseProfile(); window._acCloseList && window._acCloseList(); if (typeof viewDetail === 'function') viewDetail(id); };
  window._acChatFromPane = function (adId) { window._acCloseProfile && window._acCloseProfile(); window._acCloseList && window._acCloseList(); if (typeof openChat === 'function') openChat(adId); };

  // ===== نافذتان مستقلّتان بملء الشاشة: المفضلة / محادثاتي =====
  (function () {
    var ov = document.createElement('div');
    ov.className = 'ac-overlay ac-sheet'; ov.id = 'acListOverlay';
    ov.innerHTML = '<div class="ac-card ac-sheet-card">'
      + '<div class="ac-sheet-head"><h3 id="acListTitle">المفضلة</h3><button class="ac-close" onclick="window._acCloseList()" aria-label="إغلاق">' + X_SVG + '</button></div>'
      + '<div class="ac-sheet-body" id="acListBody"></div>'
      + '</div>';
    document.body.appendChild(ov);
  })();
  window._acCloseList = function () { var o = document.getElementById('acListOverlay'); if (o) o.classList.remove('show'); };
  window._acOpenFav = function () {
    document.getElementById('acListTitle').textContent = 'المفضلة';
    _acRenderFav(document.getElementById('acListBody'));
    document.getElementById('acListOverlay').classList.add('show');
  };
  window._acOpenChats = function () {
    if (!_user) { window._acOpenAuth(); return; }
    document.getElementById('acListTitle').textContent = 'محادثاتي';
    var body = document.getElementById('acListBody'); body.innerHTML = '<div class="ac-empty">جارٍ التحميل...</div>';
    document.getElementById('acListOverlay').classList.add('show');
    _acRenderMyChatsPane(body);
  };
  // ===== طلباتي (حجز/شراء) — متابعة حالة الطلب =====
  function _reqCard(b) {
    var isSale = b.deal_type === 'sale';
    var typeLbl = isSale ? 'طلب شراء' : 'طلب حجز';
    var st = b.status || 'pending';
    var idx = st === 'confirmed' ? 3 : st === 'reserved' ? 2 : st === 'rejected' ? -1 : 1;
    var steps = ['بانتظار التدقيق', 'قيد المعالجة', 'تمت الموافقة'];
    var parts = steps.map(function (s, i) {
      var n = i + 1, cls = 'req-step' + (idx > 0 && n < idx ? ' done' : '') + (n === idx ? ' cur' : '');
      var dot = (idx > 0 && (n < idx || (n === idx && idx === 3))) ? '✓' : n;
      return '<div class="' + cls + '"><span class="req-dot">' + dot + '</span><span class="req-slbl">' + s + '</span></div>';
    });
    var stepsHtml = parts.join('<span class="req-line"></span>');
    var _waBtn = '<a class="req-wa" href="https://wa.me/963983127483?text=' + encodeURIComponent('مرحباً، بخصوص طلبي: ' + (b.ad_title || '')) + '" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M17.5 14.4c-.3-.1-1.7-.9-2-1-.3-.1-.5-.1-.6.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.6-2-.2-.3 0-.5.1-.6l.5-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.6-1.6-.9-2.2-.2-.6-.5-.5-.6-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3"/></svg> التواصل مع الإدارة</a>';
    var extra = '';
    if (st === 'confirmed') extra = '<div class="req-approved"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>تمت الموافقة</span></div>';
    else if (st === 'rejected') extra = '<div class="req-rejected">تعذّر قبول هذا الطلب.</div>' + _waBtn;
    var img = b.ad_image ? '<img class="req-img" src="' + esc(b.ad_image) + '" alt="">' : '';
    return '<div class="req-card">'
      + '<div class="req-head">' + img + '<div style="flex:1;min-width:0"><div class="req-type">' + typeLbl + '</div><div class="req-title">' + esc(b.ad_title || 'إعلان') + '</div></div><span class="req-date">' + fmtTime(b.created_at) + '</span></div>'
      + (idx < 0 ? '' : '<div class="req-steps">' + stepsHtml + '</div>')
      + extra
      + '</div>';
  }
  async function _acRenderRequests(box) {
    box = box || document.getElementById('acListBody'); if (!box) return;
    if (!_user) { box.innerHTML = '<div class="ac-empty">سجّل الدخول لعرض طلباتك</div>'; return; }
    box.innerHTML = '<div class="ac-empty">جارٍ التحميل...</div>';
    var r = await sb.from('bookings').select('*').eq('user_id', _user.id).order('created_at', { ascending: false });
    if (r.error) { box.innerHTML = '<div class="ac-empty">تعذّر التحميل</div>'; return; }
    if (!r.data || !r.data.length) { box.innerHTML = '<div class="ac-empty">لا توجد طلبات بعد.<br>طلبات الحجز والشراء ستظهر هنا مع حالتها.</div>'; return; }
    box.innerHTML = r.data.map(_reqCard).join('');
  }
  window._acOpenRequests = function () {
    if (!_user) { window._acOpenAuth(); return; }
    document.getElementById('acListTitle').textContent = 'طلباتي';
    var body = document.getElementById('acListBody'); body.innerHTML = '<div class="ac-empty">جارٍ التحميل...</div>';
    document.getElementById('acListOverlay').classList.add('show');
    _acRenderRequests(body);
  };
  window._acSaveProfile = async function () {
    var first = document.getElementById('acProfName').value.trim();
    var last = document.getElementById('acProfLast').value.trim();
    var phone = document.getElementById('acProfPhone').value.trim();
    var address = document.getElementById('acProfAddress').value.trim();
    var m = document.getElementById('acProfMsg');
    if (!first || !last || !phone) { m.textContent = 'أدخل الاسم والكنية ورقم الهاتف'; m.className = 'ac-msg err'; return; }
    var btn = document.getElementById('acProfSave'); btn.disabled = true; btn.textContent = 'جارٍ...';
    var r = await sb.auth.updateUser({ data: { first_name: first, last_name: last, full_name: (first + ' ' + last).trim(), phone: phone, address: address } });
    btn.disabled = false; btn.textContent = 'حفظ';
    if (r.error) { m.textContent = 'تعذّر: ' + r.error.message; m.className = 'ac-msg err'; return; }
    _user = r.data.user; renderAccountBlock();
    window._acOpenProfile(); // أعد بناء الجدول المقفل بالقيم الجديدة
    var m2 = document.getElementById('acProfMsg'); m2.textContent = 'تم الحفظ بنجاح'; m2.className = 'ac-msg ok';
  };
  // تغيير كلمة المرور عبر رابط تحقّق يُرسَل إلى بريد المستخدم (وليس مباشرة)
  window._acChangePassword = async function () {
    if (!_user || !_user.email) { window.uiToast('تعذّر — لا يوجد بريد مرتبط بالحساب', 'error'); return; }
    var ok = await window.uiConfirm('سنرسل رابط تغيير كلمة المرور إلى بريدك:\n' + _user.email, { title: 'تغيير كلمة المرور', okText: 'إرسال الرابط' });
    if (!ok) return;
    try {
      var r = await sb.auth.resetPasswordForEmail(_user.email, { redirectTo: window.location.origin + window.location.pathname });
      if (r.error) throw r.error;
      window.uiAlert('أرسلنا رابط تغيير كلمة المرور إلى بريدك.\nافتح الرابط لتعيين كلمة مرور جديدة.', { type: 'success', title: 'تحقّق من بريدك' });
    } catch (e) {
      var c = (e && e.message) || '';
      if (/rate|seconds|too many/i.test(c)) window.uiToast('أرسلنا رابطاً منذ قليل — انتظر دقيقة ثم أعد المحاولة.', 'error');
      else window.uiToast('تعذّر الإرسال: ' + (c || 'حاول لاحقاً'), 'error');
    }
  };
  // تسجيل الدخول عبر مزوّد خارجي (Google / Facebook)
  window._acOAuth = async function (provider) {
    try {
      var r = await sb.auth.signInWithOAuth({ provider: provider, options: { redirectTo: window.location.origin + window.location.pathname } });
      if (r.error) throw r.error;
    } catch (e) {
      var c = (e && e.message) || '';
      if (/provider is not enabled|Unsupported provider/i.test(c)) window.uiToast('هذا الخيار غير مُفعّل بعد. يجب تفعيله من إعدادات Supabase.', 'error');
      else window.uiToast('تعذّر تسجيل الدخول: ' + (c || 'حاول لاحقاً'), 'error');
    }
  };

  /* ---------- قائمة "محادثاتي" ---------- */
  window._acOpenMyChats = async function () {
    if (!_user) { window._acOpenAuth(); return; }
    _unread = 0; updateChatBadge();
    document.getElementById('acMyChats').classList.add('show');
    var box = document.getElementById('acMyList');
    box.innerHTML = '<div class="ac-empty">جارٍ التحميل...</div>';
    var r = await sb.from('conversations').select('*').eq('user_id', _user.id).order('last_message_at', { ascending: false });
    if (r.error) { box.innerHTML = '<div class="ac-empty">تعذّر التحميل</div>'; return; }
    if (!r.data || !r.data.length) { box.innerHTML = '<div class="ac-empty">لا توجد محادثات بعد</div>'; return; }
    var all = (typeof listings !== 'undefined') ? listings : [];
    box.innerHTML = r.data.map(function (c) {
      var l = null;
      try { l = all.find(function (x) { return String(x.id) === String(c.ad_id); }); } catch (e) {}
      var title = (l && l.title) || c.subject || 'الدردشة مع الإدارة';
      var img = (l && l.images && l.images.length) ? l.images[0] : '';
      var ref = (l && l.ref) || '';
      var thumb = img
        ? '<img class="ac-my-img" src="' + esc(img) + '" alt="">'
        : '<div class="ac-my-img ac-my-noimg">' + SUPPORT_SVG + '</div>';
      return '<div class="ac-myitem" onclick="window._acOpenFromList(' + (c.ad_id != null ? c.ad_id : 'null') + ')">'
        + thumb
        + '<div class="ac-my-info">'
        + '<div class="t">' + esc(title) + '</div>'
        + (ref ? '<div class="ac-my-ref">كود: ' + esc(ref) + '</div>' : '')
        + '<div class="d">' + fmtTime(c.last_message_at || c.created_at) + '</div>'
        + '</div></div>';
    }).join('');
  };
  window._acCloseMyChats = function () { document.getElementById('acMyChats').classList.remove('show'); };
  window._acOpenFromList = function (adId) { window._acCloseMyChats(); openChat(adId); };

  /* ---------- نافذة الترحيب (تظهر مرة عند الفتح) ---------- */
  function maybeWelcome() {
    // أُزيلت نافذة الترحيب التلقائية — الدخول متاح عبر أيقونة الحساب في الهيدر
  }

  /* ---------- 5) الدردشة ---------- */
  async function getOrCreateConversation(adId) {
    // ابحث عن محادثة قائمة لنفس المستخدم والإعلان
    var q = sb.from('conversations').select('*').eq('user_id', _user.id);
    if (adId != null) q = q.eq('ad_id', adId);
    var found = await q.order('id', { ascending: false }).limit(1);
    if (found.data && found.data.length) return found.data[0];
    // أنشئ جديدة
    var subj = '';
    try { var l = (window.listings || []).find(function (x) { return String(x.id) === String(adId); }); subj = l ? (l.title || '') : ''; } catch (e) {}
    var md = _user.user_metadata || {};
    var ins = await sb.from('conversations').insert({ user_id: _user.id, ad_id: adId != null ? adId : null, subject: subj, user_email: _user.email || '', user_name: md.full_name || '', user_phone: md.phone || '', user_address: md.address || '' }).select().single();
    if (ins.error) throw ins.error;
    return ins.data;
  }

  // سطر اسم المرسِل مع أيقونة الدعم بجانبه داخل الفقاعة
  function senderLine(name) {
    return '<div class="ac-sender">' + esc(name || 'الدعم') + '<span class="ac-sender-ic">' + SUPPORT_SVG + '</span></div>';
  }
  function renderMessage(m) {
    var body = document.getElementById('acChatBody');
    var mine = m.sender_role === 'user';
    var div = document.createElement('div');
    div.className = 'ac-bubble ' + (mine ? 'me' : 'them');
    if (mine) {
      div.innerHTML = esc(m.body) + '<span class="time">' + fmtTime(m.created_at) + '</span>';
    } else {
      div.innerHTML = senderLine(m.sender_name) + esc(m.body) + '<span class="time">' + fmtTime(m.created_at) + '</span>';
    }
    body.appendChild(div);
    var t = document.getElementById('acTyping'); if (t) body.appendChild(t); // أبقِ مؤشّر الكتابة بالأسفل
    body.scrollTop = body.scrollHeight;
  }
  // فقاعة الردّ التلقائي (الدعم الآلي)
  function botMsg(text) {
    var body = document.getElementById('acChatBody'); if (!body) return;
    var empty = body.querySelector('.ac-empty'); if (empty) empty.remove();
    var div = document.createElement('div'); div.className = 'ac-bubble them';
    div.innerHTML = senderLine('الدعم الآلي') + esc(text) + '<span class="time">' + fmtTime(new Date().toISOString()) + '</span>';
    body.appendChild(div);
    var t = document.getElementById('acTyping'); if (t) body.appendChild(t);
    body.scrollTop = body.scrollHeight;
  }
  // رسالة نظام مركزيّة (بدء/إنهاء الجلسة)
  function sysMsg(text) {
    var body = document.getElementById('acChatBody'); if (!body) return;
    var d = document.createElement('div'); d.className = 'ac-sys'; d.textContent = text;
    body.appendChild(d);
    var t = document.getElementById('acTyping'); if (t) body.appendChild(t);
    body.scrollTop = body.scrollHeight;
  }
  // مؤشّر "جاري الكتابة"
  function showTyping() {
    var body = document.getElementById('acChatBody'); if (!body) return;
    var t = document.getElementById('acTyping');
    if (!t) { t = document.createElement('div'); t.id = 'acTyping'; t.className = 'ac-typing'; t.innerHTML = '<span></span><span></span><span></span>'; }
    body.appendChild(t); t.classList.add('show'); body.scrollTop = body.scrollHeight;
    clearTimeout(_typingHide); _typingHide = setTimeout(hideTyping, 2600);
  }
  function hideTyping() { var t = document.getElementById('acTyping'); if (t) t.classList.remove('show'); }
  // قناة البثّ المشتركة مع الأدمن (كتابة + أحداث الجلسة)
  function joinRT(convId) {
    if (_rt) { sb.removeChannel(_rt); _rt = null; }
    _rt = sb.channel('rt-' + convId, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, function (p) { if (p.payload && p.payload.role === 'admin') showTyping(); })
      .on('broadcast', { event: 'session' }, function (p) {
        var d = p.payload || {};
        if (d.action === 'start') sysMsg('تم بدء الجلسة' + (d.name ? ' مع ' + d.name : ''));
        else if (d.action === 'end') {
          hideTyping(); sysMsg('تم إنهاء الجلسة — شكراً لتواصلك 🌹');
          var inp = document.getElementById('acChatInput'); if (inp) { inp.disabled = true; inp.placeholder = 'انتهت الجلسة'; }
          _conv = null; // لا يمكن إعادة فتحها — حُذفت نهائياً
          setTimeout(function () { window._acCloseChat(); }, 1600);
        }
      })
      .subscribe(function (status) {
        // أبلغ الأدمن أننا دخلنا — إن كان يشاهد المحادثة يردّ ببثّ "بدء الجلسة"
        if (status === 'SUBSCRIBED' && _rt) _rt.send({ type: 'broadcast', event: 'hello', payload: {} });
      });
  }
  window._acTyping = function () {
    var now = Date.now();
    if (_rt && now - _lastTyped > 1400) {
      _lastTyped = now;
      var nm = (window.currentUserInfo && window.currentUserInfo()) ? window.currentUserInfo().name : '';
      _rt.send({ type: 'broadcast', event: 'typing', payload: { role: 'user', name: nm || 'زائر' } });
    }
  };

  async function loadMessages(convId) {
    var body = document.getElementById('acChatBody'); body.innerHTML = '';
    var r = await sb.from('messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: true });
    if (r.error) { body.innerHTML = '<div class="ac-empty">تعذّر تحميل الرسائل</div>'; return; }
    if (!r.data.length) { body.innerHTML = '<div class="ac-empty">ابدأ المحادثة — اكتب رسالتك بالأسفل 👇</div>'; }
    else r.data.forEach(renderMessage);
  }

  function subscribe(convId) {
    if (_channel) { sb.removeChannel(_channel); _channel = null; }
    _channel = sb.channel('ac-msgs-' + convId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + convId },
        function (payload) {
          var m = payload.new;
          if (m.sender_role === 'user' && m.sender_id === _user.id) return; // رسالتي معروضة مسبقاً
          var empty = document.querySelector('#acChatBody .ac-empty'); if (empty) empty.remove();
          renderMessage(m);
        })
      .subscribe();
  }

  window.openChat = async function (adId, prefill) {
    // تأكّد من الجلسة
    if (!_user) { var s = await sb.auth.getSession(); _user = (s.data && s.data.session) ? s.data.session.user : null; }
    if (!_user) { window._acOpenAuth(adId, prefill); return; }
    try {
      _conv = await getOrCreateConversation(adId);
      var title = _conv.subject ? ('بخصوص: ' + _conv.subject) : 'الدردشة مع الإدارة';
      document.getElementById('acChatTitle').textContent = title;
      var inp0 = document.getElementById('acChatInput'); if (inp0) { inp0.disabled = false; inp0.placeholder = 'اكتب رسالتك...'; }
      document.getElementById('acChat').classList.add('show');
      await loadMessages(_conv.id);
      subscribe(_conv.id);
      joinRT(_conv.id);
      _unread = 0; updateChatBadge();
      // احفظ أن الدردشة مفتوحة لإعادة فتحها بعد الريفريش
      try { sessionStorage.setItem('tt_open_chat', JSON.stringify({ adId: adId == null ? null : adId })); } catch (e) {}
      // رسالة الترحيب تصل فقط بعد أن يرسل الزبون أوّل رسالة (في _acSend)
      _autoReplied = !!document.querySelector('#acChatBody .ac-bubble.me');
      if (prefill) { document.getElementById('acChatInput').value = prefill; }
      setTimeout(function () { document.getElementById('acChatInput').focus(); }, 100);
    } catch (e) { window.uiToast('تعذّر فتح الدردشة: ' + ((e && e.message) || ''), 'error'); }
  };

  window._acCloseChat = function () {
    document.getElementById('acChat').classList.remove('show');
    if (_channel) { sb.removeChannel(_channel); _channel = null; }
    if (_rt) { sb.removeChannel(_rt); _rt = null; }
    _conv = null;
    try { sessionStorage.removeItem('tt_open_chat'); } catch (e) {}
  };

  window._acSend = async function () {
    var inp = document.getElementById('acChatInput'); var text = inp.value.trim();
    if (!text || !_conv || !_user) return;
    inp.value = '';
    inp.focus(); // أبقِ لوحة المفاتيح مفتوحة على الموبايل
    renderMessage({ sender_role: 'user', body: text, created_at: new Date().toISOString() });
    var empty = document.querySelector('#acChatBody .ac-empty'); if (empty) empty.remove();
    var md = _user.user_metadata || {};
    var r = await sb.from('messages').insert({ conversation_id: _conv.id, sender_id: _user.id, sender_role: 'user', body: text, sender_name: md.full_name || '' });
    if (r.error) { window.uiToast('تعذّر الإرسال: ' + r.error.message, 'error'); return; }
    sb.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', _conv.id).then(function () {});
    // رسالة الترحيب/الردّ التلقائي — تصل بعد أوّل رسالة يرسلها الزبون فقط
    if (!_autoReplied) { _autoReplied = true; setTimeout(function () { botMsg('👋 أهلاً بك في «طلبك تم»! شكراً لتواصلك 🌹 تم استلام رسالتك وسيردّ عليك فريق الدعم في أسرع وقت.'); }, 600); }
  };

  /* ---------- إشعارات العميل: رسالة جديدة من الإدارة في أي محادثة ---------- */
  function updateChatBadge() {
    var b = document.querySelector('.chat-unread');
    if (b) { b.textContent = _unread; b.style.display = _unread > 0 ? 'inline-flex' : 'none'; }
    // النقطة الحمراء على زرّ القائمة (الناف بار) — المحادثات رجعت للناف بار
    var mb = document.querySelector('.menu-btn');
    if (mb) {
      var dot = mb.querySelector('.menu-dot');
      if (_unread > 0 && !dot) { dot = document.createElement('span'); dot.className = 'menu-dot'; dot.style.cssText = 'position:absolute;top:6px;right:6px;width:10px;height:10px;background:#ef4444;border-radius:50%;box-shadow:0 0 0 2px #fff'; mb.style.position = 'relative'; mb.appendChild(dot); }
      else if (_unread === 0 && dot) dot.remove();
    }
    // عدّاد على عنصر «محادثاتي» داخل القائمة
    var mc = document.getElementById('menuChatsDot');
    if (mc) { if (_unread > 0) { mc.textContent = _unread > 9 ? '9+' : _unread; mc.style.display = 'flex'; } else { mc.style.display = 'none'; } }
    // أزِل أي نقطة قديمة من زرّ البروفايل
    var oldPb = document.querySelector('#acHeaderBtn .acp-unread-dot'); if (oldPb) oldPb.remove();
  }
  function ping() { try { var c = new (window.AudioContext || window.webkitAudioContext)(); var o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = 'sine'; o.frequency.value = 880; g.gain.setValueAtTime(.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(.15, c.currentTime + .01); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + .25); o.start(); o.stop(c.currentTime + .26); } catch (e) {} }
  function subscribeNotifications() {
    if (_notifyCh || !_user) return;
    _notifyCh = sb.channel('notify-' + _user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, function (payload) {
        var m = payload.new;
        if (!m || m.sender_role !== 'admin') return;          // فقط ردود الإدارة
        if (_conv && m.conversation_id === _conv.id) return;   // المحادثة مفتوحة أصلاً
        _unread++; updateChatBadge(); ping();
        window.uiToast && window.uiToast('رسالة جديدة من ' + (m.sender_name || 'الإدارة'), 'info');
      }).subscribe();
  }
  function unsubscribeNotifications() { if (_notifyCh) { sb.removeChannel(_notifyCh); _notifyCh = null; } _unread = 0; updateChatBadge(); }

  /* ---------- 6) تتبّع حالة الجلسة ---------- */
  function showReset() {
    var ov = document.getElementById('acResetOverlay'); if (!ov) return;
    document.getElementById('acResetMsg').className = 'ac-msg';
    document.getElementById('acResetPass').value = '';
    ov.classList.add('show');
  }
  // إن عاد المستخدم من رابط إعادة التعيين، افتح نافذة كلمة المرور فوراً
  if (_recoveryInUrl) { setTimeout(showReset, 400); }

  // getSession يقرأ الجلسة من التخزين المحلّي فوراً (لا يفقد الحساب عند الريفريش)
  sb.auth.getSession().then(async function (s) {
    _user = (s.data && s.data.session) ? s.data.session.user : null;
    if (_user) await checkBlocked();
    renderAccountBlock();
    maybeWelcome();
    if (_user) subscribeNotifications();
    // إعادة فتح الدردشة إن كانت مفتوحة قبل الريفريش (لا تخرج للرئيسية)
    if (_user && !_recoveryInUrl) {
      try {
        var oc = JSON.parse(sessionStorage.getItem('tt_open_chat') || 'null');
        if (oc) setTimeout(function () { window.openChat(oc.adId); }, 350);
      } catch (e) {}
    }
  });
  sb.auth.onAuthStateChange(function (_e, session) {
    _user = session ? session.user : null;
    renderAccountBlock();
    if (_user) subscribeNotifications(); else unsubscribeNotifications();
    // المستخدم فتح رابط إعادة التعيين من بريده → اعرض نافذة كلمة المرور الجديدة
    if (_e === 'PASSWORD_RECOVERY') showReset();
  });
})();
