// ============================================================
// login.js — UI de login e ciclo de sessão nas páginas
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
//
// Responsabilidade:
//   • Mostrar/esconder o overlay de login
//   • Submeter credenciais (delega em auth.js → apiAutenticar)
//   • Observar sessões persistidas e logout via apiObservarAuth
//   • Chamar onSucesso / onSessaoTerminada das páginas
//
// NÃO contém: Firebase init, JWT, gestão de sessão (auth.js),
// lógica de negócio (app.js).
// ============================================================

'use strict';

var _opcoesLogin       = null;
var _erroLoginPendente = '';

// ============================================================
// inicializarLogin — ponto de entrada de cada página
//
// opcoes = {
//   idWrap:            string | null
//   verificarAcesso:   fn(perfil) → bool
//   mensagemSemAcesso: string
//   onSucesso:         fn(perfil)
//   onSessaoTerminada: fn()
// }
// ============================================================

function inicializarLogin(opcoes) {
  _opcoesLogin = opcoes;

  // Mostrar overlay de carregamento imediatamente
  _mostrarLoadingOverlay();

  // Ocultar overlay de login enquanto o Firebase resolve
  if (typeof sessaoValida === 'function' && sessaoValida()) {
    var overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.visibility = 'hidden';
  }

  apiObservarAuth(function (user) {
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
// fazerLogin — chamado pelo botão "Entrar" no HTML
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
      // apiAutenticar já registou a sessão; agora só precisamos
      // de obter o perfil Firestore e desbloquear a página.
      // Não dependemos do onAuthStateChanged para este caminho.
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
// logout — chamado pelas páginas
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

  // apiLogout está em auth.js; o onAuthStateChanged re-mostrará o login
  apiLogout().then(function () {
    _mostrarEcraLogin();
  });
}

// ============================================================
// _processarUtilizador — partilhado pelo login activo e pelo
// listener de sessões persistidas
// ============================================================

function _processarUtilizador(userOuDados) {
  obterPerfilUtilizador()
    .then(function (perfil) {
      if (!perfil.ativo) {
        _mostrarErroLogin('Esta conta foi desativada. Contacte o administrador.');
        _fazerSignOut();
        return;
      }

      if (!_opcoesLogin.verificarAcesso(perfil)) {
        _mostrarErroLogin(_opcoesLogin.mensagemSemAcesso || 'Acesso negado.');
        _fazerSignOut();
        return;
      }

      _esconderEcraLogin();
      _opcoesLogin.onSucesso(perfil);
    })
    .catch(function () {
      // Falha ao ler perfil (ex.: sem ligação)
      _mostrarEcraLogin();
    });
}

// ============================================================
// Auxiliares de UI — privados
// ============================================================

function _esconderEcraLogin() {
  _ocultarLoadingOverlay();
  document.documentElement.classList.remove('tem-sessao');
  
  var overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.classList.add('hidden');

  if (_opcoesLogin && _opcoesLogin.idWrap) {
    var wrap = document.getElementById(_opcoesLogin.idWrap);
    if (wrap) wrap.style.display = '';
  }
}

function _mostrarEcraLogin() {
  document.documentElement.classList.remove('tem-sessao');
  
  var overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.classList.remove('hidden');

  if (_opcoesLogin && _opcoesLogin.idWrap) {
    var wrap = document.getElementById(_opcoesLogin.idWrap);
    if (wrap) wrap.style.display = 'none';
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

function _mostrarErroLogin(mensagem) {
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
// OVERLAY DE CARREGAMENTO ENTRE PÁGINAS
// ============================================================

function _mostrarLoadingOverlay() {
  // Reutilizar se já existir (navegação rápida)
  if (document.getElementById('pageLoadingOverlay')) return;

  var div = document.createElement('div');
  div.id        = 'pageLoadingOverlay';
  div.className = 'page-loading-overlay';
  div.innerHTML =
    '<img class="page-loading-logo" src="img/logo-small.png" alt="">' +
    '<div class="page-loading-spinner"></div>' +
    '<span class="page-loading-texto">A carregar...</span>';

  // Inserir antes de qualquer outro elemento para garantir z-index
  document.body.insertBefore(div, document.body.firstChild);
}

function _ocultarLoadingOverlay() {
  var overlay = document.getElementById('pageLoadingOverlay');
  if (!overlay) return;
  overlay.classList.add('oculto');
  // Remover do DOM após a transição
  setTimeout(function() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }, 350);
}
