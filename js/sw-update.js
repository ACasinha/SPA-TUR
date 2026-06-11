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
  var el = document.getElementById('rodapeVersao');

  // Caminho 1: SW já activo — pedir versão via postMessage
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    var canal = new MessageChannel();
    canal.port1.onmessage = function(e) {
      if (e.data && e.data.type === 'VERSION' && el) {
        el.textContent = 'v' + e.data.versao;
      }
    };
    navigator.serviceWorker.controller.postMessage(
      { type: 'GET_VERSION' },
      [canal.port2]
    );
    return;
  }

  // Caminho 2: SW ainda não activo (primeira carga) — ler sw.js directamente
  // FIX: o regex procura a constante VERSAO, não CACHE_VIEWS
  fetch('sw.js', { cache: 'no-store' })
    .then(function(r) { return r.text(); })
    .then(function(txt) {
      var match = txt.match(/const\s+VERSAO\s*=\s*['"]([^'"]+)['"]/);
      if (match && el) {
        el.textContent = 'v' + match[1];
      }
    })
    .catch(function() {});
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

        // Pedir versão assim que o controlador estiver disponível
        if (navigator.serviceWorker.controller) {
          mostrarVersao();
        } else {
          // Primeira instalação: aguardar que o SW tome controlo
          navigator.serviceWorker.addEventListener('controllerchange', function() {
            mostrarVersao();
          }, { once: true });
          // Fallback para a primeira carga sem controlador
          mostrarVersao();
        }

        reg.addEventListener('updatefound', function() {
          var newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', function() {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              mostrarToast('<span class="material-symbols-rounded" style="font-size: 16px; padding-right: 2px;">cached</span> Nova versão disponível! Clique em "Verificar atualização".', 'info');
            }
          });
        });
      })
      .catch(function(err) {
        console.warn('[SW] Falha no registo:', err);
        // Sem SW (ex: HTTP puro em dev) — tentar ler versão do sw.js na mesma
        mostrarVersao();
      });
  });
} else {
  // Browser sem suporte a SW — mostrar versão via fetch como fallback
  document.addEventListener('DOMContentLoaded', mostrarVersao);
}

// ============================================================
// VERIFICAR ATUALIZAÇÃO
// ============================================================

function verificarAtualizacao() {
  var btn = document.getElementById('btnVerificarUpdate');
  if (!btn) return;
  btn.disabled  = true;
  // Alterado para innerHTML para renderizar a tag <span>
  btn.innerHTML = '<span class="material-symbols-rounded" style="font-size: 16px; padding-right: 2px;">hourglass_empty</span> A verificar...';

  if (!_swRegistration) {
    mostrarToast('<span class="material-symbols-rounded" style="font-size: 16px; padding-right: 2px;">error</span> Service Worker não disponível.', 'info');
    btn.disabled  = false;
    btn.innerHTML = '<span class="material-symbols-rounded" style="font-size: 16px; padding-right: 2px;">cached</span> Verificar atualização';
    return;
  }

  _swRegistration.update()
    .then(function() {
      var temNovo = _swRegistration.waiting || _swRegistration.installing;
      if (temNovo) {
        btn.innerHTML   = '<span class="material-symbols-rounded" style="font-size: 16px; padding-right: 2px;">check_circle</span> Atualizar agora';
        btn.disabled    = false;
        btn.onclick     = function() { aplicarAtualizacao(); };
        mostrarToast('<span class="material-symbols-rounded" style="font-size: 16px; padding-right: 2px;">check_circle</span> Nova versão disponível. Clique em "Atualizar agora".', 'info');
      } else {
        mostrarVersao();
        mostrarToast('<span class="material-symbols-rounded" style="font-size: 16px; padding-right: 2px;">check_circle</span> A app está atualizada.', 'sucesso');
        btn.disabled    = false;
        btn.innerHTML   = '<span class="material-symbols-rounded" style="font-size: 16px; padding-right: 2px;">cached</span> Verificar atualização';
      }
    })
    .catch(function(err) {
      mostrarToast('<span class="material-symbols-rounded" style="font-size: 16px; padding-right: 2px;">error</span> Erro ao verificar: ' + err.message, 'erro');
      btn.disabled    = false;
      btn.innerHTML   = '<span class="material-symbols-rounded" style="font-size: 16px; padding-right: 2px;">cached</span> Verificar atualização';
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
