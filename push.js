/* ============================================================
   طلبك تم — إشعارات Push (إعلانات جديدة: المميّزة والتخفيضات)
   يتطلّب: مفتاح VAPID العام أدناه + دالة Edge «notify-new-ad» + جدول push_subscriptions
   ============================================================ */
(function () {
  'use strict';

  // ⚠️ ضع هنا «المفتاح العام VAPID» (Public Key) — وَلِّده بالأمر:  npx web-push generate-vapid-keys
  var VAPID_PUBLIC_KEY = 'BCxgakQGKveZ-VrjCDDjidvv2-fgsatkbj7IJrxE3x9Q1nDxkd9p4ReJlumuJPtEF-vg1eStHLp00qnPa_XCoAk';

  function supported() {
    return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  }

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  // حفظ الاشتراك في Supabase (جدول push_subscriptions)
  async function saveSubscription(sub) {
    try {
      var j = sub.toJSON();
      if (!j || !j.keys) return;
      await window.supabaseClient.from('push_subscriptions').upsert({
        endpoint: j.endpoint,
        p256dh: j.keys.p256dh,
        auth: j.keys.auth
      }, { onConflict: 'endpoint' });
    } catch (e) { console.warn('[push] save failed', e); }
  }

  async function removeSubscription(endpoint) {
    try { await window.supabaseClient.from('push_subscriptions').delete().eq('endpoint', endpoint); } catch (e) {}
  }

  // تفعيل الإشعارات (يُستدعى من زر القائمة)
  async function enablePush() {
    if (!supported()) { (window.uiAlert || window.alert)('متصفّحك لا يدعم الإشعارات. على آيفون: ثبّت التطبيق على الشاشة الرئيسية أولاً.', { type: 'info', title: 'غير مدعوم' }); return false; }
    if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.indexOf('ضع_') === 0) { console.warn('[push] VAPID_PUBLIC_KEY غير مضبوط'); (window.uiAlert || window.alert)('الإشعارات غير مهيّأة بعد. (مفتاح VAPID غير مضبوط)', { type: 'error', title: 'تنبيه' }); return false; }
    try {
      var perm = await Notification.requestPermission();
      if (perm !== 'granted') { (window.uiToast || function(){}) ('لم يتم تفعيل الإشعارات', 'info'); updateBtn(); return false; }
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      }
      await saveSubscription(sub);
      try { localStorage.setItem('tam_push_on', '1'); } catch (e) {}
      (window.uiToast || function(){}) ('تم تفعيل إشعارات الإعلانات الجديدة ✓', 'success');
      updateBtn();
      return true;
    } catch (e) {
      console.error('[push] enable failed', e);
      (window.uiAlert || window.alert)('تعذّر تفعيل الإشعارات حالياً. حاول مرّة أخرى.', { type: 'error', title: 'تنبيه' });
      return false;
    }
  }

  async function disablePush() {
    try {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (sub) { await removeSubscription(sub.endpoint); await sub.unsubscribe(); }
      try { localStorage.removeItem('tam_push_on'); } catch (e) {}
      (window.uiToast || function(){}) ('تم إيقاف الإشعارات', 'info');
      updateBtn();
    } catch (e) { console.warn('[push] disable failed', e); }
  }

  async function isOn() {
    if (!supported() || Notification.permission !== 'granted') return false;
    try { var reg = await navigator.serviceWorker.ready; return !!(await reg.pushManager.getSubscription()); } catch (e) { return false; }
  }

  window._acTogglePush = async function () {
    if (await isOn()) disablePush(); else enablePush();
  };

  // تحديث نص/حالة زر القائمة
  async function updateBtn() {
    var lbl = document.getElementById('pushMenuLbl'); if (!lbl) return;
    if (!supported()) { lbl.textContent = 'الإشعارات غير مدعومة'; return; }
    lbl.textContent = (await isOn()) ? 'إيقاف إشعارات الإعلانات' : 'تفعيل إشعارات الإعلانات الجديدة';
  }
  window._acRefreshPushBtn = updateBtn;

  // عند التحميل: إن كان مفعّلاً سابقاً، تأكّد أن الاشتراك محفوظ (يتجدّد أحياناً)
  window.addEventListener('load', function () {
    setTimeout(async function () {
      updateBtn();
      try {
        if (localStorage.getItem('tam_push_on') === '1' && await isOn()) {
          var reg = await navigator.serviceWorker.ready;
          var sub = await reg.pushManager.getSubscription();
          if (sub) saveSubscription(sub);
        }
      } catch (e) {}
    }, 2500);
  });
})();
