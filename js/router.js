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
// INICIALIZAÇÃO
// ============================================================

function routerInit(perfil) {
  _perfilUtiliz = perfil;
  document.addEventListener('click', _onLinkClick);
  
  window.addEventListener('popstate', function() {
    // Captura o caminho após o '#' (ex: '#/dashboard' torna-se '/dashboard')
    var caminhoHash = window.location.hash.replace(/^#/, '') || '/';
    _navegar(caminhoHash, false);
  });
  
  // Carrega a rota inicial baseada no Hash atual da URL
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

      // Desactivar CSS da view anterior (o novo CSS já está no DOM neste ponto)
      if (viewAnterior && viewAnterior !== rota.view) {
        var linkAntigo = document.querySelector('link[data-view-css="' + viewAnterior + '"]');
        if (linkAntigo) linkAntigo.disabled = true;
      }

      // Injectar HTML e montar nova view
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

  // 1. Deteta dinamicamente se estamos no GitHub Pages e extrai o subdiretório
  var baseRepo = '';
  if (window.location.hostname.indexOf('github.io') !== -1) {
    // Extrai o '/nome-do-repositorio/' a partir do pathname atual
    baseRepo = '/' + window.location.pathname.split('/')[1] + '/';
    // Remove barras duplas acidentais
    baseRepo = baseRepo.replace(/\/+/g, '/');
  }

  var rota    = _rotaPorView(nomeView);
  var deps    = (rota && rota.deps) || [];
  
  // 2. Aplica o prefixo correto do repositório para os caminhos dos ficheiros
  var htmlUrl = baseRepo + 'views/' + nomeView + '/view.html';
  var jsUrl   = baseRepo + 'views/' + nomeView + '/view.js';
  var cssUrl  = baseRepo + 'views/' + nomeView + '/view.css';

  return Promise.all([
    fetch(htmlUrl).then(function(r) {
      if (!r.ok) throw new Error('HTML não encontrado: ' + htmlUrl);
      return r.text();
    }),
    deps.reduce(function(cadeia, url) {
      // Garante o prefixo também nas dependências, se forem locais relativos
      var urlDep = (url.startsWith('http') || url.startsWith('//')) ? url : baseRepo + url;
      return chain.then(function() { return _carregarScript(urlDep); });
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

// CSS lazy — cria o <link> uma única vez; nas visitas seguintes
// a reactivação é feita em _carregarView (linha acima).
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
  document.querySelectorAll('.nav-menu-item[data-rota]').forEach(function(el) {
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
  
  // Remove o cardinal se o link já o tiver, limpa barras repetidas e assume a rota limpa
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
