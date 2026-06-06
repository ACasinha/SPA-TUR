// ============================================================
// app-shell.js — Orquestrador da SPA
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
//
// Responsabilidades:
//   • Inicializar o login e, após sucesso, o router
//   • Expor spaSetHeader() para as views personalizarem o header
//   • Gerir o header dinâmico (título + zona direita)
//   • Toast global acessível a qualquer view
// ============================================================

'use strict';

// Namespace das views — cada view/view.js escreve aqui
window.__views = window.__views || {};

// ── Arranque ─────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  inicializarLogin({
    // A SPA não tem idWrap: o shell é controlado aqui
    idWrap: null,

    // Qualquer utilizador autenticado e activo pode entrar no shell.
    // O router verifica o acesso por rota individualmente.
    verificarAcesso: function(perfil) {
      return perfil.role === 'administrador'
          || perfil.role === 'utilizador'
          || perfil.role === 'visualizador'
          || perfil.acessoDashboard === true
          || perfil.acessoEditor    === true;
    },

    mensagemSemAcesso: 'Esta conta não tem acesso à aplicação. Contacte o administrador.',

    onSucesso: function(perfil) {
      _activarShell(perfil);
    },

    onSessaoTerminada: function() {
      _desactivarShell();
    }
  });
});

// ============================================================
// ACTIVAR / DESACTIVAR SHELL
// ============================================================

function _activarShell(perfil) {
  var shell = document.getElementById('app-shell');
  if (shell) shell.style.display = '';

  // Nome no header
  var nomeEl = document.getElementById('headerNomeFuncionario');
  if (nomeEl) nomeEl.textContent = perfil.nome || perfil.email || '—';

  // Menu de navegação contextual (nav-menu.js)
  if (typeof construirMenuNav === 'function') {
    construirMenuNav(perfil);
  }

  // Sincronização offline
  if (typeof syncInit === 'function') {
    syncInit()
      .then(function() {
        if (typeof syncLimparResolvidos === 'function') syncLimparResolvidos();
        if (navigator.onLine && typeof syncSincronizarFila === 'function') {
          syncSincronizarFila();
        }
      })
      .catch(function() {});
  }

  // Inicializar o router com o perfil do utilizador
  routerDefinirPerfil(perfil);
  routerInit(perfil);

}

function _desactivarShell() {
  var shell = document.getElementById('app-shell');
  if (shell) shell.style.display = 'none';

  // Limpar o outlet para evitar estado residual
  var outlet = document.getElementById('spa-outlet');
  if (outlet) outlet.innerHTML = '';

  // Limpar zona direita do header
  var hr = document.getElementById('headerRight');
  if (hr) hr.innerHTML = '';
}

// ============================================================
// API PÚBLICA PARA AS VIEWS
// ============================================================

/**
 * spaSetHeader({ titulo, direita })
 * As views chamam isto no mount() para personalizar o header.
 *
 * @param {object} opcoes
 *   titulo  {string}  — título mostrado no header (opcional)
 *   direita {string}  — HTML injectado na zona direita (opcional)
 */
window.spaSetHeader = function(opcoes) {
  opcoes = opcoes || {};

  if (opcoes.titulo !== undefined) {
    var tEl = document.getElementById('headerTitulo');
    if (tEl) tEl.textContent = opcoes.titulo;
  }

  if (opcoes.direita !== undefined) {
    var dr = document.getElementById('headerRight');
    if (dr) dr.innerHTML = opcoes.direita;
  }
};

/**
 * spaResetHeader()
 * Restaura o header para o estado padrão (entre views).
 */
window.spaResetHeader = function() {
  var tEl = document.getElementById('headerTitulo');
  if (tEl) tEl.textContent = 'Registo Diário de Turistas e Visitantes';
  var dr = document.getElementById('headerRight');
  if (dr) dr.innerHTML = '';
};

/**
 * mostrarToast(msg, tipo)
 * Toast global — pode ser chamado de qualquer view.
 * Compatível com o toast das páginas anteriores.
 */
window.mostrarToast = function(msg, tipo) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className   = 'toast ' + (tipo || 'info') + ' show';
  clearTimeout(t._rmzTimer);
  t._rmzTimer = setTimeout(function() { t.classList.remove('show'); }, 3800);
};

/**
 * fazerLogout — chamado pelo menu de navegação (nav-menu.js)
 */
window.logout = function(temAlteracoes) {
  if (temAlteracoes) {
    if (!confirm('Tem alterações por guardar. Tem a certeza que quer sair?')) return;
  } else {
    if (!confirm('Deseja terminar a sessão?')) return;
  }
  if (typeof limparCacheUtilizador === 'function') limparCacheUtilizador();
  apiLogout().then(function() {
    _desactivarShell();
  });
};
