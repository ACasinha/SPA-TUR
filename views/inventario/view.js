// ============================================================
// views/inventario/view.js
// View: Inventário de Material Promocional Turístico
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
//
// Acesso: administradores ou utilizadores com acessoInventario: true
//
// Coleções Firestore:
//   materiais             — catálogo (nome, categoria, tematica, idioma,
//                            stockMinimo, stockPorLocal{local:qtd}, ativo)
//   materiais_movimentos  — histórico de entradas/saídas (auditoria)
//   inventario_config/listas — listas editáveis (locais, categorias,
//                            tematicas, idiomas)
// ============================================================

'use strict';

(function() {

  // ── Estado ─────────────────────────────────────────────────
  var _perfil              = null;
  var _isAdmin             = false;
  var _config              = { locais: [], categorias: [], tematicas: [], idiomas: [] };
  var _materiais           = [];
  var _movimentos          = [];
  var _tabAtiva            = 'painel';
  var _apenasAlerta        = false;
  var _editandoMaterialId  = null;
  var _movRapidoMaterialId = null;
  var _correcaoMaterialId  = null;
  var _listeners           = [];

  var DEFAULTS = {
    locais: [
      'Armazém Central',
      'Posto de Turismo de Monsaraz',
      'Posto de Turismo de Reguengos',
      'Museu José Mestre Batista',
      'Casa do Barro',
      'Museu do Fresco',
      'Casa da Inquisição',
      'Igreja de Santiago',
      'Igreja da Misericórdia',
      'Arte Contemporânea',
      'Auditório António Marcelino'
    ],
    categorias: ['Folheto', 'Livro / Livreto', 'Mapa', 'Postal', 'Cartaz'],
    tematicas: [
      'Monsaraz',
      'Enoturismo',
      'Reguengos',
      'São Pedro do Corval',
      'Percursos Pedestres - PR1',
      'Percursos Pedestres - PR2',
      'Percursos Pedestres - PR3',
      'Percursos Pedestres - PR4'
    ],
    idiomas: ['Português', 'Inglês', 'Espanhol', 'Francês']
  };

  // ============================================================
  // CICLO DE VIDA
  // ============================================================

  function mount(perfil) {
    _perfil  = perfil;
    _isAdmin = perfil.role === 'administrador';

    spaSetHeader({ titulo: 'Inventário de Material Promocional' });

    var btnConfig = document.getElementById('invTabConfigBtn');
    if (btnConfig) btnConfig.style.display = _isAdmin ? '' : 'none';

    document.querySelectorAll('.inv-tab-btn').forEach(function(btn) {
      _al(btn, 'click', function() { _activarTab(btn.getAttribute('data-tab')); });
    });

    ['filtroLocal', 'filtroCategoria', 'filtroTematica', 'filtroIdioma'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) _al(el, 'change', _onFiltroPainelChange);
    });
    var filtroTexto = document.getElementById('filtroTexto');
    if (filtroTexto) _al(filtroTexto, 'input', _onFiltroPainelChange);

    ['filtroMovMaterial', 'filtroMovLocal', 'filtroMovTipo'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) _al(el, 'change', _renderTabelaMovimentos);
    });

    var movData = document.getElementById('movData');
    if (movData) movData.value = _hojeISO();

    ['modalMaterial', 'modalMovimentoRapido', 'modalCorrecaoStock'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) _al(el, 'click', function(e) { if (e.target === el) el.classList.remove('show'); });
    });

    _al(document, 'keydown', function(e) {
      if (e.key === 'Escape') {
        fecharModalMaterial();
        fecharModalMovimentoRapido();
        fecharModalCorrecao();
      }
    });

    _carregarTudo();
  }

  function unmount() {
    _listeners.forEach(function(l) { l.target.removeEventListener(l.tipo, l.fn, l.opts); });
    _listeners = [];

    _perfil = null; _isAdmin = false;
    _materiais = []; _movimentos = [];
    _config = { locais: [], categorias: [], tematicas: [], idiomas: [] };
    _editandoMaterialId = null; _movRapidoMaterialId = null; _correcaoMaterialId = null;
    _apenasAlerta = false; _tabAtiva = 'painel';

    window.__inventario = null;
    spaResetHeader();
  }

  function _al(target, tipo, fn, opts) {
    target.addEventListener
