// ============================================================
// sidebar.js — Navegação lateral para desktop (≥1024px)
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
//
// Responsabilidades:
//   • Construir a sidebar dinamicamente após login
//   • Gerir estado colapsado/expandido com persistência
//   • Auto-colapso na rota /editor, restauro ao sair
//   • Expor zona sidebar-header-extra para as views
//   • Redirecionar spaSetHeader({ direita }) para a sidebar
//     em desktop, mantendo compatibilidade com o header em mobile
// ============================================================

'use strict';

(function() {

  // ── Constantes ──────────────────────────────────────────────
  var CHAVE_ESTADO    = 'rmz_sidebar_colapsada';
  var BP_DESKTOP      = 1024;
  var ROTA_AUTOCOLAPSO = '/editor';

  // ── Estado interno ──────────────────────────────────────────
  var _perfil              = null;
  var _colapsada           = false;
  var _estadoAntesEditor   = null;  // guarda estado antes do auto-colapso
  var _rotaActual          = '/';
  var _sidebarEl           = null;
  var _shellMainEl         = null;
  var _construida          = false;

  // ── Itens de menu — espelham os do nav-menu.js ──────────────
  var MENU_ITEMS = [
    {
      id:      'sb-registo',
      label:   'Registo Diário',
      icone:   'list_alt',
      rota:    '/',
      visible: function(p) {
        return p.role === 'administrador' || p.role === 'utilizador';
      }
    },
    {
      id:      'sb-dashboard',
      label:   'Dashboard',
      icone:   'analytics',
      rota:    '/dashboard',
      visible: function(p) {
        return p.role === 'administrador'
            || p.role === 'visualizador'
            || p.acessoDashboard === true;
      }
    },
    {
      id:      'sb-editor',
      label:   'Editor Mensal',
      icone:   'edit_document',
      rota:    '/editor',
      visible: function(p) {
        return p.role === 'administrador' || p.acessoEditor === true;
      }
    },
    {
      id:      'sb-admin',
      label:   'Gestão de Utilizadores',
      icone:   'admin_panel_settings',
      rota:    '/admin',
      visible: function(p) {
        return p.role === 'administrador';
      }
    }
  ];

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  function construirSidebar(perfil) {
    _perfil    = perfil;
    _colapsada = localStorage.getItem(CHAVE_ESTADO) === '1';

    // Só em desktop
    if (!_eDesktop()) {
      _construida = false;
      return;
    }

    _reorganizarShell();
    _construirDOM();
    _construida = true;

    // Interceptar spaSetHeader para redirecionar o conteúdo direito
    _interceptarSpaSetHeader();

    // Listener de resize para activar/desactivar
    window.addEventListener('resize', _onResize);
  }

  // ============================================================
  // REORGANIZAR O SHELL
  // Envolve o outlet + footer num div.shell-main para que o
  // flex-row do #app-shell não coloque o footer ao lado da sidebar.
  // ============================================================

  function _reorganizarShell() {
    var appShell = document.getElementById('app-shell');
    if (!appShell) return;

    // Evitar reorganizar duas vezes
    if (appShell.querySelector('.shell-main')) {
      _shellMainEl = appShell.querySelector('.shell-main');
      return;
    }

    var outlet  = document.getElementById('spa-outlet');
    var footer  = document.getElementById('appFooter');
    var transicao = document.getElementById('spa-transition');

    var shellMain = document.createElement('div');
    shellMain.className = 'shell-main';

    // Inserir o wrapper antes do primeiro dos elementos
    var referencia = outlet || footer;
    if (referencia) {
      appShell.insertBefore(shellMain, referencia);
    } else {
      appShell.appendChild(shellMain);
    }

    // Mover elementos para dentro do wrapper
    if (transicao) shellMain.appendChild(transicao);
    if (outlet)    shellMain.appendChild(outlet);
    if (footer)    shellMain.appendChild(footer);

    _shellMainEl = shellMain;
  }

  // ============================================================
  // CONSTRUIR DOM DA SIDEBAR
  // ============================================================

  function _construirDOM() {
    // Remover sidebar anterior se existir
    var anterior = document.getElementById('appSidebar');
    if (anterior) anterior.parentNode.removeChild(anterior);

    var sidebar = document.createElement('aside');
    sidebar.id        = 'appSidebar';
    sidebar.className = 'sidebar' + (_colapsada ? ' colapsada' : '');
    sidebar.setAttribute('role', 'navigation');
    sidebar.setAttribute('aria-label', 'Navegação principal');

    // ── Logo ──────────────────────────────────────────────────
    var logo = document.createElement('div');
    logo.className = 'sidebar-logo';
    logo.innerHTML =
      '<img class="sidebar-logo-img" src="img/logo-small.png" alt="Logo Município">' +
      '<div class="sidebar-logo-texto">' +
        '<span class="sidebar-logo-nome">Reguengos de Monsaraz</span>' +
        '<span class="sidebar-logo-sub">Serviços de Turismo</span>' +
      '</div>';
    sidebar.appendChild(logo);

    // ── Navegação ─────────────────────────────────────────────
    var nav = document.createElement('nav');
    nav.className = 'sidebar-nav';

    var itemsVisiveis = MENU_ITEMS.filter(function(item) {
      return item.visible(_perfil);
    });

    itemsVisiveis.forEach(function(item) {
      nav.appendChild(_criarItem(item));
    });

    sidebar.appendChild(nav);

    // ── Spacer ────────────────────────────────────────────────
    var spacer = document.createElement('div');
    spacer.className = 'sidebar-spacer';
    sidebar.appendChild(spacer);

    // ── Zona inferior ─────────────────────────────────────────
    var bottom = document.createElement('div');
    bottom.className = 'sidebar-bottom';

    // Área extra das views
    var extra = document.createElement('div');
    extra.id        = 'sidebarHeaderExtra';
    extra.className = 'sidebar-header-extra';
    bottom.appendChild(extra);

    // Separador
    var sep = document.createElement('div');
    sep.className = 'sidebar-sep';
    bottom.appendChild(sep);

    // Utilizador
    bottom.appendChild(_criarUser());

    // Botão sair
    var btnSair = document.createElement('button');
    btnSair.className = 'sidebar-sair';
    btnSair.type      = 'button';
    btnSair.innerHTML =
      '<span class="sidebar-item-icon material-symbols-rounded">logout</span>' +
      '<span class="sidebar-item-label">Terminar sessão</span>';
    btnSair.addEventListener('click', function() {
      if (typeof logout === 'function') logout();
    });
    bottom.appendChild(btnSair);

    // Separador antes do toggle
    var sep2 = document.createElement('div');
    sep2.className = 'sidebar-sep';
    bottom.appendChild(sep2);

    // Botão colapso
    var toggle = document.createElement('button');
    toggle.id        = 'sidebarToggle';
    toggle.className = 'sidebar-toggle';
    toggle.type      = 'button';
    toggle.setAttribute('aria-label', _colapsada ? 'Expandir menu' : 'Colapsar menu');
    toggle.innerHTML =
      '<span class="sidebar-toggle-icon material-symbols-rounded">chevron_left</span>' +
      '<span class="sidebar-toggle-label">Colapsar</span>';
    toggle.addEventListener('click', _toggleColapso);
    bottom.appendChild(toggle);

    sidebar.appendChild(bottom);

    // Inserir sidebar no início do #app-shell (antes do shell-main)
    var appShell = document.getElementById('app-shell');
    if (appShell) {
      appShell.insertBefore(sidebar, appShell.firstChild);
    }

    _sidebarEl = sidebar;

    // Actualizar item activo
    _actualizarActivo(_rotaActual);
  }

  // ============================================================
  // CRIAR ITEM DE MENU
  // ============================================================

  function _criarItem(item) {
    var a = document.createElement('a');
    a.href      = item.rota;
    a.id        = item.id;
    a.className = 'sidebar-item';
    a.setAttribute('data-rota',    item.rota);
    a.setAttribute('data-tooltip', item.label);
    a.innerHTML =
      '<span class="sidebar-item-icon material-symbols-rounded">' + item.icone + '</span>' +
      '<span class="sidebar-item-label">' + _esc(item.label) + '</span>';

    a.addEventListener('click', function(e) {
      e.preventDefault();
      if (typeof routerNavegar === 'function') {
        routerNavegar(item.rota);
      } else {
        window.location.href = item.rota;
      }
    });

    return a;
  }

  // ============================================================
  // CRIAR BLOCO DE UTILIZADOR
  // ============================================================

  function _criarUser() {
    var div = document.createElement('div');
    div.className = 'sidebar-user';

    var nome  = (_perfil && (_perfil.nome || _perfil.email)) || '—';
    var role  = _labelRole(_perfil);
    var sigla = nome.charAt(0).toUpperCase();

    div.innerHTML =
      '<div class="sidebar-user-avatar">' + _esc(sigla) + '</div>' +
      '<div class="sidebar-user-info">' +
        '<span class="sidebar-user-nome">' + _esc(nome) + '</span>' +
        '<span class="sidebar-user-role">' + _esc(role) + '</span>' +
      '</div>';

    return div;
  }

  // ============================================================
  // COLAPSO / EXPANSÃO
  // ============================================================

  function _toggleColapso() {
    _colapsada = !_colapsada;
    _aplicarEstado();
    localStorage.setItem(CHAVE_ESTADO, _colapsada ? '1' : '0');
  }

  function _aplicarEstado() {
    if (!_sidebarEl) return;

    if (_colapsada) {
      _sidebarEl.classList.add('colapsada');
    } else {
      _sidebarEl.classList.remove('colapsada');
    }

    var toggle = document.getElementById('sidebarToggle');
    if (toggle) {
      toggle.setAttribute('aria-label', _colapsada ? 'Expandir menu' : 'Colapsar menu');
    }
  }

  function _colapsar(silencioso) {
    // silencioso = true → não grava no localStorage (auto-colapso)
    _colapsada = true;
    _aplicarEstado();
    if (!silencioso) localStorage.setItem(CHAVE_ESTADO, '1');
  }

  function _expandir(silencioso) {
    _colapsada = false;
    _aplicarEstado();
    if (!silencioso) localStorage.setItem(CHAVE_ESTADO, '0');
  }

  // ============================================================
  // NOTIFICAÇÃO DE MUDANÇA DE ROTA (chamado pelo router.js)
  // ============================================================

  function sidebarNavegar(novaCaminho) {
    var rotaAnterior = _rotaActual;
    _rotaActual      = novaCaminho;

    if (!_construida || !_eDesktop()) return;

    // Auto-colapso ao entrar no editor
    if (novaCaminho === ROTA_AUTOCOLAPSO && rotaAnterior !== ROTA_AUTOCOLAPSO) {
      _estadoAntesEditor = _colapsada;
      if (!_colapsada) {
        _colapsar(true); // silencioso — não altera o localStorage
      }
    }

    // Restauro ao sair do editor
    if (rotaAnterior === ROTA_AUTOCOLAPSO && novaCaminho !== ROTA_AUTOCOLAPSO) {
      if (_estadoAntesEditor !== null && !_estadoAntesEditor) {
        _expandir(true); // silencioso
      }
      _estadoAntesEditor = null;
    }

    _actualizarActivo(novaCaminho);
  }

  // ============================================================
  // ACTUALIZAR ITEM ACTIVO
  // ============================================================

  function _actualizarActivo(caminho) {
    if (!_sidebarEl) return;
    _sidebarEl.querySelectorAll('.sidebar-item[data-rota]').forEach(function(el) {
      var r = el.getAttribute('data-rota');
      el.classList.toggle('activo', r === caminho);
      if (r === caminho) {
        el.setAttribute('aria-current', 'page');
      } else {
        el.removeAttribute('aria-current');
      }
    });
  }

  // ============================================================
  // INTERCEPTAR spaSetHeader
  // Em desktop, o conteúdo "direita" vai para a sidebar.
  // Em mobile, o comportamento original mantém-se.
  // ============================================================

  function _interceptarSpaSetHeader() {
    // Guardar a função original
    var _spaSetHeaderOriginal = window.spaSetHeader;

    window.spaSetHeader = function(opcoes) {
      opcoes = opcoes || {};

      // Título — vai sempre para o elemento original (existe no HTML)
      // Em desktop o header está oculto, mas o título pode ser usado
      // por outras lógicas (document.title, etc.)
      if (opcoes.titulo !== undefined) {
        var tEl = document.getElementById('headerTitulo');
        if (tEl) tEl.textContent = opcoes.titulo;
        // Também actualizar o título da página
        document.title = opcoes.titulo + ' — Registo de Nacionalidades';
      }

      // Conteúdo "direita"
      if (opcoes.direita !== undefined) {
        if (_eDesktop()) {
          // Desktop → sidebar
          var extra = document.getElementById('sidebarHeaderExtra');
          if (extra) extra.innerHTML = opcoes.direita;
        } else {
          // Mobile → header original
          var dr = document.getElementById('headerRight');
          if (dr) dr.innerHTML = opcoes.direita;
        }
      }
    };

    // Guardar referência ao original para o reset
    window._spaSetHeaderOriginal = _spaSetHeaderOriginal;
  }

  // ============================================================
  // RESIZE — activar/desactivar sidebar conforme breakpoint
  // ============================================================

  var _resizeTimer = null;

  function _onResize() {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function() {
      if (_eDesktop() && !_construida) {
        // Passou para desktop — construir
        construirSidebar(_perfil);
      } else if (!_eDesktop() && _construida) {
        // Passou para mobile — destruir sidebar
        _destruirSidebar();
      }
    }, 150);
  }

  function _destruirSidebar() {
    var sidebar = document.getElementById('appSidebar');
    if (sidebar) sidebar.parentNode.removeChild(sidebar);
    _sidebarEl  = null;
    _construida = false;

    // Restaurar spaSetHeader original
    if (window._spaSetHeaderOriginal) {
      window.spaSetHeader = window._spaSetHeaderOriginal;
    }
  }

  // ============================================================
  // UTILITÁRIOS
  // ============================================================

  function _eDesktop() {
    return window.innerWidth >= BP_DESKTOP;
  }

  function _labelRole(perfil) {
    if (!perfil) return '';
    if (perfil.role === 'administrador') return 'Administrador';
    if (perfil.role === 'visualizador')  return 'Visualizador';
    var extras = [];
    if (perfil.acessoDashboard) extras.push('Dashboard');
    if (perfil.acessoEditor)    extras.push('Editor');
    if (extras.length) return 'Utilizador · ' + extras.join(', ');
    return 'Utilizador';
  }

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ============================================================
  // API PÚBLICA
  // ============================================================

  window.construirSidebar    = construirSidebar;
  window.sidebarNavegar      = sidebarNavegar;

})();
