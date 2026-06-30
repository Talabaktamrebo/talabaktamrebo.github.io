/* ============================================================
   طلبك تم — نظام المزاد (MVP) لإعلانات البيع
   "أحقّية الشراء": صاحب أعلى مزايدة يفوز بحقّ الشراء.
   يعتمد على supabaseClient + fmtPrice + window._acOpenAuth + window.uiToast
   ============================================================ */
(function () {
  'use strict';
  if (typeof supabaseClient === 'undefined') return;
  var sb = supabaseClient;
  var _ch = null, _timer = null, _ad = null;

  function money(n) { try { return (typeof fmtPrice === 'function') ? fmtPrice(n) : Number(n).toLocaleString('en-US') + ' ل.س.ج'; } catch (e) { return n + ' ل.س.ج'; } }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  // بطاقة المزاد (هيكل ثابت يُعبّأ لحظياً بعد العرض)
  window.auctionCardHTML = function (l) {
    return ''
      + '<div class="auc">'
      + '  <div class="auc-top"><span class="auc-badge">مزاد</span><span class="auc-timer" id="aucTimer">—</span></div>'
      + '  <div class="auc-label">أعلى مزايدة حالية</div>'
      + '  <div class="auc-price" id="aucPrice">' + money(l.auctionStart || l.price || 0) + '</div>'
      + '  <div class="auc-count" id="aucCount">لا مزايدات بعد — كن الأول</div>'
      + '  <div class="auc-bidrow" id="aucBidRow">'
      + '    <input id="aucInput" type="number" inputmode="numeric" placeholder="مبلغ مزايدتك" oninput="this.value=this.value.replace(/[^0-9]/g,\'\')">'
      + '    <button class="gd-btn primary" id="aucBidBtn" onclick="window._placeBid(\'' + l.id + '\')">زايد الآن</button>'
      + '  </div>'
      + '  <div class="auc-min" id="aucMin"></div>'
      + '  <div class="auc-bids" id="aucBids"></div>'
      + '  <button class="gd-btn ghost" onclick="openChat(\'' + l.id + '\')">تواصل مع الإدارة</button>'
      + '</div>';
  };

  function ended() {
    return (_ad && _ad.auctionStatus && _ad.auctionStatus !== 'live')
      || (_ad && _ad.auctionEnds && new Date(_ad.auctionEnds).getTime() <= Date.now());
  }

  function renderBids(rows) {
    var top = rows && rows.length ? rows[0] : null;
    var priceEl = document.getElementById('aucPrice');
    var countEl = document.getElementById('aucCount');
    var minEl = document.getElementById('aucMin');
    var bidsEl = document.getElementById('aucBids');
    var inc = Number(_ad.auctionIncrement || 1);
    if (top) {
      if (priceEl) priceEl.textContent = money(top.amount);
      if (countEl) countEl.textContent = rows.length + ' مزايدة · الأعلى: ' + esc(top.bidder_name || 'مزايد');
      if (minEl) minEl.textContent = 'الحدّ الأدنى للمزايدة التالية: ' + money(Number(top.amount) + inc);
    } else {
      var start = Number(_ad.auctionStart || _ad.price || 0);
      if (priceEl) priceEl.textContent = money(start);
      if (countEl) countEl.textContent = 'لا مزايدات بعد — كن الأول';
      if (minEl) minEl.textContent = 'سعر الابتداء: ' + money(start);
    }
    if (bidsEl) {
      bidsEl.innerHTML = (rows || []).slice(0, 5).map(function (b, i) {
        return '<div class="auc-bid' + (i === 0 ? ' lead' : '') + '"><span>' + esc(b.bidder_name || 'مزايد') + '</span><b>' + money(b.amount) + '</b></div>';
      }).join('');
    }
  }

  async function loadBids() {
    var r = await sb.from('bids').select('bidder_name,amount,created_at').eq('ad_id', _ad.id).order('amount', { ascending: false }).limit(20);
    if (!r.error) renderBids(r.data || []);
  }

  function tick() {
    var el = document.getElementById('aucTimer');
    var row = document.getElementById('aucBidRow');
    if (!el) return;
    if (ended()) {
      el.textContent = 'انتهى المزاد';
      el.classList.add('end');
      if (row) row.style.display = 'none';
      var minEl = document.getElementById('aucMin'); if (minEl) minEl.textContent = 'الفائز هو صاحب أعلى مزايدة — ستتواصل معه الإدارة.';
      if (_timer) { clearInterval(_timer); _timer = null; }
      return;
    }
    if (!_ad.auctionEnds) { el.textContent = 'مزاد مفتوح'; return; }
    var d = new Date(_ad.auctionEnds).getTime() - Date.now();
    var dd = Math.floor(d / 86400000), hh = Math.floor(d % 86400000 / 3600000), mm = Math.floor(d % 3600000 / 60000), ss = Math.floor(d % 60000 / 1000);
    el.textContent = 'ينتهي خلال ' + (dd > 0 ? dd + 'ي ' : '') + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  }

  window._auctionStop = function () {
    if (_ch) { try { sb.removeChannel(_ch); } catch (e) {} _ch = null; }
    if (_timer) { clearInterval(_timer); _timer = null; }
    _ad = null;
  };

  // يُستدعى بعد عرض صفحة الإعلان إن كان مزاداً
  window._auctionInit = function (l) {
    window._auctionStop();
    _ad = l;
    loadBids();
    tick(); _timer = setInterval(tick, 1000);
    _ch = sb.channel('auc-' + l.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids', filter: 'ad_id=eq.' + l.id }, function () { loadBids(); })
      .subscribe();
  };

  window._placeBid = async function (adId) {
    if (typeof window.isLoggedIn === 'function' && !window.isLoggedIn()) {
      if (window._acOpenAuth) window._acOpenAuth();
      return;
    }
    if (ended()) { window.uiToast && window.uiToast('انتهى المزاد', 'error'); return; }
    var inp = document.getElementById('aucInput');
    var amount = Number((inp && inp.value) || 0);
    if (!amount || amount <= 0) { window.uiToast && window.uiToast('أدخل مبلغ المزايدة', 'error'); return; }
    var btn = document.getElementById('aucBidBtn'); if (btn) { btn.disabled = true; btn.textContent = 'جارٍ...'; }
    try {
      var r = await sb.rpc('place_bid', { p_ad_id: Number(adId), p_amount: amount });
      if (r.error) throw r.error;
      var res = r.data || {};
      if (res.ok) {
        if (inp) inp.value = '';
        window.uiToast && window.uiToast('تمت مزايدتك بنجاح بمبلغ ' + money(res.amount), 'success');
        loadBids();
      } else {
        window.uiToast && window.uiToast(res.error || 'تعذّرت المزايدة', 'error');
      }
    } catch (e) {
      window.uiToast && window.uiToast('تعذّرت المزايدة: ' + ((e && e.message) || ''), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'زايد الآن'; }
    }
  };
})();
