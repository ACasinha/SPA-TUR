// ============================================================
// views/vendas/view.js
// View: Vendas Diárias e Inventário Mensal
//
// Acesso: administradores ou utilizadores com acessoVendas: true
//
// Coleções Firestore:
//   vendas_config/locais      — { locais: [..] } locais com vendas (admin)
//   vendas_artigos            — { nome, preco, ativo }
//   vendas_listas             — { nome, artigos: [ids], locais: [..], ativo }
//   vendas_registos/{local__YYYY-MM}
//        { local, mes, dias: { d01: { itens: {artigoId: {q, p}}, totalQtd, totalValor } } }
//   vendas_inventarios/{local__YYYY-MM}
//        { local, mes, fechado, itens: {artigoId: {anterior, entradas, vendas, teorico, contado, preco}} }
//
// Dependências: SheetJS (router deps), jsPDF + AutoTable (index.html)
// ============================================================

'use strict';

(function() {

  // ── Estado ─────────────────────────────────────────────────
  var _perfil       = null;
  var _isAdmin      = false;
  var _tab          = 'vendas';
  var _listeners    = [];
  var _dirtyV       = false;
  var _dirtyI       = false;

  var _config       = { locais: [] };
  var _artigos      = [];
  var _listas       = [];

  var _local        = '';
  var _mes          = '';
  var _artigosLocal = [];
  var _docV         = null;   // vendas do mês
  var _docI         = null;   // inventário do mês
  var _docIAnt      = null;   // inventário do mês anterior

  var _editArtigoId = null;
  var _editListaId  = null;

  var DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  // ============================================================
  // CICLO DE VIDA
  // ============================================================

  function mount(perfil) {
    _perfil  = perfil;
    _isAdmin = perfil.role === 'administrador';

    spaSetHeader({ titulo: 'Vendas e Inventário Mensal' });

    var tabCfg = document.getElementById('vdTabConfig');
    if (tabCfg) tabCfg.style.display = _isAdmin ? '' : 'none';
    document.querySelectorAll('.vd-so-admin').forEach(function(el) {
      el.style.display = _isAdmin ? '' : 'none';
    });

    document.querySelectorAll('.vd-tab').forEach(function(b) {
      _al(b, 'click', function() { _activarTab(b.getAttribute('data-tab')); });
    });

    var inMes = document.getElementById('vdMes');
    if (inMes) inMes.value = _hoje().mes;

    _lig('vdBtnCarregar',          'click',  carregar);
    _lig('vdDia',                  'change', _renderRegisto);
    _lig('vdBtnGuardarVendas',     'click',  guardarVendas);
    _lig('vdBtnGuardarInv',        'click',  guardarInventario);
    _lig('vdBtnModeloVendasPdf',   'click',  function() { _modeloPdf('vendas'); });
    _lig('vdBtnModeloVendasXls',   'click',  function() { _modeloExcel('vendas'); });
    _lig('vdBtnModeloInvPdf',      'click',  function() { _modeloPdf('inventario'); });
    _lig('vdBtnModeloInvXls',      'click',  function() { _modeloExcel('inventario'); });
    _lig('vdBtnExportarVendas',    'click',  function() { _exportarExcel(false); });
    _lig('vdBtnExportarInv',       'click',  function() { _exportarExcel(false); });
    _lig('vdBtnExportarTodosVendas','click', function() { _exportarExcel(true); });
    _lig('vdBtnExportarTodosInv',  'click',  function() { _exportarExcel(true); });
    _lig('vdBtnGuardarLocais',     'click',  guardarLocais);
    _lig('vdBtnNovoArtigo',        'click',  function() { abrirArtigo(null); });
    _lig('vdBtnNovaLista',         'click',  function() { abrirLista(null); });

    ['vdModalArtigo', 'vdModalLista'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) _al(el, 'click', function(e) { if (e.target === el) fecharModais(); });
    });
    _al(document, 'keydown', function(e) { if (e.key === 'Escape') fecharModais(); });
    _al(window, 'beforeunload', _onBeforeUnload);

    _carregarBase();
  }

  function beforeLeave() {
    if (_dirtyV || _dirtyI) return confirm('Tem alterações por guardar. Tem a certeza que quer sair?');
    return true;
  }

  function unmount() {
    _listeners.forEach(function(l) { l.target.removeEventListener(l.tipo, l.fn); });
    _listeners = [];
    _local = ''; _mes = ''; _artigosLocal = [];
    _docV = null; _docI = null; _docIAnt = null;
    _config = { locais: [] }; _artigos = []; _listas = [];
    _dirtyV = false; _dirtyI = false; _tab = 'vendas';
    window.__vendas = null;
    spaResetHeader();
  }

  function _al(target, tipo, fn) {
    target.addEventListener(tipo, fn);
    _listeners.push({ target: target, tipo: tipo, fn: fn });
  }
  function _lig(id, tipo, fn) {
    var el = document.getElementById(id);
    if (el) _al(el, tipo, fn);
  }
  function _onBeforeUnload(e) {
    if (_dirtyV || _dirtyI) { e.preventDefault(); e.returnValue = 'Tem alterações por guardar.'; return e.returnValue; }
  }

  // ============================================================
  // UTILITÁRIOS
  // ============================================================

  function _pad(n) { return String(n).padStart(2, '0'); }
  function _hoje() {
    var h = new Date();
    return { mes: h.getFullYear() + '-' + _pad(h.getMonth() + 1), dia: _pad(h.getDate()) };
  }
  function _diasNoMes(mes) {
    var p = mes.split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10), 0).getDate();
  }
  function _mesAnterior(mes) {
    var p = mes.split('-'), a = parseInt(p[0], 10), m = parseInt(p[1], 10) - 1;
    if (m < 1) { m = 12; a--; }
    return a + '-' + _pad(m);
  }
  function _idDoc(local, mes) { return local + '__' + mes; }
  function _mesLegivel(mes) {
    var p = mes.split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, 1)
      .toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  }
  function _eur(n) {
    return (n || 0).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
  }
  function _num(v) { return Math.max(0, parseInt(v, 10) || 0); }
  function _email() { return (_perfil && _perfil.email) || ''; }
  function _ts() { return firebase.firestore.FieldValue.serverTimestamp(); }
  function _esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function _todosLocais() {
    return (typeof LOCAIS_DETALHADOS !== 'undefined' ? LOCAIS_DETALHADOS : [])
      .concat(typeof LOCAIS_SIMPLES !== 'undefined' ? LOCAIS_SIMPLES : []);
  }
  function _artigoPorId(id) {
    return _artigos.find(function(a) { return a.id === id; }) || { id: id, nome: '(artigo removido)', preco: 0 };
  }
  function _artigosDoLocal(local) {
    var ids = {};
    _listas.forEach(function(l) {
      if (l.ativo !== false && (l.locais || []).indexOf(local) !== -1) {
        (l.artigos || []).forEach(function(id) { ids[id] = true; });
      }
    });
    return _artigos
      .filter(function(a) { return a.ativo !== false && ids[a.id]; })
      .sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); });
  }
  function _formatarTs(ts) {
    try {
      var d = ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
      return d ? d.toLocaleDateString('pt-PT') + ' ' + d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : '';
    } catch (e) { return ''; }
  }

  // ============================================================
  // DADOS BASE (config, artigos, listas)
  // ============================================================

  function _carregarBase() {
    Promise.all([
      db.collection('vendas_config').doc('locais').get(),
      db.collection('vendas_artigos').get(),
      db.collection('vendas_listas').get()
    ]).then(function(r) {
      _config.locais = (r[0].exists && Array.isArray(r[0].data().locais)) ? r[0].data().locais : [];
      _artigos = []; _listas = [];
      r[1].forEach(function(d) { var x = d.data(); x.id = d.id; _artigos.push(x); });
      r[2].forEach(function(d) { var x = d.data(); x.id = d.id; _listas.push(x); });
      _artigos.sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); });
      _popularLocais();
      if (_isAdmin) _renderConfig();
    }).catch(function(err) {
      mostrarToast('Erro ao carregar configuração: ' + err.message, 'erro');
    });
  }

  function _popularLocais() {
    var sel = document.getElementById('vdLocal');
    if (!sel) return;
    var atual = sel.value;
    if (!_config.locais.length) {
      sel.innerHTML = '<option value="" disabled selected>Sem locais configurados</option>';
      return;
    }
    sel.innerHTML = '<option value="" disabled selected>Escolha uma opção...</option>' +
      _config.locais.map(function(l) { return '<option value="' + _esc(l) + '">' + _esc(l) + '</option>'; }).join('');
    if (_config.locais.indexOf(atual) !== -1) sel.value = atual;
  }

  function _activarTab(tab) {
    _tab = tab;
    document.querySelectorAll('.vd-tab').forEach(function(b) {
      b.classList.toggle('ativa', b.getAttribute('data-tab') === tab);
    });
    var mapa = { vendas: 'vdPainelVendas', inventario: 'vdPainelInventario', config: 'vdPainelConfig' };
    Object.keys(mapa).forEach(function(t) {
      var el = document.getElementById(mapa[t]);
      if (el) el.style.display = (t === tab) ? '' : 'none';
    });
    var painel = document.querySelector('.vd-painel');
    if (painel) painel.style.display = tab === 'config' ? 'none' : '';
  }

  // ============================================================
  // CARREGAR LOCAL + MÊS
  // ============================================================

  function carregar() {
    var local = ((document.getElementById('vdLocal') || {}).value || '').trim();
    var mes   =  (document.getElementById('vdMes')   || {}).value || '';
    if (!local) { mostrarToast('Escolha um local.', 'erro'); return; }
    if (!mes)   { mostrarToast('Escolha o mês.', 'erro'); return; }
    if ((_dirtyV || _dirtyI) && !confirm('Tem alterações por guardar. Se continuar serão perdidas. Continuar?')) return;

    var btn = document.getElementById('vdBtnCarregar');
    if (btn) btn.disabled = true;

    Promise.all([
      db.collection('vendas_registos').doc(_idDoc(local, mes)).get(),
      db.collection('vendas_inventarios').doc(_idDoc(local, mes)).get(),
      db.collection('vendas_inventarios').doc(_idDoc(local, _mesAnterior(mes))).get()
    ]).then(function(r) {
      if (btn) btn.disabled = false;
      _local = local; _mes = mes;
      _docV    = r[0].exists ? r[0].data() : null;
      _docI    = r[1].exists ? r[1].data() : null;
      _docIAnt = r[2].exists ? r[2].data() : null;
      _artigosLocal = _artigosDoLocal(local);
      _dirtyV = false; _dirtyI = false;

      document.getElementById('vdVendasVazio').style.display = 'none';
      document.getElementById('vdVendasCorpo').style.display = '';
      document.getElementById('vdInvVazio').style.display    = 'none';
      document.getElementById('vdInvCorpo').style.display    = '';

      _prepararSeletorDia();
      _renderRegisto();
      _renderResumoVendas();
      _renderInventario();
    }).catch(function(err) {
      if (btn) btn.disabled = false;
      mostrarToast('Erro ao carregar dados: ' + err.message, 'erro');
    });
  }

  // ============================================================
  // VENDAS — registo do dia
  // ============================================================

  function _prepararSeletorDia() {
    var wrap = document.getElementById('vdDiaWrap');
    var sel  = document.getElementById('vdDia');
    if (!wrap || !sel) return;
    wrap.style.display = _isAdmin ? '' : 'none';
    if (!_isAdmin) return;
    var h = _hoje(), n = _diasNoMes(_mes), p = _mes.split('-');
    sel.innerHTML = '';
    for (var d = 1; d <= n; d++) {
      var o = document.createElement('option');
      o.value = _pad(d);
      o.textContent = _pad(d) + ' (' + DIAS_SEM[new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, d).getDay()] + ')';
      sel.appendChild(o);
    }
    sel.value = (_mes === h.mes) ? h.dia : '01';
  }

  function _diaEdicao() {
    return _isAdmin ? ((document.getElementById('vdDia') || {}).value || '01') : _hoje().dia;
  }
  function _podeEditarDia() { return _isAdmin || _mes === _hoje().mes; }

  function _renderRegisto() {
    var dd   = _diaEdicao();
    var pode = _podeEditarDia();
    var p    = _mes.split('-');
    document.getElementById('vdRegistoTitulo').textContent =
      'Registo de vendas — ' + dd + '/' + p[1] + '/' + p[0];

    var aviso = document.getElementById('vdRegistoAviso');
    var msg = '';
    if (!_artigosLocal.length) msg = 'Este local não tem artigos atribuídos. Contacte o administrador.';
    else if (!pode)            msg = 'Só é possível registar vendas no dia atual.';
    aviso.textContent   = msg;
    aviso.style.display = msg ? '' : 'none';

    var dia = (_docV && _docV.dias && _docV.dias['d' + dd]) || { itens: {} };
    var tbody = document.getElementById('vdRegistoBody');
    tbody.innerHTML = '';

    _artigosLocal.forEach(function(a) {
      var it = (dia.itens || {})[a.id];
      var q  = it ? it.q : 0;
      var pr = (it && it.p !== undefined) ? it.p : (a.preco || 0);
      var tr = document.createElement('tr');
      tr.dataset.id    = a.id;
      tr.dataset.preco = pr;
      tr.innerHTML =
        '<td>' + _esc(a.nome) + '</td>' +
        '<td class="vd-num">' + _eur(pr) + '</td>' +
        '<td class="vd-num"><input type="number" inputmode="numeric" min="0" class="vd-qtd" placeholder="0"' +
          ' value="' + (q > 0 ? q : '') + '"' + (pode ? '' : ' disabled') + '></td>' +
        '<td class="vd-num vd-sub">—</td>';
      tr.querySelector('.vd-qtd').addEventListener('input', function() {
        _dirtyV = true;
        _recalcRegisto();
      });
      tbody.appendChild(tr);
    });

    var btn = document.getElementById('vdBtnGuardarVendas');
    if (btn) btn.style.display = (pode && _artigosLocal.length) ? '' : 'none';
    _recalcRegisto();
  }

  function _recalcRegisto() {
    var totQ = 0, totV = 0;
    document.querySelectorAll('#vdRegistoBody tr').forEach(function(tr) {
      var q = _num(tr.querySelector('.vd-qtd').value);
      var p = parseFloat(tr.dataset.preco) || 0;
      totQ += q; totV += q * p;
      tr.querySelector('.vd-sub').textContent = q > 0 ? _eur(q * p) : '—';
    });
    document.getElementById('vdTotalQtd').textContent = totQ;
    document.getElementById('vdTotalDia').textContent = _eur(totV);
  }

  function guardarVendas() {
    if (!_podeEditarDia()) return;
    var dd = _diaEdicao(), itens = {}, totQ = 0, totV = 0;

    document.querySelectorAll('#vdRegistoBody tr').forEach(function(tr) {
      var q = _num(tr.querySelector('.vd-qtd').value);
      if (q > 0) {
        var p = parseFloat(tr.dataset.preco) || 0;
        itens[tr.dataset.id] = { q: q, p: p };
        totQ += q; totV += q * p;
      }
    });
    totV = Math.round(totV * 100) / 100;

    if (!totQ && !confirm('Nenhuma venda indicada. Registar este dia sem vendas?')) return;

    var chave = 'd' + dd;
    var dados = { local: _local, mes: _mes, atualizadoEm: _ts(), atualizadoPor: _email(), dias: {} };
    dados.dias[chave] = { itens: itens, totalQtd: totQ, totalValor: totV, registadoPor: _email(), registadoEm: _ts() };

    var btn = document.getElementById('vdBtnGuardarVendas');
    if (btn) btn.disabled = true;

    db.collection('vendas_registos').doc(_idDoc(_local, _mes))
      .set(dados, { mergeFields: ['local', 'mes', 'atualizadoEm', 'atualizadoPor', 'dias.' + chave] })
      .then(function() {
        if (btn) btn.disabled = false;
        _docV = _docV || { dias: {} };
        _docV.dias = _docV.dias || {};
        _docV.dias[chave] = { itens: itens, totalQtd: totQ, totalValor: totV };
        _dirtyV = false;
        mostrarToast('✓ Vendas guardadas.', 'sucesso');
        _renderResumoVendas();
        if (!_dirtyI) _renderInventario();
      })
      .catch(function(err) {
        if (btn) btn.disabled = false;
        mostrarToast('Erro ao guardar: ' + err.message, 'erro');
      });
  }

  function _idsComVendas() {
    var ids = {};
    _artigosLocal.forEach(function(a) { ids[a.id] = true; });
    var dias = (_docV && _docV.dias) || {};
    Object.keys(dias).forEach(function(k) {
      Object.keys(dias[k].itens || {}).forEach(function(id) { ids[id] = true; });
    });
    return Object.keys(ids).map(_artigoPorId)
      .sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); });
  }

  function _vendasPorArtigo() {
    var res = {}, dias = (_docV && _docV.dias) || {};
    Object.keys(dias).forEach(function(k) {
      var itens = dias[k].itens || {};
      Object.keys(itens).forEach(function(id) { res[id] = (res[id] || 0) + (itens[id].q || 0); });
    });
    return res;
  }

  function _renderResumoVendas() {
    var wrap = document.getElementById('vdResumoWrap');
    if (!wrap) return;
    var n = _diasNoMes(_mes), dias = (_docV && _docV.dias) || {};
    var lista = _idsComVendas();

    if (!lista.length) { wrap.innerHTML = '<div class="vd-vazio">Sem artigos para este local.</div>'; return; }

    var h = '<table class="vd-tabela vd-resumo"><thead><tr><th>Artigo</th>';
    for (var d = 1; d <= n; d++) h += '<th class="vd-num">' + d + '</th>';
    h += '<th class="vd-num">Qtd</th><th class="vd-num">Valor</th></tr></thead><tbody>';

    var totQGeral = 0, totVGeral = 0;
    lista.forEach(function(a) {
      var sQ = 0, sV = 0, cel = '';
      for (var d2 = 1; d2 <= n; d2++) {
        var it = dias['d' + _pad(d2)] && dias['d' + _pad(d2)].itens && dias['d' + _pad(d2)].itens[a.id];
        var q  = it ? it.q : 0;
        sQ += q; sV += q * (it ? it.p : 0);
        cel += '<td class="vd-num">' + (q > 0 ? q : '') + '</td>';
      }
      totQGeral += sQ; totVGeral += sV;
      h += '<tr><td>' + _esc(a.nome) + '</td>' + cel +
           '<td class="vd-num"><strong>' + sQ + '</strong></td><td class="vd-num">' + _eur(sV) + '</td></tr>';
    });

    h += '<tr class="vd-linha-total"><td>Total (€)</td>';
    for (var d3 = 1; d3 <= n; d3++) {
      var dia = dias['d' + _pad(d3)];
      h += '<td class="vd-num">' + (dia && dia.totalValor ? Math.round(dia.totalValor) : '') + '</td>';
    }
    h += '<td class="vd-num">' + totQGeral + '</td><td class="vd-num">' + _eur(totVGeral) + '</td></tr>';
    h += '</tbody></table>';
    wrap.innerHTML = h;
  }

  // ============================================================
  // INVENTÁRIO MENSAL
  // ============================================================

  function _renderInventario() {
    var fechado  = !!(_docI && _docI.fechado);
    var editavel = !fechado || _isAdmin;
    var salvos   = (_docI && _docI.itens) || {};
    var ant      = (_docIAnt && _docIAnt.itens) || {};
    var vendas   = _vendasPorArtigo();

    document.getElementById('vdInvTitulo').textContent =
      'Inventário — ' + _local + ' — ' + _mesLegivel(_mes);

    var aviso = document.getElementById('vdInvAviso');
    var msg = '', cls = 'vd-aviso';
    if (!_artigosLocal.length && !Object.keys(salvos).length) {
      msg = 'Este local não tem artigos atribuídos. Contacte o administrador.';
    } else if (fechado) {
      msg = '🔒 Inventário submetido por ' + (_docI.registadoPor || '—') + ' em ' + _formatarTs(_docI.registadoEm) +
            (_isAdmin ? '. Como administrador pode alterá-lo.' : '. Só os administradores o podem alterar.');
      cls += ' vd-aviso-info';
    } else if (!_docIAnt) {
      msg = 'Não existe inventário do mês anterior — indique o stock anterior de cada artigo.';
    }
    aviso.className     = cls;
    aviso.textContent   = msg;
    aviso.style.display = msg ? '' : 'none';

    var ids = {};
    _artigosLocal.forEach(function(a) { ids[a.id] = true; });
    Object.keys(salvos).forEach(function(id) { ids[id] = true; });
    var lista = Object.keys(ids).map(_artigoPorId)
      .sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); });

    var tbody = document.getElementById('vdInvBody');
    tbody.innerHTML = '';

    lista.forEach(function(a) {
      var s        = salvos[a.id];
      var anterior = s ? s.anterior : (ant[a.id] ? ant[a.id].contado : 0);
      var entradas = s ? s.entradas : 0;
      var venda    = (fechado && s && s.vendas !== undefined) ? s.vendas : (vendas[a.id] || 0);
      var teorico  = anterior + entradas - venda;
      var contado  = s ? s.contado : teorico;
      var antEdit  = editavel && !_docIAnt && !s;

      var tr = document.createElement('tr');
      tr.dataset.id    = a.id;
      tr.dataset.preco = a.preco || 0;
      tr.innerHTML =
        '<td>' + _esc(a.nome) + '</td>' +
        '<td class="vd-num"><input type="number" min="0" inputmode="numeric" class="vd-inv-ant" value="' + anterior + '"' + (antEdit ? '' : ' readonly') + '></td>' +
        '<td class="vd-num"><input type="number" min="0" inputmode="numeric" class="vd-inv-ent" value="' + (entradas || '') + '" placeholder="0"' + (editavel ? '' : ' disabled') + '></td>' +
        '<td class="vd-num vd-inv-ven" data-v="' + venda + '">' + venda + '</td>' +
        '<td class="vd-num vd-inv-teo">' + teorico + '</td>' +
        '<td class="vd-num"><input type="number" min="0" inputmode="numeric" class="vd-inv-cont" value="' + contado + '" data-manual="' + (s ? 1 : 0) + '"' + (editavel ? '' : ' disabled') + '></td>' +
        '<td class="vd-num vd-inv-dif">0</td>';

      ['.vd-inv-ant', '.vd-inv-ent'].forEach(function(sel) {
        tr.querySelector(sel).addEventListener('input', function() { _dirtyI = true; _recalcInv(); });
      });
      tr.querySelector('.vd-inv-cont').addEventListener('input', function(e) {
        e.target.dataset.manual = '1';
        _dirtyI = true;
        _recalcInv();
      });
      tbody.appendChild(tr);
    });

    var btn = document.getElementById('vdBtnGuardarInv');
    if (btn) {
      btn.style.display = (editavel && lista.length) ? '' : 'none';
      document.getElementById('vdBtnGuardarInvTxt').textContent =
        fechado ? 'Guardar alterações' : 'Submeter e fechar inventário';
    }
    _recalcInv();
  }

  function _recalcInv() {
    document.querySelectorAll('#vdInvBody tr').forEach(function(tr) {
      var ant = _num(tr.querySelector('.vd-inv-ant').value);
      var ent = _num(tr.querySelector('.vd-inv-ent').value);
      var ven = parseInt(tr.querySelector('.vd-inv-ven').dataset.v, 10) || 0;
      var teo = ant + ent - ven;
      var inpC = tr.querySelector('.vd-inv-cont');
      tr.querySelector('.vd-inv-teo').textContent = teo;
      if (inpC.dataset.manual !== '1') inpC.value = Math.max(0, teo);
      var dif = _num(inpC.value) - teo;
      var td  = tr.querySelector('.vd-inv-dif');
      td.textContent = (dif > 0 ? '+' : '') + dif;
      td.className   = 'vd-num vd-inv-dif' + (dif < 0 ? ' neg' : (dif > 0 ? ' pos' : ''));
    });
  }

  function guardarInventario() {
    var fechado = !!(_docI && _docI.fechado);
    if (fechado && !_isAdmin) return;

    var itens = {};
    document.querySelectorAll('#vdInvBody tr').forEach(function(tr) {
      var ant = _num(tr.querySelector('.vd-inv-ant').value);
      var ent = _num(tr.querySelector('.vd-inv-ent').value);
      var ven = parseInt(tr.querySelector('.vd-inv-ven').dataset.v, 10) || 0;
      itens[tr.dataset.id] = {
        anterior: ant, entradas: ent, vendas: ven,
        teorico: ant + ent - ven,
        contado: _num(tr.querySelector('.vd-inv-cont').value),
        preco: parseFloat(tr.dataset.preco) || 0
      };
    });
    if (!Object.keys(itens).length) return;

    if (!fechado && !confirm('Submeter o inventário de ' + _mesLegivel(_mes) +
        '? Depois de submetido só os administradores o podem alterar.')) return;

    var dados = {
      local: _local, mes: _mes, fechado: true, itens: itens,
      registadoPor: _docI ? _docI.registadoPor : _email(),
      registadoEm:  (_docI && _docI.registadoEm) ? _docI.registadoEm : _ts()
    };
    if (_docI) { dados.editadoPor = _email(); dados.editadoEm = _ts(); }

    var btn = document.getElementById('vdBtnGuardarInv');
    if (btn) btn.disabled = true;

    db.collection('vendas_inventarios').doc(_idDoc(_local, _mes)).set(dados)
      .then(function() {
        if (btn) btn.disabled = false;
        _docI = { local: _local, mes: _mes, fechado: true, itens: itens,
                  registadoPor: dados.registadoPor, registadoEm: _docI ? _docI.registadoEm : new Date() };
        _dirtyI = false;
        mostrarToast('✓ Inventário guardado.', 'sucesso');
        _renderInventario();
      })
      .catch(function(err) {
        if (btn) btn.disabled = false;
        mostrarToast('Erro ao guardar: ' + err.message, 'erro');
      });
  }

  // ============================================================
  // MODELOS PDF / EXCEL (formulários em branco)
  // ============================================================

  function _carregado() {
    if (!_local || !_mes) { mostrarToast('Carregue primeiro um local e um mês.', 'erro'); return false; }
    return true;
  }

  function _modeloPdf(tipo) {
    if (!_carregado()) return;
    if (!window.jspdf || !window.jspdf.jsPDF) { mostrarToast('Biblioteca de PDF não carregada.', 'erro'); return; }

    var vendas = tipo === 'vendas';
    var doc = new window.jspdf.jsPDF({ orientation: vendas ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    var W = vendas ? 297 : 210;
    var n = _diasNoMes(_mes);

    doc.setFillColor(139, 74, 43);
    doc.rect(0, 0, W, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(vendas ? 'Registo Diario de Vendas' : 'Inventario Mensal', 10, 7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text('Municipio de Reguengos de Monsaraz  -  ' + _local + '  -  ' + _mesLegivel(_mes), 10, 12.5);
    doc.setTextColor(44, 44, 44);

    var estilo = {
      theme: 'grid', startY: 21, margin: { left: 8, right: 8 },
      headStyles: { fillColor: [139, 74, 43], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 245, 239] }
    };

    if (vendas) {
      var head = ['Artigo', 'Preco (EUR)'];
      for (var d = 1; d <= n; d++) head.push(String(d));
      head.push('Qtd', 'Valor');
      var corpo = _artigosLocal.map(function(a) {
        var l = [a.nome, (a.preco || 0).toFixed(2)];
        for (var i = 0; i < n; i++) l.push('');
        l.push('', '');
        return l;
      });
      var tot = ['Total do dia (EUR)', ''];
      for (var j = 0; j < n + 2; j++) tot.push('');
      corpo.push(tot);

      var cols = { 0: { cellWidth: 48 }, 1: { cellWidth: 14 } };
      for (var c = 2; c < n + 2; c++) cols[c] = { cellWidth: 6 };
      cols[n + 2] = { cellWidth: 11 }; cols[n + 3] = { cellWidth: 13 };
      doc.autoTable(Object.assign({}, estilo, {
        head: [head], body: corpo, columnStyles: cols,
        styles: { fontSize: 6.5, cellPadding: 0.8, minCellHeight: 7, lineColor: [200, 185, 170], lineWidth: 0.2 }
      }));
    } else {
      doc.autoTable(Object.assign({}, estilo, {
        head: [['Artigo', 'Stock anterior', 'Entradas', 'Vendas', 'Stock teorico', 'Contagem', 'Diferenca']],
        body: _artigosLocal.map(function(a) { return [a.nome, '', '', '', '', '', '']; }),
        styles: { fontSize: 8, cellPadding: 2, minCellHeight: 9, lineColor: [200, 185, 170], lineWidth: 0.2 }
      }));
      var y = doc.lastAutoTable.finalY + 14;
      doc.setFontSize(8);
      doc.text('Responsavel:', 10, y); doc.line(30, y, 120, y);
      doc.text('Data:', 130, y);       doc.line(140, y, 195, y);
    }

    doc.save('Modelo-' + (vendas ? 'Vendas' : 'Inventario') + '-' + _mes + '.pdf');
  }

  function _ws(aoa, larguras) {
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var maxC = 0;
    aoa.forEach(function(r) { if (r.length > maxC) maxC = r.length; });
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: maxC - 1 } });
    if (larguras) ws['!cols'] = larguras;
    return ws;
  }
  function _celF(ws, r, c, f) { ws[XLSX.utils.encode_cell({ r: r, c: c })] = { t: 'n', f: f }; }
  function _ref(r, c) { return XLSX.utils.encode_cell({ r: r, c: c }); }

  function _modeloExcel(tipo) {
    if (!_carregado()) return;
    if (typeof XLSX === 'undefined') { mostrarToast('Biblioteca Excel não carregada.', 'erro'); return; }

    var n  = _diasNoMes(_mes), nA = _artigosLocal.length;
    var wb = XLSX.utils.book_new(), ws;

    if (tipo === 'vendas') {
      var head = ['Artigo', 'Preço (€)'];
      for (var d = 1; d <= n; d++) head.push(d);
      head.push('Total qtd', 'Total €');
      var aoa = [head];
      _artigosLocal.forEach(function(a) {
        var l = [a.nome, a.preco || 0];
        for (var i = 0; i < n + 2; i++) l.push(null);
        aoa.push(l);
      });
      var tot = ['Total do dia (€)'];
      for (var k = 0; k < n + 3; k++) tot.push(null);
      aoa.push(tot);

      var larg = [{ wch: 32 }, { wch: 10 }];
      for (var w = 0; w < n; w++) larg.push({ wch: 4 });
      larg.push({ wch: 10 }, { wch: 12 });
      ws = _ws(aoa, larg);

      for (var r = 1; r <= nA; r++) {
        _celF(ws, r, n + 2, 'SUM(' + _ref(r, 2) + ':' + _ref(r, n + 1) + ')');
        _celF(ws, r, n + 3, _ref(r, 1) + '*' + _ref(r, n + 2));
      }
      for (var c = 2; c <= n + 1; c++) {
        _celF(ws, nA + 1, c, 'SUMPRODUCT($B$2:$B$' + (nA + 1) + ',' + _ref(1, c) + ':' + _ref(nA, c) + ')');
      }
      _celF(ws, nA + 1, n + 3, 'SUM(' + _ref(1, n + 3) + ':' + _ref(nA, n + 3) + ')');
      XLSX.utils.book_append_sheet(wb, ws, 'Vendas');
    } else {
      var aoaI = [['Artigo', 'Stock anterior', 'Entradas', 'Vendas', 'Stock teórico', 'Contagem', 'Diferença']];
      _artigosLocal.forEach(function(a) { aoaI.push([a.nome, null, null, null, null, null, null]); });
      ws = _ws(aoaI, [{ wch: 32 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }]);
      for (var r2 = 1; r2 <= nA; r2++) {
        _celF(ws, r2, 4, _ref(r2, 1) + '+' + _ref(r2, 2) + '-' + _ref(r2, 3));
        _celF(ws, r2, 6, _ref(r2, 5) + '-' + _ref(r2, 4));
      }
      XLSX.utils.book_append_sheet(wb, ws, 'Inventário');
    }
    XLSX.writeFile(wb, 'Modelo-' + (tipo === 'vendas' ? 'Vendas' : 'Inventario') + '-' + _mes + '.xlsx');
  }

  // ============================================================
  // EXPORTAÇÃO MENSAL DOS REGISTOS (Excel)
  // ============================================================

  function _exportarExcel(todos) {
    if (typeof XLSX === 'undefined') { mostrarToast('Biblioteca Excel não carregada.', 'erro'); return; }
    var mes = todos ? ((document.getElementById('vdMes') || {}).value || '') : _mes;
    var locais = todos ? _config.locais.slice() : (_local ? [_local] : []);
    if (!mes || !locais.length) { mostrarToast('Carregue primeiro um local e um mês.', 'erro'); return; }

    mostrarToast('A preparar o ficheiro Excel...', 'info');

    Promise.all(locais.map(function(l) {
      return Promise.all([
        db.collection('vendas_registos').doc(_idDoc(l, mes)).get(),
        db.collection('vendas_inventarios').doc(_idDoc(l, mes)).get()
      ]).then(function(r) {
        return { local: l, v: r[0].exists ? r[0].data() : null, i: r[1].exists ? r[1].data() : null };
      });
    })).then(function(res) {
      var wb = XLSX.utils.book_new();
      res.forEach(function(x) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(_aoaVendas(x.local, mes, x.v)), ('V ' + x.local).substring(0, 31));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(_aoaInventario(x.i)), ('I ' + x.local).substring(0, 31));
      });
      var nome = 'Vendas-Inventario-' + (todos ? 'todos-os-locais' : locais[0].replace(/\s+/g, '-')) + '-' + mes + '.xlsx';
      XLSX.writeFile(wb, nome);
    }).catch(function(err) {
      mostrarToast('Erro ao exportar: ' + err.message, 'erro');
    });
  }

  function _aoaVendas(local, mes, docV) {
    var n = _diasNoMes(mes), dias = (docV && docV.dias) || {};
    var ids = {};
    _artigosDoLocal(local).forEach(function(a) { ids[a.id] = true; });
    Object.keys(dias).forEach(function(k) {
      Object.keys(dias[k].itens || {}).forEach(function(id) { ids[id] = true; });
    });
    var lista = Object.keys(ids).map(_artigoPorId)
      .sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); });

    var head = ['Artigo', 'Preço atual (€)'];
    for (var d = 1; d <= n; d++) head.push(d);
    head.push('Total qtd', 'Total €');
    var aoa = [head];

    lista.forEach(function(a) {
      var l = [a.nome, a.preco || 0], sQ = 0, sV = 0;
      for (var d2 = 1; d2 <= n; d2++) {
        var dia = dias['d' + _pad(d2)];
        var it  = dia && dia.itens && dia.itens[a.id];
        l.push(it ? it.q : null);
        if (it) { sQ += it.q; sV += it.q * it.p; }
      }
      l.push(sQ, Math.round(sV * 100) / 100);
      aoa.push(l);
    });

    var tot = ['Total do dia (€)', null], gT = 0;
    for (var d3 = 1; d3 <= n; d3++) {
      var dd = dias['d' + _pad(d3)];
      tot.push(dd ? dd.totalValor : null);
      if (dd) gT += dd.totalValor || 0;
    }
    tot.push(null, Math.round(gT * 100) / 100);
    aoa.push(tot);
    return aoa;
  }

  function _aoaInventario(docI) {
    if (!docI) return [['Sem inventário submetido para este mês.']];
    var aoa = [['Artigo', 'Stock anterior', 'Entradas', 'Vendas', 'Stock teórico', 'Contagem', 'Diferença', 'Preço (€)', 'Valor em stock (€)']];
    var itens = docI.itens || {};
    Object.keys(itens).map(_artigoPorId)
      .sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); })
      .forEach(function(a) {
        var s = itens[a.id];
        aoa.push([a.nome, s.anterior, s.entradas, s.vendas, s.teorico, s.contado,
                  s.contado - s.teorico, s.preco, Math.round(s.contado * s.preco * 100) / 100]);
      });
    aoa.push([]);
    aoa.push(['Submetido por', docI.registadoPor || '', 'em', _formatarTs(docI.registadoEm)]);
    return aoa;
  }

  // ============================================================
  // CONFIGURAÇÃO (admin)
  // ============================================================

  function _renderConfig() {
    if (!_isAdmin) return;
    _renderCfgLocais();
    _renderCfgArtigos();
    _renderCfgListas();
  }

  function _renderCfgLocais() {
    var el = document.getElementById('vdCfgLocais');
    if (!el) return;
    el.innerHTML = _todosLocais().map(function(l) {
      return '<label class="vd-check"><input type="checkbox" value="' + _esc(l) + '"' +
             (_config.locais.indexOf(l) !== -1 ? ' checked' : '') + '><span>' + _esc(l) + '</span></label>';
    }).join('');
  }

  function guardarLocais() {
    if (!_isAdmin) return;
    var sel = [];
    document.querySelectorAll('#vdCfgLocais input:checked').forEach(function(i) { sel.push(i.value); });
    db.collection('vendas_config').doc('locais')
      .set({ locais: sel, atualizadoEm: _ts(), atualizadoPor: _email() })
      .then(function() {
        _config.locais = sel;
        _popularLocais();
        mostrarToast('✓ Locais guardados.', 'sucesso');
      })
      .catch(function(err) { mostrarToast('Erro: ' + err.message, 'erro'); });
  }

  function _renderCfgArtigos() {
    var tbody = document.getElementById('vdCfgArtigosBody');
    if (!tbody) return;
    if (!_artigos.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="vd-vazio">Sem artigos. Crie o primeiro com "Novo artigo".</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    _artigos.forEach(function(a) {
      var ativo = a.ativo !== false;
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + _esc(a.nome) + '</td>' +
        '<td class="vd-num">' + _eur(a.preco) + '</td>' +
        '<td>' + (ativo ? '<span class="vd-tag ok">Ativo</span>' : '<span class="vd-tag off">Arquivado</span>') + '</td>' +
        '<td class="vd-td-acoes"></td>';
      var td = tr.querySelector('.vd-td-acoes');
      td.appendChild(_btnIcone('edit', 'Editar', function() { abrirArtigo(a.id); }));
      td.appendChild(_btnIcone(ativo ? 'archive' : 'unarchive', ativo ? 'Arquivar' : 'Reativar', function() { alternarArtigo(a.id); }));
      tbody.appendChild(tr);
    });
  }

  function _btnIcone(icone, titulo, fn) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'vd-btn-icone'; b.title = titulo;
    b.innerHTML = '<span class="material-symbols-rounded">' + icone + '</span>';
    b.addEventListener('click', fn);
    return b;
  }

  function abrirArtigo(id) {
    _editArtigoId = id;
    var a = id ? _artigos.find(function(x) { return x.id === id; }) : null;
    document.getElementById('vdModalArtigoTitulo').textContent = a ? 'Editar artigo' : 'Novo artigo';
    document.getElementById('vdArtNome').value  = a ? a.nome : '';
    document.getElementById('vdArtPreco').value = a ? String(a.preco || 0).replace('.', ',') : '';
    document.getElementById('vdModalArtigo').classList.add('show');
    document.getElementById('vdArtNome').focus();
  }

  function guardarArtigo() {
    if (!_isAdmin) return;
    var nome  = (document.getElementById('vdArtNome').value || '').trim();
    var preco = parseFloat((document.getElementById('vdArtPreco').value || '0').replace(',', '.'));
    if (!nome)                   { mostrarToast('O nome é obrigatório.', 'erro'); return; }
    if (isNaN(preco) || preco < 0) { mostrarToast('Preço inválido.', 'erro'); return; }
    preco = Math.round(preco * 100) / 100;

    var op = _editArtigoId
      ? db.collection('vendas_artigos').doc(_editArtigoId).update({ nome: nome, preco: preco, atualizadoEm: _ts() })
      : db.collection('vendas_artigos').add({ nome: nome, preco: preco, ativo: true, criadoEm: _ts(), criadoPor: _email() });

    op.then(function() {
      fecharModais();
      mostrarToast('✓ Artigo guardado.', 'sucesso');
      return _recarregarArtigos();
    }).catch(function(err) { mostrarToast('Erro: ' + err.message, 'erro'); });
  }

  function alternarArtigo(id) {
    var a = _artigos.find(function(x) { return x.id === id; });
    if (!a) return;
    var ativo = a.ativo !== false;
    if (ativo && !confirm('Arquivar este artigo? Deixa de aparecer nos formulários, mas o histórico é preservado.')) return;
    db.collection('vendas_artigos').doc(id).update({ ativo: !ativo, atualizadoEm: _ts() })
      .then(_recarregarArtigos)
      .catch(function(err) { mostrarToast('Erro: ' + err.message, 'erro'); });
  }

  function _recarregarArtigos() {
    return db.collection('vendas_artigos').get().then(function(s) {
      _artigos = [];
      s.forEach(function(d) { var x = d.data(); x.id = d.id; _artigos.push(x); });
      _artigos.sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); });
      _renderCfgArtigos();
      _renderCfgListas();
    });
  }

  function _recarregarListas() {
    return db.collection('vendas_listas').get().then(function(s) {
      _listas = [];
      s.forEach(function(d) { var x = d.data(); x.id = d.id; _listas.push(x); });
      _renderCfgListas();
    });
  }

  function _renderCfgListas() {
    var el = document.getElementById('vdCfgListas');
    if (!el) return;
    if (!_listas.length) { el.innerHTML = '<div class="vd-vazio">Sem listas. Crie a primeira com "Nova lista".</div>'; return; }
    el.innerHTML = '';
    _listas.slice().sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); })
      .forEach(function(l) {
        var div = document.createElement('div');
        div.className = 'vd-lista-item';
        div.innerHTML =
          '<div class="vd-lista-info">' +
            '<div class="vd-lista-nome">' + _esc(l.nome) + '</div>' +
            '<div class="vd-lista-meta">' + (l.artigos || []).length + ' artigo(s)</div>' +
            '<div class="vd-chips">' + (l.locais || []).map(function(x) { return '<span class="vd-chip">' + _esc(x) + '</span>'; }).join('') + '</div>' +
          '</div><div class="vd-td-acoes"></div>';
        var ac = div.querySelector('.vd-td-acoes');
        ac.appendChild(_btnIcone('edit', 'Editar', function() { abrirLista(l.id); }));
        ac.appendChild(_btnIcone('delete', 'Eliminar', function() { eliminarLista(l.id); }));
        el.appendChild(div);
      });
  }

  function abrirLista(id) {
    _editListaId = id;
    var l = id ? _listas.find(function(x) { return x.id === id; }) : null;
    document.getElementById('vdModalListaTitulo').textContent = l ? 'Editar lista' : 'Nova lista';
    document.getElementById('vdListaNome').value = l ? l.nome : '';

    var artSel = l ? (l.artigos || []) : [];
    var locSel = l ? (l.locais  || []) : [];
    var arts = _artigos.filter(function(a) { return a.ativo !== false || artSel.indexOf(a.id) !== -1; });

    document.getElementById('vdListaArtigos').innerHTML = arts.length
      ? arts.map(function(a) {
          return '<label class="vd-check"><input type="checkbox" value="' + _esc(a.id) + '"' +
                 (artSel.indexOf(a.id) !== -1 ? ' checked' : '') + '><span>' + _esc(a.nome) + ' · ' + _eur(a.preco) + '</span></label>';
        }).join('')
      : '<div class="vd-vazio">Crie primeiro alguns artigos.</div>';

    document.getElementById('vdListaLocais').innerHTML = _config.locais.length
      ? _config.locais.map(function(x) {
          return '<label class="vd-check"><input type="checkbox" value="' + _esc(x) + '"' +
                 (locSel.indexOf(x) !== -1 ? ' checked' : '') + '><span>' + _esc(x) + '</span></label>';
        }).join('')
      : '<div class="vd-vazio">Escolha primeiro os locais com vendas.</div>';

    document.getElementById('vdModalLista').classList.add('show');
    document.getElementById('vdListaNome').focus();
  }

  function guardarLista() {
    if (!_isAdmin) return;
    var nome = (document.getElementById('vdListaNome').value || '').trim();
    var arts = [], locs = [];
    document.querySelectorAll('#vdListaArtigos input:checked').forEach(function(i) { arts.push(i.value); });
    document.querySelectorAll('#vdListaLocais input:checked').forEach(function(i) { locs.push(i.value); });
    if (!nome)        { mostrarToast('O nome da lista é obrigatório.', 'erro'); return; }
    if (!arts.length) { mostrarToast('Escolha pelo menos um artigo.', 'erro'); return; }
    if (!locs.length) { mostrarToast('Escolha pelo menos um local.', 'erro'); return; }

    var op = _editListaId
      ? db.collection('vendas_listas').doc(_editListaId).update({ nome: nome, artigos: arts, locais: locs, atualizadoEm: _ts() })
      : db.collection('vendas_listas').add({ nome: nome, artigos: arts, locais: locs, ativo: true, criadoEm: _ts(), criadoPor: _email() });

    op.then(function() {
      fecharModais();
      mostrarToast('✓ Lista guardada.', 'sucesso');
      return _recarregarListas();
    }).catch(function(err) { mostrarToast('Erro: ' + err.message, 'erro'); });
  }

  function eliminarLista(id) {
    if (!_isAdmin) return;
    if (!confirm('Eliminar esta lista? Os registos já feitos não são afetados.')) return;
    db.collection('vendas_listas').doc(id).delete()
      .then(_recarregarListas)
      .catch(function(err) { mostrarToast('Erro: ' + err.message, 'erro'); });
  }

  function fecharModais() {
    ['vdModalArtigo', 'vdModalLista'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove('show');
    });
    _editArtigoId = null; _editListaId = null;
  }

  // ============================================================
  // API PÚBLICA + REGISTO DA VIEW
  // ============================================================

  window.__vendas = {
    fecharModais: fecharModais,
    guardarArtigo: guardarArtigo,
    guardarLista: guardarLista
  };

  window.__views = window.__views || {};
  window.__views.vendas = { mount: mount, beforeLeave: beforeLeave, unmount: unmount };

})();
