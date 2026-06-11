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
var _viewsCarregadas = {};
var _htmlCache       = {};
var _navegando       = false;
var _scriptsCarregados = {};
var _cssEmCurso      = {};

var OUTLET_ID = 'spa-outlet';

// ============================================================
// AUXILIAR DE DETEÇÃO DE CAMINHO BASE (GitHub Pages vs Local)
// ============================================================
function _obterBaseRepo() {
  var base = '';
  if (window.location.hostname.indexOf('github.io') !== -1) {
    base = '/' + window.location.pathname.split('/')[1] + '/';
    base = base.replace(/\/+/g, '/');
  }
  return base;
}

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

      // Desmontar view anterior
      if (_viewActual && typeof _viewActual.unmount === 'function') {
        _viewActual.unmount();
      }

      // Desactivar CSS da view anterior
      if (viewAnterior && viewAnterior !== rota.view) {
        var linkAntigo = document.querySelector('link[data-view-css="' + viewAnterior + '"]');
        if (linkAntigo) {
          linkAntigo.parentNode.removeChild(linkAntigo);
        }
      }

      // Injectar HTML e montar nova view
      var outlet = document.getElementById(OUTLET_ID);
      if (outlet) outlet.innerHTML = _htmlCache[rota.view] || '';

      // CORREÇÃO: Utiliza a função auxiliar para não disparar ReferenceError
      var baseRepoAtual = _obterBaseRepo();
      _carregarCss(baseRepoAtual + 'views/' + rota.view + '/view.css', rota.view);

      // Atualizar estados locais
      _viewActual = modulo;
      _rotaActual = { caminho: caminho, rota: rota };
      _actualizarNavActivo(caminho);

      if (typeof modulo.mount === 'function') {
        modulo.mount(_perfilUtiliz);
      }

      _mostrarTransicao(false);
      _navegando = false;
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
  if (_viewsCarregadas[nomeView]) {
    var linkExistente = document.querySelector('link[data-view-css="' + nomeView + '"]');
    if (linkExistente) linkExistente.disabled = false;
    return Promise.resolve(_viewsCarregadas[nomeView]);
  }

  var baseRepo = _obterBaseRepo();
  var rota    = _rotaPorView(nomeView);
  var deps    = (rota && rota.deps) || [];
  
  var htmlUrl = baseRepo + 'views/' + nomeView + '/view.html';
  var jsUrl   = baseRepo + 'views/' + nomeView + '/view.js';
  var cssUrl  = baseRepo + 'views/' + nomeView + '/view.css';

  return Promise.all([
    fetch(htmlUrl).then(function(r) {
      if (!r.ok) throw new Error('HTML não encontrado: ' + htmlUrl);
      return r.text();
    }),
    deps.reduce(function(cadeia, url) {
      var urlDep = (url.startsWith('http') || url.startsWith('//')) ? url : baseRepo + url;
      // CORREÇÃO: Alterado de chain.then para cadeia.then para corresponder ao argumento
      return cadeia.then(function() { return _carregarScript(urlDep); });
    }, Promise.resolve()).then(function() {
      return _carregarScript(jsUrl);
    }),
    _carregarCss(cssUrl, nomeView)
  ])
  .then(function(resultados) {
    _htmlCache[nomeView] = resultados[0];
    var modulo = (window.__views && window.__views[nomeView]) || {};
    _viewsCarregadas[nomeView] = modulo;
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

function _carregarCss(url, nomeView) {
  if (_cssEmCurso[nomeView]) return _cssEmCurso[nomeView];

  var promessa = fetch(url, { method: 'HEAD' })
    .then(function(r) {
      if (!r.ok) return;
      return new Promise(function(resolve) {
        var link = document.createElement('link');
        link.rel  = 'stylesheet';
        link.href = url;
        link.setAttribute('data-view-css', nomeView);
        link.onload = link.onerror = resolve;
        document.head.appendChild(link);
      });
    })
    .catch(function() {})
    .then(function() {
      delete _cssEmCurso[nomeView];
    });

  _cssEmCurso[nomeView] = promessa;
  return promessa;
}

function _carregarScript(url) {
  if (_scriptsCarregados[url]) return Promise.resolve();
  return new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src     = url;
    s.onload  = function() { _scriptsCarregados[url] = true; resolve(); };
    s.onerror = function() { reject(new Error('Falha ao carregar script: ' + url)); };
    document.head.appendChild(s);
  });
}

// ============================================================
// UTILITÁRIOS
// ============================================================

function _actualizarNavActivo(caminho) {
  document.querySelectorAll('.nav-menu-item[data-rota]').forEach(function(el
