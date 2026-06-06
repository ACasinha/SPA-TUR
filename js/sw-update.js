// ============================================================
// sw-update.js — Registo do Service Worker, versão e actualizações
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
//
// Partilhado pelo shell SPA (index.html).
// Lê a versão do SW via postMessage em vez de fetch ao sw.js
// (evita cache poisoning na SPA).
// ============================================================

'use strict';

var _swRegistration = null;

// ============================================================
// VERSÃO — pedida ao SW via postMessage
// ============================================================

function mostrarVersao() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    // Fallback: ler directamente do sw.js (primeira carga)
    fetch('sw.js', { cache: 'no-store' })
      .then(function(r) { return r.text(); })
      .then(function(txt) {
        var match = txt.match(/VERSAO\s*=\s*['"]([^'"]+)['"]/);
        if (match) {
          var el = document.getElementById('rodapeVersao');
          if (el) el.textContent = 'v' + match[1];
        }
      })
      .catch(function() {});
    return;
  }

  // Pedir versão ao SW activo
  var canal = new MessageChannel();
  canal.port1.onmessage = function(e) {
    if (e.data && e.data.type === 'VERSION') {
      var el = document.getElementById('rodapeVersao');
      if (el) el.textContent = 'v' + e.data.versao;
    }
  };
  navigator.serviceWorker.controller.postMessage(
    { type: 'GET_VERSION' },
    [canal.port2]
  );
}

// ============================================================
// REGISTO DO SERVICE WORKER
// ============================================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./sw.js')
      .then(function(reg) {
        _swRegistration = reg;
        console.log('[SW] Registado. Scope:', reg.scope);
        mostrarVersao();

        reg.addEventListener('updatefound', function() {
          var newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', function() {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              mostrarToast('🔄 Nova versão disponível! Clique em "Verificar atualização".', 'info');
            }
          });
        });
      })
      .catch(function(err) {
        console.warn('[SW] Falha no registo:', err);
      });
  });
}

// ============================================================
// VERIFICAR ATUALIZAÇÃO
// ============================================================

function verificarAtualizacao() {
  var btn = document.getElementById('btnVerificarUpdate');
  if (!btn) return;
  btn.disabled    = true;
  btn.textContent = '⏳ A verificar...';

  if (!_swRegistration) {
    mostrarToast('Service Worker não disponível.', 'info');
    btn.disabled    = false;
    btn.textContent = '🔄 Verificar atualização';
    return;
  }

  _swRegistration.update()
    .then(function() {
      var temNovo = _swRegistration.waiting || _swRegistration.installing;
      if (temNovo) {
        btn.textContent = '✅ Atualizar agora';
        btn.disabled    = false;
        btn.onclick     = function() { aplicarAtualizacao(); };
        mostrarToast('Nova versão disponível. Clique em "Atualizar agora".', 'info');
      } else {
        mostrarToast('✓ A app está atualizada.', 'sucesso');
        btn.disabled    = false;
        btn.textContent = '🔄 Verificar atualização';
      }
    })
    .catch(function(err) {
      mostrarToast('Erro ao verificar: ' + err.message, 'erro');
      btn.disabled    = false;
      btn.textContent = '🔄 Verificar atualização';
    });
}

// ============================================================
// APLICAR ATUALIZAÇÃO
// ============================================================

function aplicarAtualizacao() {
  if (_swRegistration && _swRegistration.waiting) {
    _swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    var reloadTimer = setTimeout(function() { window.location.reload(); }, 3000);
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      clearTimeout(reloadTimer);
      window.location.reload();
    }, { once: true });
  } else {
    window.location.reload();
  }
}
