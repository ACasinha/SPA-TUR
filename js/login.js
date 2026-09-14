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

  // Interceta links de "definir password" antes do fluxo normal de login
  if (_temParametrosDefinirPassword()) {
    _mostrarEcraDefinirPassword();
    return;
  }

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
// DEFINIÇÃO DE PASSWORD — link seguro enviado por e-mail
// ============================================================

function _temParametrosDefinirPassword() {
  var params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'resetPassword' && !!params.get('oobCode');
}

function _mostrarEcraDefinirPassword() {
  _ocultarLoadingOverlay();
  var loginOverlay = document.getElementById('loginOverlay');
  if (loginOverlay) loginOverlay.classList.add('hidden');

  var params  = new URLSearchParams(window.location.search);
  var oobCode = params.get('oobCode');

  var overlay = document.getElementById('defPasswordOverlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');

  var estadoEl = document.getElementById('defPasswordEstado');
  var formEl   = document.getElementById('defPasswordForm');
  var emailEl  = document.getElementById('defPasswordEmail');

  firebaseAuth.verifyPasswordResetCode(oobCode)
    .then(function (email) {
      emailEl.textContent = email;
      formEl.style.display = '';
      estadoEl.style.display = 'none';

      document.getElementById('btnDefPassword').onclick = function () {
        _confirmarDefinirPassword(oobCode);
      };
    })
    .catch(function () {
      estadoEl.textContent = 'Este link é inválido ou já expirou. Peça ao administrador para reenviar o convite.';
      estadoEl.classList.add('erro');
    });
}

function _confirmarDefinirPassword(oobCode) {
  var pass1 = (document.getElementById('defPasswordNova')     || {}).value || '';
  var pass2 = (document.getElementById('defPasswordConfirmar') || {}).value || '';
  var erroEl = document.getElementById('defPasswordErro');
  var btn    = document.getElementById('btnDefPassword');

  if (pass1.length < 6) {
    _mostrarErroCampo(erroEl, 'A password deve ter no mínimo 6 caracteres.');
    return;
  }
  if (pass1 !== pass2) {
    _mostrarErroCampo(erroEl, 'As passwords não coincidem.');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'A guardar...'; }

  firebaseAuth.confirmPasswordReset(oobCode, pass1)
    .then(function () {
      document.getElementById('defPasswordForm').style.display = 'none';
      var sucesso = document.getElementById('defPasswordSucesso');
      if (sucesso) sucesso.style.display = '';
    })
    .catch(function (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Guardar password'; }
      _mostrarErroCampo(erroEl, 'Erro: ' + err.message);
    });
}

function irParaLogin() {
  window.location.href = window.location.origin + window.location.pathname;
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
