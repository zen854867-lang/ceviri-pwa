/* ============================================================
   sw.js — Service Worker
   Offline çalışma + cache yönetimi
   ============================================================ */

const CACHE_NAME = 'ceviri-v1';

// Cache'e alınacak dosyalar (uygulama kabuğu)
const APP_SHELL = [
  './index.html',
  './style.css',
  './manifest.json',
  './file_handler.js',
  './translator.js',
  './app.js',
  'https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;700&family=Syne:wght@400;600;800&display=swap'
];

/* ---------- Kurulum: dosyaları cache'e al ---------- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

/* ---------- Aktivasyon: eski cache'leri temizle ---------- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ---------- Fetch: önce cache, sonra network ---------- */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Google Translate API isteklerini ASLA cache'leme (online gerekli)
  if (url.hostname.includes('translate.googleapis.com') ||
      url.hostname.includes('translate.google.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Font isteklerini cache'den sun, yoksa network'ten al
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // ONNX model dosyaları — büyük dosyalar, ayrı cache
  if (url.pathname.includes('/models/')) {
    event.respondWith(
      caches.open('ceviri-models-v1').then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            cache.put(event.request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // Genel strateji: cache-first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Başarılı yanıtları cache'e ekle
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Tamamen offline — index.html döndür
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

/* ---------- Mesaj: cache güncelleme ---------- */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
