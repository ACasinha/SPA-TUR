// ============================================================
// api.js — Inicialização Firebase + chamadas à Cloud Function
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
//
// Responsabilidade: configurar o Firebase, expor chamarAPI()
// e as funções de acesso directo à Cloud Function.
//
// NÃO contém: lógica de sessão, autenticação, UI de login.
// Esses aspectos estão em auth.js.
// ============================================================

'use strict';

// ── Configuração — editar apenas estes dois valores ──────────

var CLOUD_FUNCTION_URL = 'https://europe-west1-stats-tur.cloudfunctions.net/rmz-api';

var FIREBASE_CONFIG = {
  apiKey:            'AIzaSyDk6jfWQC2C-5SEblLRZ5euNU6OHUusopU',
  authDomain:        'stats-tur.firebaseapp.com',
  projectId:         'stats-tur',
  storageBucket:     'stats-tur.firebasestorage.app',
  messagingSenderId: '146563538068',
  appId:             '1:146563538068:web:429757296c7ce85d64e881'
};

// ── Constantes de rede ───────────────────────────────────────

var REQUEST_TIMEOUT_MS = 20000;

// ── Inicialização Firebase (idempotente) ─────────────────────

if (!firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
}

var firebaseAuth = firebase.auth();

// Persistência LOCAL: a sessão sobrevive a fechar o separador.
// O resultado desta promise não bloqueia o arranque da app;
// auth.js aguarda o onAuthStateChanged que ocorre depois.
firebaseAuth
  .setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .catch(function (err) {
    console.warn('[Firebase] Erro ao definir persistência:', err);
  });

// ============================================================
// chamarAPI — único ponto de saída para a Cloud Function
//
// Obtém o token JWT via auth.js (obterIdToken) e envia o
// pedido com timeout. Lança erro se a sessão estiver inválida
// (código 401) para que auth.js possa reagir.
// ============================================================

function chamarAPI(action, payload) {
  payload = payload || {};

  var controller = new AbortController();
  var timeoutId  = null;

  function limparTimeout() {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  // obterIdToken está definido em auth.js e valida a sessão
  // antes de devolver o JWT.
  return obterIdToken()
    .then(function (idToken) {
      console.log('[API] →', action);
      timeoutId = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);

      return fetch(CLOUD_FUNCTION_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: action, payload: payload, idToken: idToken }),
        signal:  controller.signal
      });
    })
    .then(function (response) {
      limparTimeout();
      console.log('[API] ← HTTP', response.status);
      return response.json();
    })
    .then(function (data) {
      // 401 significa sessão revogada no servidor; notificar auth.js
      if (data.codigo === 401) {
        limparSessao();          // auth.js
        throw new Error('Não autorizado. Faça login novamente.');
      }
      return data;
    })
    .catch(function (err) {
      limparTimeout();
      if (err.name === 'AbortError') {
        throw new Error(
          'Tempo limite excedido (' + REQUEST_TIMEOUT_MS / 1000 + 's). Verifique a ligação.'
        );
      }
      throw err;
    });
}

// ============================================================
// Funções de domínio — encapsulam as actions da Cloud Function
// Usadas pela lógica de negócio (app.js, editor.js, etc.)
// ============================================================

function apiVerificarDados(local, data, onSuccess, onFailure) {
  chamarAPI('verificarDados', { local: local, data: data })
    .then(onSuccess)
    .catch(function (err) { onFailure({ message: err.message }); });
}

function apiGuardarRegisto(payload, onSuccess, onFailure) {
  chamarAPI('guardarRegisto', payload)
    .then(onSuccess)
    .catch(function (err) { onFailure({ message: err.message }); });
}

function apiCriarUtilizador(payload, onSuccess, onFailure) {
  chamarAPI('criarUtilizador', payload)
    .then(onSuccess)
    .catch(function (err) { onFailure({ message: err.message }); });
}
