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

// Configuração injectada por js/config.js (não versionado — ver
// js/config.example.js e .github/workflows/deploy.yml)
if (!window.FIREBASE_CONFIG || !window.CLOUD_FUNCTION_URL) {
  throw new Error(
    '[api.js] Configuração em falta. Verifique se js/config.js foi ' +
    'carregado antes de js/api.js (crie a partir de js/config.example.js ' +
    'para desenvolvimento local).'
  );
}

var CLOUD_FUNCTION_URL = window.CLOUD_FUNCTION_URL;
var FIREBASE_CONFIG    = window.FIREBASE_CONFIG;

// ── Constantes de rede ───────────────────────────────────────

var REQUEST_TIMEOUT_MS = 20000;

// ── Inicialização Firebase (idempotente) ─────────────────────

if (!firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
  // ── App Check (reCAPTCHA Enterprise) ──────────────────────────
if (window.RECAPTCHA_ENTERPRISE_SITE_KEY) {
  var appCheckProvider = new firebase.appCheck.ReCaptchaEnterpriseProvider(
    window.RECAPTCHA_ENTERPRISE_SITE_KEY
  );
  firebase.appCheck().activate(appCheckProvider, true); // true = auto-refresh do token
} else {
  console.warn('[AppCheck] RECAPTCHA_ENTERPRISE_SITE_KEY em falta — App Check inactivo.');
}

function obterAppCheckToken() {
  if (!window.RECAPTCHA_ENTERPRISE_SITE_KEY) return Promise.resolve(null);
  return firebase.appCheck().getToken(false)
    .then(function (r) { return r.token; })
    .catch(function () { return null; });
}
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
  function limparTimeout() { if (timeoutId !== null) { clearTimeout(timeoutId); timeoutId = null; } }

  return Promise.all([obterIdToken(), obterAppCheckToken()])
    .then(function (r) {
      var idToken = r[0], appCheckToken = r[1];
      timeoutId = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
      return fetch(CLOUD_FUNCTION_URL, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Firebase-AppCheck': appCheckToken || ''
        },
        body:   JSON.stringify({ action: action, payload: payload, idToken: idToken }),
        signal: controller.signal
      });
    })
    .then(function (response) { limparTimeout(); return response.json(); })
    .then(function (data) {
      if (data.codigo === 401) { limparSessao(); throw new Error('Não autorizado. Faça login novamente.'); }
      return data;
    })
    .catch(function (err) {
      limparTimeout();
      if (err.name === 'AbortError') throw new Error('Tempo limite excedido (' + REQUEST_TIMEOUT_MS/1000 + 's).');
      throw err;
    });
}

function chamarAPIPublica(action, payload) {
  return obterAppCheckToken().then(function (appCheckToken) {
    return fetch(CLOUD_FUNCTION_URL, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Firebase-AppCheck': appCheckToken || ''
      },
      body: JSON.stringify({ action: action, payload: payload || {} })
    }).then(function (r) { return r.json(); });
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

function apiGuardarRegistosLote(payload, onSuccess, onFailure) {
  chamarAPI('guardarRegistosLote', payload)
    .then(onSuccess)
    .catch(function (err) { onFailure({ message: err.message }); });
}

function apiCriarUtilizador(payload, onSuccess, onFailure) {
  chamarAPI('criarUtilizador', payload)
    .then(onSuccess)
    .catch(function (err) { onFailure({ message: err.message }); });
}
