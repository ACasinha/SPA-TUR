// ============================================================
// nav-menu.js — Barra de Navegação Inferior com Ícones (Mobile <1024px)
// e Gaveta "Mais" (Bottom Sheet)
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
// ============================================================

'use strict';

(function() {

  var _sheetAberta = false;
  var _perfilActual = null;

  var MENU_ITEMS = [
    {
      id:      'nav-inicio',
      label:   'Início',
      icone:   'home',
      rota:    '/',
      visible: function(p) { return true; }
    },
    {
      id:      'nav-app',
      label:   'Registo',
      icone:   'list_alt',
      rota:    '/registo',
      visible: function(p) {
        return p && (p.role === 'administrador' || p.acessoRegisto === true);
      }
    },
    {
      id:      'nav-dashboard',
      label:   'Dashboard',
      icone:   'analytics',
      rota:    '/dashboard',
      visible: function(p) {
        return p && (p.role === 'administrador' || p.acessoDashboard === true);
      }
    },
    {
      id:      'nav-editor',
      label:   'Editor',
      icone:   'edit_document',
      rota:    '/editor',
      visible: function(p) {
        return p && (p.role === 'administrador' || p.acessoEditor === true);
      }
    },
    {
      id:      'nav-inventario',
      label:   'Inventário',
      icone:   'inventory_2',
      rota:    '/inventario',
      visible: function(p) {
        return p && (p.role === 'administrador' || p.acessoInventario === true);
      }
    },
    {
      id:      'nav-admin',
      label:   'Utilizadores',
      icone:   'admin_panel_settings',
      rota:    '/admin',
      visible: function(p) {
        return p && p.role === 'administrador';
      }
    }
  ];

  // ── Obter rota actual da SPA ──────────────────────────────
  function rotaActual() {
    var hash = window.location.hash.replace(/^#/, '');
    if (hash) return hash.replace(/\/+$/, '') || '/';
    var path = window.location.pathname.replace(/\/+$/, '') || '/';
    return path;
  }

  // ── Construir e injectar a navegação ──────────────────────
  function construirMenu(perfil) {
    _perfilActual = perfil || {};
    var rota = rotaActual();

    // 1. Limpar elementos anteriores
    _destruirElementos();

    // 2. Limpar o contentor headerNav do antigo hamburger
    var headerNav = document.getElementById('headerNav');
    if (headerNav) {
      headerNav.innerHTML = '';
    }

    // 3. Filtrar itens visíveis para o utilizador
    var itemsVisiveis = MENU_ITEMS.filter(function(item) {
      return item.visible(_perfilActual);
    });

    // Em mobile, a barra acomoda até 4 itens diretos + botão "Mais" (total 5 abas)
    // Se o utilizador tiver 4 ou menos itens, todos aparecem na barra + "Mais" para conta/logout
    var maxDiretos = 4;
    var itensBarra = [];
    var itensGaveta = [];

    if (itemsVisiveis.length <= maxDiretos) {
      itensBarra = itemsVisiveis;
    } else {
      itensBarra = itemsVisiveis.slice(0, maxDiretos);
      itensGaveta = itemsVisiveis.slice(maxDiretos);
    }

    // 4. Criar a barra de navegação inferior (<nav class="bottom-nav">)
    var nav = document.createElement('nav');
    nav.id = 'bottomNav';
    nav.className = 'bottom-nav';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Navegação principal inferior');

    itensBarra.forEach(function(item) {
      var eActivo = (item.rota === rota);
      var btn = document.createElement('a');
      btn.href = item.rota;
      btn.className = 'bottom-nav-item' + (eActivo ? ' activo' : '');
      btn.setAttribute('data-rota', item.rota);
      btn.id = item.id;
      if (eActivo) btn.setAttribute('aria-current', 'page');

      btn.innerHTML =
        '<span class="bottom-nav-icon material-symbols-rounded">' + item.icone + '</span>' +
        '<span class="bottom-nav-label">' + _escapar(item.label) + '</span>';

      btn.addEventListener('click', function(e) {
        e.preventDefault();
        fecharGaveta();
        if (typeof routerNavegar === 'function') {
          routerNavegar(item.rota);
        } else {
          window.location.hash = item.rota;
        }
      });

      nav.appendChild(btn);
    });

    // 5. Botão "Mais" / Perfil na barra inferior
    var btnMais = document.createElement('button');
    btnMais.type = 'button';
    btnMais.id = 'bottomNavMais';
    btnMais.className = 'bottom-nav-item';
    btnMais.setAttribute('aria-label', 'Mais opções e utilizador');
    btnMais.setAttribute('aria-expanded', 'false');

    // Verificar se a rota actual está dentro dos itens da gaveta
    var rotaNaGaveta = itensGaveta.some(function(it) { return it.rota === rota; });
    if (rotaNaGaveta) {
      btnMais.classList.add('activo');
      btnMais.setAttribute('aria-current', 'page');
    }

    btnMais.innerHTML =
      '<span class="bottom-nav-icon material-symbols-rounded">more_horiz</span>' +
      '<span class="bottom-nav-label">Mais</span>';

    btnMais.addEventListener('click', function(e) {
      e.stopPropagation();
      _sheetAberta ? fecharGaveta() : abrirGaveta();
    });

    nav.appendChild(btnMais);

    // Inserir barra no app-shell ou body
    var shell = document.getElementById('app-shell') || document.body;
    shell.appendChild(nav);

    // 6. Construir a Bottom Sheet (Gaveta "Mais")
    _construirBottomSheet(itensGaveta, _perfilActual);

    // 7. Atualizar estados ativos
    actualizarNavActivo(rota);
  }

  // ── Construir a Bottom Sheet (Gaveta) ─────────────────────
  function _construirBottomSheet(itensExtras, perfil) {
    var overlay = document.createElement('div');
    overlay.id = 'bottomSheetOverlay';
    overlay.className = 'bottom-sheet-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    var sheet = document.createElement('div');
    sheet.className = 'bottom-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Opções adicionais');

    // Handle de arrasto
    var handle = document.createElement('div');
    handle.className = 'bottom-sheet-handle';
    sheet.appendChild(handle);

    // Cabeçalho com perfil do utilizador
    var header = document.createElement('div');
    header.className = 'bottom-sheet-header';

    var nome = (perfil && (perfil.nome || perfil.email)) || 'Utilizador';
    var sigla = nome.charAt(0).toUpperCase();
    var role = _labelRole(perfil);

    header.innerHTML =
      '<div class="bottom-sheet-user">' +
        '<div class="bottom-sheet-avatar">' + _escapar(sigla) + '</div>' +
        '<div class="bottom-sheet-user-info">' +
          '<span class="bottom-sheet-user-nome">' + _escapar(nome) + '</span>' +
          '<span class="bottom-sheet-user-role">' + _escapar(role) + '</span>' +
        '</div>' +
      '</div>' +
      '<button class="bottom-sheet-btn-fechar" id="btnFecharBottomSheet" aria-label="Fechar">' +
        '<span class="material-symbols-rounded">close</span>' +
      '</button>';

    sheet.appendChild(header);

    // Lista de ações
    var lista = document.createElement('div');
    lista.className = 'bottom-sheet-list';

    // Itens extras de navegação (ex: Inventário, Gestão de Utilizadores)
    if (itensExtras && itensExtras.length > 0) {
      itensExtras.forEach(function(item) {
        var a = document.createElement('a');
        a.href = item.rota;
        a.className = 'bottom-sheet-item';
        a.setAttribute('data-rota', item.rota);
        a.innerHTML =
          '<span class="material-symbols-rounded">' + item.icone + '</span>' +
          '<span>' + _escapar(item.label) + '</span>';

        a.addEventListener('click', function(e) {
          e.preventDefault();
          fecharGaveta();
          if (typeof routerNavegar === 'function') {
            routerNavegar(item.rota);
          } else {
            window.location.hash = item.rota;
          }
        });

        lista.appendChild(a);
      });
    }

    var sep = document.createElement('div');
    sep.className = 'bottom-sheet-sep';
    lista.appendChild(sep);

    // Alternar Tema (Dark / Light)
    var btnTema = document.createElement('button');
    btnTema.type = 'button';
    btnTema.className = 'bottom-sheet-item';
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btnTema.innerHTML =
      '<span class="material-symbols-rounded" id="sheetThemeIcon">' + (isDark ? 'light_mode' : 'dark_mode') + '</span>' +
      '<span id="sheetThemeText">' + (isDark ? 'Modo Claro' : 'Modo Escuro') + '</span>';

    btnTema.addEventListener('click', function() {
      var currentTheme = document.documentElement.getAttribute('data-theme');
      var newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);

      var iconEl = document.getElementById('sheetThemeIcon');
      var textEl = document.getElementById('sheetThemeText');
      if (iconEl) iconEl.textContent = newTheme === 'dark' ? 'light_mode' : 'dark_mode';
      if (textEl) textEl.textContent = newTheme === 'dark' ? 'Modo Claro' : 'Modo Escuro';

      // Sincronizar botão do rodapé ou sidebar se existir
      var sidebarIcon = document.getElementById('sidebarThemeIcon');
      if (sidebarIcon) sidebarIcon.textContent = newTheme === 'dark' ? 'light_mode' : 'dark_mode';
      var sidebarTxt = document.getElementById('sidebarThemeText');
      if (sidebarTxt) sidebarTxt.textContent = newTheme === 'dark' ? 'Modo Claro' : 'Modo Escuro';
    });
    lista.appendChild(btnTema);

    // Botão Verificar atualização
    var btnUpdate = document.createElement('button');
    btnUpdate.type = 'button';
    btnUpdate.className = 'bottom-sheet-item btn-verificar-update';
    btnUpdate.id = 'btnSheetUpdate';
    btnUpdate.innerHTML =
      '<span class="material-symbols-rounded">cached</span>' +
      '<span>Verificar atualização</span>';
    btnUpdate.addEventListener('click', function() {
      if (typeof verificarAtualizacao === 'function') verificarAtualizacao();
    });
    lista.appendChild(btnUpdate);

    // Botão Instalar app
    var btnInstalar = document.createElement('button');
    btnInstalar.type = 'button';
    btnInstalar.className = 'bottom-sheet-item btn-instalar-app';
    btnInstalar.id = 'btnSheetInstalar';
    btnInstalar.style.display = 'none';
    btnInstalar.innerHTML =
      '<span class="material-symbols-rounded">install_mobile</span>' +
      '<span>Instalar app</span>';
    btnInstalar.addEventListener('click', function() {
      if (typeof instalarApp === 'function') instalarApp();
    });
    lista.appendChild(btnInstalar);

    // Versão da aplicação
    var divVersao = document.createElement('div');
    divVersao.className = 'bottom-sheet-versao';
    divVersao.innerHTML =
      '<span>Versão <strong class="app-versao" id="sheetVersao">v1</strong></span>';
    lista.appendChild(divVersao);

    // Separador
    var sep2 = document.createElement('div');
    sep2.className = 'bottom-sheet-sep';
    lista.appendChild(sep2);

    // Botão Sair / Logout
    var btnSair = document.createElement('button');
    btnSair.type = 'button';
    btnSair.className = 'bottom-sheet-item bottom-sheet-sair';
    btnSair.innerHTML =
      '<span class="material-symbols-rounded">logout</span>' +
      '<span>Terminar sessão</span>';

    btnSair.addEventListener('click', function() {
      fecharGaveta();
      if (typeof logout === 'function') logout();
    });

    lista.appendChild(btnSair);
    sheet.appendChild(lista);
    overlay.appendChild(sheet);

    // Fechar ao clicar no backdrop ou botão fechar
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) fecharGaveta();
    });

    var btnFechar = header.querySelector('#btnFecharBottomSheet');
    if (btnFechar) {
      btnFechar.addEventListener('click', fecharGaveta);
    }

    document.body.appendChild(overlay);

    // Fechar com a tecla Escape
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && _sheetAberta) fecharGaveta();
    });
  }

  // ── Controlo da gaveta "Mais" ──────────────────────────────
  function abrirGaveta() {
    var overlay = document.getElementById('bottomSheetOverlay');
    var btnMais = document.getElementById('bottomNavMais');
    if (!overlay) return;

    _sheetAberta = true;
    overlay.classList.add('visivel');
    overlay.setAttribute('aria-hidden', 'false');
    if (btnMais) btnMais.setAttribute('aria-expanded', 'true');

    if (typeof mostrarVersao === 'function') mostrarVersao();
    if (typeof verificarVisibilidadeInstalacao === 'function') verificarVisibilidadeInstalacao();
  }

  function fecharGaveta() {
    var overlay = document.getElementById('bottomSheetOverlay');
    var btnMais = document.getElementById('bottomNavMais');
    if (!overlay) return;

    _sheetAberta = false;
    overlay.classList.remove('visivel');
    overlay.setAttribute('aria-hidden', 'true');
    if (btnMais) btnMais.setAttribute('aria-expanded', 'false');
  }

  // ── Destruir elementos anteriores ─────────────────────────
  function _destruirElementos() {
    var navAntiga = document.getElementById('bottomNav');
    if (navAntiga && navAntiga.parentNode) {
      navAntiga.parentNode.removeChild(navAntiga);
    }

    var sheetAntiga = document.getElementById('bottomSheetOverlay');
    if (sheetAntiga && sheetAntiga.parentNode) {
      sheetAntiga.parentNode.removeChild(sheetAntiga);
    }

    _sheetAberta = false;
  }

  // ── Actualizar estado activo na navegação ─────────────────
  function actualizarNavActivo(caminho) {
    caminho = caminho || rotaActual();

    // 1. Itens da barra inferior
    var bottomItems = document.querySelectorAll('.bottom-nav-item[data-rota]');
    bottomItems.forEach(function(el) {
      var r = el.getAttribute('data-rota');
      var activo = (r === caminho);
      el.classList.toggle('activo', activo);
      if (activo) {
        el.setAttribute('aria-current', 'page');
      } else {
        el.removeAttribute('aria-current');
      }
    });

    // 2. Itens da gaveta "Mais"
    var sheetItems = document.querySelectorAll('.bottom-sheet-item[data-rota]');
    var rotaNaGaveta = false;
    sheetItems.forEach(function(el) {
      var r = el.getAttribute('data-rota');
      var activo = (r === caminho);
      el.classList.toggle('activo', activo);
      if (activo) {
        el.setAttribute('aria-current', 'page');
        rotaNaGaveta = true;
      } else {
        el.removeAttribute('aria-current');
      }
    });

    // 3. Se a rota activa for uma das que está dentro da gaveta, o botão "Mais" fica activo
    var btnMais = document.getElementById('bottomNavMais');
    if (btnMais) {
      btnMais.classList.toggle('activo', rotaNaGaveta);
      if (rotaNaGaveta) {
        btnMais.setAttribute('aria-current', 'page');
      } else {
        btnMais.removeAttribute('aria-current');
      }
    }
  }

  // Listener para popstate
  window.addEventListener('popstate', function() {
    actualizarNavActivo(rotaActual());
  });

  // ── Utilitários ───────────────────────────────────────────
  function _labelRole(perfil) {
    if (!perfil) return 'Utilizador';
    if (perfil.role === 'administrador') return 'Administrador';
    var extras = [];
    if (perfil.acessoRegisto)     extras.push('Registo');
    if (perfil.acessoDashboard)  extras.push('Dashboard');
    if (perfil.acessoEditor)     extras.push('Editor');
    if (perfil.acessoInventario) extras.push('Inventário');
    if (extras.length) return 'Utilizador · ' + extras.join(', ');
    return 'Utilizador';
  }

  function _escapar(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── API Pública ───────────────────────────────────────────
  window.construirMenuNav   = construirMenu;
  window.fecharMenuNav      = fecharGaveta;
  window.actualizarNavActivo = actualizarNavActivo;

})();
