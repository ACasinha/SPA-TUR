// ============================================================
// nav-menu.js — Menu de navegação contextual (header)
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
//
// Partilhado por index.html, admin.html, dashboard.html, editor.html
// Renderiza os itens de menu consoante o perfil do utilizador.
// ============================================================

'use strict';

(function() {

  var _menuAberto = false;

  // ── Definição dos itens de menu ──────────────────────────
  // visible: função que recebe o perfil e devolve true/false
  // current: string com a página actual (para marcar activo)

  var MENU_ITEMS = [
    {
      id:      'nav-app',
      label:   '📋 Registo Diário',
      href:    'index.html',
      page:    'index',
      visible: function(p) {
        return p.role === 'administrador' || p.role === 'utilizador';
      }
    },
    {
      id:      'nav-dashboard',
      label:   '📊 Dashboard',
      href:    'dashboard.html',
      page:    'dashboard',
      visible: function(p) {
        return p.role === 'administrador'
            || p.role === 'visualizador'
            || p.acessoDashboard === true;
      }
    },
    {
      id:      'nav-editor',
      label:   '✏️ Editor Mensal',
      href:    'editor.html',
      page:    'editor',
      visible: function(p) {
        return p.role === 'administrador' || p.acessoEditor === true;
      }
    },
    {
      id:      'nav-admin',
      label:   '🛡️ Gestão de Utilizadores',
      href:    'admin.html',
      page:    'admin',
      visible: function(p) {
        return p.role === 'administrador';
      }
    }
  ];

  // ── Detectar página actual ────────────────────────────────
  function paginaActual() {
    var path = window.location.pathname.split('/').pop().replace('.html', '');
    if (!path || path === '') return 'index';
    return path;
  }

  // ── Construir e injectar o menu no header ─────────────────
  function construirMenu(perfil) {
    var pagina   = paginaActual();
    var itemsVisiveis = MENU_ITEMS.filter(function(item) {
      return item.visible(perfil);
    });

    // Destruir menu anterior se existir (re-login com perfil diferente)
    var btnAntigo    = document.getElementById('navMenuBtn');
    var painelAntigo = document.getElementById('navMenuPainel');
    if (btnAntigo)    btnAntigo.parentNode.removeChild(btnAntigo);
    if (painelAntigo) painelAntigo.parentNode.removeChild(painelAntigo);
    _menuAberto = false;

    // Botão hamburger — injectado no header-right
    var headerRight = document.querySelector('.header-right');
    if (!headerRight) return;

    var btn = document.createElement('button');
    btn.id        = 'navMenuBtn';
    btn.className = 'nav-menu-btn';
    btn.setAttribute('aria-label', 'Menu de navegação');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-haspopup', 'true');
    btn.innerHTML =
      '<span class="nav-menu-icon">' +
        '<span></span><span></span><span></span>' +
      '</span>' +
      '<span class="nav-menu-btn-label">Menu</span>';

    // Adicionar ao fim do header-right — fica sempre o elemento mais à direita
    headerRight.appendChild(btn);

    // Painel dropdown
    var painel = document.createElement('div');
    painel.id        = 'navMenuPainel';
    painel.className = 'nav-menu-painel';
    painel.setAttribute('role', 'navigation');
    painel.setAttribute('aria-label', 'Navegação principal');

    // Cabeçalho do painel
    var cab = document.createElement('div');
    cab.className = 'nav-menu-cab';
    cab.innerHTML =
      '<span class="nav-menu-cab-nome">' +
        (perfil.nome || perfil.email || '—') +
      '</span>' +
      '<span class="nav-menu-cab-role">' + _labelRole(perfil) + '</span>';
    painel.appendChild(cab);

    // Separador
    var sep = document.createElement('div');
    sep.className = 'nav-menu-sep';
    painel.appendChild(sep);

    // Itens
    itemsVisiveis.forEach(function(item) {
      var a = document.createElement('a');
      a.href      = item.href;
      a.className = 'nav-menu-item' + (item.page === pagina ? ' activo' : '');
      a.id        = item.id;
      a.innerHTML = '<span class="nav-menu-item-label">' + item.label + '</span>';

      if (item.page === pagina) {
        a.setAttribute('aria-current', 'page');
        var badge = document.createElement('span');
        badge.className   = 'nav-menu-item-badge';
        badge.textContent = 'Aqui';
        a.appendChild(badge);
      }

      a.addEventListener('click', function(e) {
        if (item.page === pagina) {
          e.preventDefault();
          fecharMenu();
        }
      });

      painel.appendChild(a);
    });

    // Separador + botão sair
    var sep2 = document.createElement('div');
    sep2.className = 'nav-menu-sep';
    painel.appendChild(sep2);

    var btnSair = document.createElement('button');
    btnSair.className   = 'nav-menu-item nav-menu-sair';
    btnSair.innerHTML   = '<span class="nav-menu-item-label">↩ Terminar sessão</span>';
    btnSair.addEventListener('click', function() {
      fecharMenu();
      if (typeof logout === 'function') logout();
    });
    painel.appendChild(btnSair);

    document.body.appendChild(painel);

    // Eventos
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      _menuAberto ? fecharMenu() : abrirMenu();
    });

    document.addEventListener('click', function(e) {
      if (_menuAberto && !painel.contains(e.target) && e.target !== btn) {
        fecharMenu();
      }
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && _menuAberto) fecharMenu();
    });
  }

  function abrirMenu() {
    var btn    = document.getElementById('navMenuBtn');
    var painel = document.getElementById('navMenuPainel');
    if (!btn || !painel) return;

    _posicionarPainel();
    _menuAberto = true;
    btn.classList.add('aberto');
    btn.setAttribute('aria-expanded', 'true');
    painel.classList.add('visivel');

    // Focar no primeiro item
    var primeiro = painel.querySelector('.nav-menu-item:not(.activo)');
    if (primeiro) setTimeout(function() { primeiro.focus(); }, 50);
  }

  function fecharMenu() {
    var btn    = document.getElementById('navMenuBtn');
    var painel = document.getElementById('navMenuPainel');
    if (!btn || !painel) return;
    _menuAberto = false;
    btn.classList.remove('aberto');
    btn.setAttribute('aria-expanded', 'false');
    painel.classList.remove('visivel');
  }

  function _posicionarPainel() {
    var btn    = document.getElementById('navMenuBtn');
    var painel = document.getElementById('navMenuPainel');
    if (!btn || !painel) return;
    var r = btn.getBoundingClientRect();
    painel.style.top   = (r.bottom + 6) + 'px';
    painel.style.right = (window.innerWidth - r.right) + 'px';
  }

  window.addEventListener('resize', function() {
    if (_menuAberto) _posicionarPainel();
  });

  function _labelRole(perfil) {
    if (perfil.role === 'administrador') return 'Administrador';
    if (perfil.role === 'visualizador')  return 'Visualizador';
    var extras = [];
    if (perfil.acessoDashboard) extras.push('Dashboard');
    if (perfil.acessoEditor)    extras.push('Editor');
    if (extras.length) return 'Utilizador · ' + extras.join(', ');
    return 'Utilizador';
  }

  // ── API pública ───────────────────────────────────────────
  window.construirMenuNav = construirMenu;
  window.fecharMenuNav    = fecharMenu;

})();