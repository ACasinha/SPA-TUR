// ============================================================
// sync.js — Fila de sincronização offline
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
//
// Responsabilidade:
//   • Gerir a fila de registos pendentes em IndexedDB (via idb)
//   • Sincronizar com a Cloud Function quando há rede
//   • Detectar conflitos e notificar a UI
//   • Sugerir geração de PDF como backup físico
//
// Dependências em tempo de execução:
//   idb (CDN — carregado antes deste ficheiro)
//   api.js  → chamarAPI
//   auth.js → obterIdToken
//
// NÃO contém: lógica de UI de resolução de conflitos (editor.js),
// construção do PDF (offline.js), gestão de sessão (auth.js).
// ============================================================

'use strict';

// ── Constantes ───────────────────────────────────────────────

var SYNC_DB_NAME      = 'rmz-offline-db';
var SYNC_DB_VERSION   = 1;
var SYNC_STORE        = 'fila_sync';
var SYNC_BG_TAG       = 'rmz-sync';

// Máximo de tentativas antes de marcar como erro permanente
var SYNC_MAX_TENTATIVAS = 5;

// Estados possíveis de um registo na fila
var ESTADO = {
  PENDENTE:       'pendente',
  A_SINCRONIZAR:  'a_sincronizar',
  ACEITE_AUTO:    'aceite_auto',
  EM_REVISAO:     'em_revisao',
  ACEITE_ADMIN:   'aceite_admin',
  REJEITADO:      'rejeitado',
  ERRO:           'erro'
};

// ── Estado interno ───────────────────────────────────────────

var _db             = null;
var _sincronizando  = false;

// ============================================================
// INICIALIZAÇÃO — abre a base de dados IndexedDB
// Chamado uma vez em app.js após login bem-sucedido.
// ============================================================

function initSync() {
  if (_db) return Promise.resolve(_db);

  return idb.openDB(SYNC_DB_NAME, SYNC_DB_VERSION, {
    upgrade: function(db) {
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        var store = db.createObjectStore(SYNC_STORE, { keyPath: 'id' });

        // Índices para queries frequentes
        store.createIndex('estado',     'estado',     { unique: false });
        store.createIndex('local_data', 'local_data', { unique: false }); // 'local|data'
        store.createIndex('criadoEm',   'criadoEm',   { unique: false });
      }
    }
  }).then(function(db) {
    _db = db;
    console.log('[Sync] IndexedDB iniciado — versão', SYNC_DB_VERSION);
    return db;
  });
}

// ============================================================
// GUARDAR NA FILA
//
// Chamado por app.js em substituição directa de chamarAPI.
// Gera um idempotencyKey único e persiste o registo localmente.
// Se houver rede, tenta sincronizar imediatamente.
// Sugere PDF se o registo ficou pendente (sem rede).
// ============================================================

function guardarNaFila(payload) {
  return initSync().then(function(db) {
    var id = _gerarUUID();

    var registo = {
      id:              id,
      idempotencyKey:  id,   // mesmo valor — usado pelo servidor para idempotência
      estado:          ESTADO.PENDENTE,
      tentativas:      0,
      criadoEm:        new Date().toISOString(),
      sincronizadoEm:  null,
      erroMensagem:    null,

      // Chave composta para lookup rápido de conflitos
      local_data: payload.local + '|' + payload.data,

      // O payload que será enviado para a Cloud Function
      payload: {
        data:        payload.data,
        local:       payload.local,
        paises:      payload.paises      || {},
        operadores:  payload.operadores  || [],
        sugestoes:   payload.sugestoes   || [],
        observacoes: payload.observacoes || ''
      }
    };

    return db.put(SYNC_STORE, registo).then(function() {
      console.log('[Sync] Registo guardado na fila:', id, payload.local, payload.data);

      if (navigator.onLine) {
        // Sincronizar imediatamente — não esperar pelo Background Sync
        return sincronizarFila().then(function() {
          return { id: id, sincronizadoImediatamente: true };
        });
      } else {
        // Offline — registar Background Sync e sugerir PDF
        _registarBackgroundSync();
        _sugerirPDF(payload);
        return { id: id, sincronizadoImediatamente: false };
      }
    });
  });
}

// ============================================================
// SINCRONIZAR FILA
//
// Envia todos os registos pendentes por ordem cronológica.
// Pára na primeira falha de rede para não criar inconsistências
// (ex: quarta sem terça confirmada).
// Falhas de conflito não param a fila — o registo fica em
// 'em_revisao' e o próximo é processado.
// ============================================================

function sincronizarFila() {
  var resetPromise = initSync().then(function(db) {
    return db.getAllFromIndex(SYNC_STORE, 'estado', ESTADO.A_SINCRONIZAR)
      .then(function(presos) {
        return Promise.all(presos.map(function(r) {
          console.log('[Sync] Reset de registo preso:', r.id);
          return _atualizarEstado(r.id, ESTADO.PENDENTE);
        }));
      });
  }).catch(function() {});
  
  if (_sincronizando) {
    console.log('[Sync] Sincronização já em curso — ignorar pedido duplicado.');
    return Promise.resolve();
  }
  if (!navigator.onLine) {
    console.log('[Sync] Sem rede — sincronização adiada.');
    return Promise.resolve();
  }

  _sincronizando = true;
  console.log('[Sync] A iniciar sincronização...');

  return initSync()
    .then(function(db) {
      return db.getAllFromIndex(SYNC_STORE, 'estado', ESTADO.PENDENTE);
    })
    .then(function(pendentes) {
      if (pendentes.length === 0) {
        console.log('[Sync] Nenhum registo pendente.');
        return;
      }

      console.log('[Sync] Pendentes:', pendentes.length);

      // Ordenar cronologicamente pela data do registo (DD/MM/YYYY)
      pendentes.sort(function(a, b) {
        return _parseDateDMY(a.payload.data) - _parseDateDMY(b.payload.data);
      });

      // Enviar sequencialmente — não em paralelo
      return pendentes.reduce(function(cadeia, registo) {
        return cadeia.then(function(parar) {
          if (parar) return true;  // propagate stop signal
          return _sincronizarUmRegisto(registo).then(function(resultado) {
            // Parar a cadeia apenas em erros de rede (não em conflitos)
            return resultado === 'erro_rede';
          });
        });
      }, Promise.resolve(false));
    })
    .then(function() {
      _sincronizando = false;
      _notificarUI();
      console.log('[Sync] Sincronização concluída.');
    })
    .catch(function(err) {
      _sincronizando = false;
      console.error('[Sync] Erro na sincronização:', err);
    });
}

// ── Enviar um registo individual ─────────────────────────────

function _sincronizarUmRegisto(registo) {
  return _atualizarEstado(registo.id, ESTADO.A_SINCRONIZAR)
    .then(function() {
      var payloadCompleto = Object.assign({}, registo.payload, {
        idempotencyKey:  registo.idempotencyKey,
        criadoOfflineEm: registo.criadoEm
      });

      return chamarAPI('guardarRegistoOffline', payloadCompleto);
    })
    .then(function(resp) {
      if (resp.sucesso && resp.estado === 'em_revisao') {
        // Conflito detectado — marcar para revisão, continuar com os próximos
        return _atualizarEstado(registo.id, ESTADO.EM_REVISAO).then(function() {
          console.log('[Sync] Registo em revisão (conflito):', registo.id);
          _notificarConflito(registo, resp.conflitoId);
          return 'em_revisao';
        });
      }

      if (resp.sucesso) {
        // Aceite automaticamente
        return _atualizarEstado(registo.id, ESTADO.ACEITE_AUTO, {
          sincronizadoEm: new Date().toISOString()
        }).then(function() {
          console.log('[Sync] Registo aceite:', registo.id);
          return 'ok';
        });
      }

      // Erro da Cloud Function (não de rede)
      console.warn('[Sync] Erro do servidor:', resp.mensagem);
      return _atualizarTentativa(registo).then(function() {
        return 'erro_servidor';
      });
    })
    .catch(function(err) {
      // Erro de rede ou timeout — parar a cadeia
      console.warn('[Sync] Erro de rede:', err.message);
      return _atualizarEstado(registo.id, ESTADO.PENDENTE).then(function() {
        return 'erro_rede';
      });
    });
}

// ============================================================
// LEITURA DA FILA — usada pela UI para badges e listas
// ============================================================

function obterPendentes() {
  return initSync().then(function(db) {
    return db.getAllFromIndex(SYNC_STORE, 'estado', ESTADO.PENDENTE);
  });
}

function obterEmRevisao() {
  return initSync().then(function(db) {
    return db.getAllFromIndex(SYNC_STORE, 'estado', ESTADO.EM_REVISAO);
  });
}

function obterTodosPendentesERevisao() {
  return Promise.all([obterPendentes(), obterEmRevisao()])
    .then(function(resultados) {
      return resultados[0].concat(resultados[1]);
    });
}

function obterRegistoPorId(id) {
  return initSync().then(function(db) {
    return db.get(SYNC_STORE, id);
  });
}

// Consulta a fila por local+data — usado por app.js ao verificar
// dados quando está offline, em substituição da chamada à API.
function obterRegistoLocalPorLocalData(local, data) {
  var chave = local + '|' + data;
  return initSync().then(function(db) {
    return db.getAllFromIndex(SYNC_STORE, 'local_data', chave);
  }).then(function(registos) {
    if (!registos || registos.length === 0) return null;

    // Se houver mais do que um (improvável), preferir o mais recente
    registos.sort(function(a, b) {
      return new Date(b.criadoEm) - new Date(a.criadoEm);
    });

    // Devolver apenas registos activos (não rejeitados nem com erro permanente)
    var activo = registos.find(function(r) {
      return r.estado !== ESTADO.REJEITADO && r.estado !== ESTADO.ERRO;
    });

    return activo ? activo.payload : null;
  });
}

// Contagem total de registos activos (pendentes + em revisão)
// Usado para o badge no header
function contarActivos() {
  return obterTodosPendentesERevisao().then(function(lista) {
    return lista.length;
  });
}

// ============================================================
// ACTUALIZAÇÃO DE ESTADO — interno
// ============================================================

function _atualizarEstado(id, novoEstado, camposExtra) {
  return initSync().then(function(db) {
    return db.get(SYNC_STORE, id).then(function(registo) {
      if (!registo) return;
      registo.estado = novoEstado;
      if (camposExtra) {
        Object.assign(registo, camposExtra);
      }
      return db.put(SYNC_STORE, registo);
    });
  });
}

function _atualizarTentativa(registo) {
  registo.tentativas = (registo.tentativas || 0) + 1;

  if (registo.tentativas >= SYNC_MAX_TENTATIVAS) {
    console.warn('[Sync] Máximo de tentativas atingido:', registo.id);
    return _atualizarEstado(registo.id, ESTADO.ERRO, {
      erroMensagem: 'Máximo de ' + SYNC_MAX_TENTATIVAS + ' tentativas atingido.'
    });
  }

  return _atualizarEstado(registo.id, ESTADO.PENDENTE, {
    tentativas: registo.tentativas
  });
}

// Chamado por editor.js após o admin resolver um conflito
function marcarResolvido(id, decisao) {
  var novoEstado = decisao === 'rejeitado' ? ESTADO.REJEITADO : ESTADO.ACEITE_ADMIN;
  return _atualizarEstado(id, novoEstado, {
    sincronizadoEm: new Date().toISOString()
  });
}

// Limpar registos já resolvidos com mais de 7 dias (housekeeping)
function limparResolvidos() {
  var limite = new Date();
  limite.setDate(limite.getDate() - 7);
  var limiteISO = limite.toISOString();

  return initSync().then(function(db) {
    var tx    = db.transaction(SYNC_STORE, 'readwrite');
    var store = tx.objectStore(SYNC_STORE);
    return store.getAll().then(function(todos) {
      var promises = todos
        .filter(function(r) {
          var resolvido = r.estado === ESTADO.ACEITE_AUTO   ||
                          r.estado === ESTADO.ACEITE_ADMIN  ||
                          r.estado === ESTADO.REJEITADO;
          return resolvido && r.criadoEm < limiteISO;
        })
        .map(function(r) { return store.delete(r.id); });
      return Promise.all(promises).then(function() { return tx.done; });
    });
  });
}

// ============================================================
// BACKGROUND SYNC
//
// Registar tag para que o SW sincronize automaticamente
// quando a rede regressar (Android Chrome).
// iOS Safari não suporta — o fallback é o listener 'online'
// em offline.js que chama sincronizarFila() directamente.
// ============================================================

function _registarBackgroundSync() {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) {
    console.log('[Sync] Background Sync não disponível — usando fallback online event.');
    return;
  }
  navigator.serviceWorker.ready
    .then(function(reg) {
      return reg.sync.register(SYNC_BG_TAG);
    })
    .then(function() {
      console.log('[Sync] Background Sync registado:', SYNC_BG_TAG);
    })
    .catch(function(err) {
      console.warn('[Sync] Falha ao registar Background Sync:', err);
    });
}

// ============================================================
// SUGERIR PDF COMO BACKUP FÍSICO
//
// Chamado quando um registo fica pendente (sem rede).
// Usa um toast persistente com botão de acção.
// A geração do PDF em si continua a ser responsabilidade
// de offline.js / gerarPDF().
// ============================================================

function _sugerirPDF(payload) {
  // Aguardar um momento para não colidir com o toast de "guardado offline"
  setTimeout(function() {
    _mostrarToastPDF(payload);
  }, 2500);
}

function _mostrarToastPDF(payload) {
  // Remover toast anterior de PDF se existir
  var anterior = document.getElementById('toastPDFBackup');
  if (anterior) anterior.parentNode.removeChild(anterior);

  var toast = document.createElement('div');
  toast.id        = 'toastPDFBackup';
  toast.className = 'toast-pdf-backup';
  toast.innerHTML =
    '<div class="toast-pdf-texto">' +
      '📄 Guarde também um PDF como backup físico deste registo.' +
    '</div>' +
    '<div class="toast-pdf-acoes">' +
      '<button class="toast-pdf-btn" id="btnToastGerarPDF">Gerar PDF</button>' +
      '<button class="toast-pdf-fechar" id="btnToastPDFFechar">✕</button>' +
    '</div>';

  document.body.appendChild(toast);

  // Animar entrada
  setTimeout(function() { toast.classList.add('visivel'); }, 50);

  document.getElementById('btnToastGerarPDF').addEventListener('click', function() {
    if (typeof mostrarModalPDF === 'function') mostrarModalPDF();
    _fecharToastPDF();
  });

  document.getElementById('btnToastPDFFechar').addEventListener('click', _fecharToastPDF);

  // Auto-fechar após 15 segundos
  setTimeout(_fecharToastPDF, 15000);
}

function _fecharToastPDF() {
  var toast = document.getElementById('toastPDFBackup');
  if (!toast) return;
  toast.classList.remove('visivel');
  setTimeout(function() {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 400);
}

// ============================================================
// NOTIFICAÇÕES PARA A UI
// ============================================================

// Dispara evento personalizado para que app.js / editor.js
// actualizem badges sem dependência directa deste módulo
function _notificarUI() {
  window.dispatchEvent(new CustomEvent('rmz-sync-update'));
}

function _notificarConflito(registo, conflitoId) {
  window.dispatchEvent(new CustomEvent('rmz-sync-conflito', {
    detail: {
      registoId:  registo.id,
      conflitoId: conflitoId,
      local:      registo.payload.local,
      data:       registo.payload.data
    }
  }));
}

// ============================================================
// UTILITÁRIOS
// ============================================================

function _gerarUUID() {
  // Usar crypto.randomUUID() se disponível (Chrome 92+, Firefox 95+)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback compatível
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    var v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Converter DD/MM/YYYY para timestamp numérico para ordenação
function _parseDateDMY(str) {
  if (!str) return 0;
  var p = str.split('/');
  if (p.length !== 3) return 0;
  return new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10)).getTime();
}

// ============================================================
// API PÚBLICA
// ============================================================

window.syncInit              = initSync;
window.syncGuardarNaFila     = guardarNaFila;
window.syncSincronizarFila   = sincronizarFila;
window.syncObterPendentes    = obterPendentes;
window.syncObterEmRevisao    = obterEmRevisao;
window.syncContarActivos     = contarActivos;
window.syncObterRegistoPorId = obterRegistoPorId;
window.syncMarcarResolvido   = marcarResolvido;
window.syncLimparResolvidos  = limparResolvidos;
window.SYNC_ESTADO           = ESTADO;
window.syncObterRegistoLocalPorLocalData = obterRegistoLocalPorLocalData;
