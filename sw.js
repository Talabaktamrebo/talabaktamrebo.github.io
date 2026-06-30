const CACHE_NAME = 'talbaktem-v99';
const STATIC_ASSETS = [
  './',
  '/index.html',
  '/supabase-config.js',
  '/manifest.json',
  '/offline.html',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/hero1.webp',
  '/hero2.webp',
  '/hero3.webp',
  '/cat-apt.png',
  '/cat-car.png',
  '/cat-equip.png',
  '/cat-shop.png',
  '/cat-farm.png',
  '/cat-free.png',
  '/cat-partner.png',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&family=Poppins:wght@200;300;400;700;800;900&family=Raleway:wght@200;300;400&display=swap'
];

// Install — addAll مرن: فشل ملف واحد لا يُفشل التثبيت
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(STATIC_ASSETS.map(a => cache.add(a))))
      .then(() => self.skipWaiting())
  );
});

// Activate — حذف الكاشات القديمة
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // (1) الشبكة أولاً للـ API (Supabase)
  if (url.hostname.includes('supabase') || url.hostname.includes('googleapis')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // (2) الشبكة أولاً للصفحات والـ JS/CSS — تضمن وصول أي تحديث فوراً (يمنع نسخة قديمة عالقة)
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.ok) { const c = res.clone(); caches.open(CACHE_NAME).then(cache => cache.put(e.request, c)); }
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || (e.request.mode === 'navigate' ? caches.match('/offline.html') : undefined)))
    );
    return;
  }

  // (3) الكاش أولاً للوسائط الثابتة (صور/خطوط) مع تحديث بالخلفية
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(res => {
        if (res && res.ok) { const c = res.clone(); caches.open(CACHE_NAME).then(cache => cache.put(e.request, c)); }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});

// ===== إشعارات Push (إعلانات جديدة) =====
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { body: (event.data && event.data.text()) || '' }; }
  const title = data.title || 'طلبك تم';
  const options = {
    body: data.body || 'إعلان جديد على طلبك تم',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    tag: data.tag || ('ad-' + (data.adId || Date.now())),
    renotify: true,
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) { try { c.navigate(target); } catch (_) {} return c.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
