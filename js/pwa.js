// ============================================================
// pwa.js — Instalação da PWA (banner e botão)
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
//
// Exclusivo do index.html.
// O registo do SW, versão e actualizações estão em sw-update.js,
// partilhado também pelo admin.html.
// ============================================================

'use strict';

var _deferredPrompt         = null;
var CHAVE_BANNER_DISPENSADO = 'rmz_banner_dispensado';

// ============================================================
// BANNER DE INSTALAÇÃO (topo — primeira abertura)
// ============================================================

function bannerFoiDispensado() {
  return localStorage.getItem(CHAVE_BANNER_DISPENSADO) === '1';
}

function dispensarBanner() {
  localStorage.setItem(CHAVE_BANNER_DISPENSADO, '1');
  document.getElementById('installBanner').classList.remove('visivel');
}

window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  _deferredPrompt = e;

  // Banner topo — só se não dispensado e não em standalone
  var jaInstalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!jaInstalada && !bannerFoiDispensado()) {
    document.getElementById('installBanner').classList.add('visivel');
  }

  // Botão no rodapé — sempre visível se instalável
  var btnRodape = document.getElementById('btnInstalarRodape');
  if (btnRodape) btnRodape.style.display = '';
});

window.addEventListener('appinstalled', function() {
  _deferredPrompt = null;
  dispensarBanner();
  var btnRodape = document.getElementById('btnInstalarRodape');
  if (btnRodape) btnRodape.style.display = 'none';
  mostrarToast('✓ App instalada com sucesso!', 'sucesso');
});

// Botão instalar — topo
var btnInstalar = document.getElementById('btnInstalar');
if (btnInstalar) {
  btnInstalar.addEventListener('click', function() { instalarApp(); });
}

// Botão fechar — topo
var btnFechar = document.getElementById('btnInstalarFechar');
if (btnFechar) {
  btnFechar.addEventListener('click', function() { dispensarBanner(); });
}

// ============================================================
// INSTALAR APP (usado pelo botão do rodapé e do banner)
// ============================================================

function instalarApp() {
  if (!_deferredPrompt) {
    mostrarToast('A instalação não está disponível neste momento ou a app já está instalada.', 'info');
    return;
  }
  _deferredPrompt.prompt();
  _deferredPrompt.userChoice.then(function(choice) {
    console.log('[PWA] Resposta:', choice.outcome);
    _deferredPrompt = null;
    dispensarBanner();
    var btnRodape = document.getElementById('btnInstalarRodape');
    if (btnRodape) btnRodape.style.display = 'none';
  });
}

// Ocultar banner topo se já em standalone
if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
  var b = document.getElementById('installBanner');
  if (b) b.classList.remove('visivel');
}
