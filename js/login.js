// ============================================================
// login.js — UI de login e ciclo de sessão (versão SPA)
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
//
// Diferenças face à versão multi-página:
//   • Não há idWrap por página — o shell é controlado pelo app-shell.js
//   • Após sucesso, chama routerInit em vez de activar um wrap específico
//   • O overlay de carregamento é único e global
// ============================================================

'use strict';

var _opcoesLogin       = null;
var _erroLoginPendente = '';

// ============================================================
// inicializarLogin — ponto de entrada chamado pelo app-shell.js
// ============================================================

function inicializarLogin(opcoes) {
  _opcoesLogin = opcoes;

  _mostrarLoadingOverlay();

  // Ocultar overlay de login enquanto o Firebase resolve sessão persistida
  if (typeof sessaoValida === 'function' && sessaoValida()) {
    var overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.visibility = 'hidden';
  }

  apiObservarAuth(function(user) {
    if (!user) {
      var overlay = document.getElementById('loginOverlay');
      if (overlay) overlay.style.visibility = '';
      _ocultarLoadingOverlay();
      _mostrarEcraLogin();
      return;
    }
    _processarUtilizador(user);
  });
}

// ============================================================
// fazerLogin — chamado pelo botão "Entrar"
// ============================================================

function fazerLogin() {
  var email = ((document.getElementById('loginUser') || {}).value || '').trim();
  var pass  =  (document.getElementById('loginPass') || {}).value || '';
  var erro  = document.getElementById('loginErro');
  var btn   = document.getElementById('btnLogin');

  if (!email || !pass) {
    _mostrarErroCampo(erro, 'Por favor preencha todos os campos.');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'A autenticar...'; }
  if (erro) erro.classList.remove('visivel');

  apiAutenticar(
    email,
    pass,
    function onSuccess(dados) {
      _processarUtilizador(dados);
    },
    function onFailure(err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Entrar →'; }
      _mostrarErroCampo(erro, err.message);
      var passEl = document.getElementById('loginPass');
      if (passEl) { passEl.value = ''; passEl.focus(); }
    }
  );
}

// ============================================================
// logout — chamado pelo nav-menu e pelas views
// ============================================================

function logout(temAlteracoes) {
  if (temAlteracoes) {
    if (!confirm('Tem alterações por guardar. Tem a certeza que quer sair?')) return;
  } else {
    if (!confirm('Deseja terminar a sessão?')) return;
  }

  if (typeof limparCacheUtilizador === 'function') limparCacheUtilizador();

  if (_opcoesLogin && typeof _opcoesLogin.onSessaoTerminada === 'function') {
    _opcoesLogin.onSessaoTerminada();
  }

  apiLogout().then(function() {
    _mostrarEcraLogin();
  });
}

// ============================================================
// _processarUtilizador — partilhado pelo login activo e sessões
// ============================================================

function _processarUtilizador(userOuDados) {
  obterPerfilUtilizador()
    .then(function(perfil) {
      if (!perfil.ativo) {
        _mostrarErroLoginPendente('Esta conta foi desativada. Contacte o administrador.');
        _fazerSignOut();
        return;
      }

      if (_opcoesLogin && !_opcoesLogin.verificarAcesso(perfil)) {
        _mostrarErroLoginPendente(_opcoesLogin.mensagemSemAcesso || 'Acesso negado.');
        _fazerSignOut();
        return;
      }

      _esconderEcraLogin();

      if (_opcoesLogin && typeof _opcoesLogin.onSucesso === 'function') {
        _opcoesLogin.onSucesso(perfil);
      }
    })
    .catch(function(err) {
      console.warn('[login] Falha ao obter perfil:', err);
      _ocultarLoadingOverlay();
      _mostrarEcraLogin();
    });
}

// ============================================================
// Auxiliares de UI
// ============================================================

function _esconderEcraLogin() {
  _ocultarLoadingOverlay();

  var overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function _mostrarEcraLogin() {
  var overlay = document.getElementById('loginOverlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.style.visibility = '';
  }

  var passEl = document.getElementById('loginPass');
  if (passEl) passEl.value = '';

  var btn = document.getElementById('btnLogin');
  if (btn) { btn.disabled = false; btn.textContent = 'Entrar →'; }

  var erro = document.getElementById('loginErro');
  if (erro) {
    erro.classList.remove('visivel');
    if (_erroLoginPendente) {
      _mostrarErroCampo(erro, _erroLoginPendente);
      _erroLoginPendente = '';
    }
  }
}

function _mostrarErroLoginPendente(mensagem) {
  _erroLoginPendente = mensagem;
}

function _mostrarErroCampo(erroEl, mensagem) {
  if (!erroEl) return;
  erroEl.textContent = mensagem;
  erroEl.classList.add('visivel');
}

function _fazerSignOut() {
  if (typeof limparCacheUtilizador === 'function') limparCacheUtilizador();
  firebaseAuth.signOut();
}

// ============================================================
// OVERLAY DE CARREGAMENTO INICIAL
// ============================================================

function _mostrarLoadingOverlay() {
  if (document.getElementById('pageLoadingOverlay')) return;

  var div = document.createElement('div');
  div.id        = 'pageLoadingOverlay';
  div.className = 'page-loading-overlay';
  div.innerHTML =
    '<img class="page-loading-logo" src="img/logo-small.png" alt="">' +
    '<div class="page-loading-spinner"></div>' +
    '<span class="page-loading-texto">A carregar...</span>';
  document.body.insertBefore(div, document.body.firstChild);
}

function _ocultarLoadingOverlay() {
  var overlay = document.getElementById('pageLoadingOverlay');
  if (!overlay) return;
  overlay.classList.add('oculto');
  setTimeout(function() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }, 350);
}