/* ============================================================
   طلبك تم — نافذة الحجز متعدّدة الخطوات (ملء الشاشة، مثل Airbnb)
   خطوة 1: التواريخ · خطوة 2: المعلومات · خطوة 3: المراجعة والإرسال
   تعتمد على: listings, _adminBlockedDates, currentUserInfo, submitBookingRequest, fmtPrice, MONTHS, DAYS
   ============================================================ */
(function () {
  'use strict';
  var MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  var DAYS_AR = ['أحد','إثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'];
  var SVG = {
    cal:'<svg class="bk-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    clock:'<svg class="bk-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    money:'<svg class="bk-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>'
  };

  var _ad = null, _start = null, _end = null, _cy, _cm, _step = 1;
  var _mode = 'rent', _months = null;   // وضع الحجز: يومي (rent) أو شهري (monthly)

  /* أخفِ التقويم/النموذج القديم داخل التفاصيل (استُبدل بهذه النافذة) */
  var css = ''
    + '#calSection,#bookFormSection,.rent-type-toggle,#dailySection .rent-cal-main,#monthlySection .rent-cal-main{display:none !important}'
    /* تنظيف التخطيط بعد إخفاء التقويم + بطاقة حجز بأسلوب Gathern */
    + '@media(min-width:1024px){.rent-cal-layout{display:block !important}.rent-book-sidebar{position:sticky;top:80px;flex:none !important;max-width:460px;margin:0 auto}}'
    + '.rent-book-card{background:#fff;border:1px solid #eef2f7;border-radius:18px;padding:20px;box-shadow:0 6px 24px rgba(0,0,0,.07);max-width:460px;margin:16px auto}'
    + '.rent-book-card .rbc-price{font-size:24px;font-weight:900;color:#0f172a;text-align:center;margin-bottom:4px}'
    + '.rent-book-card .rbc-price small{font-size:13px;font-weight:600;color:#94a3b8}'
    + '.rent-book-card .rbc-dates{font-size:13px;color:#64748b;text-align:center;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #f1f5f9}'
    + '.rent-book-card .rbc-btn{width:100%;padding:15px;border-radius:13px;font-size:16px;font-weight:800}'
    + '.bk-overlay{position:fixed;inset:0;z-index:11000;background:#fff;display:none;flex-direction:column;direction:rtl;font-family:inherit}'
    + '.bk-overlay.show{display:flex}'
    + '.bk-head{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #eef2f7;flex-shrink:0}'
    + '.bk-head button{background:none;border:none;font-size:1.6rem;color:#475569;cursor:pointer;line-height:1}'
    + '.bk-head .ti{font-weight:800;color:#0f172a;font-size:1rem;flex:1}'
    + '.bk-steps{display:flex;gap:6px;padding:0 16px 12px;flex-shrink:0}'
    + '.bk-steps span{flex:1;height:4px;border-radius:3px;background:#e2e8f0}'
    + '.bk-steps span.on{background:#F6921E}'
    + '.bk-body{flex:1;overflow-y:auto;padding:16px;max-width:520px;width:100%;margin:0 auto;box-sizing:border-box}'
    + '.bk-foot{display:flex;gap:10px;padding:14px 16px;border-top:1px solid #eef2f7;max-width:520px;width:100%;margin:0 auto;box-sizing:border-box;flex-shrink:0}'
    + '.bk-btn{flex:1;padding:14px;border:none;border-radius:12px;font-size:1rem;font-weight:800;cursor:pointer;font-family:inherit}'
    + '.bk-btn.primary{background:#F6921E;color:#fff}'
    + '.bk-btn.primary:disabled{opacity:.5;cursor:default}'
    + '.bk-btn.ghost{background:#fff;color:#475569;border:1.5px solid #e2e8f0}'
    + '.bk-sec-title{font-weight:800;color:#0f172a;margin:0 0 12px;font-size:1.05rem}'
    /* التقويم */
    + '.bk-cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}'
    + '.bk-cal-head button{width:38px;height:38px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;font-size:1.1rem}'
    + '.bk-cal-mn{font-weight:800;color:#0f172a}'
    + '.bk-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}'
    + '.bk-dn{text-align:center;font-size:.7rem;color:#94a3b8;font-weight:700;padding:4px 0}'
    + '.bk-d{aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:.92rem;cursor:pointer;color:#0f172a;font-weight:600;position:relative;border-radius:50%}'
    + '.bk-d span{position:relative;z-index:2}'
    + '.bk-d.emp{visibility:hidden}'
    + '.bk-d.dis{cursor:default}.bk-d.dis span{color:#cbd5e1}'
    + '.bk-d.booked{cursor:default}.bk-d.booked span{color:#fca5a5;text-decoration:line-through}'
    + '.bk-d:not(.dis):not(.booked):not(.sel):not(.rs):not(.re):hover{background:#fff4e6}'
    + '.bk-d.inr{background:#fde8d0;border-radius:0}.bk-d.inr span{color:#9a3412}'
    + '.bk-d.rs::before,.bk-d.re::before{content:"";position:absolute;top:0;bottom:0;width:50%;background:#fde8d0;z-index:0}'
    + '.bk-d.rs::before{left:0}.bk-d.re::before{right:0}'
    + '.bk-d.sel::after,.bk-d.rs::after,.bk-d.re::after{content:"";position:absolute;inset:2px;background:#F6921E;border-radius:50%;z-index:1;box-shadow:0 2px 8px rgba(246,146,30,.4)}'
    + '.bk-d.sel span,.bk-d.rs span,.bk-d.re span{color:#fff}'
    /* أيقونات SVG داخل الملخّص */
    + '.bk-ic{width:16px;height:16px;color:#94a3b8;flex-shrink:0;vertical-align:-3px;margin-left:6px}'
    + '.bk-sum .ln{display:flex;align-items:center;gap:2px;margin:3px 0}'
    /* تخطيط اللابتوب: روزنامة + معلومات جنباً إلى جنب */
    + '@media(min-width:1000px){.bk-body{max-width:860px}.bk-two{display:flex;gap:30px;align-items:flex-start}.bk-two .bk-col-cal{flex:1;min-width:0}.bk-two .bk-col-info{flex:0 0 300px;border-right:1px solid #eef2f7;padding-right:26px}.bk-two .bk-col-info .bk-sec-title{margin-top:0}}'
    + '.bk-sum{margin-top:14px;background:#f8fafc;border:1px solid #eef2f7;border-radius:12px;padding:12px;font-size:.9rem;color:#334155;line-height:2}'
    /* اختيار الأشهر (الإيجار الشهري) */
    + '.bk-msel{width:100%;box-sizing:border-box;padding:14px;border:1.5px solid #e2e8f0;border-radius:12px;font-size:1rem;font-family:inherit;outline:none;background:#fff}'
    + '.bk-msel:focus{border-color:#F6921E}'
    /* الحقول */
    + '.bk-field{margin-bottom:12px}'
    + '.bk-field label{display:block;font-size:.82rem;font-weight:700;color:#334155;margin-bottom:6px}'
    + '.bk-field input{width:100%;box-sizing:border-box;padding:13px 14px;border:1.5px solid #e2e8f0;border-radius:12px;font-size:.95rem;font-family:inherit;outline:none}'
    + '.bk-field input:focus{border-color:#F6921E}'
    + '.bk-review{background:#f8fafc;border:1px solid #eef2f7;border-radius:14px;padding:16px;font-size:.92rem;color:#334155;line-height:2.2}'
    + '.bk-review b{color:#0f172a}'
    + '.bk-review .row{display:flex;justify-content:space-between;gap:10px;border-bottom:1px dashed #e2e8f0;padding:4px 0}'
    + '.bk-review .total{color:#F6921E;font-weight:800;font-size:1.05rem}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var el = document.createElement('div');
  el.className = 'bk-overlay'; el.id = 'bkOverlay';
  el.innerHTML = ''
    + '<div class="bk-head"><button onclick="window._bkBack()" id="bkX">&times;</button><div class="ti" id="bkTitle">الحجز</div></div>'
    + '<div class="bk-steps"><span id="bkS1"></span><span id="bkS2"></span><span id="bkS3"></span></div>'
    + '<div class="bk-body" id="bkBody"></div>'
    + '<div class="bk-foot" id="bkFoot"></div>';
  document.body.appendChild(el);

  function esc(s){ var d=document.createElement('div'); d.textContent=s==null?'':s; return d.innerHTML; }
  function money(n){ try { return (window.fmtPrice ? window.fmtPrice(n) : Number(n).toLocaleString('en-US')+' ل.س'); } catch(e){ return n+' ل.س'; } }
  function iso(dt){ return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0'); }
  function fmtD(dt){ return dt.getDate()+' '+MONTHS_AR[dt.getMonth()]+' '+dt.getFullYear(); }
  function blockedFor(adId){
    var bd = (typeof _adminBlockedDates !== 'undefined' && _adminBlockedDates) ? (_adminBlockedDates[adId] || []) : [];
    var booked = [];
    try { var lb = JSON.parse(localStorage.getItem('tam_booked')||'{}'); booked = lb[adId]||[]; } catch(e){}
    return bd.concat(booked);
  }
  function daysCount(){
    if(!_start||!_end) return _start?1:0;
    var n=0, t=new Date(_start);
    while(t<=_end){ n++; t.setDate(t.getDate()+1); }
    return n;
  }

  /* ---------- فتح النافذة ---------- */
  window.openBooking = function (adId, mode) {
    var list = (typeof listings !== 'undefined') ? listings : [];
    _ad = list.find(function(x){ return String(x.id)===String(adId); }) || window._currentListing;
    if(!_ad){ window.uiToast('تعذّر فتح الحجز','error'); return; }
    _mode = (mode==='monthly' || mode==='sale') ? mode : 'rent';
    _start=null; _end=null; _months=null; _step=1;
    var n=new Date(); _cy=n.getFullYear(); _cm=n.getMonth();
    // حدّث الأيام المعطّلة من القاعدة إن أمكن
    if (window.refreshBlockedDates) { try { window.refreshBlockedDates().then(render); } catch(e){ render(); } }
    else render();
    document.getElementById('bkOverlay').classList.add('show');
    document.body.style.overflow='hidden';
  };
  window._bkClose = function(){ document.getElementById('bkOverlay').classList.remove('show'); document.body.style.overflow=''; };
  window._bkBack = function(){ if(isDesk() && _step===3){ _step=1; render(); return; } if(_step>1){ _step--; render(); } else window._bkClose(); };
  window._bkNext = function(){ if(_step<3){ _step++; render(); } };

  function setSteps(){
    if(_mode==='sale'){
      document.getElementById('bkS2').style.display='none';
      document.getElementById('bkS3').style.display='none';
      document.getElementById('bkS1').className='on';
      document.getElementById('bkTitle').textContent='طلب الشراء';
      return;
    }
    document.getElementById('bkS2').style.display='';
    var desk=isDesk();
    document.getElementById('bkS3').style.display = desk?'none':'';
    document.getElementById('bkS1').className = 'on';
    document.getElementById('bkS2').className = (desk ? (_step>=3?'on':'') : (_step>=2?'on':''));
    document.getElementById('bkS3').className = (_step>=3?'on':'');
    var s1t = (_mode==='monthly') ? 'اختر المدّة' : 'اختر التواريخ';
    document.getElementById('bkTitle').textContent = desk ? (_step<3?'تفاصيل الحجز':'مراجعة الطلب') : (_step===1?s1t:_step===2?'معلوماتك':'مراجعة الطلب');
  }

  /* ---------- العرض ---------- */
  function isDesk(){ return window.innerWidth >= 1000; }
  function render(){
    setSteps();
    var body=document.getElementById('bkBody'), foot=document.getElementById('bkFoot');
    if(_mode==='sale'){
      // طلب الشراء: فورم واحد يُملأ ويُرسل مباشرة (بلا روزنامة وبلا مراجعة)
      body.innerHTML='<div class="bk-sec-title">معلومات طلب الشراء</div>'+infoHtml();
      foot.innerHTML='<button class="bk-btn primary" onclick="window._bkSaleSend()">إرسال الطلب</button>';
      return;
    }
    var monthly = _mode==='monthly';
    var step1Html = monthly ? monthsHtml() : calHtml();
    var step1Title = monthly ? 'اختر مدّة الإيجار' : 'اختر تواريخ الحجز';
    var step1Ready = monthly ? (_months!=null) : (_start&&_end);
    if(isDesk()){
      if(_step<3){
        body.innerHTML='<div class="bk-two"><div class="bk-col-cal"><div class="bk-sec-title">'+step1Title+'</div>'+step1Html+'</div>'
          + '<div class="bk-col-info"><div class="bk-sec-title">معلوماتك</div>'+infoHtml()+'</div></div>';
        foot.innerHTML='<button class="bk-btn primary" onclick="window._bkDeskNext()">التالي — مراجعة الطلب</button>';
      } else {
        body.innerHTML=reviewHtml();
        foot.innerHTML='<button class="bk-btn ghost" onclick="window._bkBack()">تعديل</button><button class="bk-btn primary" onclick="window._bkSend()">إرسال الطلب</button>';
      }
      return;
    }
    if(_step===1){ body.innerHTML=step1Html; foot.innerHTML='<button class="bk-btn primary" '+(step1Ready?'':'disabled')+' onclick="window._bkNext()">التالي</button>'; }
    else if(_step===2){ body.innerHTML=infoHtml(); foot.innerHTML='<button class="bk-btn ghost" onclick="window._bkBack()">رجوع</button><button class="bk-btn primary" onclick="window._bkToReview()">التالي</button>'; }
    else { body.innerHTML=reviewHtml(); foot.innerHTML='<button class="bk-btn ghost" onclick="window._bkBack()">تعديل</button><button class="bk-btn primary" onclick="window._bkSend()">إرسال الطلب</button>'; }
  }
  window._bkDeskNext=function(){
    if(_mode==='monthly'){ if(_months==null){ window.uiToast('اختر مدّة الإيجار أولاً','error'); return; } }
    else if(!_start||!_end){ window.uiToast('اختر تواريخ الحجز أولاً','error'); return; }
    var info=readInfo(); if(!info) return;
    _info=info; _step=3; render();
  };
  // طلب الشراء: يملأ الفورم ويُرسل مباشرة
  window._bkSaleSend=function(){ var info=readInfo(); if(!info) return; _info=info; window._bkSend(); };

  /* خطوة 1: التقويم */
  function calHtml(){
    var blocked=blockedFor(_ad.id);
    var fd=new Date(_cy,_cm,1).getDay(), dm=new Date(_cy,_cm+1,0).getDate();
    var td=new Date(); td.setHours(0,0,0,0);
    var h='<div class="bk-cal-head"><button onclick="window._bkPrev()">&#8250;</button><div class="bk-cal-mn">'+MONTHS_AR[_cm]+' '+_cy+'</div><button onclick="window._bkNextM()">&#8249;</button></div>';
    h+='<div class="bk-grid">'+DAYS_AR.map(function(d){return '<div class="bk-dn">'+d+'</div>';}).join('');
    for(var i=0;i<fd;i++) h+='<div class="bk-d emp"></div>';
    for(var d=1;d<=dm;d++){
      var dt=new Date(_cy,_cm,d), past=dt<td;
      var key=_cy+'-'+String(_cm+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
      var isB=blocked.indexOf(key)>-1;
      var cl='bk-d';
      if(past) cl+=' dis'; else if(isB) cl+=' booked';
      if(_start&&_end){ var t=dt.getTime(),s=_start.getTime(),e=_end.getTime();
        if(t===s&&t===e)cl+=' sel'; else if(t===s)cl+=' rs'; else if(t===e)cl+=' re'; else if(t>s&&t<e)cl+=' inr';
      } else if(_start&&dt.getTime()===_start.getTime()) cl+=' sel';
      h+='<div class="'+cl+'" '+((past||isB)?'':'onclick="window._bkPick('+_cy+','+_cm+','+d+')"')+'><span>'+d+'</span></div>';
    }
    h+='</div>';
    if(_start&&_end){ var n=daysCount();
      h+='<div class="bk-sum">'
        + '<div class="ln">'+SVG.cal+fmtD(_start)+' ← '+fmtD(_end)+'</div>'
        + '<div class="ln">'+SVG.clock+'المدة: <b style="margin-right:4px">'+n+' يوم</b></div>'
        + '<div class="ln">'+SVG.money+'الإجمالي: <b style="margin-right:4px;color:#F6921E">'+money(_ad.price*n)+'</b></div>'
        + '</div>';
    } else h+='<div class="bk-sum">اختر تاريخ الوصول ثم المغادرة</div>';
    return h;
  }
  window._bkPrev=function(){ _cm--; if(_cm<0){_cm=11;_cy--;} render(); };
  window._bkNextM=function(){ _cm++; if(_cm>11){_cm=0;_cy++;} render(); };
  window._bkPick=function(y,m,d){
    var dt=new Date(y,m,d);
    if(!_start||(_start&&_end)){ _start=dt; _end=null; }
    else if(dt<_start){ _start=dt; }
    else { _end=dt; }
    render();
  };

  /* خطوة 1 (شهري): اختيار المدّة */
  function monthsHtml(){
    var opts='<option value="">— اختر مدّة الإيجار —</option>';
    for(var i=1;i<=24;i++) opts+='<option value="'+i+'"'+(_months===i?' selected':'')+'>'+i+' شهر</option>';
    opts+='<option value="-1"'+(_months===-1?' selected':'')+'>مدة غير محدّدة</option>';
    var h='<select class="bk-msel" onchange="window._bkPickMonth(this.value)">'+opts+'</select>';
    if(_months!=null){
      h+='<div class="bk-sum">'
        + '<div class="ln">'+SVG.clock+'المدّة: <b style="margin-right:4px">'+(_months>0?_months+' شهر':'غير محدّدة')+'</b></div>'
        + '<div class="ln">'+SVG.money+'السعر: <b style="margin-right:4px;color:#0D9488">يُتفق عليه مع الإدارة</b></div>'
        + '</div>';
    } else h+='<div class="bk-sum">اختر عدد الأشهر — السعر يُتفق عليه مع الإدارة</div>';
    return h;
  }
  window._bkPickMonth=function(v){ _months = (v===''?null:parseInt(v)); render(); };

  /* خطوة 2: المعلومات */
  function infoHtml(){
    var info=(window.currentUserInfo&&window.currentUserInfo())||{};
    var parts=(info.name||'').trim().split(/\s+/);
    var first=info.first||parts.shift()||''; var last=info.last||parts.join(' ');
    return '<div class="bk-field"><label>الاسم</label><input id="bkName" value="'+esc(first)+'" placeholder="مثلاً: أحمد"></div>'
      + '<div class="bk-field"><label>الكنية</label><input id="bkLast" value="'+esc(last)+'" placeholder="مثلاً: علي"></div>'
      + '<div class="bk-field"><label>رقم الهاتف</label><input id="bkPhone" inputmode="numeric" dir="ltr" value="'+esc(info.phone||'')+'" placeholder="09xxxxxxxx" oninput="this.value=this.value.replace(/[^0-9]/g,\'\')"></div>'
      + '<div class="bk-field"><label>البريد الإلكتروني</label><input id="bkEmail" type="email" dir="ltr" value="'+esc(info.email||'')+'" placeholder="you@email.com"></div>'
      + '<div class="bk-field"><label>العنوان <span style="color:#94a3b8">(اختياري)</span></label><input id="bkAddr" value="'+esc(info.address||'')+'" placeholder="المدينة، الحي"></div>';
  }
  function readInfo(){
    var name=(document.getElementById('bkName').value||'').trim();
    var last=(document.getElementById('bkLast').value||'').trim();
    var phone=(document.getElementById('bkPhone').value||'').trim();
    var email=(document.getElementById('bkEmail').value||'').trim();
    if(!name||!last||!phone||!email){ window.uiToast('أدخل الاسم والكنية والهاتف والبريد الإلكتروني','error'); return null; }
    return { name:name, last:last, phone:phone, email:email, address:(document.getElementById('bkAddr').value||'').trim() };
  }
  window._bkToReview=function(){
    var info=readInfo(); if(!info) return;
    _info=info; _step=3; render();
  };
  var _info={};

  /* خطوة 3: المراجعة */
  function reviewHtml(){
    var head = '<div class="row"><span>الإعلان</span><b>'+esc(_ad.title||'')+'</b></div>'
      + (_ad.ref?'<div class="row"><span>الرمز</span><b>'+esc(_ad.ref)+'</b></div>':'');
    var who = '<div class="row"><span>الاسم</span><b>'+esc(_info.name)+'</b></div>'
      + '<div class="row"><span>الكنية</span><b>'+esc(_info.last)+'</b></div>'
      + '<div class="row"><span>الهاتف</span><b dir="ltr">'+esc(_info.phone)+'</b></div>'
      + '<div class="row"><span>البريد</span><b dir="ltr">'+esc(_info.email)+'</b></div>'
      + (_info.address?'<div class="row"><span>العنوان</span><b>'+esc(_info.address)+'</b></div>':'');
    if(_mode==='sale'){
      return '<div class="bk-review">'+head
        + '<div class="row"><span>نوع الطلب</span><b>شراء</b></div>'
        + who
        + '<div class="row" style="border:none"><span>السعر</span><span class="total">'+(_ad.price?money(_ad.price):'يُتفق عليه')+'</span></div>'
        + '</div>';
    }
    if(_mode==='monthly'){
      return '<div class="bk-review">'+head
        + '<div class="row"><span>نوع الإيجار</span><b>شهري</b></div>'
        + '<div class="row"><span>المدّة</span><b>'+(_months>0?_months+' شهر':'غير محدّدة')+'</b></div>'
        + who
        + '<div class="row" style="border:none"><span>السعر</span><span class="total" style="color:#0D9488">يُتفق عليه</span></div>'
        + '</div>';
    }
    var n=daysCount();
    return '<div class="bk-review">'+head
      + '<div class="row"><span>من</span><b>'+fmtD(_start)+'</b></div>'
      + '<div class="row"><span>إلى</span><b>'+fmtD(_end)+'</b></div>'
      + '<div class="row"><span>المدة</span><b>'+n+' يوم</b></div>'
      + who
      + '<div class="row" style="border:none"><span>الإجمالي</span><span class="total">'+money(_ad.price*n)+'</span></div>'
      + '</div>';
  }
  window._bkSend=function(){
    if(!window.submitBookingRequest){ window.uiToast('تعذّر الإرسال','error'); return; }
    window._bkClose();
    var who={ clientName:_info.name, clientLast:_info.last, clientPhone:_info.phone, clientEmail:_info.email, clientAddress:_info.address };
    var base={ adId:_ad.id, adRef:_ad.ref||'', adTitle:_ad.title||'', adCatId:_ad.catId||'', adImage:(_ad.images&&_ad.images[0])||'' };
    if(_mode==='sale'){
      submitBookingRequest(Object.assign({}, base, who, { dealType:'sale', priceDaily:null, totalPrice:_ad.price||null }));
      return;
    }
    if(_mode==='monthly'){
      submitBookingRequest(Object.assign({}, base, who, { dealType:'monthly', months:(_months>0?_months:null), priceDaily:null, totalPrice:null }));
      return;
    }
    var n=daysCount();
    submitBookingRequest(Object.assign({}, base, who, { dealType:'rent', dateFrom:iso(_start), dateTo:iso(_end), days:n, priceDaily:_ad.price, totalPrice:_ad.price*n }));
  };
})();
