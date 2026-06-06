// ============================================================
// router.js — SPA Router com lazy loading de views
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
//
// Responsabilidades:
//   • Gerir o histórico via History API (pushState / popstate)
//   • Lazy loading de HTML + JS de cada view
//   • Ciclo de vida: beforeLeave → load → mount → unmount
//   • Protecção de rotas (auth + role)
//   • Loading overlay entre transições
//
// NÃO contém: lógica de negócio, autenticação (auth.js),
// perfis (users.js).
// ============================================================

'use strict';

// ── Definição das rotas ──────────────────────────────────────

var ROTAS = {
  '/': {
    view:      'registo',
    titulo:    'Registo Diário',
    acesso:    function(p) { return p.role === 'administrador' || p.role === 'utilizador'; },
    semAcesso: 'Esta conta não tem acesso à aplicação de registo.'
  },
  '/dashboard': {
    view:      'dashboard',
    titulo:    'Dashboard',
    acesso:    function(p) {
      return p.role === 'administrador' || p.role === 'visualizador' || p.acessoDashboard === true;
    },
    semAcesso: 'Não tem permissão para aceder ao dashboard.'
  },
  '/editor': {
    view:      'editor',
    titulo:    'Editor Mensal',
    acesso:    function(p) { return p.role === 'administrador' || p.acessoEditor === true; },
    semAcesso: 'Não tem permissão para aceder ao editor mensal.'
  },
  '/admin': {
    view:      'admin',
    titulo:    'Gestão de Utilizadores',
    acesso:    function(p) { return p.role === 'administrador'; },
    semAcesso: 'Apenas administradores podem aceder a esta área.'
  }
};

// ── Estado interno ───────────────────────────────────────────

var _rotaActual     = null;   // objecto rota activa
var _viewActual     = null;   // instância da view activa
var _perfilUtiliz   = null;   // perfil do utilizador autenticado
var _viewsCarregadas = {};    // cache: viewName → módulo JS carregado
var _htmlCache       = {};    // cache: viewName → HTML string
var _navegando       = false;

// ── Elemento shell onde as views são injectadas ──────────────
var OUTLET_ID = 'spa-outlet';

// ============================================================
// INICIALIZAÇÃO — chamada após login bem-sucedido
// ============================================================

function routerInit(perfil) {
  _perfilUtiliz = perfil;

  // Interceptar links internos (delegação no document)
  document.addEventListener('click', _onLinkClick);

  // Botão Back/Forward do browser
  window.addEventListener('popstate', function(e) {
    var caminho = window.location.pathname;
    _navegar(caminho, false);
  });

  // Navegar para a rota actual (refresh ou abertura directa)
  _navegar(window.location.pathname, false);
}

// ============================================================
// NAVEGAR — ponto de entrada público
// ============================================================

function routerNavegar(caminho) {
  _navegar(caminho, true);
}

function _navegar(caminho, pushState) {
  if (_navegando) return;

  // Normalizar: remover trailing slash excepto na raiz
  caminho = caminho.replace(/\/+$/, '') || '/';

  // Rota conhecida?
  var rota = ROTAS[caminho];
  if (!rota) {
    // Rota desconhecida → raiz
    caminho = '/';
    rota    = ROTAS['/'];
  }

  // Verificar acesso
  if (_perfilUtiliz && !rota.acesso(_perfilUtiliz)) {
    _mostrarErroAcesso(rota.semAcesso);
    return;
  }

  // Já estamos aqui?
  if (_rotaActual && _rotaActual.caminho === caminho) return;

  _navegando = true;
  _mostrarTransicao(true);

  // 1. beforeLeave na view actual
  var promessaLeave = Promise.resolve();
  if (_viewActual && typeof _viewActual.beforeLeave === 'function') {
    promessaLeave = Promise.resolve(_viewActual.beforeLeave());
  }

  promessaLeave
    .then(function() {
      return _carregarView(rota.view);
    })
    .then(function(modulo) {
      // Actualizar URL e título
      if (pushState) {
        history.pushState({ caminho: caminho }, rota.titulo, caminho);
      }
      document.title = rota.titulo + ' — Registo de Nacionalidades';

      // Desmontar view anterior
      if (_viewActual && typeof _viewActual.unmount === 'function') {
        _viewActual.unmount();
      }

      // Injectar HTML no outlet
      var outlet = document.getElementById(OUTLET_ID);
      outlet.innerHTML = _htmlCache[rota.view] || '';

      // Montar nova view
      _viewActual  = modulo;
      _rotaActual  = { caminho: caminho, rota: rota };

      // Actualizar menu de navegação activo
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
      _mostrarErroAcesso('Erro ao carregar a página: ' + err.message);
    });
}

// ============================================================
// LAZY LOADING — HTML + JS por view
// ============================================================

function _carregarView(nomeView) {
  // Já em cache?
  if (_viewsCarregadas[nomeView]) {
    return Promise.resolve(_viewsCarregadas[nomeView]);
  }

  var htmlUrl = 'views/' + nomeView + '/view.html';
  var jsUrl   = 'views/' + nomeView + '/view.js';

  // Carregar HTML e JS em paralelo
  return Promise.all([
    fetch(htmlUrl).then(function(r) {
      if (!r.ok) throw new Error('HTML não encontrado: ' + htmlUrl);
      return r.text();
    }),
    _carregarScript(jsUrl)
  ])
  .then(function(resultados) {
    _htmlCache[nomeView] = resultados[0];

    // O script deve registar-se via window.__views[nomeView]
    var modulo = (window.__views && window.__views[nomeView]) || {};
    _viewsCarregadas[nomeView] = modulo;
    return modulo;
  });
}

// Injectar script dinamicamente (uma única vez por URL)
var _scriptsCarregados = {};
function _carregarScript(url) {
  if (_scriptsCarregados[url]) return Promise.resolve();
  return new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = url;
    s.onload  = function() { _scriptsCarregados[url] = true; resolve(); };
    s.onerror = function() { reject(new Error('Falha ao carregar script: ' + url)); };
    document.head.appendChild(s);
  });
}

// ============================================================
// ACTUALIZAR NAVEGAÇÃO ACTIVA
// ============================================================

function _actualizarNavActivo(caminho) {
  // nav-menu.js usa a classe 'activo' nos <a> do painel
  document.querySelectorAll('.nav-menu-item[data-rota]').forEach(function(el) {
    var rota = el.getAttribute('data-rota');
    el.classList.toggle('activo', rota === caminho);
    if (rota === caminho) {
      el.setAttribute('aria-current', 'page');
    } else {
      el.removeAttribute('aria-current');
    }
  });
}

// ============================================================
// DELEGAÇÃO DE CLIQUES — interceptar <a href="..."> internos
// ============================================================

function _onLinkClick(e) {
  // Ignorar cliques com modificadores
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (e.defaultPrevented) return;

  var el = e.target.closest('a[href]');
  if (!el) return;

  var href = el.getAttribute('href');
  if (!href) return;

  // Ignorar links externos, âncoras, e mailto/tel
  if (href.startsWith('http') || href.startsWith('//') ||
      href.startsWith('#')    || href.startsWith('mailto:') ||
      href.startsWith('tel:')) return;

  // Verificar se é uma rota conhecida
  var caminho = href.replace(/\/+$/, '') || '/';
  if (!ROTAS[caminho]) return;

  e.preventDefault();
  routerNavegar(caminho);
}

// ============================================================
// OVERLAY DE TRANSIÇÃO
// ============================================================

function _mostrarTransicao(mostrar) {
  var el = document.getElementById('spa-transition');
  if (!el) return;
  if (mostrar) {
    el.classList.add('activo');
  } else {
    // Pequeno delay para evitar flash em carregamentos rápidos
    setTimeout(function() { el.classList.remove('activo'); }, 80);
  }
}

// ============================================================
// ERRO DE ACESSO
// ============================================================

function _mostrarErroAcesso(mensagem) {
  var outlet = document.getElementById(OUTLET_ID);
  if (!outlet) return;
  outlet.innerHTML =
    '<div class="spa-erro-acesso">' +
      '<span class="spa-erro-icone">🔒</span>' +
      '<h2>Acesso negado</h2>' +
      '<p>' + _esc(mensagem) + '</p>' +
      '<button onclick="routerNavegar(\'/\')" class="btn btn-guardar">← Voltar ao início</button>' +
    '</div>';
}

// ============================================================
// ACTUALIZAR PERFIL (após mudança de role, etc.)
// ============================================================

function routerDefinirPerfil(perfil) {
  _perfilUtiliz = perfil;
}

// ============================================================
// UTILITÁRIOS
// ============================================================

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// API pública
window.routerInit    = routerInit;
window.routerNavegar = routerNavegar;
window.routerDefinirPerfil = routerDefinirPerfil;
