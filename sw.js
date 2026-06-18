// ============================================================
// sw.js — Service Worker redesenhado para SPA
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
//
// VERSÃO: incrementar a cada deploy.
// ============================================================

const VERSAO       = '2.0.1.c';
const CACHE_SHELL  = 'rmz-shell-v'  + VERSAO;   // HTML/CSS/JS do shell
const CACHE_VIEWS  = 'rmz-views-v'  + VERSAO;   // HTML/JS das views (lazy)
const CACHE_ASSETS = 'rmz-assets-v' + VERSAO;   // Fontes, imagens, CDN
const CACHE_DADOS  = 'rmz-dados-v'  + VERSAO;   // Respostas da API (opcional)

// ── Assets do shell — críticos para o arranque offline ───────
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './css/spa.css',
  './views/registo/view.html',
  './views/registo/view.js',
  './views/registo/view.css',
  './js/api.js',
  './js/auth.js',
  './js/users.js',
  './js/login.js',
  './js/router.js',
  './js/app-shell.js',
  './js/data.js',
  './js/ui.js',
  './js/offline.js',
  './js/sync.js',
  './js/pwa.js',
  './js/sw-update.js',
  './js/nav-menu.js',
  './css/sidebar.css',
  './js/sidebar.js',
  './img/logo.png',
  './img/logo-small.png',
  './img/logo-small-white.png',
  './img/logo-turismo.png',
];

// ── Assets externos (CDN) ────────────────────────────────────
const CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Source+Sans+3:wght@300;400;500;600&display=swap',
  'https://cdn.jsdelivr.net/npm/idb@8/build/umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js',
];

// ── Pedidos que NUNCA devem ser interceptados ────────────────
function ehPedidoDeRede(url) {
  return url.includes('cloudfunctions.net')
      || url.includes('identitytoolkit.googleapis.com')
      || url.includes('securetoken.googleapis.com')
      || url.includes('firebaseauth.googleapis.com')
      || url.includes('firestore.googleapis.com');
}

// ── Pedidos de views lazy (html/js) ──────────────────────────
function ehViewLazy(url) {
  return url.includes('/views/');
}

// ── Assets externos ──────────────────────────────────────────
function ehAssetExterno(url) {
  return url.includes('gstatic.com')
      || url.includes('fonts.googleapis.com')
      || url.includes('fonts.gstatic.com')
      || url.includes('jsdelivr.net')
      || url.includes('cdnjs.cloudflare.com');
}

// ============================================================
// INSTALL — cache do shell e CDN
// ============================================================
self.addEventListener('install', function(e) {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE_SHELL).then(function(cache) {
        return Promise.allSettled(
          SHELL_ASSETS.map(function(url) {
            return cache.add(url).catch(function(err) {
              console.warn('[SW] Falha ao cachear shell:', url, err.message);
            });
          })
        );
      }),
      caches.open(CACHE_ASSETS).then(function(cache) {
        return Promise.allSettled(
          CDN_ASSETS.map(function(url) {
            return cache.add(url).catch(function(err) {
              console.warn('[SW] Falha ao cachear CDN:', url, err.message);
            });
          })
        );
      })
    ]).then(function() {
      return self.skipWaiting();
    })
  );
});

// ============================================================
// ACTIVATE — limpar caches antigas
// ============================================================
self.addEventListener('activate', function(e) {
  var cachesActuais = [CACHE_SHELL, CACHE_VIEWS, CACHE_ASSETS, CACHE_DADOS];
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(k) { return cachesActuais.indexOf(k) === -1; })
          .map(function(k) {
            console.log('[SW] A apagar cache antiga:', k);
            return caches.delete(k);
          })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ============================================================
// FETCH — estratégias por tipo de pedido
// ============================================================
self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;

  var url = e.request.url;

  // ── 1. API / Firebase → sempre rede (sem interceptar) ──────
  if (ehPedidoDeRede(url)) return;

  // ── 2. CDN / fontes → Cache First ──────────────────────────
  if (ehAssetExterno(url)) {
    e.respondWith(_cacheFirst(e.request, CACHE_ASSETS));
    return;
  }

  // ── 3. Views lazy (views/*/view.html e view.js) ─────────────
  //    Stale-While-Revalidate: entrega do cache enquanto actualiza
  if (ehViewLazy(url)) {
    e.respondWith(_staleWhileRevalidate(e.request, CACHE_VIEWS));
    return;
  }

  // ── 4. Shell assets (css/js/img do core) → Stale-While-Revalidate
  if (url.includes('/css/')   ||
      url.includes('/js/')    ||
      url.includes('/img/')   ||
      url.includes('/icons/') ||
      url.endsWith('manifest.json')) {
    e.respondWith(_staleWhileRevalidate(e.request, CACHE_SHELL));
    return;
  }

  // ── 5. Navegação SPA → sempre servir index.html do cache ────
  //    Qualquer rota HTML (/, /dashboard, /editor, /admin)
  //    é tratada pelo router.js no cliente.
  if (e.request.mode === 'navigate') {
    e.respondWith(_spaNavigate(e.request));
    return;
  }

  // ── 6. Resto → Network First com fallback ao cache ──────────
  e.respondWith(_networkFirst(e.request, CACHE_SHELL));
});

// ============================================================
// ESTRATÉGIAS DE CACHE
// ============================================================

// Cache First — CDN e assets estáticos
function _cacheFirst(request, cacheName) {
  return caches.match(request).then(function(cached) {
    if (cached) return cached;
    return fetch(request).then(function(resp) {
      var clone = resp.clone();
      caches.open(cacheName).then(function(c) { c.put(request, clone); });
      return resp;
    });
  });
}

// Stale-While-Revalidate — shell assets e views lazy
function _staleWhileRevalidate(request, cacheName) {
  var fetchPromise = fetch(request).then(function(resp) {
    var clone = resp.clone();
    caches.open(cacheName).then(function(c) { c.put(request, clone); });
    return resp;
  }).catch(function() { return null; });

  return caches.match(request).then(function(cached) {
    return cached || fetchPromise;
  });
}

// Network First — com fallback ao cache
function _networkFirst(request, cacheName) {
  return fetch(request)
    .then(function(resp) {
      var clone = resp.clone();
      caches.open(cacheName).then(function(c) { c.put(request, clone); });
      return resp;
    })
    .catch(function() {
      return caches.match(request);
    });
}

// Navegação SPA — entrega o index.html para todas as rotas
function _spaNavigate(request) {
  return fetch(request)
    .then(function(resp) {
      // Guardar a página HTML no cache do shell
      var clone = resp.clone();
      caches.open(CACHE_SHELL).then(function(c) { c.put(request, clone); });
      return resp;
    })
    .catch(function() {
      // Offline: servir o index.html — o router trata do resto
      return caches.match('./index.html').then(function(cached) {
        return cached || caches.match('./');
      });
    });
}

// ============================================================
// BACKGROUND SYNC
// ============================================================
self.addEventListener('sync', function(e) {
  if (e.tag === 'rmz-sync') {
    console.log('[SW] Background Sync:', e.tag);
    e.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
        .then(function(clients) {
          if (!clients.length) return;
          clients[0].postMessage({ type: 'EXECUTAR_SYNC' });
        })
    );
  }
});

// ============================================================
// MENSAGENS
// ============================================================
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // Informar os clientes da versão actual
  if (e.data && e.data.type === 'GET_VERSION') {
    if (e.ports && e.ports[0]) {

    e.ports[0].postMessage({ type: 'VERSION', versao: VERSAO 

    });
  }
}
});
