// ============================================================
// nav-menu.js — Menu de navegação contextual (versão SPA)
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
//
// Diferenças face à versão multi-página:
//   • Navegação via routerNavegar() em vez de window.location
//   • Marca item activo por caminho SPA (/, /dashboard, etc.)
//   • data-rota em cada <a> para o router actualizar o estado activo
// ============================================================

'use strict';

(function() {

  var _menuAberto = false;

  var MENU_ITEMS = [
    {
      id:    'nav-app',
      label: '📋 Registo Diário',
      rota:  '#/',
      visible: function(p) {
        return p.role === 'administrador' || p.role === 'utilizador';
      }
    },
    {
      id:    'nav-dashboard',
      label: '📊 Dashboard',
      rota:  '#/dashboard',
      visible: function(p) {
        return p.role === 'administrador'
            || p.role === 'visualizador'
            || p.acessoDashboard === true;
      }
    },
    {
      id:    'nav-editor',
      label: '✏️ Editor Mensal',
      rota:  '#/editor',
      visible: function(p) {
        return p.role === 'administrador' || p.acessoEditor === true;
      }
    },
    {
      id:    'nav-admin',
      label: '🛡️ Gestão de Utilizadores',
      rota:  '#/admin',
      visible: function(p) {
        return p.role === 'administrador';
      }
    }
  ];

  // ── Rota actual ───────────────────────────────────────────
  function rotaActual() {
    var path = window.location.pathname.replace(/\/+$/, '') || '/';
    return path;
  }

  // ── Construir e injectar o menu ───────────────────────────
  function construirMenu(perfil) {
    var rota          = rotaActual();
    var itemsVisiveis = MENU_ITEMS.filter(function(item) {
      return item.visible(perfil);
    });

    // Destruir menu anterior
    var btnAntigo    = document.getElementById('navMenuBtn');
    var painelAntigo = document.getElementById('navMenuPainel');
    if (btnAntigo)    btnAntigo.parentNode.removeChild(btnAntigo);
    if (painelAntigo) painelAntigo.parentNode.removeChild(painelAntigo);
    _menuAberto = false;

    var headerNav = document.getElementById('headerNav');

    if (!headerNav) return;

    // Botão hamburger
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
    headerNav.appendChild(btn);
    console.log('btn criado', document.getElementById('navMenuBtn'));

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

    painel.appendChild(_separador());

    // Itens de navegação
    itemsVisiveis.forEach(function(item) {
      var eActivo = item.rota === rota;
      var a       = document.createElement('a');

      // href real para acessibilidade e ctrl+clique
      a.href      = item.rota;
      // data-rota usado pelo router para marcar activo sem recarregar
      a.setAttribute('data-rota', item.rota);
      a.className = 'nav-menu-item' + (eActivo ? ' activo' : '');
      a.id        = item.id;
      a.innerHTML = '<span class="nav-menu-item-label">' + item.label + '</span>';

      if (eActivo) {
        a.setAttribute('aria-current', 'page');
        var badge = document.createElement('span');
        badge.className   = 'nav-menu-item-badge';
        badge.textContent = 'Aqui';
        a.appendChild(badge);
      }

      // Navegação SPA — interceptar clique normal
      a.addEventListener('click', function(e) {
        e.preventDefault();
        fecharMenu();
        if (typeof routerNavegar === 'function') {
          routerNavegar(item.rota);
        } else {
          window.location.href = item.rota;
        }
      });

      painel.appendChild(a);
    });

    painel.appendChild(_separador());

    // Botão sair
    var btnSair = document.createElement('button');
    btnSair.className = 'nav-menu-item nav-menu-sair';
    btnSair.innerHTML = '<span class="nav-menu-item-label">↩ Terminar sessão</span>';
    btnSair.addEventListener('click', function() {
      fecharMenu();
      if (typeof logout === 'function') logout();
    });
    painel.appendChild(btnSair);

    document.body.appendChild(painel);

    // Eventos do botão hamburger
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

    console.log('construirMenuNav');
console.log(document.getElementById('headerRight'));
  }

  function _separador() {
    var sep = document.createElement('div');
    sep.className = 'nav-menu-sep';
    return sep;
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

  // Actualizar estado activo quando o router muda de rota
  // (o router chama _actualizarNavActivo, que já lida com data-rota)
  window.addEventListener('popstate', function() {
    var rota   = rotaActual();
    var painel = document.getElementById('navMenuPainel');
    if (!painel) return;
    painel.querySelectorAll('.nav-menu-item[data-rota]').forEach(function(el) {
      var r      = el.getAttribute('data-rota');
      var activo = r === rota;
      el.classList.toggle('activo', activo);
      if (activo) {
        el.setAttribute('aria-current', 'page');
      } else {
        el.removeAttribute('aria-current');
      }
    });
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

  window.construirMenuNav = construirMenu;
  window.fecharMenuNav    = fecharMenu;

})();