// ============================================================
// views/editor/view.js
// View: Editor Mensal de Dados
//
// Migração de editor.js + editor-sticky.js para padrão SPA.
// Toda a lógica encapsulada no IIFE — sem poluição global.
// API pública exposta via window.__views.editor para os onclick do HTML.
// ============================================================

'use strict';

(function() {

  // ── Estado ─────────────────────────────────────────────────
  var _perfil           = null;
  var _isAdmin          = false;
  var _localAtual       = '';
  var _mesAtual         = '';
  var _dadosMes         = {};
  var _alteracoes       = {};
  var _totalAlteracoes  = 0;
  var _conflitosDoMes   = {};
  var _conflitoActivo   = null;
  var _dadosExtras      = {};
  var _alteracoesExtras = {};
  var _diaModalActivo   = null;
  var _modoModalExtras  = null;
  var _listeners        = [];

  var DIAS_SEM = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  // ── Sticky thead ────────────────────────────────────────────
  var _stickyClone       = null;
  var _stickyAtivo       = false;
  var _stickyRafPendente = false;

  // ============================================================
  // CICLO DE VIDA
  // ============================================================

  function mount(perfil) {
    _perfil  = perfil;
    _isAdmin = perfil.role === 'administrador';

    spaSetHeader({ titulo: 'Editor Mensal de Dados' });

    // Mês actual por defeito
    var hoje   = new Date();
    var mesStr = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
    var inputMes = document.getElementById('inputMes');
    if (inputMes) {
      inputMes.value = mesStr;
      _al(inputMes, 'keydown', function(e) {
        if (e.key === 'Enter') carregarMes();
      });
    }

    // Fechar modais com Escape
    _al(document, 'keydown', function(e) {
      if (e.key === 'Escape') {
        fecharModalGuardar();
        fecharModalExtras();
        fecharModalConflito();
      }
    });

    // Fechar modais ao clicar no overlay
    ['modalGuardar', 'modalExtras', 'modalConflito'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) _al(el, 'click', function(e) { if (e.target === el) _fecharModal(id); });
    });

    // beforeunload
    _al(window, 'beforeunload', _onBeforeUnload);

    // Sticky thead — listeners globais
    _al(window, 'scroll', _stickyAgendarActualizacao, { passive: true });
    _al(window, 'resize', _stickyAgendarActualizacao, { passive: true });
  }

  function beforeLeave() {
    if (_totalAlteracoes > 0 || Object.keys(_alteracoesExtras).length > 0) {
      return confirm('Tem alterações por guardar no editor. Tem a certeza que quer sair?');
    }
    return true;
  }

  function unmount() {
    _stickyDestruirClone();

    _listeners.forEach(function(l) {
      l.target.removeEventListener(l.tipo, l.fn, l.opts);
    });
    _listeners = [];

    // Resetar estado
    _localAtual = ''; _mesAtual = ''; _dadosMes = {};
    _alteracoes = {}; _totalAlteracoes = 0;
    _conflitosDoMes = {}; _conflitoActivo = null;
    _dadosExtras = {}; _alteracoesExtras = {};
    _diaModalActivo = null; _modoModalExtras = null;

    if (window.__views) window.__views.editor = null;
    spaResetHeader();
  }

  function _al(target, tipo, fn, opts) {
    target.addEventListener(tipo, fn, opts);
    _listeners.push({ target: target, tipo: tipo, fn: fn, opts: opts });
  }

  function _onBeforeUnload(e) {
    if (_totalAlteracoes > 0 || Object.keys(_alteracoesExtras).length > 0) {
      e.preventDefault();
      e.returnValue = 'Tem alterações por guardar.';
      return e.returnValue;
    }
  }

  function _fecharModal(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('show');
  }

  // ============================================================
  // CARREGAR MÊS
  // ============================================================

  function carregarMes() {
    var local = ((document.getElementById('selectorLocal') || {}).value || '').trim();
    var mes   =  (document.getElementById('inputMes')      || {}).value || '';

    if (!local) {
      mostrarToast('Escolha um local / posto.', 'erro');
      var sl = document.getElementById('selectorLocal');
      if (sl) sl.focus();
      return;
    }
    if (!mes) {
      mostrarToast('Escolha o mês.', 'erro');
      var im = document.getElementById('inputMes');
      if (im) im.focus();
      return;
    }
    if (_totalAlteracoes > 0 || Object.keys(_alteracoesExtras).length > 0) {
      if (!confirm('Tem alterações por guardar. Se continuar serão perdidas. Continuar?')) return;
    }

    _localAtual = local; _mesAtual = mes;
    _dadosMes = {}; _alteracoes = {}; _totalAlteracoes = 0;
    _atualizarBarraAlteracoes();

    var cardExtras = document.getElementById('secaoExtras');
    if (cardExtras) cardExtras.style.display = 'none';

    _mostrarLoading(true);

    Promise.all([
      chamarAPI('obterDadosMes',  { local: local, mes: mes }),
      chamarAPI('obterConflitos', { local: local, mes: mes })
    ])
    .then(function(res) {
      _mostrarLoading(false);
      var respDados     = res[0];
      var respConflitos = res[1];

      if (!respDados.sucesso) {
        mostrarToast('Erro: ' + respDados.mensagem, 'erro');
        return;
      }

      _dadosMes          = respDados.dados  || {};
      _dadosExtras       = respDados.extras || {};
      _alteracoesExtras = {};
      _conflitosDoMes   = (respConflitos.sucesso ? respConflitos.conflitos : {}) || {};

      var partes  = mes.split('-');
      var ano     = parseInt(partes[0], 10);
      var mesNum  = parseInt(partes[1], 10);
      var numDias = new Date(ano, mesNum, 0).getDate();

      _construirGrelha(local, ano, mesNum, numDias);
      _construirTabelaExtras(ano, mesNum, numDias);
      _atualizarBadgeConflitos();
    })
    .catch(function(err) {
      _mostrarLoading(false);
      mostrarToast('Erro ao carregar dados: ' + err.message, 'erro');
    });
  }

  // ============================================================
  // CONSTRUIR GRELHA
  // ============================================================

  function _construirGrelha(local, ano, mesNum, numDias) {
    var wrapper = document.getElementById('grelhaWrapper');
    if (!wrapper) return;
    wrapper.innerHTML = '';
    _stickyDestruirClone();

    var simples   = (typeof modoSimplificado === 'function') && modoSimplificado(local);
    var listaPais = simples ? PAISES_SIMPLES : PAISES;
    var hoje      = new Date();
    var hojeAno   = hoje.getFullYear();
    var hojesMes  = hoje.getMonth() + 1;
    var hojesDia  = hoje.getDate();

    var tabela = document.createElement('table');
    tabela.className = 'grelha-tabela';
    tabela.setAttribute('role', 'grid');

    var thead  = document.createElement('thead');
    var trHead = document.createElement('tr');

    var thPais = document.createElement('th');
    thPais.className = 'th-pais';
    thPais.setAttribute('scope', 'col');
    var thPaisInner = document.createElement('div');
    thPaisInner.className   = 'th-pais-inner';
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
    thTotInner.className   = 'th-total-inner';
    thTotInner.textContent = 'Total';
    thTot.appendChild(thTotInner);
    trHead.appendChild(thTot);
    thead.appendChild(trHead);
    tabela.appendChild(thead);

    var tbody          = document.createElement('tbody');
    var paisesDestaque = listaPais.filter(function(p) { return p.destaque; });
    var paisesResto    = listaPais.filter(function(p) { return !p.destaque; });
    var totaisDia      = {};

    function adicionarLinha(pais, isDestaque) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-pais', pais.nome);
      if (isDestaque) tr.classList.add('linha-destaque');

      var tdPais = document.createElement('td');
      tdPais.className   = 'td-pais';
      tdPais.textContent = pais.nome;
      tdPais.title       = pais.nome;
      tr.appendChild(tdPais);

      var totalLinha = 0;
      for (var dd = 1; dd <= numDias; dd++) {
        var dataFmt = String(dd).padStart(2, '0') + '/' + String(mesNum).padStart(2, '0') + '/' + ano;
        var valor = (_dadosMes[dataFmt] && _dadosMes[dataFmt][pais.nome]) || 0;
        totalLinha     += valor;
        totaisDia[dd]   = (totaisDia[dd] || 0) + valor;

        var dObj  = new Date(ano, mesNum - 1, dd);
        var dSem  = dObj.getDay();
        var eFDS  = dSem === 0 || dSem === 6;
        var eHoje = (ano === hojeAno && mesNum === hojesMes && dd === hojesDia);

        var td = document.createElement('td');
        td.className = 'td-valor' + (eFDS ? ' fim-semana' : '') + (eHoje ? ' hoje-col' : '');

        var inp = document.createElement('input');
        inp.type        = 'number';
        inp.inputMode   = 'numeric';
        inp.min         = '0';
        inp.className   = 'cel-input' + (valor > 0 ? ' tem-valor' : '');
        inp.value       = valor > 0 ? String(valor) : '';
        inp.placeholder = '0';
        inp.dataset.data = dataFmt;
        inp.dataset.pais = pais.nome;
        inp.setAttribute('aria-label', pais.nome + ' — dia ' + dd);
        inp.addEventListener('change',  function(e) { _onCelChange(e.target); });
        inp.addEventListener('keydown', function(e) { _onCelKeydown(e); });
        inp.addEventListener('focus',   function(e) { e.target.select(); });
        td.appendChild(inp);
        tr.appendChild(td);
      }

      var tdTot = document.createElement('td');
      tdTot.className         = 'td-total';
      tdTot.setAttribute('data-pais-total', pais.nome);
      tdTot.textContent       = totalLinha > 0 ? totalLinha : '—';
      tr.appendChild(tdTot);
      tbody.appendChild(tr);
    }

    paisesDestaque.forEach(function(p) { adicionarLinha(p, true); });

    if (!simples && paisesResto.length > 0) {
      var trSep = document.createElement('tr');
      trSep.className = 'linha-separador';
      var tdSep = document.createElement('td');
      tdSep.colSpan = numDias + 2;
      trSep.appendChild(tdSep);
      tbody.appendChild(trSep);
    }

    paisesResto.forEach(function(p) { adicionarLinha(p, false); });

    var trTotais = document.createElement('tr');
    trTotais.className = 'linha-totais';
    var tdTotLabel = document.createElement('td');
    tdTotLabel.className   = 'td-pais';
    tdTotLabel.textContent = 'Total do dia';
    trTotais.appendChild(tdTotLabel);

    var totalGeral = 0;
    for (var dd2 = 1; dd2 <= numDias; dd2++) {
      var t = totaisDia[dd2] || 0;
      totalGeral += t;
      var tdT = document.createElement('td');
      tdT.className        = 'td-valor';
      tdT.dataset.totalDia = dd2;
      tdT.style.cssText    = 'text-align:center;font-weight:700;font-size:var(--text-xs);color:' + (t > 0 ? 'var(--verde)' : 'var(--cinza)');
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

    if (Object.keys(_conflitosDoMes).length > 0) _assinalarConflitos();

    document.getElementById('estadoVazioCard').style.display = 'none';
    document.getElementById('secaoGrelha').style.display     = '';
    document.getElementById('secaoGrelha').classList.remove('recolhido');
    document.getElementById('secaoToggleIcone').textContent  = '▼';
    document.getElementById('grelhaAcoes').style.display     = '';

    var nomeMes = new Date(ano, mesNum - 1, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
    document.getElementById('secaoGrelhaTitle').textContent = local + ' — ' + nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);
    document.getElementById('grelhaInfoTexto').innerHTML = 'A editar: <strong>' + _esc(local) + '</strong> — <strong>' + nomeMes + '</strong>';

    var totalCarregado = 0;
    Object.values(_dadosMes).forEach(function(diaObj) {
      Object.values(diaObj).forEach(function(v) { totalCarregado += (v || 0); });
    });
    document.getElementById('secaoTotalBadge').textContent = totalCarregado > 0 ? totalCarregado.toLocaleString('pt-PT') + ' visitantes' : 'Sem dados';

    setTimeout(function() {
      _stickyIniciar();
      var w = document.getElementById('grelhaWrapper');
      if (w) _al(w, 'scroll', function() {
        if (_stickyAtivo) _stickyAgendarActualizacao();
      }, { passive: true });
    }, 50);
  }

  // ============================================================
  // EVENTOS DE CÉLULA
  // ============================================================

  function _onCelChange(inp) {
    var data  = inp.dataset.data;
    var pais  = inp.dataset.pais;
    var valor = Math.max(0, parseInt(inp.value, 10) || 0);
    inp.value = valor > 0 ? String(valor) : '';
    inp.classList.toggle('tem-valor', valor > 0);

    var original = (_dadosMes[data] && _dadosMes[data][pais]) || 0;
    var alterado = valor !== original;
    inp.classList.toggle('alterada', alterado);

    if (!_alteracoes[data]) _alteracoes[data] = {};
    if (alterado) {
      _alteracoes[data][pais] = valor;
    } else {
      delete _alteracoes[data][pais];
      if (Object.keys(_alteracoes[data]).length === 0) delete _alteracoes[data];
    }

    _recalcularTotalLinha(pais);
    _recalcularTotalDia(data);
    _recalcularTotalGeral();
    _totalAlteracoes = _contarAlteracoes();
    _atualizarBarraAlteracoes();
  }

  function _onCelKeydown(e) {
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
      var original = (_dadosMes[inp.dataset.data] && _dadosMes[inp.dataset.data][inp.dataset.pais]) || 0;
      inp.value = original > 0 ? String(original) : '';
      _onCelChange(inp);
      inp.blur();
    }

    if (alvo && !alvo.disabled) { alvo.focus(); alvo.select(); }
  }

  // ============================================================
  // RECÁLCULOS
  // ============================================================

  function _recalcularTotalLinha(nomePais) {
    var tabela = document.querySelector('.grelha-tabela');
    if (!tabela) return;
    var tr = tabela.querySelector('tr[data-pais="' + nomePais + '"]');
    if (!tr) return;
    var total = 0;
    tr.querySelectorAll('.cel-input').forEach(function(i) { total += parseInt(i.value, 10) || 0; });
    var tdTot = tabela.querySelector('td[data-pais-total="' + nomePais + '"]');
    if (tdTot) tdTot.textContent = total > 0 ? total : '—';
  }

  function _recalcularTotalDia(dataFmt) {
    var dia    = parseInt(dataFmt.split('/')[0], 10);
    var tabela = document.querySelector('.grelha-tabela');
    if (!tabela) return;
    var total = 0;
    tabela.querySelectorAll('.cel-input[data-data="' + dataFmt + '"]').forEach(function(i) { total += parseInt(i.value, 10) || 0; });
    var el = tabela.querySelector('td[data-total-dia="' + dia + '"]');
    if (el) {
      el.textContent = total > 0 ? total : '—';
