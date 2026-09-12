// ============================================================
// editor.js — Editor Mensal de Dados
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
//
// Acesso: administradores ou utilizadores com acessoEditor: true
// ============================================================

'use strict';

var _perfilAtual     = null;
var _isAdmin         = false;
var _isEditor        = false;
var _appInicializada = false;

var _localAtual      = '';
var _mesAtual        = '';   // 'YYYY-MM'
var _dadosMes        = {};   // { 'DD/MM/YYYY': { pais: valor, ... } }
var _alteracoes      = {};   // { 'DD/MM/YYYY': { pais: valor, ... } }
var _totalAlteracoes = 0;

var DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

var _conflitosDoMes  = {};   // { 'DD/MM/YYYY': { id, payloadNovo, payloadExistente, ... } }
var _conflitoActivo  = null; // conflito aberto no modal

var _dadosExtras      = {};  // { 'DD/MM/YYYY': { operadores, sugestoes, observacoes } }
var _alteracoesExtras = {};  // { 'DD/MM/YYYY': { operadores, sugestoes, observacoes } }
var _diaModalActivo   = null;
var _modoModalExtras  = null;

// ============================================================
// HELPER — verifica se o perfil tem acesso ao editor
// ============================================================
function _temAcessoEditor(perfil) {
  return perfil.role === 'administrador' || perfil.acessoEditor === true;
}

// ============================================================
// ARRANQUE
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
  // Preencher o mês actual no input
  var hoje   = new Date();
  var mesStr = hoje.getFullYear() + '-' +
               String(hoje.getMonth() + 1).padStart(2, '0');
  var inputMes = document.getElementById('inputMes');
  if (inputMes) inputMes.value = mesStr;

  inicializarLogin({
    idWrap:            'editorWrap',
    verificarAcesso:   function(perfil) {
      return _temAcessoEditor(perfil);
    },
    mensagemSemAcesso: 'Acesso negado. Não tem permissão para aceder ao editor mensal.',
    onSucesso:         function(perfil) {
      _perfilAtual = perfil;
      _isAdmin     = perfil.role === 'administrador';
      _isEditor    = true;
      activarEditor(perfil);
    },
    onSessaoTerminada: function() {
      _appInicializada = false;
    }
  });
});

function fazerLogout() {
  logout(_totalAlteracoes > 0);
}


// ============================================================
// ACTIVAR
// ============================================================

function activarEditor(perfil) {
  var elNome = document.getElementById('headerNomeFuncionario');
  if (elNome) elNome.textContent = perfil.nome || perfil.email || '—';

  var badgeModo = document.getElementById('badgeModo');
  if (badgeModo) {
    badgeModo.className   = 'modo-badge ' + (_isAdmin ? 'admin' : 'editor');
    badgeModo.textContent = _isAdmin ? '🛡️ Administrador' : '✏️ Editor';
  }

  if (typeof construirMenuNav === 'function') construirMenuNav(perfil);

  _appInicializada = true;
}

// ============================================================
// CARREGAR DADOS DO MÊS — 1 única chamada à Cloud Function
// ============================================================

function carregarMes() {
  var local = document.getElementById('selectorLocal').value;
  var mes   = document.getElementById('inputMes').value;  // 'YYYY-MM'

  if (!local) {
    mostrarToast('Escolha um local / posto.', 'erro');
    document.getElementById('selectorLocal').focus();
    return;
  }
  if (!mes) {
    mostrarToast('Escolha o mês.', 'erro');
    document.getElementById('inputMes').focus();
    return;
  }
  if (_totalAlteracoes > 0) {
    if (!confirm('Tem alterações por guardar. Se continuar serão perdidas. Continuar?')) return;
  }

  _localAtual      = local;
  _mesAtual        = mes;
  _dadosMes        = {};
  _alteracoes      = {};
  _totalAlteracoes = 0;
  atualizarBarraAlteracoes();

  var cardExtras = document.getElementById('secaoExtras');
  if (cardExtras) cardExtras.style.display = 'none';
  
  mostrarGrelhaLoading(true);

  // Uma única chamada que devolve todos os dias do mês de uma vez
  Promise.all([
    chamarAPI('obterDadosMes',   { local: local, mes: mes }),
    chamarAPI('obterConflitos',  { local: local, mes: mes })
  ])
.then(function(resultados) {
  mostrarGrelhaLoading(false);
  var respDados     = resultados[0];
  var respConflitos = resultados[1];

  if (!respDados.sucesso) {
    mostrarToast('Erro: ' + respDados.mensagem, 'erro');
    return;
  }

  _dadosMes       = respDados.dados          || {};
  _dadosExtras    = respDados.extras   || {};
  _alteracoesExtras = {};

  _conflitosDoMes = (respConflitos.sucesso ? respConflitos.conflitos : {}) || {};

  if (!respConflitos.sucesso) {
    console.error('Erro ao obter conflitos:', respConflitos);
    _conflitosDoMes = {};
  } else {
    _conflitosDoMes = respConflitos.conflitos || {};
    _alteracoesExtras = {};
  }

  var partes  = mes.split('-');
  var ano     = parseInt(partes[0], 10);
  var mesNum  = parseInt(partes[1], 10);
  var numDias = new Date(ano, mesNum, 0).getDate();

  construirGrelha(local, ano, mesNum, numDias);
  construirTabelaExtras(ano, mesNum, numDias);
  atualizarBadgeConflitos();
})
    .catch(function(err) {
      mostrarGrelhaLoading(false);
      mostrarToast('Erro ao carregar dados: ' + err.message, 'erro');
    });
}

// ============================================================
// CONSTRUIR A GRELHA
// ============================================================

function construirGrelha(local, ano, mesNum, numDias) {
  var wrapper = document.getElementById('grelhaWrapper');
  wrapper.innerHTML = '';

  var simples    = (typeof modoSimplificado === 'function') && modoSimplificado(local);
  var listaPais  = simples ? PAISES_SIMPLES : PAISES;

  var hoje     = new Date();
  var hojeAno  = hoje.getFullYear();
  var hojesMes = hoje.getMonth() + 1;
  var hojesDia = hoje.getDate();

  var tabela = document.createElement('table');
  tabela.className = 'grelha-tabela';
  tabela.setAttribute('role', 'grid');

  // ── CABEÇALHO ────────────────────────────────────────────
  var thead  = document.createElement('thead');
  var trHead = document.createElement('tr');

  var thPais = document.createElement('th');
  thPais.className = 'th-pais';
  thPais.setAttribute('scope', 'col');
  var thPaisInner = document.createElement('div');
  thPaisInner.className = 'th-pais-inner';
  thPaisInner.textContent = simples ? 'Tipo de Visitante' : 'País / Região';
  thPais.appendChild(thPaisInner);
  trHead.appendChild(thPais);

  for (var d = 1; d <= numDias; d++) {
    var dataObj = new Date(ano, mesNum - 1, d);
    var diaSem  = dataObj.getDay();
    var ehFDS   = diaSem === 0 || diaSem === 6;
    var ehHoje  = (ano === hojeAno && mesNum === hojesMes && d === hojesDia);

    var th = document.createElement('th');
    th.className = 'th-dia' + (ehFDS ? ' fim-semana' : '') + (ehHoje ? ' hoje' : '');
    th.setAttribute('scope', 'col');

    var inner = document.createElement('div');
    inner.className = 'th-dia-inner';
    var numEl = document.createElement('span');
    numEl.className   = 'th-dia-num';
    numEl.textContent = d;
    var semEl = document.createElement('span');
    semEl.className   = 'th-dia-sem';
    semEl.textContent = DIAS_SEM[diaSem];
    inner.appendChild(numEl);
    inner.appendChild(semEl);
    th.appendChild(inner);
    trHead.appendChild(th);
  }

  var thTot = document.createElement('th');
  thTot.className = 'th-total';
  thTot.setAttribute('scope', 'col');
  var thTotInner = document.createElement('div');
  thTotInner.className  = 'th-total-inner';
  thTotInner.textContent = 'Total';
  thTot.appendChild(thTotInner);
  trHead.appendChild(thTot);

  thead.appendChild(trHead);
  tabela.appendChild(thead);

  // ── CORPO ─────────────────────────────────────────────────
  var tbody          = document.createElement('tbody');
  var paisesDestaque = listaPais.filter(function(p) { return p.destaque; });
  var paisesResto    = listaPais.filter(function(p) { return !p.destaque; });
  var totaisDia      = {};

  function adicionarLinhaPais(pais, isDestaque) {
    var tr = document.createElement('tr');
    tr.dataset.pais = pais.nome;
    if (isDestaque) tr.classList.add('linha-destaque');

    var tdPais = document.createElement('td');
    tdPais.className   = 'td-pais';
    tdPais.textContent = pais.nome;
    tdPais.title       = pais.nome;
    tr.appendChild(tdPais);

    var totalLinha = 0;

    for (var d = 1; d <= numDias; d++) {
      var dataFmt = String(d).padStart(2, '0') + '/' +
                    String(mesNum).padStart(2, '0') + '/' + ano;
      var dObj  = new Date(ano, mesNum - 1, d);
      var dSem  = dObj.getDay();
      var eFDS  = dSem === 0 || dSem === 6;
      var eHoje = (ano === hojeAno && mesNum === hojesMes && d === hojesDia);

      var valor = (_dadosMes[dataFmt] && _dadosMes[dataFmt][pais.nome])
                  ? (_dadosMes[dataFmt][pais.nome] || 0) : 0;
      totalLinha        += valor;
      totaisDia[d]       = (totaisDia[d] || 0) + valor;

      var td = document.createElement('td');
      td.className = 'td-valor' +
                     (eFDS  ? ' fim-semana' : '') +
                     (eHoje ? ' hoje-col'   : '');

      var inp = document.createElement('input');
      inp.type       = 'number';
      inp.inputMode  = 'numeric';
      inp.min        = '0';
      inp.className  = 'cel-input' + (valor > 0 ? ' tem-valor' : '');
      inp.value      = valor > 0 ? String(valor) : '';
      inp.placeholder = '0';
      inp.dataset.data = dataFmt;
      inp.dataset.pais = pais.nome;
      inp.setAttribute('aria-label', pais.nome + ' — dia ' + d);

      inp.addEventListener('change',  function(e) { onCelChange(e.target); });
      inp.addEventListener('keydown', function(e) { onCelKeydown(e); });
      inp.addEventListener('focus',   function(e) { e.target.select(); });

      td.appendChild(inp);
      tr.appendChild(td);
    }

    var tdTot = document.createElement('td');
    tdTot.className          = 'td-total';
    tdTot.dataset.paisTotal  = pais.nome;
    tdTot.textContent        = totalLinha > 0 ? totalLinha : '—';
    tr.appendChild(tdTot);

    tbody.appendChild(tr);
  }

  paisesDestaque.forEach(function(p) { adicionarLinhaPais(p, true); });

  if (!simples && paisesResto.length > 0) {
    var trSep = document.createElement('tr');
    trSep.className = 'linha-separador';
    var tdSep = document.createElement('td');
    tdSep.colSpan = numDias + 2;
    trSep.appendChild(tdSep);
    tbody.appendChild(trSep);
  }

  paisesResto.forEach(function(p) { adicionarLinhaPais(p, false); });

  // ── Linha de totais por dia ───────────────────────────────
  var trTotais = document.createElement('tr');
  trTotais.className = 'linha-totais';

  var tdTotLabel = document.createElement('td');
  tdTotLabel.className   = 'td-pais';
  tdTotLabel.textContent = 'Total do dia';
  trTotais.appendChild(tdTotLabel);

  var totalGeral = 0;
  for (var d = 1; d <= numDias; d++) {
    var t = totaisDia[d] || 0;
    totalGeral += t;
    var tdT = document.createElement('td');
    tdT.className        = 'td-valor';
    tdT.dataset.totalDia = d;
    tdT.style.cssText    = 'text-align:center;font-weight:700;font-size:var(--text-xs);color:' +
                           (t > 0 ? 'var(--verde)' : 'var(--cinza)');
    tdT.textContent = t > 0 ? t : '—';
    trTotais.appendChild(tdT);
  }

  var tdTotGeral = document.createElement('td');
  tdTotGeral.className   = 'td-total';
  tdTotGeral.id          = 'totalGeralGrelha';
  tdTotGeral.textContent = totalGeral > 0 ? totalGeral : '—';
  trTotais.appendChild(tdTotGeral);

  tbody.appendChild(trTotais);
  tabela.appendChild(tbody);
  wrapper.appendChild(tabela);

  if (Object.keys(_conflitosDoMes).length > 0) {
  _assinalarConflitosNaGrelha();
}

  

  var nomeMes = new Date(ano, mesNum - 1, 1)
    .toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  document.getElementById('grelhaInfoTexto').innerHTML =
    'A editar: <strong>' + esc(local) + '</strong> — <strong>' + nomeMes + '</strong>';
}

// ============================================================
// Construir Tabela de Operadores, Sugestões, etc
// ============================================================

function construirTabelaExtras(ano, mesNum, numDias) {
  var card = document.getElementById('secaoExtras');
  if (card) card.style.display = '';

  var tbody = document.getElementById('extrasTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  var hoje     = new Date();
  var hojeAno  = hoje.getFullYear();
  var hojesMes = hoje.getMonth() + 1;
  var hojesDia = hoje.getDate();

  for (var d = 1; d <= numDias; d++) {
    var dataFmt = String(d).padStart(2, '0') + '/' +
                  String(mesNum).padStart(2, '0') + '/' + ano;
    var dataObj = new Date(ano, mesNum - 1, d);
    var diaSem  = DIAS_SEM[dataObj.getDay()];
    var ehFDS   = dataObj.getDay() === 0 || dataObj.getDay() === 6;
    var ehHoje  = (ano === hojeAno && mesNum === hojesMes && d === hojesDia);

    var ext       = _dadosExtras[dataFmt] || {};
    var altExt    = _alteracoesExtras[dataFmt] || {};
    var ops       = altExt.operadores  !== undefined ? altExt.operadores  : (ext.operadores  || []);
    var sugs      = altExt.sugestoes   !== undefined ? altExt.sugestoes   : (ext.sugestoes   || []);
    var obs       = altExt.observacoes !== undefined ? altExt.observacoes : (ext.observacoes || '');
    var temConflito = !!(_conflitosDoMes[dataFmt]);
    var temAlt      = !!_alteracoesExtras[dataFmt];

    var chips = '';
    if (ops.length)  chips += '<span class="extras-chip chip-op">Operadores (' + ops.length + ')</span>';
    if (sugs.length) chips += '<span class="extras-chip chip-sug">Sugestões (' + sugs.length + ')</span>';
    if (obs)         chips += '<span class="extras-chip chip-obs">Observações</span>';
    if (temConflito) chips += '<span class="extras-chip chip-conflito">⚠️ Conflito</span>';
    if (temAlt)      chips += '<span class="extras-chip chip-alt">✏️ Por guardar</span>';

    var tr = document.createElement('tr');
    tr.className = (ehFDS ? 'extras-fds' : '') + (ehHoje ? ' extras-hoje' : '');
    tr.dataset.data = dataFmt;

    tr.innerHTML =
      '<td class="extras-td-data">' +
        '<span class="extras-dia-num">' + String(d).padStart(2, '0') + '</span>' +
        '<span class="extras-dia-sem">' + diaSem + '</span>' +
      '</td>' +
      '<td class="extras-td-chips">' +
        (chips || '<span class="extras-sem-dados">—</span>') +
      '</td>' +
      '<td class="extras-td-acao">' +
        '<button type="button" class="btn-editar-extras" data-data="' + dataFmt + '">' +
          '✏️ Editar' +
        '</button>' +
      '</td>';

    tr.querySelector('.btn-editar-extras').addEventListener('click', function() {
      abrirModalExtras(this.dataset.data, 'editar');
    });

    tbody.appendChild(tr);
  }
}

function _assinalarConflitosNaGrelha() {
  Object.keys(_conflitosDoMes).forEach(function(dataFmt) {
    var dia = parseInt(dataFmt.split('/')[0], 10);

    // Marcar cabeçalho do dia
    var ths = document.querySelectorAll('.th-dia');
    ths.forEach(function(th) {
      var numEl = th.querySelector('.th-dia-num');
      if (numEl && parseInt(numEl.textContent, 10) === dia) {
        th.classList.add('tem-conflito');
        th.style.cursor = 'pointer';
        th.title = 'Conflito pendente — clique para resolver';
        th.addEventListener('click', function() {
          abrirModalConflito(dataFmt);
        });
      }
    });

    // Marcar células com valores diferentes
    var conflito     = _conflitosDoMes[dataFmt];
    var paisesNovos  = (conflito.payloadNovo      || {}).paises || {};
    var paisesExist  = (conflito.payloadExistente || {}).paises || {};
    var todosPaises  = Object.keys(Object.assign({}, paisesNovos, paisesExist));

    todosPaises.forEach(function(pais) {
      if ((paisesNovos[pais] || 0) !== (paisesExist[pais] || 0)) {
        var inp = document.querySelector(
          '.cel-input[data-data="' + dataFmt + '"][data-pais="' + CSS.escape(pais) + '"]'
        );
        if (inp) inp.classList.add('celula-conflito');
      }
    });
  });
}

function _actualizarLinhaExtras(dataFmt) {
  var tr = document.querySelector('#extrasTableBody tr[data-data="' + dataFmt + '"]');
  if (!tr) return;

  var ext    = _dadosExtras[dataFmt]      || {};
  var altExt = _alteracoesExtras[dataFmt] || {};
  var ops    = altExt.operadores  !== undefined ? altExt.operadores  : (ext.operadores  || []);
  var sugs   = altExt.sugestoes   !== undefined ? altExt.sugestoes   : (ext.sugestoes   || []);
  var obs    = altExt.observacoes !== undefined ? altExt.observacoes : (ext.observacoes || '');
  var temConflito = !!(_conflitosDoMes[dataFmt]);
  var temAlt      = !!_alteracoesExtras[dataFmt];

  var chips = '';
  if (ops.length)  chips += '<span class="extras-chip chip-op">Operadores (' + ops.length + ')</span>';
  if (sugs.length) chips += '<span class="extras-chip chip-sug">Sugestões (' + sugs.length + ')</span>';
  if (obs)         chips += '<span class="extras-chip chip-obs">Observações</span>';
  if (temConflito) chips += '<span class="extras-chip chip-conflito">⚠️ Conflito</span>';
  if (temAlt)      chips += '<span class="extras-chip chip-alt">✏️ Por guardar</span>';

  var tdChips = tr.querySelector('.extras-td-chips');
  if (tdChips) tdChips.innerHTML = chips || '<span class="extras-sem-dados">—</span>';
}

// ============================================================
// EVENTOS DE CÉLULA
// ============================================================

function onCelChange(inp) {
  var data  = inp.dataset.data;
  var pais  = inp.dataset.pais;
  var valor = Math.max(0, parseInt(inp.value, 10) || 0);

  inp.value = valor > 0 ? String(valor) : '';
  inp.classList.toggle('tem-valor', valor > 0);

  var original = (_dadosMes[data] && _dadosMes[data][pais]) || 0;
  var alterado = (valor !== original);
  inp.classList.toggle('alterada', alterado);

  if (!_alteracoes[data]) _alteracoes[data] = {};
  if (alterado) {
    _alteracoes[data][pais] = valor;
  } else {
    delete _alteracoes[data][pais];
    if (Object.keys(_alteracoes[data]).length === 0) delete _alteracoes[data];
  }

  recalcularTotalLinha(pais);
  recalcularTotalDia(data);
  recalcularTotalGeral();

  _totalAlteracoes = contarAlteracoes();
  atualizarBarraAlteracoes();
}

function onCelKeydown(e) {
  var inp    = e.target;
  var tr     = inp.closest('tr');
  var tabela = inp.closest('table');
  if (!tabela) return;

  var linhas  = Array.from(tabela.querySelectorAll('tbody tr:not(.linha-separador):not(.linha-totais)'));
  var trIdx   = linhas.indexOf(tr);
  var celulas = Array.from(tr.querySelectorAll('.cel-input'));
  var celIdx  = celulas.indexOf(inp);
  var alvo    = null;

  if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
    e.preventDefault();
    alvo = celulas[celIdx + 1] || null;
    if (!alvo && linhas[trIdx + 1]) alvo = linhas[trIdx + 1].querySelector('.cel-input');
  } else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
    e.preventDefault();
    alvo = celulas[celIdx - 1] || null;
    if (!alvo && linhas[trIdx - 1]) {
      var prev = linhas[trIdx - 1].querySelectorAll('.cel-input');
      alvo = prev[prev.length - 1] || null;
    }
  } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
    e.preventDefault();
    if (linhas[trIdx + 1]) {
      alvo = linhas[trIdx + 1].querySelectorAll('.cel-input')[celIdx] || null;
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (trIdx > 0) {
      alvo = linhas[trIdx - 1].querySelectorAll('.cel-input')[celIdx] || null;
    }
  } else if (e.key === 'Escape') {
    var dataE     = inp.dataset.data;
    var paisE     = inp.dataset.pais;
    var originalE = (_dadosMes[dataE] && _dadosMes[dataE][paisE]) || 0;
    inp.value     = originalE > 0 ? String(originalE) : '';
    onCelChange(inp);
    inp.blur();
  }

  if (alvo && !alvo.disabled) { alvo.focus(); alvo.select(); }
}

// ============================================================
// RECÁLCULOS
// ============================================================

function recalcularTotalLinha(nomePais) {
  var tabela = document.querySelector('.grelha-tabela');
  if (!tabela) return;
  var tr = tabela.querySelector('tr[data-pais="' + CSS.escape(nomePais) + '"]');
  if (!tr) return;
  var total = 0;
  tr.querySelectorAll('.cel-input').forEach(function(i) { total += parseInt(i.value, 10) || 0; });
  var tdTot = tabela.querySelector('td[data-pais-total="' + CSS.escape(nomePais) + '"]');
  if (tdTot) tdTot.textContent = total > 0 ? total : '—';
}

function recalcularTotalDia(dataFmt) {
  var dia    = parseInt(dataFmt.split('/')[0], 10);
  var tabela = document.querySelector('.grelha-tabela');
  if (!tabela) return;
  var total = 0;
  tabela.querySelectorAll('.cel-input[data-data="' + dataFmt + '"]')
        .forEach(function(i) { total += parseInt(i.value, 10) || 0; });
  var el = tabela.querySelector('td[data-total-dia="' + dia + '"]');
  if (el) {
    el.textContent = total > 0 ? total : '—';
    el.style.color = total > 0 ? 'var(--verde)' : 'var(--cinza)';
  }
}

function recalcularTotalGeral() {
  var tabela = document.querySelector('.grelha-tabela');
  if (!tabela) return;
  var total = 0;
  tabela.querySelectorAll('.cel-input').forEach(function(i) { total += parseInt(i.value, 10) || 0; });
  var el = document.getElementById('totalGeralGrelha');
  if (el) el.textContent = total > 0 ? total : '—';
}

function contarAlteracoes() {
  var n = 0;
  Object.values(_alteracoes).forEach(function(obj) { n += Object.keys(obj).length; });
  return n;
}

function atualizarBarraAlteracoes() {
  var badge  = document.getElementById('alteracoesBadge');
  var btnG   = document.getElementById('btnGuardarTudo');
  if (_totalAlteracoes > 0) {
    badge.classList.add('visivel');
    badge.textContent = '✏️ ' + _totalAlteracoes +
      (_totalAlteracoes === 1 ? ' alteração' : ' alterações') + ' por guardar';
    if (btnG) btnG.disabled = false;
  } else {
    badge.classList.remove('visivel');
    if (btnG) btnG.disabled = true;
  }
}

// ============================================================
// GUARDAR ALTERAÇÕES — agrupa dias em lotes, 1 call por dia alterado
// (muito melhor do que as 31 calls anteriores — só envia os dias
//  que foram efectivamente modificados)
// ============================================================

function confirmarGuardar() {
  if (_totalAlteracoes === 0) { mostrarToast('Não há alterações para guardar.', 'info'); return; }
  var diasAlterados = Object.keys(_alteracoes).length;
  document.getElementById('modalResumoTexto').textContent =
    '📍 Local: '  + _localAtual + '\n' +
    '📅 Mês: '    + formatarMesLegivel(_mesAtual) + '\n' +
    '📊 Dias com alterações: ' + diasAlterados + '\n' +
    '✏️ Células alteradas: '   + _totalAlteracoes;
  document.getElementById('modalGuardar').classList.add('show');
}

function fecharModalGuardar() {
  document.getElementById('modalGuardar').classList.remove('show');
}

function executarGuardar() {
  fecharModalGuardar();
  var datas = Object.keys(_alteracoes);
  if (datas.length === 0) return;

  var btnG = document.getElementById('btnGuardarTudo');
  if (btnG) { btnG.disabled = true; btnG.textContent = '⏳ A guardar...'; }
  mostrarToast('A guardar ' + datas.length + ' dia(s) alterado(s)...', 'info');

  // Apenas os dias alterados geram chamadas (N << 31 na maioria dos casos)
  var promessas = datas.map(function(data) {
    var existentes    = _dadosMes[data] || {};
    var alteracoesDia = _alteracoes[data] || {};
    var finais = {};
    Object.keys(existentes).forEach(function(p) {
      if ((existentes[p] || 0) > 0) finais[p] = existentes[p];
    });
    Object.keys(alteracoesDia).forEach(function(p) {
      var v = alteracoesDia[p] || 0;
      if (v > 0) finais[p] = v; else delete finais[p];
    });
    return chamarAPI('guardarRegisto', {
      data: data, local: _localAtual, paises: finais,
      operadores: [], sugestoes: [], observacoes: ''
    });
  });

  Promise.all(promessas)
    .then(function(resultados) {
      var sucesso = resultados.filter(function(r) { return r && r.sucesso; }).length;
      var falhou  = resultados.length - sucesso;
      if (btnG) { btnG.disabled = false; btnG.textContent = '💾 Guardar alterações'; }

      if (falhou === 0) {
        // Actualizar _dadosMes com os valores guardados
        datas.forEach(function(data) {
          if (!_dadosMes[data]) _dadosMes[data] = {};
          Object.keys(_alteracoes[data] || {}).forEach(function(p) {
            _dadosMes[data][p] = _alteracoes[data][p];
          });
        });
        _alteracoes = {}; _totalAlteracoes = 0;
        atualizarBarraAlteracoes();
        document.querySelectorAll('.cel-input.alterada').forEach(function(el) {
          el.classList.remove('alterada');
        });
        mostrarToast('✓ ' + sucesso + ' dia(s) guardado(s) com sucesso.', 'sucesso');
      } else {
        mostrarToast('⚠️ ' + sucesso + ' guardado(s), ' + falhou + ' com erro.', 'aviso');
        atualizarBarraAlteracoes();
      }
    })
    .catch(function(err) {
      if (btnG) { btnG.disabled = false; btnG.textContent = '💾 Guardar alterações'; }
      mostrarToast('Erro ao guardar: ' + err.message, 'erro');
    });
}

function descartarAlteracoes() {
  if (_totalAlteracoes === 0) return;
  if (!confirm('Tem a certeza que quer descartar todas as alterações não guardadas?')) return;
  document.querySelectorAll('.cel-input.alterada').forEach(function(inp) {
    var data     = inp.dataset.data;
    var pais     = inp.dataset.pais;
    var original = (_dadosMes[data] && _dadosMes[data][pais]) || 0;
    inp.value = original > 0 ? String(original) : '';
    inp.classList.remove('alterada');
    inp.classList.toggle('tem-valor', original > 0);
    recalcularTotalLinha(pais);
    recalcularTotalDia(data);
  });
  _alteracoes = {}; _totalAlteracoes = 0;
  recalcularTotalGeral();
  atualizarBarraAlteracoes();
  mostrarToast('Alterações descartadas.', 'info');
}

// ============================================================
// UI AUXILIARES
// ============================================================

function mostrarGrelhaLoading(mostrar) {
  document.getElementById('grelhaLoading').classList.toggle('show', mostrar);
  if (mostrar) document.getElementById('grelhaWrapper').innerHTML = '';
  document.getElementById('grelhaAcoes').style.display = mostrar ? 'none' : '';
}

function formatarMesLegivel(mesStr) {
  if (!mesStr) return '';
  var p = mesStr.split('-');
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, 1)
    .toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
}

function voltarParaApp() {
  if (_totalAlteracoes > 0) {
    if (!confirm('Tem alterações por guardar. Tem a certeza que quer sair?')) return;
  }
  window.location.href = 'index.html';
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function mostrarToast(msg, tipo) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast ' + (tipo || 'info') + ' show';
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { t.classList.remove('show'); }, 4000);
}

document.addEventListener('DOMContentLoaded', function() {
  var overlay = document.getElementById('modalGuardar');
  if (overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) fecharModalGuardar();
    });
  }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { fecharModalGuardar(); fecharModalExtras(); }
  });
  window.addEventListener('beforeunload', function(e) {
    if (_totalAlteracoes > 0) {
      e.preventDefault();
      e.returnValue = 'Tem alterações por guardar.';
      return e.returnValue;
    }
  });

var overlayExtras = document.getElementById('modalExtras');
if (overlayExtras) {
  overlayExtras.addEventListener('click', function(e) {
    if (e.target === overlayExtras) fecharModalExtras();
  });
}
});

// ============================================================
// MODAL CONFLITOS
// ============================================================
function abrirModalConflito(dataFmt) {
  var conflito = _conflitosDoMes[dataFmt];
  if (!conflito) return;
  _conflitoActivo = conflito;

  document.getElementById('conflitoMeta').textContent =
    _localAtual + ' — ' + dataFmt;
  document.getElementById('conflitoServidorAutor').textContent =
    conflito.autorExistente
      ? 'por ' + conflito.autorExistente + (conflito.servidorEm ? ' em ' + conflito.servidorEm : '')
      : '';
  document.getElementById('conflitoOfflineAutor').textContent =
    'por ' + (conflito.email || '—') +
    (conflito.criadoOfflineEm
      ? ' (offline ' + new Date(conflito.criadoOfflineEm).toLocaleString('pt-PT') + ')'
      : '');

  _preencherTabelaConflito('conflitoTabelaServidor',
    (conflito.payloadExistente || {}).paises || {}, 'conflitoTotalServidor');
  _preencherTabelaConflito('conflitoTabelaOffline',
    (conflito.payloadNovo || {}).paises || {}, 'conflitoTotalOffline');

  _mostrarDiferencas(conflito);
  document.getElementById('modalConflito').classList.add('show');
}

function fecharModalConflito() {
  document.getElementById('modalConflito').classList.remove('show');
  _conflitoActivo = null;
}

function _preencherTabelaConflito(tabelaId, paises, totalId) {
  var tabela = document.getElementById(tabelaId);
  var total  = 0;
  var html   = '';
  Object.keys(paises).sort().forEach(function(pais) {
    var v = paises[pais] || 0;
    total += v;
    html += '<tr><td>' + esc(pais) + '</td>' +
            '<td class="conflito-num">' + v + '</td></tr>';
  });
  tabela.innerHTML = html || '<tr><td colspan="2" style="opacity:0.5">Sem dados</td></tr>';
  var totEl = document.getElementById(totalId);
  if (totEl) totEl.textContent = 'Total: ' + total;
}

function _mostrarDiferencas(conflito) {
  var paisesS = (conflito.payloadExistente || {}).paises || {};
  var paisesO = (conflito.payloadNovo      || {}).paises || {};
  var todos   = Object.keys(Object.assign({}, paisesS, paisesO));
  var difs    = [];

  todos.forEach(function(pais) {
    var vS = paisesS[pais] || 0;
    var vO = paisesO[pais] || 0;
    if (vS !== vO) difs.push({ pais: pais, servidor: vS, offline: vO, delta: vO - vS });
  });

  var el = document.getElementById('conflitoDiferencas');
  if (!difs.length) {
    el.innerHTML = '<div class="conflito-sem-dif">Os valores são idênticos — qualquer opção produz o mesmo resultado.</div>';
    return;
  }
  var html = '<div class="conflito-dif-titulo">Diferenças por país:</div>';
  difs.forEach(function(d) {
    var sinal = d.delta > 0 ? '+' : '';
    html += '<div class="conflito-dif-linha">' +
              '<span>' + esc(d.pais) + '</span>' +
              '<span class="conflito-dif-valores">' + d.servidor + ' → ' + d.offline + '</span>' +
              '<span class="conflito-dif-delta ' + (d.delta > 0 ? 'positivo' : 'negativo') + '">' +
                sinal + d.delta +
              '</span>' +
            '</div>';
  });
  el.innerHTML = html;
}

function resolverConflito(decisao) {
  if (!_conflitoActivo) return;

  var payloadFinal = decisao === 'usar_offline'
    ? _conflitoActivo.payloadNovo
    : _conflitoActivo.payloadExistente;

  chamarAPI('resolverConflito', {
    conflitoId:   _conflitoActivo.id,
    decisao:      decisao,
    payloadFinal: payloadFinal
  })
  .then(function(resp) {
    if (!resp.sucesso) {
      mostrarToast('Erro: ' + resp.mensagem, 'erro');
      return;
    }
    var dataFmt = _conflitoActivo.data;
    delete _conflitosDoMes[dataFmt];

    // Actualizar grelha com os dados finais
    var paisesFinais = decisao === 'manter_servidor'
      ? (_conflitoActivo.payloadExistente || {}).paises || {}
      : (_conflitoActivo.payloadNovo      || {}).paises || {};

    _actualizarColunaAposResolucao(dataFmt, paisesFinais);
    fecharModalConflito();
    atualizarBadgeConflitos();
    mostrarToast('✓ Conflito resolvido.', 'sucesso');
  })
  .catch(function(err) {
    mostrarToast('Erro: ' + err.message, 'erro');
  });
}

function activarModoFusao() {
  if (!_conflitoActivo) return;
  var dataFmt   = _conflitoActivo.data;
  var paisesRef = (_conflitoActivo.payloadNovo || {}).paises || {};

  fecharModalConflito();

  // Pré-preencher coluna com valores offline para edição manual
  Object.keys(paisesRef).forEach(function(pais) {
    var inp = document.querySelector(
      '.cel-input[data-data="' + dataFmt + '"][data-pais="' + CSS.escape(pais) + '"]'
    );
    if (!inp) return;
    inp.value = paisesRef[pais] || '';
    inp.classList.add('alterada', 'modo-fusao');
    onCelChange(inp);
  });

  // Scroll para a coluna
  var inp = document.querySelector('.cel-input[data-data="' + dataFmt + '"]');
  if (inp) inp.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

  mostrarToast('✏️ Valores offline pré-preenchidos. Edite e guarde normalmente.', 'info');
}

function _actualizarColunaAposResolucao(dataFmt, paises) {
  if (!_dadosMes[dataFmt]) _dadosMes[dataFmt] = {};
  Object.assign(_dadosMes[dataFmt], paises);

  // Actualizar inputs na grelha
  Object.keys(paises).forEach(function(pais) {
    var inp = document.querySelector(
      '.cel-input[data-data="' + dataFmt + '"][data-pais="' + CSS.escape(pais) + '"]'
    );
    if (!inp) return;
    var v = paises[pais] || 0;
    inp.value = v > 0 ? String(v) : '';
    inp.classList.remove('celula-conflito', 'alterada', 'modo-fusao');
    inp.classList.toggle('tem-valor', v > 0);
    recalcularTotalLinha(pais);
    recalcularTotalDia(dataFmt);
  });

  // Remover marcação do cabeçalho do dia
  var dia = parseInt(dataFmt.split('/')[0], 10);
  document.querySelectorAll('.th-dia.tem-conflito').forEach(function(th) {
    var numEl = th.querySelector('.th-dia-num');
    if (numEl && parseInt(numEl.textContent, 10) === dia) {
      th.classList.remove('tem-conflito');
      th.style.cursor = '';
      th.title = '';
    }
  });

  recalcularTotalGeral();
}

function atualizarBadgeConflitos() {
  var n     = Object.keys(_conflitosDoMes).length;
  var aviso = document.getElementById('conflitosAviso');
  var badge = document.getElementById('conflitosAvisoBadge');
  if (!aviso) return;
  aviso.style.display = n > 0 ? '' : 'none';
  if (badge) badge.textContent = n;
}

function toggleSecaoEditor(idCorpo, idIcone) {
  var corpo  = document.getElementById(idCorpo);
  var icone  = document.getElementById(idIcone);
  if (!corpo || !icone) return;
  var aberto = !corpo.closest('.secao-card').classList.contains('recolhido');
  corpo.closest('.secao-card').classList.toggle('recolhido', aberto);
  icone.textContent = aberto ? '▶' : '▼';
}

// ============================================================
// MODAL DE EXTRAS — Operadores / Sugestões / Observações
// ============================================================

function abrirModalExtras(data, modo) {
  _diaModalActivo  = data;
  _modoModalExtras = modo;

  var selectorDia = document.getElementById('modalExtrasSelectorDia');
  if (selectorDia) {
    selectorDia.style.display = modo === 'adicionar' ? '' : 'none';
    if (modo === 'adicionar') {
      // Não pré-preencher dia — utilizador escolhe
      selectorDia.value = data || '';
      _diaModalActivo   = selectorDia.value || null;
    }
  }

  var titulo = document.getElementById('modalExtrasTitulo');
  if (titulo) {
    titulo.textContent = modo === 'adicionar'
      ? '➕ Adicionar Registo'
      : '✏️ Editar — ' + data;
  }
  var meta = document.getElementById('modalExtrasMeta');
  if (meta) meta.textContent = _localAtual;


  // Preencher selector de dia (modo adicionar)
var selectorWrap = document.getElementById('modalExtrasSelectorDiaWrap');
var selectorDia  = document.getElementById('modalExtrasSelectorDia');
if (selectorDia && selectorWrap) {
  if (modo === 'adicionar') {
    selectorWrap.style.display = '';
    selectorDia.innerHTML = '';
    // Construir lista de dias do mês actual
    var partes  = _mesAtual.split('-');
    var anoSel  = parseInt(partes[0], 10);
    var mesSel  = parseInt(partes[1], 10);
    var nDias   = new Date(anoSel, mesSel, 0).getDate();
    for (var dd = 1; dd <= nDias; dd++) {
  var dfmt = String(dd).padStart(2,'0') + '/' +
             String(mesSel).padStart(2,'0') + '/' + anoSel;

  var temDadosBD  = !!(_dadosExtras[dfmt] &&
                       (_dadosExtras[dfmt].operadores && _dadosExtras[dfmt].operadores.length ||
                        _dadosExtras[dfmt].sugestoes  && _dadosExtras[dfmt].sugestoes.length  ||
                        _dadosExtras[dfmt].observacoes));
  var temDadosAlt = !!(_alteracoesExtras[dfmt]);
  if (temDadosBD || temDadosAlt) continue;

  var opt  = document.createElement('option');
  opt.value       = dfmt;
  opt.textContent = dfmt + ' (' + DIAS_SEM[new Date(anoSel, mesSel-1, dd).getDay()] + ')';
  selectorDia.appendChild(opt);
}

if (!selectorDia.options.length) {
  mostrarToast('Todos os dias do mês já têm registos.', 'info');
  return;
}
  } else {
    selectorWrap.style.display = 'none';
  }
}
  _preencherModalExtras(data);

  document.getElementById('modalExtras').classList.add('show');
}

function _preencherModalExtras(data) {
  if (!data) {
    _modalRenderizarOperadores([]);
    _modalRenderizarSugestoes([]);
    var obsEl = document.getElementById('modalExtrasObservacoes');
    if (obsEl) obsEl.value = '';
    return;
  }

  var ext    = _dadosExtras[data]      || {};
  var altExt = _alteracoesExtras[data] || {};
  var ops    = altExt.operadores  !== undefined ? altExt.operadores  : (ext.operadores  || []);
  var sugs   = altExt.sugestoes   !== undefined ? altExt.sugestoes   : (ext.sugestoes   || []);
  var obs    = altExt.observacoes !== undefined ? altExt.observacoes : (ext.observacoes || '');

  _modalRenderizarOperadores(ops);
  _modalRenderizarSugestoes(sugs);
  var obsEl = document.getElementById('modalExtrasObservacoes');
  if (obsEl) obsEl.value = obs;

  var avisoEl = document.getElementById('modalExtrasConflitoAviso');
  if (avisoEl) {
    var temConflito = !!(_conflitosDoMes[data]);
    avisoEl.style.display = temConflito ? '' : 'none';
  }
}

function fecharModalExtras() {
  document.getElementById('modalExtras').classList.remove('show');
  _diaModalActivo  = null;
  _modoModalExtras = null;
}

function _modalRenderizarOperadores(ops) {
  var lista = document.getElementById('modalExtrasOpLista');
  if (!lista) return;
  lista.innerHTML = '';
  var items = ops.length ? ops : [{ operador: '', nacionalidades: '', total: '' }];
  items.forEach(function(op) {
    var cartao = _criarLinhaOperadorModal(op);
    cartao.querySelectorAll('.modal-op-nac-select, .modal-op-nac-num').forEach(function(el) {
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', function() {
        _recalcularTotalModalOp(cartao);
      });
    });
    lista.appendChild(cartao);
  });
}

function _criarLinhaOperadorModal(op) {
  var div = document.createElement('div');
  div.className = 'modal-extras-op-cartao';

  var pares = _parsearNacionalidadesEditor(op.nacionalidades || '');

  var nacHtml = '';
  if (pares.length > 0) {
    pares.forEach(function(par) {
      nacHtml += _htmlLinhaNacModal(par.pais, par.num);
    });
  } else {
    nacHtml = _htmlLinhaNacModal('', '');
  }

  div.innerHTML =
    '<div class="modal-op-cartao-header">' +
      '<input type="text" class="modal-extras-op-nome" placeholder="Nome do operador ou agência"' +
             ' value="' + esc(op.operador || '') + '">' +
      '<button type="button" class="btn-rem-modal-linha modal-op-cartao-rem"' +
              ' onclick="this.closest(\'.modal-extras-op-cartao\').remove()"' +
              ' aria-label="Remover operador">✕</button>' +
    '</div>' +
    '<div class="modal-op-nac-lista">' + nacHtml + '</div>' +
    '<button type="button" class="btn-modal-add-nac"' +
            ' onclick="_adicionarLinhaNacModal(this)">+ Adicionar nacionalidade</button>' +
    '<div class="modal-op-cartao-total-wrap">' +
      '<span class="modal-op-cartao-total-label">TOTAL</span>' +
      '<input type="number" class="modal-extras-op-total" inputmode="numeric"' +
             ' min="0" placeholder="0" readonly' +
             ' value="' + esc(String(op.total || '')) + '">' +
    '</div>';

  // Recalcular total ao criar
  _recalcularTotalModalOp(div);

  return div;
}

function _htmlLinhaNacModal(paisSel, num) {
  var optsHtml = '<option value="">— País —</option>';
  PAISES.forEach(function(p) {
    var sel = p.nome === paisSel ? ' selected' : '';
    optsHtml += '<option value="' + esc(p.nome) + '"' + sel + '>' + esc(p.nome) + '</option>';
  });

  return '<div class="modal-op-nac-linha">' +
    '<select class="modal-op-nac-select">' + optsHtml + '</select>' +
    '<input type="number" inputmode="numeric" class="modal-op-nac-num"' +
           ' min="0" placeholder="0" value="' + esc(String(num || '')) + '">' +
    '<button type="button" class="btn-rem-nac-modal"' +
            ' onclick="_removerLinhaNacModal(this)" aria-label="Remover">✕</button>' +
  '</div>';
}

function _adicionarLinhaNacModal(btn) {
  var lista = btn.previousElementSibling;
  var div   = document.createElement('div');
  div.innerHTML = _htmlLinhaNacModal('', '');
  var linha = div.firstChild;
  // Ligar eventos de recalculo
  var cartao = btn.closest('.modal-extras-op-cartao');
  linha.querySelector('.modal-op-nac-select').addEventListener('change', function() {
    _recalcularTotalModalOp(cartao);
  });
  linha.querySelector('.modal-op-nac-num').addEventListener('input', function() {
    _recalcularTotalModalOp(cartao);
  });
  lista.appendChild(linha);
}

function _removerLinhaNacModal(btn) {
  var linha  = btn.closest('.modal-op-nac-linha');
  var cartao = btn.closest('.modal-extras-op-cartao');
  linha.remove();
  _recalcularTotalModalOp(cartao);
}

function _recalcularTotalModalOp(cartao) {
  if (!cartao) return;
  var total = 0;
  cartao.querySelectorAll('.modal-op-nac-num').forEach(function(inp) {
    total += parseInt(inp.value, 10) || 0;
  });
  var totEl = cartao.querySelector('.modal-extras-op-total');
  if (totEl) totEl.value = total > 0 ? total : '';
}

function _parsearNacionalidadesEditor(str) {
  if (!str) return [];
  return str.split(',').map(function(s) {
    var partes = s.trim().split(':');
    return { pais: (partes[0] || '').trim(), num: parseInt((partes[1] || ''), 10) || 0 };
  }).filter(function(p) { return p.pais; });
}

function modalAdicionarOperador() {
  var lista = document.getElementById('modalExtrasOpLista');
  if (lista) lista.appendChild(_criarLinhaOperadorModal({ operador: '', nacionalidades: '', total: '' }));
}

function _modalRenderizarSugestoes(sugs) {
  var lista = document.getElementById('modalExtrasSugLista');
  if (!lista) return;
  lista.innerHTML = '';
  var items = sugs.length ? sugs : [{ sugestao: '', nacionalidade: '' }];
  items.forEach(function(s) {
    lista.appendChild(_criarLinhaSugestaoModal(s));
  });
}

function _criarLinhaSugestaoModal(s) {
  var div = document.createElement('div');
  div.className = 'modal-extras-linha';

  var optsHtml = '<option value="">— País —</option>';
  PAISES.forEach(function(p) {
    var sel = p.nome === (s.nacionalidade || '') ? ' selected' : '';
    optsHtml += '<option value="' + esc(p.nome) + '"' + sel + '>' + esc(p.nome) + '</option>';
  });

  div.innerHTML =
    '<input type="text" class="modal-extras-sug-texto" placeholder="Sugestão ou crítica"' +
           ' value="' + esc(s.sugestao || '') + '">' +
    '<select class="modal-extras-sug-nac">' + optsHtml + '</select>' +
    '<button type="button" class="btn-rem-modal-linha"' +
            ' onclick="this.closest(\'.modal-extras-linha\').remove()"' +
            ' aria-label="Remover">✕</button>';
  return div;
}

function modalAdicionarSugestao() {
  var lista = document.getElementById('modalExtrasSugLista');
  if (lista) lista.appendChild(_criarLinhaSugestaoModal({ sugestao: '', nacionalidade: '' }));
}

function guardarModalExtras() {
  var data = _diaModalActivo;

  // No modo adicionar, ler o dia seleccionado no selector
  if (_modoModalExtras === 'adicionar') {
    var sel = document.getElementById('modalExtrasSelectorDia');
    data = sel ? sel.value : null;
    _diaModalActivo = data;
  }

  if (!data) {
    mostrarToast('Escolha o dia do registo.', 'erro');
    return;
  }

  // Recolher operadores
  var ops = [];
document.querySelectorAll('#modalExtrasOpLista .modal-extras-op-cartao').forEach(function(cartao) {
  var nome = (cartao.querySelector('.modal-extras-op-nome') || {}).value || '';
  if (!nome.trim()) return;

  var nacs = [];
  cartao.querySelectorAll('.modal-op-nac-linha').forEach(function(linha) {
    var pais = (linha.querySelector('.modal-op-nac-select') || {}).value || '';
    var num  = parseInt((linha.querySelector('.modal-op-nac-num') || {}).value, 10) || 0;
    if (pais && num > 0) nacs.push(pais + ': ' + num);
  });

  var tot = parseInt((cartao.querySelector('.modal-extras-op-total') || {}).value, 10) || 0;
  ops.push({ operador: nome.trim(), nacionalidades: nacs.join(', '), total: tot });
});

  // Recolher sugestões
  var sugs = [];
  document.querySelectorAll('#modalExtrasSugLista .modal-extras-linha').forEach(function(linha) {
    var txt = (linha.querySelector('.modal-extras-sug-texto') || {}).value || '';
    var nac = (linha.querySelector('.modal-extras-sug-nac')   || {}).value || '';
    if (txt.trim()) sugs.push({ sugestao: txt.trim(), nacionalidade: nac.trim() });
  });

  var obs = (document.getElementById('modalExtrasObservacoes') || {}).value || '';

  // Comparar com originais
  var orig        = _dadosExtras[data] || {};
  var opsChanged  = JSON.stringify(ops)  !== JSON.stringify(orig.operadores  || []);
  var sugsChanged = JSON.stringify(sugs) !== JSON.stringify(orig.sugestoes   || []);
  var obsChanged  = obs !== (orig.observacoes || '');

  if (!opsChanged && !sugsChanged && !obsChanged) {
    fecharModalExtras();
    mostrarToast('Sem alterações a guardar.', 'info');
    return;
  }

  var btn = document.querySelector('#modalExtras .btn-modal-confirmar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ A guardar...'; }

  var paisesOriginais = _dadosMes[data] || {};
  var payload = {
    data:        data,
    local:       _localAtual,
    paises:      paisesOriginais,
    operadores:  opsChanged  ? ops  : (orig.operadores  || []),
    sugestoes:   sugsChanged ? sugs : (orig.sugestoes   || []),
    observacoes: obsChanged  ? obs  : (orig.observacoes || '')
  };

  chamarAPI('guardarRegisto', payload)
    .then(function(resp) {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar'; }
      if (!resp.sucesso) {
        mostrarToast('Erro: ' + resp.mensagem, 'erro');
        return;
      }

      // Actualizar _dadosExtras
      if (!_dadosExtras[data]) _dadosExtras[data] = {};
      if (opsChanged)  _dadosExtras[data].operadores  = ops;
      if (sugsChanged) _dadosExtras[data].sugestoes   = sugs;
      if (obsChanged)  _dadosExtras[data].observacoes = obs;

      // Limpar alterações pendentes
      delete _alteracoesExtras[data];

      fecharModalExtras();
      mostrarToast('✓ Registo guardado com sucesso.', 'sucesso');
      _actualizarLinhaExtras(data);
    })
    .catch(function(err) {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar'; }
      mostrarToast('Erro: ' + err.message, 'erro');
    });
}

window.carregarMes = carregarMes();