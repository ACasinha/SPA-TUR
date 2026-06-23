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
    target.addEventListener(tipo, fn, opts);
    _listeners.push({ target: target, tipo: tipo, fn: fn, opts: opts });
  }

  // ============================================================
  // CARREGAMENTO DE DADOS
  // ============================================================

  function _carregarTudo() {
    Promise.all([_carregarConfig(), _carregarMateriais(), _carregarMovimentos()])
      .then(function() {
        _popularSelects();
        _renderPainel();
        _renderTabelaMateriais();
        _renderTabelaMovimentos();
        _renderConfig();
        _renderAlerta();
      })
      .catch(function(err) {
        mostrarToast('Erro ao carregar inventário: ' + err.message, 'erro');
      });
  }

  function _carregarConfig() {
    return db.collection('inventario_config').doc('listas').get()
      .then(function(doc) {
        if (doc.exists) {
          var d = doc.data();
          _config = {
            locais:     Array.isArray(d.locais)     ? d.locais     : DEFAULTS.locais.slice(),
            categorias: Array.isArray(d.categorias) ? d.categorias : DEFAULTS.categorias.slice(),
            tematicas:  Array.isArray(d.tematicas)  ? d.tematicas  : DEFAULTS.tematicas.slice(),
            idiomas:    Array.isArray(d.idiomas)    ? d.idiomas    : DEFAULTS.idiomas.slice()
          };
        } else {
          _config = {
            locais:     DEFAULTS.locais.slice(),
            categorias: DEFAULTS.categorias.slice(),
            tematicas:  DEFAULTS.tematicas.slice(),
            idiomas:    DEFAULTS.idiomas.slice()
          };
          _guardarConfig().catch(function() {});
        }
      })
      .catch(function(err) {
        console.warn('[Inventário] Erro ao carregar configuração, a usar valores padrão:', err);
        _config = {
          locais:     DEFAULTS.locais.slice(),
          categorias: DEFAULTS.categorias.slice(),
          tematicas:  DEFAULTS.tematicas.slice(),
          idiomas:    DEFAULTS.idiomas.slice()
        };
      });
  }

  function _guardarConfig() {
    return db.collection('inventario_config').doc('listas').set({
      locais:        _config.locais,
      categorias:    _config.categorias,
      tematicas:     _config.tematicas,
      idiomas:       _config.idiomas,
      atualizadoEm:  firebase.firestore.FieldValue.serverTimestamp(),
      atualizadoPor: (_perfil && _perfil.email) || ''
    });
  }

  function _carregarMateriais() {
    return db.collection('materiais').where('ativo', '==', true).get()
      .then(function(snap) {
        var lista = [];
        snap.forEach(function(doc) {
          var d = doc.data();
          d.id            = doc.id;
          d.stockPorLocal = d.stockPorLocal || {};
          d.stockMinimo   = d.stockMinimo   || 0;
          lista.push(d);
        });
        lista.sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); });
        _materiais = lista;
      });
  }

  function _carregarMovimentos() {
    return db.collection('materiais_movimentos').orderBy('criadoEm', 'desc').limit(150).get()
      .then(function(snap) {
        var lista = [];
        snap.forEach(function(doc) {
          var d = doc.data();
          d.id = doc.id;
          lista.push(d);
        });
        _movimentos = lista;
      })
      .catch(function(err) {
        console.warn('[Inventário] Erro ao carregar movimentos:', err);
        _movimentos = [];
      });
  }

  // ============================================================
  // TABS
  // ============================================================

  function _activarTab(tab) {
    _tabAtiva = tab;
    document.querySelectorAll('.inv-tab-btn').forEach(function(btn) {
      btn.classList.toggle('ativa', btn.getAttribute('data-tab') === tab);
    });
    var mapa = {
      painel:     'invPainelPainel',
      materiais:  'invPainelMateriais',
      movimentos: 'invPainelMovimentos',
      config:     'invPainelConfig'
    };
    Object.keys(mapa).forEach(function(t) {
      var el = document.getElementById(mapa[t]);
      if (el) el.style.display = (t === tab) ? '' : 'none';
    });
  }

  // ============================================================
  // SELECTS — preenchimento a partir da configuração / catálogo
  // ============================================================

  function _popularSelects() {
    _popularSelectComTodos('filtroLocal',     _config.locais,     'Todos os locais');
    _popularSelectComTodos('filtroCategoria', _config.categorias, 'Todas as categorias');
    _popularSelectComTodos('filtroTematica',  _config.tematicas,  'Todas as temáticas');
    _popularSelectComTodos('filtroIdioma',    _config.idiomas,    'Todos os idiomas');
    _popularSelectComTodos('filtroMovLocal',  _config.locais,     'Todos os locais');

    _popularSelectLocal(document.getElementById('movLocal'));

    _popularSelectSimples('materialCategoria', _config.categorias);
    _popularSelectSimples('materialTematica',  _config.tematicas);
    _popularSelectSimples('materialIdioma',    _config.idiomas);

    _popularSelectMateriais('movMaterial', false);
    _popularSelectMateriais('filtroMovMaterial', true);
  }

  function _popularSelectComTodos(id, lista, labelTodos) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var valorAtual = sel.value;
    sel.innerHTML = '<option value="">' + _esc(labelTodos) + '</option>' +
      lista.map(function(v) { return '<option value="' + _esc(v) + '">' + _esc(v) + '</option>'; }).join('');
    if (lista.indexOf(valorAtual) !== -1) sel.value = valorAtual;
  }

  function _popularSelectSimples(id, lista) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var valorAtual = sel.value;
    sel.innerHTML = '<option value="">— Escolher —</option>' +
      lista.map(function(v) { return '<option value="' + _esc(v) + '">' + _esc(v) + '</option>'; }).join('');
    if (lista.indexOf(valorAtual) !== -1) sel.value = valorAtual;
  }

  function _popularSelectLocal(sel) {
    if (!sel) return;
    sel.innerHTML = _config.locais
      .map(function(l) { return '<option value="' + _esc(l) + '">' + _esc(l) + '</option>'; })
      .join('');
  }

  function _popularSelectMateriais(id, comTodos) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var valorAtual = sel.value;
    var opts = _materiais.map(function(m) {
      return '<option value="' + m.id + '">' + _esc(m.nome) + ' (' + _esc(m.idioma) + ') — ' + _esc(m.categoria) + '</option>';
    }).join('');
    sel.innerHTML = (comTodos
      ? '<option value="">Todos os materiais</option>'
      : '<option value="" disabled selected>Escolha um material...</option>') + opts;
    if (valorAtual) sel.value = valorAtual;
  }

  // ============================================================
  // CÁLCULOS DE STOCK
  // ============================================================

  function _calcularTotal(m) {
    var total = 0;
    Object.keys(m.stockPorLocal || {}).forEach(function(l) { total += (m.stockPorLocal[l] || 0); });
    return total;
  }

  function _calcularEstado(m) {
    var total = _calcularTotal(m);
    if (total <= 0) return 'esgotado';
    if (total < (m.stockMinimo || 0)) return 'baixo';
    return 'ok';
  }

  // ============================================================
  // ALERTA DE STOCK
  // ============================================================

  function _renderAlerta() {
    var banner = document.getElementById('invAlertaStock');
    var texto  = document.getElementById('invAlertaTexto');
    if (!banner || !texto) return;

    var itens = _materiais.filter(function(m) { return _calcularEstado(m) !== 'ok'; });

    if (!itens.length) {
      banner.style.display = 'none';
      return;
    }

    var nomes = itens.slice(0, 3).map(function(m) { return m.nome; }).join(', ');
    var resto = itens.length > 3 ? ' e mais ' + (itens.length - 3) : '';
    texto.textContent =
      itens.length + (itens.length === 1 ? ' material com stock baixo ou esgotado: ' : ' materiais com stock baixo ou esgotado: ') +
      nomes + resto;
    banner.style.display = 'flex';
  }

  function verAlertas() {
    _apenasAlerta = true;
    _activarTab('painel');
    _renderPainel();
    mostrarToast('A mostrar apenas materiais com alerta. Altere os filtros para limpar.', 'info');
  }

  function _onFiltroPainelChange() {
    _apenasAlerta = false;
    _renderPainel();
  }

  // ============================================================
  // PAINEL — vista visual
  // ============================================================

  function _renderPainel() {
    var filtroLocal     = (document.getElementById('filtroLocal')     || {}).value || '';
    var filtroCategoria = (document.getElementById('filtroCategoria') || {}).value || '';
    var filtroTematica  = (document.getElementById('filtroTematica')  || {}).value || '';
    var filtroIdioma    = (document.getElementById('filtroIdioma')    || {}).value || '';
    var filtroTexto     = ((document.getElementById('filtroTexto')    || {}).value || '').trim().toLowerCase();

    var lista = _materiais.filter(function(m) {
      if (filtroCategoria && m.categoria !== filtroCategoria) return false;
      if (filtroTematica  && m.tematica  !== filtroTematica)  return false;
      if (filtroIdioma    && m.idioma    !== filtroIdioma)    return false;
      if (filtroTexto     && (m.nome || '').toLowerCase().indexOf(filtroTexto) === -1) return false;
      if (_apenasAlerta   && _calcularEstado(m) === 'ok') return false;
      return true;
    });

    var grelha = document.getElementById('invGrelhaCartoes');
    grelha.innerHTML = '';

    if (!lista.length) {
      grelha.innerHTML =
        '<div class="inv-estado-vazio">' +
          '<span class="inv-estado-vazio-icone">📭</span>' +
          '<div>Nenhum material encontrado com estes filtros.</div>' +
        '</div>';
    } else {
      lista.forEach(function(m) {
        grelha.appendChild(_criarCartaoMaterial(m, filtroLocal));
      });
    }

    var totalMateriais = _materiais.length;
    var totalUnidades   = _materiais.reduce(function(s, m) { return s + _calcularTotal(m); }, 0);
    var nBaixo          = _materiais.filter(function(m) { return _calcularEstado(m) === 'baixo'; }).length;
    var nEsgotado       = _materiais.filter(function(m) { return _calcularEstado(m) === 'esgotado'; }).length;

    var resumo = document.getElementById('invStatsResumo');
    if (resumo) {
      resumo.innerHTML =
        '<div class="inv-stat-box">' +
          '<span class="inv-stat-num">' + totalMateriais + '</span>' +
          '<span class="inv-stat-label">Materiais</span>' +
        '</div>' +
        '<div class="inv-stat-box">' +
          '<span class="inv-stat-num">' + totalUnidades.toLocaleString('pt-PT') + '</span>' +
          '<span class="inv-stat-label">Unidades em Stock</span>' +
        '</div>' +
        '<div class="inv-stat-box inv-stat-aviso">' +
          '<span class="inv-stat-num">' + nBaixo + '</span>' +
          '<span class="inv-stat-label">Stock Baixo</span>' +
        '</div>' +
        '<div class="inv-stat-box inv-stat-erro">' +
          '<span class="inv-stat-num">' + nEsgotado + '</span>' +
          '<span class="inv-stat-label">Esgotados</span>' +
        '</div>';
    }
  }

  function _criarCartaoMaterial(m, filtroLocal) {
    var card   = document.createElement('div');
    var estado = _calcularEstado(m);
    card.className = 'inv-cartao inv-cartao-' + estado;

    var totalGeral       = _calcularTotal(m);
    var numeroPrincipal  = totalGeral;
    var labelPrincipal   = 'Total (todos os locais)';
    if (filtroLocal) {
      numeroPrincipal = (m.stockPorLocal && m.stockPorLocal[filtroLocal]) || 0;
      labelPrincipal  = 'Em ' + filtroLocal;
    }

    var localBreakdown = Object.keys(m.stockPorLocal || {})
      .filter(function(l) { return (m.stockPorLocal[l] || 0) > 0; })
      .sort()
      .map(function(l) {
        return '<span class="inv-cartao-local-chip">' + _esc(l) + ': <strong>' + m.stockPorLocal[l] + '</strong></span>';
      }).join('');

    var estadoLabel = estado === 'esgotado' ? '🔴 Esgotado' : (estado === 'baixo' ? '🟠 Stock Baixo' : '🟢 OK');

    card.innerHTML =
      '<div class="inv-cartao-header">' +
        '<div class="inv-cartao-titulo">' + _esc(m.nome) + '</div>' +
        '<span class="inv-cartao-estado ' + estado + '">' + estadoLabel + '</span>' +
      '</div>' +
      '<div class="inv-cartao-badges">' +
        '<span class="inv-badge inv-badge-categoria">' + _esc(m.categoria) + '</span>' +
        '<span class="inv-badge inv-badge-tematica">' + _esc(m.tematica) + '</span>' +
        '<span class="inv-badge inv-badge-idioma">' + _esc(m.idioma) + '</span>' +
      '</div>' +
      '<div class="inv-cartao-numero">' +
        '<span class="inv-cartao-num">' + numeroPrincipal + '</span>' +
        '<span class="inv-cartao-num-label">' + _esc(labelPrincipal) + '</span>' +
      '</div>' +
      (localBreakdown
        ? '<div class="inv-cartao-locais">' + localBreakdown + '</div>'
        : '<div class="inv-cartao-locais inv-vazio">Sem stock registado em nenhum local.</div>') +
      '<div class="inv-cartao-rodape">' +
        '<span class="inv-cartao-minimo">Mín.: ' + (m.stockMinimo || 0) + '</span>' +
        '<div class="inv-cartao-rodape-btns">' +
          '<button type="button" class="inv-cartao-btn-corrigir" title="Corrigir stock">🛠</button>' +
          '<button type="button" class="inv-cartao-btn">🔄 Movimento</button>' +
        '</div>' +
      '</div>';

    card.querySelector('.inv-cartao-btn').addEventListener('click', function() {
      abrirMovimentoRapido(m.id);
    });
    card.querySelector('.inv-cartao-btn-corrigir').addEventListener('click', function() {
      abrirCorrecaoStock(m.id);
    });

    return card;
  }

  // ============================================================
  // MATERIAIS — catálogo (tabela)
  // ============================================================

  function _renderTabelaMateriais() {
    var tbody = document.getElementById('invTabelaMateriaisBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!_materiais.length) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="inv-estado-vazio-td">' +
          'Nenhum material no catálogo. Crie o primeiro com "➕ Novo Material".' +
        '</td></tr>';
      return;
    }

    _materiais.forEach(function(m) {
      tbody.appendChild(_criarLinhaMaterial(m));
    });
  }

  function _criarLinhaMaterial(m) {
    var tr          = document.createElement('tr');
    var estado      = _calcularEstado(m);
    var estadoLabel = estado === 'esgotado' ? '🔴 Esgotado' : (estado === 'baixo' ? '🟠 Baixo' : '🟢 OK');
    var total       = _calcularTotal(m);

    tr.innerHTML =
      '<td><strong>' + _esc(m.nome) + '</strong></td>' +
      '<td>' + _esc(m.categoria) + '</td>' +
      '<td>' + _esc(m.tematica) + '</td>' +
      '<td>' + _esc(m.idioma) + '</td>' +
      '<td class="inv-td-num">' + (m.stockMinimo || 0) + '</td>' +
      '<td class="inv-td-num">' + total + '</td>' +
      '<td><span class="inv-tag-estado ' + estado + '">' + estadoLabel + '</span></td>' +
      '<td class="inv-td-acoes"></td>';

    var tdAcoes = tr.querySelector('.inv-td-acoes');

    var btnMov = document.createElement('button');
    btnMov.type = 'button';
    btnMov.className = 'btn-inv-acao';
    btnMov.textContent = '🔄';
    btnMov.title = 'Registar movimento';
    btnMov.addEventListener('click', function() { abrirMovimentoRapido(m.id); });
    tdAcoes.appendChild(btnMov);

    var btnCorrecao = document.createElement('button');
    btnCorrecao.type = 'button';
    btnCorrecao.className = 'btn-inv-acao';
    btnCorrecao.textContent = '🛠';
    btnCorrecao.title = 'Corrigir stock';
    btnCorrecao.addEventListener('click', function() { abrirCorrecaoStock(m.id); });
    tdAcoes.appendChild(btnCorrecao);

    var btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.className = 'btn-inv-acao';
    btnEdit.textContent = '✏️';
    btnEdit.title = 'Editar';
    btnEdit.addEventListener('click', function() { abrirEditarMaterial(m.id); });
    tdAcoes.appendChild(btnEdit);

    if (_isAdmin) {
      var btnArq = document.createElement('button');
      btnArq.type = 'button';
      btnArq.className = 'btn-inv-acao btn-inv-acao-perigo';
      btnArq.textContent = '🗑';
      btnArq.title = 'Arquivar';
      btnArq.addEventListener('click', function() { arquivarMaterial(m.id); });
      tdAcoes.appendChild(btnArq);
    }

    return tr;
  }

  // ── Modal de material ────────────────────────────────────

  function abrirNovoMaterial() {
    _editandoMaterialId = null;
    document.getElementById('modalMaterialTitulo').textContent = 'Novo Material';
    document.getElementById('materialId').value = '';
    document.getElementById('materialNome').value = '';
    document.getElementById('materialStockMinimo').value = '';
    _popularSelectSimples('materialCategoria', _config.categorias);
    _popularSelectSimples('materialTematica',  _config.tematicas);
    _popularSelectSimples('materialIdioma',    _config.idiomas);
    document.getElementById('modalMaterial').classList.add('show');
    document.getElementById('materialNome').focus();
  }

  function abrirEditarMaterial(id) {
    var m = _materiais.find(function(x) { return x.id === id; });
    if (!m) return;
    _editandoMaterialId = id;
    document.getElementById('modalMaterialTitulo').textContent = 'Editar Material';
    document.getElementById('materialId').value = id;
    document.getElementById('materialNome').value = m.nome || '';
    document.getElementById('materialStockMinimo').value = m.stockMinimo || '';
    _popularSelectSimples('materialCategoria', _config.categorias);
    _popularSelectSimples('materialTematica',  _config.tematicas);
    _popularSelectSimples('materialIdioma',    _config.idiomas);
    document.getElementById('materialCategoria').value = m.categoria || '';
    document.getElementById('materialTematica').value  = m.tematica  || '';
    document.getElementById('materialIdioma').value    = m.idioma    || '';
    document.getElementById('modalMaterial').classList.add('show');
  }

  function fecharModalMaterial() {
    document.getElementById('modalMaterial').classList.remove('show');
    _editandoMaterialId = null;
  }

  function guardarMaterial() {
    var id          = (document.getElementById('materialId') || {}).value || '';
    var nome        = ((document.getElementById('materialNome') || {}).value || '').trim();
    var categoria   = (document.getElementById('materialCategoria') || {}).value || '';
    var tematica    = (document.getElementById('materialTematica')  || {}).value || '';
    var idioma      = (document.getElementById('materialIdioma')    || {}).value || '';
    var stockMinimo = parseInt((document.getElementById('materialStockMinimo') || {}).value, 10) || 0;

    if (!nome)      { mostrarToast('O nome do material é obrigatório.', 'erro'); return; }
    if (!categoria) { mostrarToast('Escolha uma categoria.', 'erro'); return; }
    if (!tematica)  { mostrarToast('Escolha uma temática.', 'erro'); return; }
    if (!idioma)    { mostrarToast('Escolha um idioma.', 'erro'); return; }

    var btn = document.querySelector('#modalMaterial .btn-modal-confirmar');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ A guardar...'; }

    function _recarregarTudo() {
      return _carregarMateriais().then(function() {
        _popularSelects();
        _renderPainel();
        _renderTabelaMateriais();
      });
    }

    if (id) {
      db.collection('materiais').doc(id).update({
        nome: nome, categoria: categoria, tematica: tematica, idioma: idioma,
        stockMinimo: stockMinimo,
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
      })
      .then(function() {
        if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar'; }
        fecharModalMaterial();
        mostrarToast('✓ Material atualizado.', 'sucesso');
        return _recarregarTudo();
      })
      .catch(function(err) {
        if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar'; }
        mostrarToast('Erro: ' + err.message, 'erro');
      });
    } else {
      db.collection('materiais').add({
        nome: nome, categoria: categoria, tematica: tematica, idioma: idioma,
        stockMinimo: stockMinimo,
        stockPorLocal: {},
        ativo: true,
        criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
        criadoPor: (_perfil && _perfil.email) || ''
      })
      .then(function() {
        if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar'; }
        fecharModalMaterial();
        mostrarToast('✓ Material criado.', 'sucesso');
        return _recarregarTudo();
      })
      .catch(function(err) {
        if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar'; }
        mostrarToast('Erro: ' + err.message, 'erro');
      });
    }
  }

  function arquivarMaterial(id) {
    if (!_isAdmin) return;
    var material = _materiais.find(function(m) { return m.id === id; });
    if (!material) return;
    if (!confirm('Arquivar "' + material.nome + '"? O material deixa de aparecer nas listas, mas o histórico de movimentos é preservado.')) return;

    db.collection('materiais').doc(id).update({
      ativo: false,
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(function() {
      mostrarToast('✓ Material arquivado.', 'sucesso');
      return _carregarMateriais();
    })
    .then(function() {
      _popularSelects();
      _renderPainel();
      _renderTabelaMateriais();
    })
    .catch(function(err) { mostrarToast('Erro: ' + err.message, 'erro'); });
  }

  // ============================================================
  // MOVIMENTOS — entradas / saídas
  // ============================================================

  function _executarMovimento(materialId, local, tipo, quantidade, dataFmt, observacoes, onSuccess, onError) {
    if (!materialId) { onError(new Error('Escolha um material.')); return; }
    if (!local)       { onError(new Error('Escolha um local.')); return; }
    if (!quantidade || quantidade <= 0) { onError(new Error('Indique uma quantidade válida.')); return; }

    var materialRef = db.collection('materiais').doc(materialId);

    db.runTransaction(function(tx) {
      return tx.get(materialRef).then(function(doc) {
        if (!doc.exists) throw new Error('Material não encontrado.');
        var dados         = doc.data();
        var stockPorLocal = Object.assign({}, dados.stockPorLocal || {});
        var atual          = stockPorLocal[local] || 0;
        var novo;

        if (tipo === 'entrada') {
          novo = atual + quantidade;
        } else {
          novo = atual - quantidade;
          if (novo < 0) {
            throw new Error('Stock insuficiente em "' + local + '" (disponível: ' + atual + ').');
          }
        }
        stockPorLocal[local] = novo;

        tx.update(materialRef, {
          stockPorLocal: stockPorLocal,
          atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
        });

        var movRef = db.collection('materiais_movimentos').doc();
        tx.set(movRef, {
          materialId:     materialId,
          materialNome:   dados.nome      || '',
          categoria:      dados.categoria || '',
          tematica:       dados.tematica  || '',
          idioma:         dados.idioma    || '',
          local:          local,
          tipo:           tipo,
          quantidade:     quantidade,
          data:           dataFmt,
          observacoes:    observacoes || '',
          utilizadorEmail: (_perfil && _perfil.email) || '',
          utilizadorNome:  (_perfil && (_perfil.nome || _perfil.email)) || '',
          criadoEm:       firebase.firestore.FieldValue.serverTimestamp()
        });
      });
    })
    .then(function() { onSuccess(); })
    .catch(function(err) { onError(err); });
  }

  function registarMovimento() {
    var materialId   = (document.getElementById('movMaterial')     || {}).value || '';
    var local        = (document.getElementById('movLocal')        || {}).value || '';
    var tipo         = (document.getElementById('movTipo')         || {}).value || 'entrada';
    var quantidade   = parseInt((document.getElementById('movQuantidade') || {}).value, 10) || 0;
    var dataIso      = (document.getElementById('movData')         || {}).value || _hojeISO();
    var observacoes  = ((document.getElementById('movObservacoes') || {}).value || '').trim();
    var dataFmt      = _isoParaDMY(dataIso);

    var btn = document.querySelector('.btn-inv-registar');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ A registar...'; }

    _executarMovimento(materialId, local, tipo, quantidade, dataFmt, observacoes,
      function onSuccess() {
        if (btn) { btn.disabled = false; btn.textContent = '💾 Registar Movimento'; }
        mostrarToast('✓ Movimento registado.', 'sucesso');
        var qEl = document.getElementById('movQuantidade');
        var oEl = document.getElementById('movObservacoes');
        if (qEl) qEl.value = '';
        if (oEl) oEl.value = '';
        _carregarMateriais().then(function() { _renderPainel(); _renderTabelaMateriais(); });
        _carregarMovimentos().then(_renderTabelaMovimentos);
      },
      function onError(err) {
        if (btn) { btn.disabled = false; btn.textContent = '💾 Registar Movimento'; }
        mostrarToast('Erro: ' + err.message, 'erro');
      }
    );
  }

  function abrirMovimentoRapido(id) {
    var material = _materiais.find(function(m) { return m.id === id; });
    if (!material) return;
    _movRapidoMaterialId = id;

    document.getElementById('movRapidoMeta').textContent =
      material.nome + ' — ' + material.categoria + ' · ' + material.idioma;
    _popularSelectLocal(document.getElementById('movRapidoLocal'));
    document.getElementById('movRapidoQuantidade').value   = '';
    document.getElementById('movRapidoData').value         = _hojeISO();
    document.getElementById('movRapidoObservacoes').value  = '';
    document.getElementById('modalMovimentoRapido').classList.add('show');
  }

  function fecharModalMovimentoRapido() {
    document.getElementById('modalMovimentoRapido').classList.remove('show');
    _movRapidoMaterialId = null;
  }

  function confirmarMovimentoRapido(tipo) {
    if (!_movRapidoMaterialId) return;

    var local       = (document.getElementById('movRapidoLocal')       || {}).value || '';
    var quantidade  = parseInt((document.getElementById('movRapidoQuantidade') || {}).value, 10) || 0;
    var dataIso     = (document.getElementById('movRapidoData')        || {}).value || _hojeISO();
    var observacoes = ((document.getElementById('movRapidoObservacoes') || {}).value || '').trim();
    var dataFmt     = _isoParaDMY(dataIso);

    _executarMovimento(_movRapidoMaterialId, local, tipo, quantidade, dataFmt, observacoes,
      function onSuccess() {
        mostrarToast('✓ ' + (tipo === 'entrada' ? 'Entrada' : 'Saída') + ' registada.', 'sucesso');
        fecharModalMovimentoRapido();
        _carregarMateriais().then(function() { _renderPainel(); _renderTabelaMateriais(); });
        _carregarMovimentos().then(_renderTabelaMovimentos);
      },
      function onError(err) {
        mostrarToast('Erro: ' + err.message, 'erro');
      }
    );
  }

  function _renderTabelaMovimentos() {
    var filtroMaterial = (document.getElementById('filtroMovMaterial') || {}).value || '';
    var filtroLocal     = (document.getElementById('filtroMovLocal')    || {}).value || '';
    var filtroTipo       = (document.getElementById('filtroMovTipo')      || {}).value || '';

    var lista = _movimentos.filter(function(mv) {
      if (filtroMaterial && mv.materialId !== filtroMaterial) return false;
      if (filtroLocal     && mv.local      !== filtroLocal)     return false;
      if (filtroTipo       && mv.tipo       !== filtroTipo)       return false;
      return true;
    });

    var tbody = document.getElementById('invTabelaMovimentosBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="inv-estado-vazio-td">Nenhum movimento encontrado.</td></tr>';
      return;
    }

    lista.forEach(function(mv) {
      var tr = document.createElement('tr');
      var tipoLabel = mv.tipo === 'entrada' ? '⬆️ Entrada' : (mv.tipo === 'saida' ? '⬇️ Saída' : '🛠 Ajuste');
      var qtdDisplay;
      if (mv.tipo === 'ajuste') {
        var sinal = (mv.delta || 0) > 0 ? '+' : '';
        qtdDisplay = sinal + (mv.delta || 0) + ' (' + (mv.quantidadeAnterior || 0) + ' → ' + (mv.quantidadeNova || 0) + ')';
      } else {
        qtdDisplay = String(mv.quantidade || 0);
      }
      tr.innerHTML =
        '<td>' + _esc(mv.data || '') + '</td>' +
        '<td>' + _esc(mv.materialNome || '') + '</td>' +
        '<td>' + _esc(mv.local || '') + '</td>' +
        '<td><span class="inv-tag-tipo ' + mv.tipo + '">' + tipoLabel + '</span></td>' +
        '<td class="inv-td-num">' + qtdDisplay + '</td>' +
        '<td>' + _esc(mv.observacoes || '—') + '</td>' +
        '<td>' + _esc(mv.utilizadorNome || mv.utilizadorEmail || '—') + '</td>';
      tbody.appendChild(tr);
    });
  }

  // ============================================================
  // CORREÇÃO DE STOCK — após contagem física de inventário
  //
  // Diferente de entrada/saída (que somam/subtraem uma quantidade),
  // a correção define directamente o valor de cada local. Cada
  // local alterado gera um movimento de auditoria tipo 'ajuste'
  // com o valor anterior, o novo valor e o delta.
  // ============================================================

  function abrirCorrecaoStock(id) {
    var m = _materiais.find(function(x) { return x.id === id; });
    if (!m) return;
    _correcaoMaterialId = id;

    document.getElementById('correcaoMeta').textContent =
      m.nome + ' — ' + m.categoria + ' · ' + m.idioma;
    document.getElementById('correcaoObservacoes').value = '';

    // Mostrar todos os locais configurados, mais quaisquer locais
    // legados (já removidos da configuração) que ainda tenham stock.
    var locais = _config.locais.slice();
    Object.keys(m.stockPorLocal || {}).forEach(function(l) {
      if (locais.indexOf(l) === -1) locais.push(l);
    });
    locais.sort();

    var lista = document.getElementById('correcaoLista');
    lista.innerHTML = '';

    locais.forEach(function(local) {
      var valorAtual = (m.stockPorLocal && m.stockPorLocal[local]) || 0;
      var linha = document.createElement('div');
      linha.className = 'inv-correcao-linha';
      linha.innerHTML =
        '<span class="inv-correcao-linha-local">' + _esc(local) + '</span>' +
        '<input type="number" min="0" class="inv-correcao-input" value="' + valorAtual + '">' +
        '<button type="button" class="inv-correcao-linha-reset" title="Repor a zero">🔄</button>';
      linha.dataset.local = local;
      linha.querySelector('.inv-correcao-linha-reset').addEventListener('click', function() {
        linha.querySelector('.inv-correcao-input').value = 0;
      });
      lista.appendChild(linha);
    });

    if (!locais.length) {
      lista.innerHTML = '<div class="inv-config-vazio">Sem locais configurados. Adicione locais em Configurações.</div>';
    }

    document.getElementById('modalCorrecaoStock').classList.add('show');
  }

  function fecharModalCorrecao() {
    document.getElementById('modalCorrecaoStock').classList.remove('show');
    _correcaoMaterialId = null;
  }

  function zerarTodosCorrecao() {
    document.querySelectorAll('#correcaoLista .inv-correcao-input').forEach(function(inp) {
      inp.value = 0;
    });
  }

  function guardarCorrecaoStock() {
    if (!_correcaoMaterialId) return;

    var novosValores = {};
    document.querySelectorAll('#correcaoLista .inv-correcao-linha').forEach(function(linha) {
      var local = linha.dataset.local;
      var inp   = linha.querySelector('.inv-correcao-input');
      novosValores[local] = Math.max(0, parseInt(inp.value, 10) || 0);
    });

    var observacoes = ((document.getElementById('correcaoObservacoes') || {}).value || '').trim();
    var dataFmt      = _isoParaDMY(_hojeISO());
    var materialId   = _correcaoMaterialId;
    var materialRef  = db.collection('materiais').doc(materialId);

    var btn = document.querySelector('#modalCorrecaoStock .btn-modal-confirmar');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ A guardar...'; }

    db.runTransaction(function(tx) {
      return tx.get(materialRef).then(function(doc) {
        if (!doc.exists) throw new Error('Material não encontrado.');
        var dados         = doc.data();
        var stockPorLocal = Object.assign({}, dados.stockPorLocal || {});
        var ajustes       = [];

        Object.keys(novosValores).forEach(function(local) {
          var anterior = stockPorLocal[local] || 0;
          var novo     = novosValores[local];
          if (novo !== anterior) {
            ajustes.push({ local: local, anterior: anterior, novo: novo, delta: novo - anterior });
            stockPorLocal[local] = novo;
          }
        });

        if (!ajustes.length) return 0;

        tx.update(materialRef, {
          stockPorLocal: stockPorLocal,
          atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
        });

        ajustes.forEach(function(aj) {
          var movRef = db.collection('materiais_movimentos').doc();
          tx.set(movRef, {
            materialId:         materialId,
            materialNome:       dados.nome      || '',
            categoria:          dados.categoria || '',
            tematica:           dados.tematica  || '',
            idioma:             dados.idioma    || '',
            local:              aj.local,
            tipo:               'ajuste',
            quantidade:         Math.abs(aj.delta),
            quantidadeAnterior: aj.anterior,
            quantidadeNova:     aj.novo,
            delta:              aj.delta,
            data:               dataFmt,
            observacoes:        observacoes || '',
            utilizadorEmail:    (_perfil && _perfil.email) || '',
            utilizadorNome:     (_perfil && (_perfil.nome || _perfil.email)) || '',
            criadoEm:           firebase.firestore.FieldValue.serverTimestamp()
          });
        });

        return ajustes.length;
      });
    })
    .then(function(nAjustes) {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Correções'; }
      fecharModalCorrecao();
      if (!nAjustes) {
        mostrarToast('Sem alterações a guardar.', 'info');
        return;
      }
      mostrarToast('✓ ' + nAjustes + (nAjustes === 1 ? ' correção registada.' : ' correções registadas.'), 'sucesso');
      _carregarMateriais().then(function() { _renderPainel(); _renderTabelaMateriais(); });
      _carregarMovimentos().then(_renderTabelaMovimentos);
    })
    .catch(function(err) {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Correções'; }
      mostrarToast('Erro: ' + err.message, 'erro');
    });
  }

  // ============================================================
  // CONFIGURAÇÕES — listas editáveis
  // ============================================================

  function _renderConfig() {
    _renderConfigBloco('invConfigLocais',     'locais');
    _renderConfigBloco('invConfigCategorias', 'categorias');
    _renderConfigBloco('invConfigTematicas',  'tematicas');
    _renderConfigBloco('invConfigIdiomas',    'idiomas');
  }

  function _renderConfigBloco(elId, lista) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '';

    if (!_config[lista].length) {
      el.innerHTML = '<div class="inv-config-vazio">Sem valores definidos.</div>';
      return;
    }

    // Ordenar mantendo o índice original para guardar na posição correcta
    var ordenados = _config[lista].map(function(v, i) { return { valor: v, idx: i }; });
    ordenados.sort(function(a, b) { return a.valor.localeCompare(b.valor); });

    ordenados.forEach(function(entry) {
      var item = document.createElement('div');
      item.className = 'inv-config-item';
      item.dataset.idx = entry.idx;

      var inp = document.createElement('input');
      inp.type        = 'text';
      inp.className   = 'inv-config-item-input';
      inp.value       = entry.valor;
      inp.setAttribute('aria-label', 'Editar valor');

      var btnGuardar = document.createElement('button');
      btnGuardar.type      = 'button';
      btnGuardar.className = 'inv-config-guardar';
      btnGuardar.title     = 'Guardar edição';
      btnGuardar.innerHTML = '✓';
      btnGuardar.style.display = 'none';

      var btnRemover = document.createElement('button');
      btnRemover.type      = 'button';
      btnRemover.className = 'inv-config-remover';
      btnRemover.title     = 'Remover';
      btnRemover.innerHTML = '✕';

      // Mostrar botão de guardar quando o valor muda
      inp.addEventListener('input', function() {
        var mudou = inp.value.trim() !== entry.valor;
        btnGuardar.style.display = mudou ? '' : 'none';
      });

      // Guardar ao pressionar Enter
      inp.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); btnGuardar.click(); }
        if (e.key === 'Escape') { inp.value = entry.valor; btnGuardar.style.display = 'none'; }
      });

      btnGuardar.addEventListener('click', function() {
        renomearConfigItem(lista, entry.idx, inp.value.trim());
      });

      btnRemover.addEventListener('click', function() {
        removerConfigItem(lista, entry.valor);
      });

      item.appendChild(inp);
      item.appendChild(btnGuardar);
      item.appendChild(btnRemover);
      el.appendChild(item);
    });
  }

  function adicionarConfig(lista, inputId) {
    if (!_isAdmin) return;
    var input = document.getElementById(inputId);
    if (!input) return;
    var valor = (input.value || '').trim();
    if (!valor) return;

    if (_config[lista].indexOf(valor) !== -1) {
      mostrarToast('Esse valor já existe nessa lista.', 'info');
      return;
    }

    _config[lista].push(valor);
    input.value = '';

    _guardarConfig().then(function() {
      _renderConfig();
      _popularSelects();
      mostrarToast('✓ Adicionado.', 'sucesso');
    }).catch(function(err) {
      mostrarToast('Erro: ' + err.message, 'erro');
    });
  }

  function renomearConfigItem(lista, idx, novoValor) {
    if (!_isAdmin) return;

    if (!novoValor) {
      mostrarToast('O nome não pode estar vazio.', 'erro');
      return;
    }

    var valorAntigo = _config[lista][idx];

    if (novoValor === valorAntigo) return;

    // Verificar duplicado (ignorar o próprio item)
    var duplicado = _config[lista].some(function(v, i) {
      return i !== idx && v === novoValor;
    });
    if (duplicado) {
      mostrarToast('"' + novoValor + '" já existe nessa lista.', 'erro');
      return;
    }

    _config[lista][idx] = novoValor;

    _guardarConfig()
      .then(function() {
        _renderConfig();
        _popularSelects();
        mostrarToast('✓ "' + valorAntigo + '" renomeado para "' + novoValor + '".', 'sucesso');
      })
      .catch(function(err) {
        // Reverter em caso de erro
        _config[lista][idx] = valorAntigo;
        _renderConfig();
        mostrarToast('Erro ao guardar: ' + err.message, 'erro');
      });
  }

  function removerConfigItem(lista, valor) {
    if (!_isAdmin) return;
    if (!confirm('Remover "' + valor + '" desta lista? Materiais já existentes mantêm o valor atual.')) return;

    _config[lista] = _config[lista].filter(function(v) { return v !== valor; });

    _guardarConfig().then(function() {
      _renderConfig();
      _popularSelects();
      mostrarToast('Removido.', 'info');
    }).catch(function(err) {
      mostrarToast('Erro: ' + err.message, 'erro');
    });
  }

  // ============================================================
  // UTILITÁRIOS
  // ============================================================

  function _hojeISO() {
    var hoje = new Date();
    return hoje.getFullYear() + '-' +
           String(hoje.getMonth() + 1).padStart(2, '0') + '-' +
           String(hoje.getDate()).padStart(2, '0');
  }

  function _isoParaDMY(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    if (p.length !== 3) return iso;
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function _esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ============================================================
  // API PÚBLICA → window.__inventario
  // ============================================================

  window.__inventario = {
    abrirNovoMaterial:        abrirNovoMaterial,
    abrirEditarMaterial:      abrirEditarMaterial,
    fecharModalMaterial:      fecharModalMaterial,
    guardarMaterial:          guardarMaterial,
    arquivarMaterial:         arquivarMaterial,
    abrirMovimentoRapido:     abrirMovimentoRapido,
    fecharModalMovimentoRapido: fecharModalMovimentoRapido,
    confirmarMovimentoRapido: confirmarMovimentoRapido,
    registarMovimento:        registarMovimento,
    abrirCorrecaoStock:       abrirCorrecaoStock,
    fecharModalCorrecao:      fecharModalCorrecao,
    zerarTodosCorrecao:       zerarTodosCorrecao,
    guardarCorrecaoStock:     guardarCorrecaoStock,
    verAlertas:               verAlertas,
    adicionarConfig:          adicionarConfig,
    renomearConfigItem:       renomearConfigItem,
    removerConfigItem:        removerConfigItem
  };

  // ============================================================
  // REGISTAR A VIEW
  // ============================================================

  window.__views = window.__views || {};
  window.__views.inventario = {
    mount:   mount,
    unmount: unmount
  };

})();
