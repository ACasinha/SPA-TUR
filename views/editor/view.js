// ============================================================
// views/editor/view.js
// View: Editor Mensal de Dados
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

  // Resoluções parciais de extras (por secção, antes de confirmar tudo)
  // { operadores: 'servidor'|'offline'|null, sugestoes: ..., observacoes: ... }
  var _resolucaoExtras  = null;
  var _tabConflitoAtiva = 'paises';

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

    var hoje   = new Date();
    var mesStr = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
    var inputMes = document.getElementById('inputMes');
    if (inputMes) {
      inputMes.value = mesStr;
      _al(inputMes, 'keydown', function(e) {
        if (e.key === 'Enter') carregarMes();
      });
    }

    _al(document, 'keydown', function(e) {
      if (e.key === 'Escape') {
        fecharModalGuardar();
        fecharModalExtras();
        fecharModalConflito();
      }
    });

    ['modalGuardar', 'modalExtras', 'modalConflito'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) _al(el, 'click', function(e) { if (e.target === el) _fecharModal(id); });
    });

    _al(window, 'beforeunload', _onBeforeUnload);
    _al(window, 'scroll', _stickyAgendarActualizacao, { passive: true });
    _al(window, 'resize', _stickyAgendarActualizacao, { passive: true });
  }

  function beforeLeave() {
    if (_totalAlteracoes > 0) {
      return confirm('Tem alterações por guardar. Tem a certeza que quer sair?');
    }
    return true;
  }

  function unmount() {
    _stickyDestruirClone();

    _listeners.forEach(function(l) {
      l.target.removeEventListener(l.tipo, l.fn, l.opts);
    });
    _listeners = [];

    _localAtual = ''; _mesAtual = ''; _dadosMes = {};
    _alteracoes = {}; _totalAlteracoes = 0;
    _conflitosDoMes = {}; _conflitoActivo = null;
    _dadosExtras = {}; _alteracoesExtras = {};
    _diaModalActivo = null; _modoModalExtras = null;
    _resolucaoExtras = null; _tabConflitoAtiva = 'paises';

    window.__editor = null;
    spaResetHeader();
  }

  function _al(target, tipo, fn, opts) {
    target.addEventListener(tipo, fn, opts);
    _listeners.push({ target: target, tipo: tipo, fn: fn, opts: opts });
  }

  function _onBeforeUnload(e) {
    if (_totalAlteracoes > 0) {
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
    if (_totalAlteracoes > 0) {
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

      _dadosMes         = respDados.dados  || {};
      _dadosExtras      = respDados.extras || {};
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
      tr.dataset.pais = pais.nome;
      if (isDestaque) tr.classList.add('linha-destaque');

      var tdPais = document.createElement('td');
      tdPais.className   = 'td-pais';
      tdPais.textContent = pais.nome;
      tdPais.title       = pais.nome;
      tr.appendChild(tdPais);

      var totalLinha = 0;
      for (var dd = 1; dd <= numDias; dd++) {
        var dataFmt = String(dd).padStart(2, '0') + '/' +
                      String(mesNum).padStart(2, '0') + '/' + ano;
        var dObj  = new Date(ano, mesNum - 1, dd);
        var dSem  = dObj.getDay();
        var eFDS  = dSem === 0 || dSem === 6;
        var eHoje = (ano === hojeAno && mesNum === hojesMes && dd === hojesDia);
        var valor = (_dadosMes[dataFmt] && _dadosMes[dataFmt][pais.nome]) || 0;
        totalLinha     += valor;
        totaisDia[dd]   = (totaisDia[dd] || 0) + valor;

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
      tdTot.dataset.paisTotal = pais.nome;
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

    if (Object.keys(_conflitosDoMes).length > 0) _assinalarConflitos();

    document.getElementById('estadoVazioCard').style.display = 'none';
    document.getElementById('secaoGrelha').style.display     = '';
    document.getElementById('secaoGrelha').classList.remove('recolhido');
    document.getElementById('secaoToggleIcone').textContent  = '▼';
    document.getElementById('grelhaAcoes').style.display     = '';

    var nomeMes = new Date(ano, mesNum - 1, 1)
      .toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
    document.getElementById('secaoGrelhaTitle').textContent =
      local + ' — ' + nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);
    document.getElementById('grelhaInfoTexto').innerHTML =
      'A editar: <strong>' + _esc(local) + '</strong> — <strong>' + nomeMes + '</strong>';

    var totalCarregado = 0;
    Object.values(_dadosMes).forEach(function(diaObj) {
      Object.values(diaObj).forEach(function(v) { totalCarregado += (v || 0); });
    });
    document.getElementById('secaoTotalBadge').textContent =
      totalCarregado > 0
        ? totalCarregado.toLocaleString('pt-PT') + ' visitantes'
        : 'Sem dados';

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
    var tr = tabela.querySelector('tr[data-pais="' + CSS.escape(nomePais) + '"]');
    if (!tr) return;
    var total = 0;
    tr.querySelectorAll('.cel-input').forEach(function(i) { total += parseInt(i.value, 10) || 0; });
    var tdTot = tabela.querySelector('td[data-pais-total="' + CSS.escape(nomePais) + '"]');
    if (tdTot) tdTot.textContent = total > 0 ? total : '—';
  }

  function _recalcularTotalDia(dataFmt) {
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

  function _recalcularTotalGeral() {
    var tabela = document.querySelector('.grelha-tabela');
    if (!tabela) return;
    var total = 0;
    tabela.querySelectorAll('.cel-input').forEach(function(i) { total += parseInt(i.value, 10) || 0; });
    var el = document.getElementById('totalGeralGrelha');
    if (el) el.textContent = total > 0 ? total : '—';
  }

  function _contarAlteracoes() {
    var n = 0;
    Object.values(_alteracoes).forEach(function(obj) { n += Object.keys(obj).length; });
    return n;
  }

  function _atualizarBarraAlteracoes() {
    var badge = document.getElementById('alteracoesBadge');
    var btnG  = document.getElementById('btnGuardarTudo');
    var aviso = document.getElementById('secaoAlteracoesAviso');
    if (badge) {
      if (_totalAlteracoes > 0) {
        badge.classList.add('visivel');
        badge.textContent = '✏️ ' + _totalAlteracoes +
          (_totalAlteracoes === 1 ? ' alteração' : ' alterações') + ' por guardar';
      } else {
        badge.classList.remove('visivel');
      }
    }
    if (btnG)  btnG.disabled = _totalAlteracoes === 0;
    if (aviso) aviso.classList.toggle('visivel', _totalAlteracoes > 0);
  }

  // ============================================================
  // GUARDAR
  // ============================================================

  function confirmarGuardar() {
    if (_totalAlteracoes === 0) { mostrarToast('Não há alterações para guardar.', 'info'); return; }
    var diasAlterados = Object.keys(_alteracoes).length;
    var el = document.getElementById('modalResumoTexto');
    if (el) el.textContent =
      '📍 Local: '  + _localAtual + '\n' +
      '📅 Mês: '    + _formatarMes(_mesAtual) + '\n' +
      '📊 Dias com alterações: ' + diasAlterados + '\n' +
      '✏️ Células alteradas: '   + _totalAlteracoes;
    var m = document.getElementById('modalGuardar');
    if (m) m.classList.add('show');
  }

  function fecharModalGuardar() { _fecharModal('modalGuardar'); }

  function executarGuardar() {
    fecharModalGuardar();
    var datas = Object.keys(_alteracoes);
    if (!datas.length) return;

    var btnG = document.getElementById('btnGuardarTudo');
    if (btnG) { btnG.disabled = true; btnG.textContent = '⏳ A guardar...'; }
    mostrarToast('A guardar ' + datas.length + ' dia(s)...', 'info');

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
          datas.forEach(function(data) {
            if (!_dadosMes[data]) _dadosMes[data] = {};
            Object.keys(_alteracoes[data] || {}).forEach(function(p) {
              _dadosMes[data][p] = _alteracoes[data][p];
            });
          });
          _alteracoes = {}; _totalAlteracoes = 0;
          _atualizarBarraAlteracoes();
          document.querySelectorAll('.cel-input.alterada').forEach(function(el) {
            el.classList.remove('alterada');
          });
          mostrarToast('✓ ' + sucesso + ' dia(s) guardado(s) com sucesso.', 'sucesso');
        } else {
          mostrarToast('⚠️ ' + sucesso + ' guardado(s), ' + falhou + ' com erro.', 'aviso');
          _atualizarBarraAlteracoes();
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
      var original = (_dadosMes[inp.dataset.data] && _dadosMes[inp.dataset.data][inp.dataset.pais]) || 0;
      inp.value = original > 0 ? String(original) : '';
      inp.classList.remove('alterada');
      inp.classList.toggle('tem-valor', original > 0);
      _recalcularTotalLinha(inp.dataset.pais);
      _recalcularTotalDia(inp.dataset.data);
    });
    _alteracoes = {}; _totalAlteracoes = 0;
    _recalcularTotalGeral();
    _atualizarBarraAlteracoes();
    mostrarToast('Alterações descartadas.', 'info');
  }

  function toggleSecaoGrelha() {
    var card  = document.getElementById('secaoGrelha');
    var icone = document.getElementById('secaoToggleIcone');
    if (!card || !icone) return;
    var aberto = !card.classList.contains('recolhido');
    card.classList.toggle('recolhido', aberto);
    icone.textContent = aberto ? '▶' : '▼';
  }

  // ============================================================
  // TABELA EXTRAS
  // ============================================================

  function _construirTabelaExtras(ano, mesNum, numDias) {
    var card = document.getElementById('secaoExtras');
    if (card) card.style.display = '';
    var tbody = document.getElementById('extrasTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    var hoje    = new Date();
    var hojeAno = hoje.getFullYear();
    var hojesMes = hoje.getMonth() + 1;
    var hojesDia = hoje.getDate();

    for (var d = 1; d <= numDias; d++) {
      var dataFmt = String(d).padStart(2, '0') + '/' +
                    String(mesNum).padStart(2, '0') + '/' + ano;
      var dataObj = new Date(ano, mesNum - 1, d);
      var diaSem  = DIAS_SEM[dataObj.getDay()];
      var ehFDS   = dataObj.getDay() === 0 || dataObj.getDay() === 6;
      var ehHoje  = (ano === hojeAno && mesNum === hojesMes && d === hojesDia);

      var tr = document.createElement('tr');
      tr.className    = (ehFDS ? 'extras-fds' : '') + (ehHoje ? ' extras-hoje' : '');
      tr.dataset.data = dataFmt;
      tr.innerHTML =
        '<td class="extras-td-data">' +
          '<span class="extras-dia-num">' + String(d).padStart(2, '0') + '</span>' +
          '<span class="extras-dia-sem">' + diaSem + '</span>' +
        '</td>' +
        '<td class="extras-td-chips">' + _chipsExtras(dataFmt) + '</td>' +
        '<td class="extras-td-acao">' +
          '<button type="button" class="btn-editar-extras" data-data="' + dataFmt + '">✏️ Editar</button>' +
        '</td>';

      tr.querySelector('.btn-editar-extras').addEventListener('click', function() {
        abrirModalExtras(this.dataset.data, 'editar');
      });

      tbody.appendChild(tr);
    }
  }

  function _chipsExtras(dataFmt) {
    var ext    = _dadosExtras[dataFmt]      || {};
    var altExt = _alteracoesExtras[dataFmt] || {};
    var ops    = altExt.operadores  !== undefined ? altExt.operadores  : (ext.operadores  || []);
    var sugs   = altExt.sugestoes   !== undefined ? altExt.sugestoes   : (ext.sugestoes   || []);
    var obs    = altExt.observacoes !== undefined ? altExt.observacoes : (ext.observacoes || '');
    var chips  = '';
    if (ops.length)               chips += '<span class="extras-chip chip-op">Operadores (' + ops.length + ')</span>';
    if (sugs.length)              chips += '<span class="extras-chip chip-sug">Sugestões (' + sugs.length + ')</span>';
    if (obs)                      chips += '<span class="extras-chip chip-obs">Observações</span>';
    if (_conflitosDoMes[dataFmt] && _temConflitoExtras(dataFmt))
                                  chips += '<span class="extras-chip chip-conflito">⚠️ Conflito extras</span>';
    if (_alteracoesExtras[dataFmt]) chips += '<span class="extras-chip chip-alt">✏️ Por guardar</span>';
    return chips || '<span class="extras-sem-dados">—</span>';
  }

  // Verifica se um conflito tem diferenças nos extras
  function _temConflitoExtras(dataFmt) {
    var c = _conflitosDoMes[dataFmt];
    if (!c) return false;
    var eS = c.payloadExistente || {};
    var eN = c.payloadNovo      || {};
    return JSON.stringify(eS.operadores  || []) !== JSON.stringify(eN.operadores  || [])
        || JSON.stringify(eS.sugestoes   || []) !== JSON.stringify(eN.sugestoes   || [])
        || (eS.observacoes || '') !== (eN.observacoes || '');
  }

  function _actualizarLinhaExtras(dataFmt) {
    var tr = document.querySelector('#extrasTableBody tr[data-data="' + dataFmt + '"]');
    if (!tr) return;
    var tdChips = tr.querySelector('.extras-td-chips');
    if (tdChips) tdChips.innerHTML = _chipsExtras(dataFmt);
  }

  // ============================================================
  // MODAL EXTRAS
  // ============================================================

  function abrirModalExtras(data, modo) {
    _diaModalActivo  = data;
    _modoModalExtras = modo;

    var titulo = document.getElementById('modalExtrasTitulo');
    if (titulo) titulo.textContent = modo === 'adicionar' ? '➕ Adicionar Registo' : '✏️ Editar — ' + data;
    var meta = document.getElementById('modalExtrasMeta');
    if (meta) meta.textContent = _localAtual;

    var selectorWrap = document.getElementById('modalExtrasSelectorDiaWrap');
    var selectorDia  = document.getElementById('modalExtrasSelectorDia');

    if (selectorWrap && selectorDia) {
      if (modo === 'adicionar') {
        selectorWrap.style.display = '';
        selectorDia.innerHTML      = '';
        var partes  = _mesAtual.split('-');
        var anoSel  = parseInt(partes[0], 10);
        var mesSel  = parseInt(partes[1], 10);
        var nDias   = new Date(anoSel, mesSel, 0).getDate();
        for (var dd = 1; dd <= nDias; dd++) {
          var dfmt   = String(dd).padStart(2,'0') + '/' + String(mesSel).padStart(2,'0') + '/' + anoSel;
          var temBD  = !!(_dadosExtras[dfmt] &&
                          (_dadosExtras[dfmt].operadores && _dadosExtras[dfmt].operadores.length ||
                           _dadosExtras[dfmt].sugestoes  && _dadosExtras[dfmt].sugestoes.length  ||
                           _dadosExtras[dfmt].observacoes));
          var temAlt = !!_alteracoesExtras[dfmt];
          if (temBD || temAlt) continue;
          var opt = document.createElement('option');
          opt.value       = dfmt;
          opt.textContent = dfmt + ' (' + DIAS_SEM[new Date(anoSel, mesSel - 1, dd).getDay()] + ')';
          selectorDia.appendChild(opt);
        }
        if (!selectorDia.options.length) {
          mostrarToast('Todos os dias do mês já têm registos.', 'info');
          return;
        }
        _diaModalActivo = selectorDia.value || null;
      } else {
        selectorWrap.style.display = 'none';
      }
    }

    _preencherModalExtras(data);
    var m = document.getElementById('modalExtras');
    if (m) m.classList.add('show');
  }

  function onSelectorDiaChange(valor) {
    _diaModalActivo = valor;
    _preencherModalExtras(valor);
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
    if (avisoEl) avisoEl.style.display = _conflitosDoMes[data] ? '' : 'none';
  }

  function fecharModalExtras() {
    _fecharModal('modalExtras');
    _diaModalActivo = null;
    _modoModalExtras = null;
  }

  function _modalRenderizarOperadores(ops) {
    var lista = document.getElementById('modalExtrasOpLista');
    if (!lista) return;
    lista.innerHTML = '';
    var items = ops.length ? ops : [{ operador: '', nacionalidades: '', total: '' }];
    items.forEach(function(op) { lista.appendChild(_criarCartaoOpModal(op)); });
  }

  function _criarCartaoOpModal(op) {
    var div   = document.createElement('div');
    div.className = 'modal-extras-op-cartao';
    var pares = _parsearNacs(op.nacionalidades || '');
    var nacHtml = (pares.length ? pares : [{ pais: '', num: '' }])
      .map(function(p) { return _htmlLinhaNacModal(p.pais, p.num); }).join('');

    div.innerHTML =
      '<div class="modal-op-cartao-header">' +
        '<input type="text" class="modal-extras-op-nome" placeholder="Nome do operador ou agência"' +
               ' value="' + _esc(op.operador || '') + '">' +
        '<button type="button" class="btn-rem-modal-linha modal-op-cartao-rem"' +
                ' aria-label="Remover operador">✕</button>' +
      '</div>' +
      '<div class="modal-op-nac-lista">' + nacHtml + '</div>' +
      '<button type="button" class="btn-modal-add-nac">+ Adicionar nacionalidade</button>' +
      '<div class="modal-op-cartao-total-wrap">' +
        '<span class="modal-op-cartao-total-label">TOTAL</span>' +
        '<input type="number" class="modal-extras-op-total" inputmode="numeric"' +
               ' min="0" placeholder="0" readonly value="' + _esc(String(op.total || '')) + '">' +
      '</div>';

    div.querySelector('.modal-op-cartao-rem').addEventListener('click', function() { div.remove(); });
    div.querySelector('.btn-modal-add-nac').addEventListener('click', function() {
      var lista = div.querySelector('.modal-op-nac-lista');
      var novaDiv = document.createElement('div');
      novaDiv.innerHTML = _htmlLinhaNacModal('', '');
      var linha = novaDiv.firstChild;
      _ligarEventosLinhaNac(linha, div);
      lista.appendChild(linha);
    });
    div.querySelectorAll('.modal-op-nac-linha').forEach(function(l) {
      _ligarEventosLinhaNac(l, div);
    });
    _recalcularTotalModalOp(div);
    return div;
  }

  function _htmlLinhaNacModal(paisSel, num) {
    var optsHtml = '<option value="">— País —</option>';
    PAISES.forEach(function(p) {
      optsHtml += '<option value="' + _esc(p.nome) + '"' +
                  (p.nome === paisSel ? ' selected' : '') + '>' + _esc(p.nome) + '</option>';
    });
    return '<div class="modal-op-nac-linha">' +
      '<select class="modal-op-nac-select">' + optsHtml + '</select>' +
      '<input type="number" inputmode="numeric" class="modal-op-nac-num"' +
             ' min="0" placeholder="0" value="' + _esc(String(num || '')) + '">' +
      '<button type="button" class="btn-rem-nac-modal" aria-label="Remover">✕</button>' +
    '</div>';
  }

  function _ligarEventosLinhaNac(linha, cartao) {
    linha.querySelector('.modal-op-nac-select').addEventListener('change', function() {
      _recalcularTotalModalOp(cartao);
    });
    linha.querySelector('.modal-op-nac-num').addEventListener('input', function() {
      _recalcularTotalModalOp(cartao);
    });
    linha.querySelector('.btn-rem-nac-modal').addEventListener('click', function() {
      linha.remove();
      _recalcularTotalModalOp(cartao);
    });
  }

  function _recalcularTotalModalOp(cartao) {
    if (!cartao) return;
    var total = 0;
    cartao.querySelectorAll('.modal-op-nac-num').forEach(function(i) {
      total += parseInt(i.value, 10) || 0;
    });
    var totEl = cartao.querySelector('.modal-extras-op-total');
    if (totEl) totEl.value = total > 0 ? total : '';
  }

  function modalAdicionarOperador() {
    var lista = document.getElementById('modalExtrasOpLista');
    if (lista) lista.appendChild(_criarCartaoOpModal({ operador: '', nacionalidades: '', total: '' }));
  }

  function _modalRenderizarSugestoes(sugs) {
    var lista = document.getElementById('modalExtrasSugLista');
    if (!lista) return;
    lista.innerHTML = '';
    var items = sugs.length ? sugs : [{ sugestao: '', nacionalidade: '' }];
    items.forEach(function(s) { lista.appendChild(_criarLinhaSugestaoModal(s)); });
  }

  function _criarLinhaSugestaoModal(s) {
    var div = document.createElement('div');
    div.className = 'modal-extras-linha';
    var optsHtml = '<option value="">— País —</option>';
    PAISES.forEach(function(p) {
      optsHtml += '<option value="' + _esc(p.nome) + '"' +
                  (p.nome === (s.nacionalidade || '') ? ' selected' : '') + '>' +
                  _esc(p.nome) + '</option>';
    });
    div.innerHTML =
      '<input type="text" class="modal-extras-sug-texto"' +
             ' placeholder="Sugestão ou crítica" value="' + _esc(s.sugestao || '') + '">' +
      '<select class="modal-extras-sug-nac">' + optsHtml + '</select>' +
      '<button type="button" class="btn-rem-modal-linha" aria-label="Remover">✕</button>';
    div.querySelector('.btn-rem-modal-linha').addEventListener('click', function() { div.remove(); });
    return div;
  }

  function modalAdicionarSugestao() {
    var lista = document.getElementById('modalExtrasSugLista');
    if (lista) lista.appendChild(_criarLinhaSugestaoModal({ sugestao: '', nacionalidade: '' }));
  }

  function guardarModalExtras() {
    var data = _diaModalActivo;
    if (_modoModalExtras === 'adicionar') {
      var sel = document.getElementById('modalExtrasSelectorDia');
      data = sel ? sel.value : null;
      _diaModalActivo = data;
    }
    if (!data) { mostrarToast('Escolha o dia do registo.', 'erro'); return; }

    var ops = [];
    document.querySelectorAll('#modalExtrasOpLista .modal-extras-op-cartao').forEach(function(cartao) {
      var nome = ((cartao.querySelector('.modal-extras-op-nome') || {}).value || '').trim();
      if (!nome) return;
      var nacs = [];
      cartao.querySelectorAll('.modal-op-nac-linha').forEach(function(l) {
        var pais = (l.querySelector('.modal-op-nac-select') || {}).value || '';
        var num  = parseInt((l.querySelector('.modal-op-nac-num') || {}).value, 10) || 0;
        if (pais && num > 0) nacs.push(pais + ': ' + num);
      });
      var tot = parseInt((cartao.querySelector('.modal-extras-op-total') || {}).value, 10) || 0;
      ops.push({ operador: nome, nacionalidades: nacs.join(', '), total: tot });
    });

    var sugs = [];
    document.querySelectorAll('#modalExtrasSugLista .modal-extras-linha').forEach(function(l) {
      var txt = ((l.querySelector('.modal-extras-sug-texto') || {}).value || '').trim();
      var nac = (l.querySelector('.modal-extras-sug-nac') || {}).value || '';
      if (txt) sugs.push({ sugestao: txt, nacionalidade: nac });
    });

    var obs  = (document.getElementById('modalExtrasObservacoes') || {}).value || '';
    var orig = _dadosExtras[data] || {};
    var opsC = JSON.stringify(ops)  !== JSON.stringify(orig.operadores  || []);
    var sugC = JSON.stringify(sugs) !== JSON.stringify(orig.sugestoes   || []);
    var obsC = obs !== (orig.observacoes || '');

    if (!opsC && !sugC && !obsC) {
      fecharModalExtras();
      mostrarToast('Sem alterações a guardar.', 'info');
      return;
    }

    var btn = document.querySelector('#modalExtras .btn-modal-confirmar');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ A guardar...'; }

    chamarAPI('guardarRegisto', {
      data:        data,
      local:       _localAtual,
      paises:      _dadosMes[data] || {},
      operadores:  opsC ? ops  : (orig.operadores  || []),
      sugestoes:   sugC ? sugs : (orig.sugestoes   || []),
      observacoes: obsC ? obs  : (orig.observacoes || '')
    })
    .then(function(resp) {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar'; }
      if (!resp.sucesso) { mostrarToast('Erro: ' + resp.mensagem, 'erro'); return; }
      if (!_dadosExtras[data]) _dadosExtras[data] = {};
      if (opsC) _dadosExtras[data].operadores  = ops;
      if (sugC) _dadosExtras[data].sugestoes   = sugs;
      if (obsC) _dadosExtras[data].observacoes = obs;
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

  // ============================================================
  // CONFLITOS — ASSINALAR NA GRELHA
  // ============================================================

  function _assinalarConflitos() {
    Object.keys(_conflitosDoMes).forEach(function(dataFmt) {
      var dia = parseInt(dataFmt.split('/')[0], 10);

      document.querySelectorAll('.th-dia').forEach(function(th) {
        var numEl = th.querySelector('.th-dia-num');
        if (numEl && parseInt(numEl.textContent, 10) === dia) {
          th.classList.add('tem-conflito');
          th.style.cursor = 'pointer';
          th.title = 'Conflito pendente — clique para resolver';
          th.addEventListener('click', function() { abrirModalConflito(dataFmt); });
        }
      });

      var conflito    = _conflitosDoMes[dataFmt];
      var paisesNovos = (conflito.payloadNovo      || {}).paises || {};
      var paisesExist = (conflito.payloadExistente || {}).paises || {};
      Object.keys(Object.assign({}, paisesNovos, paisesExist)).forEach(function(pais) {
        if ((paisesNovos[pais] || 0) !== (paisesExist[pais] || 0)) {
          var inp = document.querySelector(
            '.cel-input[data-data="' + dataFmt + '"][data-pais="' + CSS.escape(pais) + '"]'
          );
          if (inp) inp.classList.add('celula-conflito');
        }
      });
    });
  }

  // ============================================================
  // CONFLITOS — MODAL PRINCIPAL
  // ============================================================

  function abrirModalConflito(dataFmt) {
    var conflito = _conflitosDoMes[dataFmt];
    if (!conflito) return;
    _conflitoActivo = conflito;

    // Inicializar resoluções parciais de extras a null
    _resolucaoExtras = { operadores: null, sugestoes: null, observacoes: null };

    // Meta
    document.getElementById('conflitoMeta').textContent = _localAtual + ' — ' + dataFmt;
    document.getElementById('conflitoServidorAutor').textContent =
      conflito.autorExistente ? 'por ' + conflito.autorExistente : '';
    document.getElementById('conflitoOfflineAutor').textContent =
      'por ' + (conflito.email || '—') +
      (conflito.criadoOfflineEm
        ? ' (offline ' + new Date(conflito.criadoOfflineEm).toLocaleString('pt-PT') + ')'
        : '');

    // Preencher painel de países
    _preencherTabelaConflito(
      'conflitoTabelaServidor',
      (conflito.payloadExistente || {}).paises || {},
      'conflitoTotalServidor'
    );
    _preencherTabelaConflito(
      'conflitoTabelaOffline',
      (conflito.payloadNovo || {}).paises || {},
      'conflitoTotalOffline'
    );
    _mostrarDiferencasPaises(conflito);

    // Preencher painel de extras
    _preencherPainelExtras(conflito);

    // Badges das tabs
    _actualizarBadgesTabs(conflito);

    // Activar tab de países por defeito
    activarTabConflito('paises');

    var m = document.getElementById('modalConflito');
    if (m) m.classList.add('show');
  }

  function fecharModalConflito() {
    _fecharModal('modalConflito');
    _conflitoActivo  = null;
    _resolucaoExtras = null;
    _tabConflitoAtiva = 'paises';
  }

  // ── Tabs do modal ─────────────────────────────────────────

  function activarTabConflito(tab) {
    _tabConflitoAtiva = tab;

    document.querySelectorAll('.conflito-tab').forEach(function(btn) {
      btn.classList.toggle('ativa', btn.getAttribute('data-tab') === tab);
    });

    var painelPaises = document.getElementById('conflitoPainelPaises');
    var painelExtras = document.getElementById('conflitoPainelExtras');
    if (painelPaises) painelPaises.style.display = tab === 'paises' ? '' : 'none';
    if (painelExtras) painelExtras.style.display = tab === 'extras' ? '' : 'none';
  }

  function _actualizarBadgesTabs(conflito) {
    var eS = conflito.payloadExistente || {};
    var eN = conflito.payloadNovo      || {};

    // Badge países
    var pS = eS.paises || {};
    var pN = eN.paises || {};
    var temDifPaises = Object.keys(Object.assign({}, pS, pN))
      .some(function(p) { return (pS[p] || 0) !== (pN[p] || 0); });
    var bPaises = document.getElementById('conflitoTabBadgePaises');
    if (bPaises) bPaises.style.display = temDifPaises ? '' : 'none';

    // Badge extras
    var temDifExtras = JSON.stringify(eS.operadores || []) !== JSON.stringify(eN.operadores || [])
                    || JSON.stringify(eS.sugestoes  || []) !== JSON.stringify(eN.sugestoes  || [])
                    || (eS.observacoes || '') !== (eN.observacoes || '');
    var bExtras = document.getElementById('conflitoTabBadgeExtras');
    if (bExtras) bExtras.style.display = temDifExtras ? '' : 'none';
  }

  // ── Painel de países ──────────────────────────────────────

  function _preencherTabelaConflito(tabelaId, paises, totalId) {
    var tabela = document.getElementById(tabelaId);
    var total  = 0;
    var html   = '';
    Object.keys(paises).sort().forEach(function(pais) {
      var v = paises[pais] || 0;
      total += v;
      html += '<tr><td>' + _esc(pais) + '</td><td class="conflito-num">' + v + '</td></tr>';
    });
    tabela.innerHTML = html || '<tr><td colspan="2" style="opacity:0.5">Sem dados</td></tr>';
    var totEl = document.getElementById(totalId);
    if (totEl) totEl.textContent = 'Total: ' + total;
  }

  function _mostrarDiferencasPaises(conflito) {
    var paisesS = (conflito.payloadExistente || {}).paises || {};
    var paisesO = (conflito.payloadNovo      || {}).paises || {};
    var todos   = Object.keys(Object.assign({}, paisesS, paisesO));
    var difs    = todos
      .filter(function(p) { return (paisesS[p] || 0) !== (paisesO[p] || 0); })
      .map(function(p) {
        return { pais: p, servidor: paisesS[p] || 0, offline: paisesO[p] || 0,
                 delta: (paisesO[p] || 0) - (paisesS[p] || 0) };
      });

    var el = document.getElementById('conflitoDiferencas');
    if (!difs.length) {
      el.innerHTML = '<div class="conflito-sem-dif">Os valores de países são idênticos.</div>';
      return;
    }
    var html = '<div class="conflito-dif-titulo">Diferenças por país:</div>';
    difs.forEach(function(d) {
      html +=
        '<div class="conflito-dif-linha">' +
          '<span>' + _esc(d.pais) + '</span>' +
          '<span class="conflito-dif-valores">' + d.servidor + ' → ' + d.offline + '</span>' +
          '<span class="conflito-dif-delta ' + (d.delta > 0 ? 'positivo' : 'negativo') + '">' +
            (d.delta > 0 ? '+' : '') + d.delta +
          '</span>' +
        '</div>';
    });
    el.innerHTML = html;
  }

  // ── Painel de extras ─────────────────────────────────────

  function _preencherPainelExtras(conflito) {
    var eS = conflito.payloadExistente || {};
    var eN = conflito.payloadNovo      || {};

    var opsS = eS.operadores  || [];
    var opsN = eN.operadores  || [];
    var sugS = eS.sugestoes   || [];
    var sugN = eN.sugestoes   || [];
    var obsS = eS.observacoes || '';
    var obsN = eN.observacoes || '';

    var difOps = JSON.stringify(opsS) !== JSON.stringify(opsN);
    var difSug = JSON.stringify(sugS) !== JSON.stringify(sugN);
    var difObs = obsS !== obsN;
    var temQualquerDif = difOps || difSug || difObs;

    // Sem diferenças
    var semDifEl = document.getElementById('conflitoExtrasSemDif');
    if (semDifEl) semDifEl.style.display = temQualquerDif ? 'none' : '';

    // Operadores
    _renderizarExtrasBlocoLado('conflitoOpServidor', opsS, 'operadores');
    _renderizarExtrasBlocoLado('conflitoOpOffline',  opsN, 'operadores');
    var blocoOp = document.getElementById('conflitoOpAcoes');
    if (blocoOp) blocoOp.style.display = difOps ? '' : 'none';
    _marcarBlocoComDif('conflitoOpServidor', difOps);

    // Sugestões
    _renderizarExtrasBlocoLado('conflitoSugServidor', sugS, 'sugestoes');
    _renderizarExtrasBlocoLado('conflitoSugOffline',  sugN, 'sugestoes');
    var blocoSug = document.getElementById('conflitoSugAcoes');
    if (blocoSug) blocoSug.style.display = difSug ? '' : 'none';
    _marcarBlocoComDif('conflitoSugServidor', difSug);

    // Observações
    var obsElS = document.getElementById('conflitoObsServidor');
    var obsElN = document.getElementById('conflitoObsOffline');
    if (obsElS) obsElS.textContent = obsS || '';
    if (obsElN) obsElN.textContent = obsN || '';
    var blocoObs = document.getElementById('conflitoObsAcoes');
    if (blocoObs) blocoObs.style.display = difObs ? '' : 'none';
    _marcarBlocoComDif('conflitoObsServidor', difObs);
  }

  function _marcarBlocoComDif(idFilho, temDif) {
    var el = document.getElementById(idFilho);
    if (!el) return;
    var bloco = el.closest('.conflito-extras-bloco');
    if (bloco) bloco.classList.toggle('tem-diferenca', temDif);
  }

  function _renderizarExtrasBlocoLado(elId, dados, tipo) {
    var el = document.getElementById(elId);
    if (!el) return;

    if (tipo === 'operadores') {
      if (!dados || !dados.length) {
        el.innerHTML = '<span class="conflito-extras-vazio">— Sem operadores —</span>';
        return;
      }
      el.innerHTML = dados.map(function(op) {
        return '<div class="conflito-extras-item">' +
          '<div class="conflito-extras-item-nome">' + _esc(op.operador || '—') + '</div>' +
          (op.nacionalidades
            ? '<div class="conflito-extras-item-detalhe">' + _esc(op.nacionalidades) + '</div>'
            : '') +
          '<div class="conflito-extras-item-total">Total: ' + (op.total || 0) + '</div>' +
        '</div>';
      }).join('');

    } else if (tipo === 'sugestoes') {
      if (!dados || !dados.length) {
        el.innerHTML = '<span class="conflito-extras-vazio">— Sem sugestões —</span>';
        return;
      }
      el.innerHTML = dados.map(function(s) {
        return '<div class="conflito-extras-item">' +
          '<div class="conflito-extras-item-nome">' + _esc(s.sugestao || '—') + '</div>' +
          (s.nacionalidade
            ? '<div class="conflito-extras-item-detalhe">' + _esc(s.nacionalidade) + '</div>'
            : '') +
        '</div>';
      }).join('');
    }
  }

  // ============================================================
  // CONFLITOS — RESOLUÇÃO
  // ============================================================

  // Resolução por secção individual (operadores / sugestões / observações)
  function resolverExtrasSecao(secao, origem) {
    if (!_conflitoActivo || !_resolucaoExtras) return;
    _resolucaoExtras[secao] = origem;

    // Feedback visual — substituir botões por badge "resolvido"
    var mapaAcoes = {
      operadores:  'conflitoOpAcoes',
      sugestoes:   'conflitoSugAcoes',
      observacoes: 'conflitoObsAcoes'
    };
    var labelOrigem = origem === 'servidor' ? '📊 Servidor' : '📦 Offline';
    var acoesEl = document.getElementById(mapaAcoes[secao]);
    if (acoesEl) {
      acoesEl.innerHTML =
        '<span class="conflito-extras-resolvido">✓ Mantido: ' + labelOrigem + '</span>';
    }

    // Verificar se todas as secções com diferença já foram resolvidas
    _verificarExtrasCompletos();
  }

  function _verificarExtrasCompletos() {
    if (!_conflitoActivo || !_resolucaoExtras) return;
    var eS = _conflitoActivo.payloadExistente || {};
    var eN = _conflitoActivo.payloadNovo      || {};

    var difOps = JSON.stringify(eS.operadores || []) !== JSON.stringify(eN.operadores || []);
    var difSug = JSON.stringify(eS.sugestoes  || []) !== JSON.stringify(eN.sugestoes  || []);
    var difObs = (eS.observacoes || '') !== (eN.observacoes || '');

    var tudo = (!difOps || _resolucaoExtras.operadores !== null)
            && (!difSug || _resolucaoExtras.sugestoes  !== null)
            && (!difObs || _resolucaoExtras.observacoes !== null);

    if (tudo && (difOps || difSug || difObs)) {
      mostrarToast('Todas as secções de extras resolvidas. Clique em "Confirmar" para guardar.', 'info');
    }
  }

  // Resolução global — tudo do servidor ou tudo do offline
  function resolverConflito(decisao) {
    if (!_conflitoActivo) return;

    var eS = _conflitoActivo.payloadExistente || {};
    var eN = _conflitoActivo.payloadNovo      || {};

    // Construir payload final de países
    var paisesFinais = decisao === 'usar_offline'
      ? (eN.paises || {})
      : (eS.paises || {});

    // Construir payload final de extras:
    // Para cada secção, usar a resolução individual se existir; senão aplicar a decisão global.
    var resolucao = _resolucaoExtras || {};

    function _escolher(secao, valorS, valorN) {
      if (resolucao[secao] === 'servidor') return valorS;
      if (resolucao[secao] === 'offline')  return valorN;
      // Sem resolução individual: seguir a decisão global
      return decisao === 'usar_offline' ? valorN : valorS;
    }

    var opsFinais = _escolher('operadores',  eS.operadores  || [], eN.operadores  || []);
    var sugFinais = _escolher('sugestoes',   eS.sugestoes   || [], eN.sugestoes   || []);
    var obsFinais = _escolher('observacoes', eS.observacoes || '', eN.observacoes || '');

    var payloadFinal = {
      paises:      paisesFinais,
      operadores:  opsFinais,
      sugestoes:   sugFinais,
      observacoes: obsFinais
    };

    chamarAPI('resolverConflito', {
      conflitoId:   _conflitoActivo.id,
      decisao:      decisao,
      payloadFinal: payloadFinal
    })
    .then(function(resp) {
      if (!resp.sucesso) { mostrarToast('Erro: ' + resp.mensagem, 'erro'); return; }

      var dataFmt = _conflitoActivo.data;

      // Actualizar dados em memória
      _actualizarColunaAposResolucao(dataFmt, paisesFinais);

      // Actualizar extras em memória
      if (!_dadosExtras[dataFmt]) _dadosExtras[dataFmt] = {};
      _dadosExtras[dataFmt].operadores  = opsFinais;
      _dadosExtras[dataFmt].sugestoes   = sugFinais;
      _dadosExtras[dataFmt].observacoes = obsFinais;

      delete _conflitosDoMes[dataFmt];
      fecharModalConflito();
      _atualizarBadgeConflitos();
      _actualizarLinhaExtras(dataFmt);
      mostrarToast('✓ Conflito resolvido.', 'sucesso');
    })
    .catch(function(err) { mostrarToast('Erro: ' + err.message, 'erro'); });
  }

  function activarModoFusao() {
    if (!_conflitoActivo) return;
    var dataFmt   = _conflitoActivo.data;
    var paisesRef = (_conflitoActivo.payloadNovo || {}).paises || {};
    fecharModalConflito();
    Object.keys(paisesRef).forEach(function(pais) {
      var inp = document.querySelector(
        '.cel-input[data-data="' + dataFmt + '"][data-pais="' + CSS.escape(pais) + '"]'
      );
      if (!inp) return;
      inp.value = paisesRef[pais] || '';
      inp.classList.add('alterada', 'modo-fusao');
      _onCelChange(inp);
    });
    var primeiro = document.querySelector('.cel-input[data-data="' + dataFmt + '"]');
    if (primeiro) primeiro.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    mostrarToast('✏️ Valores offline pré-preenchidos. Edite países e guarde. Para os extras, use o botão ✏️ Editar na tabela abaixo.', 'info');
  }

  function _actualizarColunaAposResolucao(dataFmt, paises) {
    if (!_dadosMes[dataFmt]) _dadosMes[dataFmt] = {};
    Object.assign(_dadosMes[dataFmt], paises);
    Object.keys(paises).forEach(function(pais) {
      var inp = document.querySelector(
        '.cel-input[data-data="' + dataFmt + '"][data-pais="' + CSS.escape(pais) + '"]'
      );
      if (!inp) return;
      var v = paises[pais] || 0;
      inp.value = v > 0 ? String(v) : '';
      inp.classList.remove('celula-conflito', 'alterada', 'modo-fusao');
      inp.classList.toggle('tem-valor', v > 0);
      _recalcularTotalLinha(pais);
      _recalcularTotalDia(dataFmt);
    });
    var dia = parseInt(dataFmt.split('/')[0], 10);
    document.querySelectorAll('.th-dia.tem-conflito').forEach(function(th) {
      var numEl = th.querySelector('.th-dia-num');
      if (numEl && parseInt(numEl.textContent, 10) === dia) {
        th.classList.remove('tem-conflito');
        th.style.cursor = '';
        th.title = '';
      }
    });
    _recalcularTotalGeral();
  }

  function _atualizarBadgeConflitos() {
    var n     = Object.keys(_conflitosDoMes).length;
    var aviso = document.getElementById('conflitosAviso');
    var badge = document.getElementById('conflitosAvisoBadge');
    if (aviso) aviso.style.display = n > 0 ? '' : 'none';
    if (badge) badge.textContent = n;
  }

  // ============================================================
  // STICKY THEAD
  // ============================================================

  function _stickyIniciar() {
    _stickyDestruirClone();
    var wrapper   = document.getElementById('grelhaWrapper');
    var tabela    = wrapper && wrapper.querySelector('.grelha-tabela');
    var theadOrig = tabela  && tabela.querySelector('thead');
    if (!wrapper || !tabela || !theadOrig) return;

    var div       = document.createElement('div');
    div.className = 'grelha-thead-clone';
    div.id        = 'grelhaTheadClone';
    div.style.display = 'none';

    var tbl       = document.createElement('table');
    tbl.className = tabela.className;
    var cgOrig    = tabela.querySelector('colgroup');
    if (cgOrig) tbl.appendChild(cgOrig.cloneNode(true));
    tbl.appendChild(theadOrig.cloneNode(true));
    div.appendChild(tbl);
    document.body.appendChild(div);
    _stickyClone = div;
    _stickyActualizar();
  }

  function _stickyDestruirClone() {
    var old = document.getElementById('grelhaTheadClone');
    if (old) old.parentNode.removeChild(old);
    _stickyClone = null;
    _stickyAtivo = false;
  }

  function _stickyActualizar() {
    if (!_stickyClone) return;
    var wrapper   = document.getElementById('grelhaWrapper');
    var tabela    = wrapper && wrapper.querySelector('.grelha-tabela');
    var theadOrig = tabela  && tabela.querySelector('thead');
    var header    = document.querySelector('.header');
    if (!wrapper || !tabela || !theadOrig) return;

    var headerH     = header ? Math.round(header.getBoundingClientRect().bottom) : 0;
    var wrapperRect = wrapper.getBoundingClientRect();
    var theadRect   = theadOrig.getBoundingClientRect();
    var deveAtivo   = theadRect.bottom <= headerH + 2
                   && wrapperRect.bottom > headerH + 60;

    if (deveAtivo !== _stickyAtivo) {
      _stickyClone.style.display = deveAtivo ? 'block' : 'none';
      _stickyAtivo = deveAtivo;
    }
    if (!_stickyAtivo) return;

    _stickyClone.style.top   = headerH + 'px';
    _stickyClone.style.left  = wrapperRect.left + 'px';
    _stickyClone.style.width = wrapperRect.width + 'px';

    var tbl = _stickyClone.querySelector('table');
    if (tbl) {
      var totalW = tabela.offsetWidth;
      tbl.style.width     = totalW + 'px';
      tbl.style.minWidth  = totalW + 'px';
      tbl.style.transform = 'translateX(-' + wrapper.scrollLeft + 'px)';
    }
  }

  function _stickyAgendarActualizacao() {
    if (_stickyRafPendente) return;
    _stickyRafPendente = true;
    requestAnimationFrame(function() {
      _stickyRafPendente = false;
      _stickyActualizar();
    });
  }

  // ============================================================
  // UTILITÁRIOS
  // ============================================================

  function _mostrarLoading(mostrar) {
    var el    = document.getElementById('grelhaLoading');
    var acoes = document.getElementById('grelhaAcoes');
    if (el)    el.classList.toggle('show', mostrar);
    if (acoes) acoes.style.display = mostrar ? 'none' : '';
  }

  function _formatarMes(mesStr) {
    if (!mesStr) return '';
    var p = mesStr.split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, 1)
      .toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  }

  function _parsearNacs(str) {
    if (!str) return [];
    return str.split(',').map(function(s) {
      var p = s.trim().split(':');
      return { pais: (p[0] || '').trim(), num: parseInt((p[1] || ''), 10) || 0 };
    }).filter(function(p) { return p.pais; });
  }

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ============================================================
  // API PÚBLICA → window.__editor
  // ============================================================

  window.__editor = {
    carregarMes:            carregarMes,
    confirmarGuardar:       confirmarGuardar,
    fecharModalGuardar:     fecharModalGuardar,
    executarGuardar:        executarGuardar,
    descartarAlteracoes:    descartarAlteracoes,
    toggleSecaoGrelha:      toggleSecaoGrelha,
    abrirModalExtras:       abrirModalExtras,
    onSelectorDiaChange:    onSelectorDiaChange,
    fecharModalExtras:      fecharModalExtras,
    guardarModalExtras:     guardarModalExtras,
    modalAdicionarOperador: modalAdicionarOperador,
    modalAdicionarSugestao: modalAdicionarSugestao,
    abrirModalConflito:     abrirModalConflito,
    fecharModalConflito:    fecharModalConflito,
    activarTabConflito:     activarTabConflito,
    resolverConflito:       resolverConflito,
    resolverExtrasSecao:    resolverExtrasSecao,
    activarModoFusao:       activarModoFusao
  };

  // ============================================================
  // REGISTAR A VIEW
  // ============================================================

  window.__views = window.__views || {};
  window.__views.editor = {
    mount:       mount,
    beforeLeave: beforeLeave,
    unmount:     unmount
  };

})();