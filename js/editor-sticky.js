// ============================================================
// editor-sticky.js — Cabeçalho fixo da grelha mensal v2
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
// ============================================================

'use strict';

(function() {

  var _clone        = null;
  var _wrapper      = null;
  var _tabela       = null;
  var _theadOrig    = null;
  var _headerGlobal = null;
  var _ativo        = false;
  var _rafPendente  = false;

  // ── Criar o clone do thead ────────────────────────────────
  function criarClone() {
    destruirClone();

    _wrapper      = document.getElementById('grelhaWrapper');
    _tabela       = _wrapper && _wrapper.querySelector('.grelha-tabela');
    _theadOrig    = _tabela  && _tabela.querySelector('thead');
    _headerGlobal = document.querySelector('.header');

    if (!_wrapper || !_tabela || !_theadOrig) return;

    var div = document.createElement('div');
    div.className = 'grelha-thead-clone';
    div.id        = 'grelhaTheadClone';

    // Começa oculto — o JS decide quando mostrar
    div.style.display = 'none';

    var tbl = document.createElement('table');
    tbl.className = _tabela.className;

    var cgOrig = _tabela.querySelector('colgroup');
    if (cgOrig) tbl.appendChild(cgOrig.cloneNode(true));

    tbl.appendChild(_theadOrig.cloneNode(true));
    div.appendChild(tbl);
    document.body.appendChild(div);
    _clone = div;

    // Posicionar correctamente antes de qualquer scroll
    actualizar();
  }

  function destruirClone() {
    var old = document.getElementById('grelhaTheadClone');
    if (old) old.parentNode.removeChild(old);
    _clone = null;
    _ativo = false;
  }

  // ── Actualizar posição e visibilidade ────────────────────
  function actualizar() {
    if (!_clone || !_wrapper || !_theadOrig) return;

    // Altura do header global (pode variar com resize)
    var headerH = _headerGlobal
      ? Math.round(_headerGlobal.getBoundingClientRect().bottom)
      : 0;

    var wrapperRect = _wrapper.getBoundingClientRect();
    var theadRect   = _theadOrig.getBoundingClientRect();

    // Mostrar clone quando o thead original sobe acima do header
    // e o wrapper ainda tem conteúdo visível abaixo
    var deveEstarAtivo = theadRect.bottom <= headerH + 2
                      && wrapperRect.bottom > headerH + 60;

    // Actualizar visibilidade
    if (deveEstarAtivo !== _ativo) {
      _clone.style.display = deveEstarAtivo ? 'block' : 'none';
      _ativo = deveEstarAtivo;
    }

    if (!_ativo) return;

    // Posição: logo abaixo do header global
    _clone.style.top   = headerH + 'px';
    _clone.style.left  = wrapperRect.left + 'px';
    _clone.style.width = wrapperRect.width + 'px';

    // Sincronizar scroll horizontal via translateX
    var tbl = _clone.querySelector('table');
    if (tbl) {
      var totalW = _tabela.offsetWidth;
      tbl.style.width    = totalW + 'px';
      tbl.style.minWidth = totalW + 'px';
      tbl.style.transform = 'translateX(-' + _wrapper.scrollLeft + 'px)';
    }
  }

  function agendarActualizacao() {
    if (_rafPendente) return;
    _rafPendente = true;
    requestAnimationFrame(function() {
      _rafPendente = false;
      actualizar();
    });
  }

  // ── Sincronizar scroll horizontal quando o wrapper faz scroll ─
  function onWrapperScroll() {
    if (_ativo) agendarActualizacao();
  }

  // ── Re-ligar o listener ao wrapper quando ele é recriado ─
  var _wrapperScrollBound = false;
  function ligarScrollWrapper() {
    var w = document.getElementById('grelhaWrapper');
    if (w && !_wrapperScrollBound) {
      w.addEventListener('scroll', onWrapperScroll, { passive: true });
      _wrapperScrollBound = true;
    }
  }

  // ── Hook na função construirGrelha do editor.js ───────────
  // Flag garante que só se envolve uma vez mesmo que construirGrelha
  // já tenha sido envolvida pelo bloco <script> do editor.html.
  var _hookFeito = false;

  function hookConstruirGrelha() {
    if (typeof construirGrelha === 'undefined') {
      setTimeout(hookConstruirGrelha, 100);
      return;
    }
    if (_hookFeito) return;
    _hookFeito = true;

    var _orig = construirGrelha;
    construirGrelha = function() {
      _orig.apply(this, arguments);
      // DOM reconstruído — recriar clone após o browser renderizar
      _wrapperScrollBound = false;
      setTimeout(function() {
        criarClone();
        ligarScrollWrapper();
      }, 50);
    };
  }

  // ── Observar quando a tabela aparece pela primeira vez ────
  function observarGrelha() {
    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var nodes = mutations[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          if (nodes[j].querySelector && nodes[j].querySelector('.grelha-tabela')) {
            _wrapperScrollBound = false;
            setTimeout(function() {
              criarClone();
              ligarScrollWrapper();
            }, 50);
            return;
          }
        }
      }
    });

    var area = document.getElementById('areaPrincipal');
    if (area) observer.observe(area, { childList: true, subtree: true });
  }

  // ── Event listeners globais ───────────────────────────────
  function ligarEventos() {
    window.addEventListener('scroll', agendarActualizacao, { passive: true });
    window.addEventListener('resize', agendarActualizacao, { passive: true });
  }

  // ── Arranque ──────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    hookConstruirGrelha();
    ligarEventos();
    observarGrelha();
  });

})();
