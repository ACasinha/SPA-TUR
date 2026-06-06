// ============================================================
// app.js — Lógica da página principal (index.html)
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
//
// Responsabilidade:
//   • Arrancar a aplicação após login válido (activarApp)
//   • Verificar/carregar dados do dia (verificarDados)
//   • Guardar registo (guardarDados) — online via API, offline via sync.js
//   • Bloquear/desbloquear formulário
//   • Gerir badge de registos pendentes de sincronização
//
// NÃO contém: Firebase init, JWT, sessão (auth.js),
// UI de login (login.js), construção de tabelas (ui.js),
// fila offline (sync.js).
// ============================================================

'use strict';

// ── Estado da página ─────────────────────────────────────────

var verificacaoTimer      = null;
var ultimoLocalVerificado = '';
var ultimaDataVerificada  = '';
var _perfilAtual          = null;
var _isAdmin              = false;
var appInicializada       = false;
var dadosAlterados        = false;

// Tri-estado: null = desconhecido, true = pode editar, false = bloqueado
var edicaoPermitida = null;

// ── Aviso de dados por guardar ───────────────────────────────

window.addEventListener('beforeunload', function (e) {
  if (dadosAlterados) {
    e.preventDefault();
    e.returnValue = 'Tem dados por guardar. Tem a certeza que quer sair?';
    return e.returnValue;
  }
});

// ── Listener de mensagens do Service Worker ──────────────────
// Recebe EXECUTAR_SYNC quando o SW detecto rede (Background Sync)
// e delega em sync.js — fallback principal para Android Chrome.

navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'EXECUTAR_SYNC') {
    console.log('[app] SW solicitou sincronização.');
    if (typeof syncSincronizarFila === 'function') {
      syncSincronizarFila().then(_actualizarBadgePendentes);
    }
  }
});

// ── Listeners de eventos de sincronização ────────────────────

window.addEventListener('rmz-sync-update', function() {
  _actualizarBadgePendentes();
});

window.addEventListener('rmz-sync-conflito', function(e) {
  var detalhe = e.detail || {};
  mostrarToast(
    '⚠️ O registo de ' + detalhe.data + ' (' + detalhe.local + ') tem um conflito pendente de resolução no Editor Mensal.',
    'info'
  );
});

// ============================================================
// ARRANQUE — delegado em login.js + auth.js
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  inicializarLogin({
    idWrap:            null,
    verificarAcesso:   function (perfil) {
      return perfil.role === 'administrador' || perfil.role === 'utilizador';
    },
    mensagemSemAcesso: 'Esta conta não tem acesso à aplicação. Contacte o administrador.',
    onSucesso:         function (perfil) {
      _perfilAtual = perfil;
      _isAdmin     = perfil.role === 'administrador';
      activarApp(perfil);
    },
    onSessaoTerminada: function () {
      // NÃO limpar a fila offline — os dados persistem entre sessões
      // para poderem ser sincronizados no próximo login.
      appInicializada       = false;
      dadosAlterados        = false;
      ultimoLocalVerificado = '';
      ultimaDataVerificada  = '';
      mostrarBanner('', '');
    }
  });
});

// ============================================================
// NAVEGAÇÃO
// ============================================================

function irParaAdmin()     { window.location.href = 'admin.html'; }
function irParaDashboard() { window.location.href = 'dashboard.html'; }
function irParaEditor()    { window.location.href = 'editor.html'; }

// ============================================================
// ACTIVAR APP — chamado por login.js após autenticação válida
// ============================================================

function activarApp(perfil) {
  var elNome = document.getElementById('headerNomeFuncionario');
  if (elNome) elNome.textContent = perfil.nome || perfil.email || '—';

  if (typeof construirMenuNav === 'function') construirMenuNav(perfil);

  if (!appInicializada) {
    _inicializarFormulario();
    appInicializada = true;
  }

  // Inicializar IndexedDB e processar pendentes desta sessão
  if (typeof syncInit === 'function') {
    syncInit()
      .then(function() {
        // Limpar registos resolvidos há mais de 7 dias (housekeeping)
        if (typeof syncLimparResolvidos === 'function') syncLimparResolvidos();

        // Actualizar badge imediatamente
        _actualizarBadgePendentes();

        // Se há rede, tentar sincronizar o que ficou pendente
        if (navigator.onLine && typeof syncSincronizarFila === 'function') {
          syncSincronizarFila().then(_actualizarBadgePendentes);
        }
      })
      .catch(function(err) {
        console.warn('[app] Erro ao inicializar sync:', err);
      });
  }
}

// ============================================================
// BADGE DE PENDENTES
// Mostra o número de registos locais ainda não sincronizados.
// ============================================================

function _actualizarBadgePendentes() {
  if (typeof syncContarActivos !== 'function') return;

  syncContarActivos().then(function(n) {
    var badge = document.getElementById('badgePendentes');
    if (!badge) return;

    if (n > 0) {
      badge.textContent = n;
      badge.style.display = '';
      badge.title = n + (n === 1 ? ' registo pendente de sincronização' : ' registos pendentes de sincronização');
    } else {
      badge.style.display = 'none';
    }
  });
}

// ============================================================
// INICIALIZAÇÃO DO FORMULÁRIO
// ============================================================

function _inicializarFormulario() {
  document.getElementById('data').valueAsDate = new Date();
  construirTabelaPaises();
  construirTabelaOperadores(NUM_LINHAS_OP);
  construirTabelaSugestoes(NUM_LINHAS_SUG);

  document.getElementById('observacoes').addEventListener('input', function () {
    if (!verificarLocalEscolhido()) { this.value = ''; return; }
    dadosAlterados = true;
  });

  document.querySelector('.container').addEventListener('input', function (e) {
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

// ============================================================
// VERIFICAÇÃO AUTOMÁTICA — agendada ao mudar local ou data
// ============================================================

function agendarVerificacao() {
  ultimoLocalVerificado = '';
  ultimaDataVerificada  = '';

  if (typeof construirTabelaPaises === 'function') construirTabelaPaises();

  clearTimeout(verificacaoTimer);
  verificacaoTimer = setTimeout(verificarDados, 600);
}

function verificarLocalEscolhido() {
  var local = document.getElementById('local').value.trim();
  if (!local) {
    mostrarToast('Por favor escolha primeiro o Local / Posto.', 'erro');
    document.getElementById('local').focus();
    return false;
  }
  return true;
}

function verificarDados() {
  var local = document.getElementById('local').value.trim();
  var data  = document.getElementById('data').value;

  if (!local || !data) return;
  if (local === ultimoLocalVerificado && data === ultimaDataVerificada) return;

  ultimoLocalVerificado = local;
  ultimaDataVerificada  = data;
  edicaoPermitida       = null;

  // Sem rede: não verificar (não há dados no servidor para comparar)
  if (!navigator.onLine) {
  bloquearFormulario(false);
  document.getElementById('btnGuardar').disabled = false;

  // Consultar IndexedDB — pode já existir um registo local para este local/data
  if (typeof syncObterRegistoLocalPorLocalData === 'function') {
    var partes2       = data.split('-');
    var dataFmt2      = partes2[2] + '/' + partes2[1] + '/' + partes2[0];

    syncObterRegistoLocalPorLocalData(local, dataFmt2)
      .then(function(payloadLocal) {
        if (payloadLocal) {
          // Carregar dados do registo local na UI
          carregarDados({
            paises:      payloadLocal.paises      || {},
            operadores:  payloadLocal.operadores  || [],
            sugestoes:   payloadLocal.sugestoes   || [],
            observacoes: payloadLocal.observacoes || ''
          });
          mostrarBanner('carregado',
            '📦 Dados locais carregados (offline). Pode editar — serão sincronizados ao reconectar.');
          mostrarToast('✓ Dados locais carregados.', 'info');
        } else {
          mostrarBanner('novo',
            '📦 Sem ligação — o registo será guardado localmente e enviado ao reconectar.');
        }
      })
      .catch(function() {
        mostrarBanner('novo',
          '📦 Sem ligação — o registo será guardado localmente e enviado ao reconectar.');
      });
  } else {
    mostrarBanner('novo',
      '📦 Sem ligação — o registo será guardado localmente e enviado ao reconectar.');
  }
  return;
}

  bloquearFormulario(false);
  document.getElementById('btnGuardar').disabled = false;
  mostrarBanner('verificando', '⏳ A verificar dados existentes...');

  var partes        = data.split('-');
  var dataFormatada = partes[2] + '/' + partes[1] + '/' + partes[0];

  apiVerificarDados(
    local,
    dataFormatada,
    function onSuccess(resp) {
      if (!resp.sucesso) {
        mostrarBanner('', '');
        mostrarToast('Erro: ' + resp.mensagem, 'erro');
        return;
      }

      if (resp.existe) {
        carregarDados(resp);

        var hoje      = new Date();
        var hojeStr   = hoje.getFullYear() + '-' +
                        String(hoje.getMonth() + 1).padStart(2, '0') + '-' +
                        String(hoje.getDate()).padStart(2, '0');
        var dataRegisto = document.getElementById('data').value;

        edicaoPermitida = (dataRegisto === hojeStr);

        if (edicaoPermitida) {
          mostrarBanner('carregado', '🔄 Dados de hoje carregados. Pode editar e guardar.');
          mostrarToast('✓ Dados carregados. Edição permitida.', 'info');
          document.getElementById('btnGuardar').disabled = false;
        } else {
          mostrarBanner(
            'bloqueado',
            '🔒 Dados de ' + dataRegisto + ' carregados. Não é possível editar registos de dias anteriores.'
          );
          mostrarToast('Edição bloqueada — registo de dia anterior.', 'erro');
          document.getElementById('btnGuardar').disabled = true;
          bloquearFormulario(true);
        }
      } else {
        edicaoPermitida = null;
        limparFormularioParcial();
        mostrarBanner('novo', '✨ Nenhum registo encontrado. Novo registo.');
        mostrarToast('✨ Novo registo.', 'sucesso');
        document.getElementById('btnGuardar').disabled = false;
        bloquearFormulario(false);
      }
    },
    function onFailure(err) {
      ultimoLocalVerificado = '';
      ultimaDataVerificada  = '';
      mostrarBanner('', '');
      mostrarToast('Erro: ' + err.message, 'erro');
    }
  );
}

// ============================================================
// GUARDAR REGISTO
//
// Online:  chama a Cloud Function directamente (comportamento anterior)
// Offline: guarda na fila local via sync.js e sugere PDF
// ============================================================

function sinalizarAlteracao() {
  dadosAlterados = true;
}

function guardarDados() {
  var local       = document.getElementById('local').value.trim();
  var data        = document.getElementById('data').value;
  var observacoes = document.getElementById('observacoes').value;

  if (!local) {
    mostrarToast('Por favor indique o local/posto.', 'erro');
    document.getElementById('local').focus();
    return;
  }
  if (!data) {
    mostrarToast('Por favor selecione a data.', 'erro');
    return;
  }
  if (edicaoPermitida === false) {
    mostrarToast('Não é possível editar registos de dias anteriores.', 'erro');
    return;
  }

  var paises = {};
  document.querySelectorAll('.pais-input').forEach(function (inp) {
    var v = parseInt(inp.value, 10) || 0;
    if (v > 0) paises[inp.dataset.pais] = v;
  });

  var operadores = recolherOperadores();
  var sugestoes  = recolherSugestoes();

  if (!Object.keys(paises).length && !operadores.length && !sugestoes.length) {
    mostrarToast('Não há dados para guardar.', 'erro');
    return;
  }

  var btn = document.getElementById('btnGuardar');
  btn.disabled    = true;
  btn.textContent = '⏳ A guardar...';

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

  // ── Caminho offline ───────────────────────────────────────
  if (!navigator.onLine) {
    if (typeof syncGuardarNaFila !== 'function') {
      mostrarToast('Módulo de sincronização não disponível.', 'erro');
      btn.disabled    = false;
      btn.textContent = '💾 Guardar Registo';
      return;
    }

    syncGuardarNaFila(payload)
      .then(function() {
        btn.disabled    = false;
        btn.textContent = '💾 Guardar Registo';
        dadosAlterados  = false;
        mostrarToast('📦 Registo guardado localmente. Será enviado ao reconectar.', 'info');
        mostrarBanner('pendente', '📦 Registo guardado localmente — sem ligação à Internet.');
        _actualizarBadgePendentes();

        // Marcar inputs com estilo de "guardado localmente"
        document.querySelectorAll('.pais-input').forEach(function (inp) {
          if ((parseInt(inp.value, 10) || 0) > 0) inp.classList.add('input-pendente');
        });
      })
      .catch(function(err) {
        btn.disabled    = false;
        btn.textContent = '💾 Guardar Registo';
        mostrarToast('Erro ao guardar localmente: ' + err.message, 'erro');
      });

    return;
  }

  // ── Caminho online ────────────────────────────────────────
  mostrarToast('A guardar...', 'info');

  apiGuardarRegisto(
    payload,
    function onSuccess(resp) {
      btn.disabled    = false;
      btn.textContent = '💾 Guardar Registo';

      if (resp.sucesso) {
        dadosAlterados = false;
        mostrarToast('✓ ' + resp.mensagem, 'sucesso');
        mostrarBanner('carregado', '✅ Registo guardado com sucesso.');
        document.querySelectorAll('.pais-input').forEach(function (inp) {
          if ((parseInt(inp.value, 10) || 0) > 0) inp.classList.add('input-carregado');
        });
      } else {
        mostrarToast('✗ ' + resp.mensagem, 'erro');
      }
    },
    function onFailure(err) {
      btn.disabled    = false;
      btn.textContent = '💾 Guardar Registo';

      // Falha de rede durante tentativa online — oferecer guardar localmente
      if (typeof syncGuardarNaFila === 'function') {
        mostrarToast('Sem ligação. A guardar localmente...', 'info');
        syncGuardarNaFila(payload)
          .then(function() {
            dadosAlterados = false;
            mostrarToast('📦 Guardado localmente. Será enviado ao reconectar.', 'info');
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
}

// ============================================================
// BLOQUEAR / DESBLOQUEAR FORMULÁRIO
// ============================================================

function bloquearFormulario(bloquear) {
  var d = bloquear;
  document.querySelectorAll('.pais-input').forEach(function (i)  { i.disabled = d; });
  document.querySelectorAll('.btn-stepper').forEach(function (b)  { b.disabled = d; });
  document.querySelectorAll('.op-nome, .op-total').forEach(function (i) { i.disabled = d; });
  document.querySelectorAll('.op-nac-select, .op-nac-num').forEach(function (i) { i.disabled = d; });
  document.querySelectorAll('.btn-add-nac, .btn-rem-nac').forEach(function (b) { b.disabled = d; });
  document.querySelectorAll('.sug-texto, .sug-nac').forEach(function (i) { i.disabled = d; });
  var obsEl = document.getElementById('observacoes');
  if (obsEl) obsEl.disabled = d;
}

// ============================================================
// LOGOUT
// ============================================================

function fazerLogout() {
  logout(dadosAlterados);
}
