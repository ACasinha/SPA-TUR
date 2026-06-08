// ============================================================
// pwa.js — Instalação da PWA (banner e botão) — Versão SPA
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
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
  var b = document.getElementById('installBanner');
  if (b) b.classList.remove('visivel');
}

// Escuta o evento nativo de instalação
window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  _deferredPrompt = e;

  // Avalia o estado visual imediatamente com base na rota SPA atual
  verificarVisibilidadeInstalacao();
});

window.addEventListener('appinstalled', function() {
  _deferredPrompt = null;
  dispensarBanner();
  var btnRodape = document.getElementById('btnInstalarRodape');
  if (btnRodape) btnRodape.style.display = 'none';
  if (typeof mostrarToast === 'function') {
    mostrarToast('✓ App instalada com sucesso!', 'sucesso');
  }
});

// ============================================================
// INSTALAR APP (usado pelo botão do rodapé e do banner)
// ============================================================

function instalarApp() {
  if (!_deferredPrompt) {
    if (typeof mostrarToast === 'function') {
      mostrarToast('A instalação não está disponível neste momento ou a app já está instalada.', 'info');
    }
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

// ============================================================
// ADAPTAÇÃO SPA: Gestão Dinâmica do DOM e Rotas
// ============================================================

// Centraliza a verificação de visibilidade e reatribui os cliques aos botões que entram/saem do DOM
function verificarVisibilidadeInstalacao() {
  // 1. Determina se estamos estritamente na rota raiz (ou index.html)
  var path = window.location.pathname;
  var naRaiz = path === '/' || path.endsWith('/index.html') || window.location.hash === '#/' || window.location.hash === '';

  var jaInstalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  // Se já estiver instalada ou NÃO estiver na página raiz, esconde tudo forçadamente
  if (jaInstalada || !naRaiz) {
    var b = document.getElementById('installBanner');
    if (b) b.classList.remove('visivel');
    var btnRodape = document.getElementById('btnInstalarRodape');
    if (btnRodape) btnRodape.style.display = 'none';
    return;
  }

  // 2. Se estiver na raiz e houver um prompt disponível, gere a exibição
  if (_deferredPrompt) {
    // Banner topo
    if (!bannerFoiDispensado()) {
      var banner = document.getElementById('installBanner');
      if (banner) banner.classList.add('visivel');
    }

    // Botão no rodapé
    var rodape = document.getElementById('btnInstalarRodape');
    if (rodape) rodape.style.display = '';
  }

  // 3. Vincular (ou revincular) os eventos de clique aos botões presentes no DOM atual
  rebindEventosPWA();
}

// Garante que os botões reagem ao clique mesmo após o router limpar o HTML
function rebindEventosPWA() {
  var btnInstalar = document.getElementById('btnInstalar');
  if (btnInstalar) {
    // Remove o listener antigo para não duplicar execuções e adiciona o novo
    btnInstalar.removeEventListener('click', executarInstalacao);
    btnInstalar.addEventListener('click', executarInstalacao);
  }

  var btnFechar = document.getElementById('btnInstalarFechar');
  if (btnFechar) {
    btnFechar.removeEventListener('click', executarDispensar);
    btnFechar.addEventListener('click', executarDispensar);
  }

  var btnRodape = document.getElementById('btnInstalarRodape');
  if (btnRodape) {
    btnRodape.removeEventListener('click', executarInstalacao);
    btnRodape.addEventListener('click', executarInstalacao);
  }
}

// Funções intermédias de encapsulamento para o addEventListener/removeEventListener
function executarInstalacao() { instalarApp(); }
function executarDispensar() { dispensarBanner(); }

// Executa a validação assim que o DOM inicial estiver pronto
document.addEventListener('DOMContentLoaded', function() {
  verificarVisibilidadeInstalacao();
});

// Reavalia o estado visual sempre que o utilizador navega pela SPA (muda o histórico)
window.addEventListener('popstate', verificarVisibilidadeInstalacao);

// Exposição global das funções para que o router.js as possa chamar se necessário
window.verificarVisibilidadeInstalacao = verificarVisibilidadeInstalacao;