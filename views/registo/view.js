// ============================================================
// views/registo/view.js
// View: Registo Diário de Turistas e Visitantes
// ============================================================

'use strict';

(function() {

  // ── Estado local da view ────────────────────────────────────
  var _perfil               = null;
  var _isAdmin              = false;
  var _verificacaoTimer     = null;
  var _ultimoLocalVerif     = '';
  var _ultimaDataVerif      = '';
  var _edicaoPermitida      = null;
  var _dadosAlterados       = false;
  var _listeners            = [];

  // ============================================================
  // CICLO DE VIDA
  // ============================================================

  function mount(perfil) {
    _perfil   = perfil;
    _isAdmin  = perfil.role === 'administrador';

    spaSetHeader({
      titulo: 'Registo Diário de Turistas e Visitantes',
      direita:
        '<div class="spa-header-badge" id="headerBadge">' +
          '<span class="badge-num" id="totalGeral">0</span>' +
          '<span class="badge-label">Visitantes</span>' +
        '</div>' +
        '<div class="badge-pendentes-wrap" id="badgePendentesWrap">' +
          '<span class="badge-pendentes" id="badgePendentes" style="display:none">0</span>' +
        '</div>'
    });

    // FIX: mostrar o botão PDF do rodapé (tem id agora)
    var btnPdf = document.getElementById('btnRodapePdf');
    if (btnPdf) btnPdf.style.display = '';

    _inicializarFormulario();

    _actualizarBadgePendentes();
    if (navigator.onLine && typeof syncSincronizarFila === 'function') {
      syncSincronizarFila().then(_actualizarBadgePendentes);
    }

    if (typeof verificarLigacao === 'function') verificarLigacao();

    _addListener(window, 'online',  function() { verificarLigacao(); });
    _addListener(window, 'offline', function() { verificarLigacao(); });
    _addListener(window, 'beforeunload', _onBeforeUnload);
    _addListener(window, 'rmz-sync-update', _actualizarBadgePendentes);
    _addListener(window, 'rmz-sync-conflito', _onConflitoSync);

    if (navigator.serviceWorker) {
      _addListener(navigator.serviceWorker, 'message', _onSwMensagem);
    }
  }

  function beforeLeave() {
    if (_dadosAlterados) {
      return confirm('Tem dados por guardar. Tem a certeza que quer sair?');
    }
    return true;
  }

  function unmount() {
    clearTimeout(_verificacaoTimer);

    // FIX: esconder o botão PDF ao sair desta view
    var btnPdf = document.getElementById('btnRodapePdf');
    if (btnPdf) btnPdf.style.display = 'none';

    _listeners.forEach(function(l) {
      l.target.removeEventListener(l.tipo, l.fn);
    });
    _listeners = [];

     // ── CORREÇÃO DE LIMPEZA ────────────────────────────────────
    // 1. Resetar a variável global de países em memória do ui.js
    if (typeof _paisesAdicionados !== 'undefined') {
      _paisesAdicionados = [];
    }

    // 2. Limpar a lista de pesquisa que o ui.js injetou no document.body
    var listaPesquisa = document.getElementById('listaPesquisaPaises');
    if (listaPesquisa) {
      listaPesquisa.innerHTML = '';
      listaPesquisa.style.display = 'none';
    }
    // ───────────────────────────────────────────────────────────
    
    _ultimoLocalVerif = '';
    _ultimaDataVerif  = '';
    _dadosAlterados   = false;
    _edicaoPermitida  = null;

    spaResetHeader();
  }

  // ============================================================
  // HELPERS DE LIFECYCLE
  // ============================================================

  function _addListener(target, tipo, fn) {
    target.addEventListener(tipo, fn);
    _listeners.push({ target: target, tipo: tipo, fn: fn });
  }

  function _onBeforeUnload(e) {
    if (_dadosAlterados) {
      e.preventDefault();
      e.returnValue = 'Tem dados por guardar.';
      return e.returnValue;
    }
  }

  function _onSwMensagem(e) {
    if (e.data && e.data.type === 'EXECUTAR_SYNC') {
      if (typeof syncSincronizarFila === 'function') {
        syncSincronizarFila().then(_actualizarBadgePendentes);
      }
    }
  }

  function _onConflitoSync(e) {
    var d = e.detail || {};
    mostrarToast(
      '⚠️ Conflito em ' + d.data + ' (' + d.local + '). Resolva no Editor Mensal.',
      'info'
    );
  }

  // ============================================================
  // INICIALIZAR FORMULÁRIO
  // ============================================================

  function _inicializarFormulario() {
    var dataEl = document.getElementById('data');
    if (dataEl) dataEl.valueAsDate = new Date();

    if (typeof construirTabelaPaises === 'function')    construirTabelaPaises();
    if (typeof construirTabelaOperadores === 'function') construirTabelaOperadores(NUM_LINHAS_OP);
    if (typeof construirTabelaSugestoes === 'function')  construirTabelaSugestoes(NUM_LINHAS_SUG);

    var obsEl = document.getElementById('observacoes');
    if (obsEl) {
      obsEl.addEventListener('input', function() {
        if (!verificarLocalEscolhido()) { this.value = ''; return; }
        _dadosAlterados = true;
      });
    }

    var container = document.querySelector('.container');
    if (container) {
      container.addEventListener('input', function(e) {
        var alvo = e.target;
        if (alvo.classList.contains('op-nome') || alvo.classList.contains('sug-nac')) {
          if (!verificarLocalEscolhido()) {
            alvo.value = '';
          } else {
            sinalizarAlteracao();
          }
        }
      });
    }
  }

  // ============================================================
  // BADGE DE PENDENTES
  // ============================================================

  function _actualizarBadgePendentes() {
    if (typeof syncContarActivos !== 'function') return;
    syncContarActivos().then(function(n) {
      var badge = document.getElementById('badgePendentes');
      if (!badge) return;
      if (n > 0) {
        badge.textContent   = n;
        badge.style.display = '';
        badge.title = n + (n === 1 ? ' registo pendente' : ' registos pendentes');
      } else {
        badge.style.display = 'none';
      }
    });
  }

  // ============================================================
  // VERIFICAÇÃO AUTOMÁTICA
  // ============================================================

  window.agendarVerificacao = function() {
    _ultimoLocalVerif = '';
    _ultimaDataVerif  = '';
    if (typeof construirTabelaPaises === 'function') construirTabelaPaises();
    clearTimeout(_verificacaoTimer);
    _verificacaoTimer = setTimeout(_verificarDados, 600);
  };

  window.verificarLocalEscolhido = function() {
    var local = (document.getElementById('local') || {}).value || '';
    if (!local) {
      mostrarToast('Por favor escolha primeiro o Local / Posto.', 'erro');
      var el = document.getElementById('local');
      if (el) el.focus();
      return false;
    }
    return true;
  };

  function _verificarDados() {
    var local = ((document.getElementById('local') || {}).value || '').trim();
    var data  =  (document.getElementById('data')  || {}).value || '';

    if (!local || !data) return;
    if (local === _ultimoLocalVerif && data === _ultimaDataVerif) return;

    _ultimoLocalVerif = local;
    _ultimaDataVerif  = data;
    _edicaoPermitida  = null;

    if (!navigator.onLine) {
      _verificarOffline(local, data);
      return;
    }

    var btnG = document.getElementById('btnGuardar');
    if (btnG) btnG.disabled = false;
    if (typeof mostrarBanner === 'function') mostrarBanner('verificando', '⏳ A verificar dados existentes...');

    var partes        = data.split('-');
    var dataFormatada = partes[2] + '/' + partes[1] + '/' + partes[0];

    apiVerificarDados(local, dataFormatada,
      function onSuccess(resp) {
        if (!resp.sucesso) {
          if (typeof mostrarBanner === 'function') mostrarBanner('', '');
          mostrarToast('Erro: ' + resp.mensagem, 'erro');
          return;
        }
        if (resp.existe) {
          if (typeof carregarDados === 'function') carregarDados(resp);
          var hoje    = new Date();
          var hojeStr = hoje.getFullYear() + '-' +
                        String(hoje.getMonth() + 1).padStart(2, '0') + '-' +
                        String(hoje.getDate()).padStart(2, '0');
          _edicaoPermitida = (data === hojeStr);
          if (_edicaoPermitida) {
            if (typeof mostrarBanner === 'function')
              mostrarBanner('carregado', '🔄 Dados de hoje carregados. Pode editar e guardar.');
            mostrarToast('✓ Dados carregados. Edição permitida.', 'info');
            if (btnG) btnG.disabled = false;
          } else {
            if (typeof mostrarBanner === 'function')
              mostrarBanner('bloqueado', '🔒 Dados de ' + data + ' carregados. Não é possível editar registos de dias anteriores.');
            mostrarToast('Edição bloqueada — registo de dia anterior.', 'erro');
            if (btnG) btnG.disabled = true;
            if (typeof bloquearFormulario === 'function') bloquearFormulario(true);
          }
        } else {
          _edicaoPermitida = null;
          if (typeof limparFormularioParcial === 'function') limparFormularioParcial();
          if (typeof mostrarBanner === 'function') mostrarBanner('novo', '✨ Nenhum registo encontrado. Novo registo.');
          mostrarToast('✨ Novo registo.', 'sucesso');
          if (btnG) btnG.disabled = false;
          if (typeof bloquearFormulario === 'function') bloquearFormulario(false);
        }
      },
      function onFailure(err) {
        _ultimoLocalVerif = '';
        _ultimaDataVerif  = '';
        if (typeof mostrarBanner === 'function') mostrarBanner('', '');
        mostrarToast('Erro: ' + err.message, 'erro');
      }
    );
  }

  function _verificarOffline(local, data) {
    if (typeof bloquearFormulario === 'function') bloquearFormulario(false);
    var btnG = document.getElementById('btnGuardar');
    if (btnG) btnG.disabled = false;

    var partes   = data.split('-');
    var dataFmt  = partes[2] + '/' + partes[1] + '/' + partes[0];

    if (typeof syncObterRegistoLocalPorLocalData === 'function') {
      syncObterRegistoLocalPorLocalData(local, dataFmt)
        .then(function(payload) {
          if (payload) {
            if (typeof carregarDados === 'function') {
              carregarDados({
                paises:      payload.paises      || {},
                operadores:  payload.operadores  || [],
                sugestoes:   payload.sugestoes   || [],
                observacoes: payload.observacoes || ''
              });
            }
            if (typeof mostrarBanner === 'function')
              mostrarBanner('carregado', '📦 Dados locais carregados (offline). Pode editar — serão sincronizados ao reconectar.');
          } else {
            if (typeof mostrarBanner === 'function')
              mostrarBanner('novo', '📦 Sem ligação — o registo será guardado localmente e enviado ao reconectar.');
          }
        })
        .catch(function() {
          if (typeof mostrarBanner === 'function')
            mostrarBanner('novo', '📦 Sem ligação — o registo será guardado localmente e enviado ao reconectar.');
        });
    } else {
      if (typeof mostrarBanner === 'function')
        mostrarBanner('novo', '📦 Sem ligação — o registo será guardado localmente e enviado ao reconectar.');
    }
  }

  // ============================================================
  // GUARDAR REGISTO
  // ============================================================

  window.sinalizarAlteracao = function() {
    _dadosAlterados = true;
  };

  window.guardarDados = function() {
    var local       = ((document.getElementById('local') || {}).value || '').trim();
    var data        =  (document.getElementById('data')  || {}).value || '';
    var observacoes =  (document.getElementById('observacoes') || {}).value || '';

    if (!local) {
      mostrarToast('Por favor indique o local/posto.', 'erro');
      var lEl = document.getElementById('local');
      if (lEl) lEl.focus();
      return;
    }
    if (!data) {
      mostrarToast('Por favor selecione a data.', 'erro');
      return;
    }
    if (_edicaoPermitida === false) {
      mostrarToast('Não é possível editar registos de dias anteriores.', 'erro');
      return;
    }

    var paises = {};
    document.querySelectorAll('.pais-input').forEach(function(inp) {
      var v = parseInt(inp.value, 10) || 0;
      if (v > 0) paises[inp.dataset.pais] = v;
    });

    var operadores = typeof recolherOperadores === 'function' ? recolherOperadores() : [];
    var sugestoes  = typeof recolherSugestoes  === 'function' ? recolherSugestoes()  : [];

    if (!Object.keys(paises).length && !operadores.length && !sugestoes.length) {
      mostrarToast('Não há dados para guardar.', 'erro');
      return;
    }

    var btn = document.getElementById('btnGuardar');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ A guardar...'; }

    var partes        = data.split('-');
    var dataFormatada = partes[2] + '/' + partes[1] + '/' + partes[0];

    var payload = {
      data:        dataFormatada,
      local:       local,
      paises:      paises,
      operadores:  operadores,
      sugestoes:   sugestoes,
      observacoes: observacoes
    };

    if (!navigator.onLine) {
      if (typeof syncGuardarNaFila !== 'function') {
        mostrarToast('Módulo de sincronização não disponível.', 'erro');
        if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Registo'; }
        return;
      }
      syncGuardarNaFila(payload)
        .then(function() {
          if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Registo'; }
          _dadosAlterados = false;
          mostrarToast('📦 Guardado localmente. Será enviado ao reconectar.', 'info');
          if (typeof mostrarBanner === 'function')
            mostrarBanner('pendente', '📦 Registo guardado localmente — sem ligação à Internet.');
          _actualizarBadgePendentes();
        })
        .catch(function(err) {
          if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Registo'; }
          mostrarToast('Erro ao guardar localmente: ' + err.message, 'erro');
        });
      return;
    }

    mostrarToast('A guardar...', 'info');
    apiGuardarRegisto(payload,
      function onSuccess(resp) {
        if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Registo'; }
        if (resp.sucesso) {
          _dadosAlterados = false;
          mostrarToast('✓ ' + resp.mensagem, 'sucesso');
          if (typeof mostrarBanner === 'function')
            mostrarBanner('carregado', '✅ Registo guardado com sucesso.');
          document.querySelectorAll('.pais-input').forEach(function(inp) {
            if ((parseInt(inp.value, 10) || 0) > 0) inp.classList.add('input-carregado');
          });
        } else {
          mostrarToast('✗ ' + resp.mensagem, 'erro');
        }
      },
      function onFailure(err) {
        if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Registo'; }
        if (typeof syncGuardarNaFila === 'function') {
          mostrarToast('Sem ligação. A guardar localmente...', 'info');
          syncGuardarNaFila(payload)
            .then(function() {
              _dadosAlterados = false;
              mostrarToast('📦 Guardado localmente. Será enviado ao reconectar.', 'info');
              if (typeof mostrarBanner === 'function')
                mostrarBanner('pendente', '📦 Registo guardado localmente — falha de ligação.');
              _actualizarBadgePendentes();
            })
            .catch(function() {
              mostrarToast('Erro: ' + err.message, 'erro');
            });
        } else {
          mostrarToast('Erro: ' + err.message, 'erro');
        }
      }
    );
  };

  // ============================================================
  // BLOQUEAR / DESBLOQUEAR FORMULÁRIO
  // ============================================================

  window.bloquearFormulario = function(bloquear) {
    var d = bloquear;
    document.querySelectorAll('.pais-input').forEach(function(i)  { i.disabled = d; });
    document.querySelectorAll('.btn-stepper').forEach(function(b)  { b.disabled = d; });
    document.querySelectorAll('.op-nome, .op-total').forEach(function(i) { i.disabled = d; });
    document.querySelectorAll('.op-nac-select, .op-nac-num').forEach(function(i) { i.disabled = d; });
    document.querySelectorAll('.btn-add-nac, .btn-rem-nac').forEach(function(b) { b.disabled = d; });
    document.querySelectorAll('.sug-texto, .sug-nac').forEach(function(i) { i.disabled = d; });
    document.querySelectorAll('.btn-novo-operador').forEach(function(b) { b.disabled = d; });
    document.querySelectorAll('.op-cartao-nome, .op-cartao-nac-select, .op-cartao-nac-num').forEach(function(i) { i.disabled = d; });
    document.querySelectorAll('.btn-remover-op-cartao, .btn-remover-op-linha, .btn-add-nac-cartao, .btn-rem-nac-cartao').forEach(function(b) { b.disabled = d; });
    var obsEl = document.getElementById('observacoes');
    if (obsEl) obsEl.disabled = d;
  };

  // ============================================================
  // LOGOUT
  // ============================================================

  window.fazerLogout = function() {
    if (typeof logout === 'function') logout(_dadosAlterados);
  };

  // ============================================================
  // REGISTAR A VIEW
  // ============================================================

  window.__views = window.__views || {};
  window.__views.registo = {
    mount:       mount,
    beforeLeave: beforeLeave,
    unmount:     unmount
  };

})();
