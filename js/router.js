// ============================================================
// router.js — SPA Router com lazy loading de views
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
// ============================================================

'use strict';

var ROTAS = {
  '/': {
    view:      'registo',
    titulo:    'Registo Diário',
    deps:      [],
    acesso:    function(p) { return p.role === 'administrador' || p.role === 'utilizador'; },
    semAcesso: 'Esta conta não tem acesso à aplicação de registo.'
  },
  '/dashboard': {
    view:      'dashboard',
    titulo:    'Dashboard',
    deps:      [],
    acesso:    function(p) {
      return p.role === 'administrador' || p.role === 'visualizador' || p.acessoDashboard === true;
    },
    semAcesso: 'Não tem permissão para aceder ao dashboard.'
  },
  '/editor': {
    view:      'editor',
    titulo:    'Editor Mensal',
    deps:      [],
    acesso:    function(p) { return p.role === 'administrador' || p.acessoEditor === true; },
    semAcesso: 'Não tem permissão para aceder ao editor mensal.'
  },
  '/inventario': {
    view:      'inventario',
    titulo:    'Inventário de Material',
    deps:      [],
    acesso:    function(p) { return p.role === 'administrador' || p.acessoInventario === true; },
    semAcesso: 'Não tem permissão para aceder ao inventário de material.'
  },
  '/admin': {
    view:      'admin',
    titulo:    'Gestão de Utilizadores',
    deps:      [],
    acesso:    function(p) { return p.role === 'administrador'; },
    semAcesso: 'Apenas administradores podem aceder a esta área.'
  }
};

var _rotaActual      = null;
var _viewActual      = null;
var _perfilUtiliz    = null;
var _navegando       = false;

// Por view: guarda os URLs dos scripts e o elemento <link> do CSS
var _recursosView    = {};

// Cache de HTML das views
var _htmlCache       = {};

var OUTLET_ID = 'spa-outlet';

// ============================================================
// INICIALIZAÇÃO
// ============================================================

function routerInit(perfil) {
  _perfilUtiliz = perfil;
  document.addEventListener('click', _onLinkClick);

  window.addEventListener('popstate', function() {
    var caminhoHash = window.location.hash.replace(/^#/, '') || '/';
    _navegar(caminhoHash, false);
  });

  var caminhoInicial = window.location.hash.replace(/^#/, '') || '/';
  _navegar(caminhoInicial, false);
}

// ============================================================
// NAVEGAR
// ============================================================

function routerNavegar(caminho) {
  _navegar(caminho, true);
}

function _navegar(caminho, pushState) {
  if (_navegando) return;

  caminho = caminho.replace(/\/+$/, '') || '/';

  var rota = ROTAS[caminho];
  if (!rota) { caminho = '/'; rota = ROTAS['/']; }

  if (_perfilUtiliz && !rota.acesso(_perfilUtiliz)) {
    _mostrarErroAcesso(rota.semAcesso);
    return;
  }

  if (_rotaActual && _rotaActual.caminho === caminho) return;

  _navegando = true;
  _mostrarTransicao(true);

  var promessaLeave = Promise.resolve();
  if (_viewActual && typeof _viewActual.beforeLeave === 'function') {
    promessaLeave = Promise.resolve(_viewActual.beforeLeave());
  }

  var viewAnterior = _rotaActual ? _rotaActual.rota.view : null;

  promessaLeave
    .then(function() {
      return _carregarView(rota.view);
    })
    .then(function(modulo) {
      if (pushState) {
        history.pushState({ caminho: caminho }, rota.titulo, '#' + caminho);
      }
      document.title = rota.titulo + ' — Registo de Nacionalidades';

      // 1. Desmontar view anterior
      if (_viewActual && typeof _viewActual.unmount === 'function') {
        _viewActual.unmount();
      }

      // 2. Remover scripts e CSS da view anterior
      if (viewAnterior && viewAnterior !== rota.view) {
        _removerRecursosView(viewAnterior);
      }

      // 3. Injectar HTML e montar nova view
      var outlet = document.getElementById(OUTLET_ID);
      outlet.innerHTML = _htmlCache[rota.view] || '';

      _viewActual = modulo;
      _rotaActual = { caminho: caminho, rota: rota };
      _actualizarNavActivo(caminho);

      if (typeof modulo.mount === 'function') {
        modulo.mount(_perfilUtiliz);
      }

      _mostrarTransicao(false);
      _navegando = false;

      // Notificar a sidebar da mudança de rota (auto-colapso, etc.)
      if (typeof sidebarNavegar === 'function') {
        sidebarNavegar(caminho);
      }
    })
    .catch(function(err) {
      console.error('[Router] Erro ao navegar para', caminho, err);
      _mostrarTransicao(false);
      _navegando = false;
    });

  if (typeof window.verificarVisibilidadeInstalacao === 'function') {
    window.verificarVisibilidadeInstalacao();
  }
}

// ============================================================
// LAZY LOADING — HTML + JS + CSS por view
// ============================================================

function _carregarView(nomeView) {
  if (_htmlCache[nomeView] && window.__views && window.__views[nomeView]) {
    var rec = _recursosView[nomeView];
    if (rec && rec.cssEl) rec.cssEl.disabled = false;
    return Promise.resolve(window.__views[nomeView]);
  }

  var baseRepo = '';
  if (window.location.hostname.indexOf('github.io') !== -1) {
    baseRepo = '/' + window.location.pathname.split('/')[1] + '/';
    baseRepo = baseRepo.replace(/\/+/g, '/');
  }

  var rota    = _rotaPorView(nomeView);
  var deps    = (rota && rota.deps) || [];

  var htmlUrl = baseRepo + 'views/' + nomeView + '/view.html';
  var jsUrl   = baseRepo + 'views/' + nomeView + '/view.js';
  var cssUrl  = baseRepo + 'views/' + nomeView + '/view.css';

  if (!_recursosView[nomeView]) {
    _recursosView[nomeView] = { scriptEls: [], cssEl: null };
  }

  return Promise.all([
    fetch(htmlUrl).then(function(r) {
      if (!r.ok) throw new Error('HTML não encontrado: ' + htmlUrl);
      return r.text();
    }),
    deps.reduce(function(cadeia, url) {
      var urlDep = (url.startsWith('http') || url.startsWith('//')) ? url : baseRepo + url;
      return cadeia.then(function() { return _carregarScript(urlDep, nomeView); });
    }, Promise.resolve()).then(function() {
      return _carregarScript(jsUrl, nomeView);
    }),
    _carregarCss(cssUrl, nomeView)
  ])
  .then(function(resultados) {
    _htmlCache[nomeView] = resultados[0];
    var modulo = (window.__views && window.__views[nomeView]) || {};
    return modulo;
  });
}

function _rotaPorView(nomeView) {
  var chaves = Object.keys(ROTAS);
  for (var i = 0; i < chaves.length; i++) {
    if (ROTAS[chaves[i]].view === nomeView) return ROTAS[chaves[i]];
  }
  return null;
}

// ============================================================
// GESTÃO DE SCRIPTS
// ============================================================

function _carregarScript(url, nomeView) {
  var existente = document.querySelector('script[data-view-script="' + url + '"]');
  if (existente) return Promise.resolve();

  return new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = url;
    s.setAttribute('data-view-script', url);
    if (nomeView) s.setAttribute('data-view', nomeView);
    s.onload  = function() { resolve(); };
    s.onerror = function() {
      console.warn('[Router] Script não encontrado (ignorado):', url);
      resolve();
    };
    document.head.appendChild(s);

    if (nomeView && _recursosView[nomeView]) {
      _recursosView[nomeView].scriptEls.push(s);
    }
  });
}

// ============================================================
// GESTÃO DE CSS
// ============================================================

function _carregarCss(url, nomeView) {
  var existente = document.querySelector('link[data-view-css="' + nomeView + '"]');
  if (existente) {
    existente.disabled = false;
    if (_recursosView[nomeView]) _recursosView[nomeView].cssEl = existente;
    return Promise.resolve();
  }

  return fetch(url, { method: 'HEAD' })
    .then(function(r) {
      if (!r.ok) return;
      return new Promise(function(resolve) {
        var link = document.createElement('link');
        link.rel  = 'stylesheet';
        link.href = url;
        link.setAttribute('data-view-css', nomeView);
        link.onload = link.onerror = resolve;
        document.head.appendChild(link);

        if (_recursosView[nomeView]) {
          _recursosView[nomeView].cssEl = link;
        }
      });
    })
    .catch(function() {});
}

// ============================================================
// REMOVER RECURSOS DA VIEW ANTERIOR
// ============================================================

function _removerRecursosView(nomeView) {
  var rec = _recursosView[nomeView];
  if (!rec) return;

  rec.scriptEls.forEach(function(el) {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
  rec.scriptEls = [];

  if (rec.cssEl && rec.cssEl.parentNode) {
    rec.cssEl.parentNode.removeChild(rec.cssEl);
    rec.cssEl = null;
  }

  if (window.__views) {
    delete window.__views[nomeView];
  }
  delete _htmlCache[nomeView];
  delete _recursosView[nomeView];
}

// ============================================================
// UTILITÁRIOS
// ============================================================

function _actualizarNavActivo(caminho) {
  // Header mobile (nav-menu.js)
  document.querySelectorAll('.nav-menu-item[data-rota]').forEach(function(el) {
    var r = el.getAttribute('data-rota');
    el.classList.toggle('activo', r === caminho);
    if (r === caminho) { el.setAttribute('aria-current', 'page'); }
    else               { el.removeAttribute('aria-current'); }
  });

  // Sidebar desktop (sidebar.js)
  document.querySelectorAll('.sidebar-item[data-rota]').forEach(function(el) {
    var r = el.getAttribute('data-rota');
    el.classList.toggle('activo', r === caminho);
    if (r === caminho) { el.setAttribute('aria-current', 'page'); }
    else               { el.removeAttribute('aria-current'); }
  });
}

function _onLinkClick(e) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (e.defaultPrevented) return;
  var el = e.target.closest('a[href]');
  if (!el) return;
  var href = el.getAttribute('href');
  if (!href) return;
  if (href.startsWith('http') || href.startsWith('//') ||
      href.startsWith('mailto:') || href.startsWith('tel:')) return;

  var caminho = href.replace(/^#/, '').replace(/\/+$/, '') || '/';
  if (!ROTAS[caminho]) return;
  e.preventDefault();
  routerNavegar(caminho);
}

function _mostrarTransicao(mostrar) {
  var el = document.getElementById('spa-transition');
  if (!el) return;
  if (mostrar) {
    el.classList.add('activo');
  } else {
    setTimeout(function() { el.classList.remove('activo'); }, 80);
  }
}

function _mostrarErroAcesso(mensagem) {
  var outlet = document.getElementById(OUTLET_ID);
  if (!outlet) return;
  outlet.innerHTML =
    '<div class="spa-erro-acesso">' +
      '<span class="spa-erro-icone">🔒</span>' +
      '<h2>Acesso negado</h2>' +
      '<p>' + String(mensagem || '').replace(/</g, '&lt;') + '</p>' +
      '<button onclick="routerNavegar(\'/\')" class="btn btn-guardar">← Voltar ao início</button>' +
    '</div>';
}

function routerDefinirPerfil(perfil) { _perfilUtiliz = perfil; }

window.routerInit          = routerInit;
window.routerNavegar       = routerNavegar;
window.routerDefinirPerfil = routerDefinirPerfil;