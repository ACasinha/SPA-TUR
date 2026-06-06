// ============================================================
// auth.js — Autenticação Firebase e gestão de sessão
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
//
// Responsabilidade:
//   • Registar/encerrar sessão com limite de 10 horas
//   • Expor obterIdToken() para api.js
//   • Expor apiAutenticar() / apiLogout() / apiObservarAuth()
//     para login.js
//
// NÃO contém: configuração Firebase (api.js), UI (login.js),
// lógica de negócio (app.js / editor.js).
// ============================================================

'use strict';

// ── Constantes de sessão ─────────────────────────────────────

var SESSAO_MAX_MS  = 10 * 60 * 60 * 1000; // 10 horas
var CHAVE_LOGIN_TS = 'rmz_login_ts';

// Flag que silencia o onAuthStateChanged durante o fluxo de
// signInWithEmailAndPassword. Sem isto, o signOut preventivo
// que limpa o estado anterior faz o listener reagir com
// user=null a meio do login, repondo o formulário
// prematuramente.
var _loginEmCurso = false;

// ============================================================
// Gestão do timestamp de sessão
// ============================================================

function registarInicioSessao() {
  localStorage.setItem(CHAVE_LOGIN_TS, String(Date.now()));
}

function sessaoValida() {
  var ts = localStorage.getItem(CHAVE_LOGIN_TS);
  if (!ts) return false;
  return (Date.now() - parseInt(ts, 10)) < SESSAO_MAX_MS;
}

function limparSessao() {
  localStorage.removeItem(CHAVE_LOGIN_TS);
}

// ============================================================
// obterIdToken — usado exclusivamente por api.js / chamarAPI()
// ============================================================

function obterIdToken() {
  if (!sessaoValida()) {
    limparSessao();
    return firebaseAuth.signOut().then(function () {
      return Promise.reject(
        new Error('A sessão expirou após 10 horas. Por favor faça login novamente.')
      );
    });
  }

  var user = firebaseAuth.currentUser;
  if (!user) {
    limparSessao();
    return Promise.reject(
      new Error('Sessão terminada. Por favor faça login novamente.')
    );
  }

  return user.getIdToken(false).catch(function () {
    return user.getIdToken(true);
  });
}

// ============================================================
// apiAutenticar — chamado por login.js ao submeter o formulário
//
// Fluxo sem signOut preventivo:
//   1. Activa _loginEmCurso para silenciar o listener
//   2. signInWithEmailAndPassword
//   3. Regista timestamp de sessão
//   4. Desactiva _loginEmCurso
//   5. Chama onSuccess — login.js notifica a página
//
// O onAuthStateChanged em apiObservarAuth NÃO é o caminho
// de sucesso do login; é apenas para sessões persistidas
// (refresh de página) e para logout. O login activo é
// tratado inteiramente aqui através do callback onSuccess.
// ============================================================

function apiAutenticar(email, password, onSuccess, onFailure) {
  var respondido = false;

  var timeoutId = setTimeout(function () {
    if (respondido) return;
    respondido  = true;
    _loginEmCurso = false;
    onFailure({ message: 'Sem resposta do servidor de autenticação.' });
  }, 15000);

  _loginEmCurso = true;

  firebaseAuth.signInWithEmailAndPassword(email, password)
    .then(function (credencial) {
      if (respondido) return;
      respondido    = true;
      _loginEmCurso = false;
      clearTimeout(timeoutId);

      registarInicioSessao();

// Registar timestamp do login no Firestore
  var uid = credencial.user.uid;
  if (typeof db !== 'undefined') {
    db.collection('users').doc(uid).update({
      ultimoLoginEm: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function() {}); // falha silenciosa — não bloqueia o login
  }

      onSuccess({
        sucesso:         true,
        nomeFuncionario: credencial.user.displayName || credencial.user.email,
        email:           credencial.user.email,
        uid:             credencial.user.uid
      });
    })
    .catch(function (err) {
      if (respondido) return;
      respondido    = true;
      _loginEmCurso = false;
      clearTimeout(timeoutId);
      onFailure({ message: _mensagemErroAuth(err) });
    });
}

// ============================================================
// apiLogout — chamado por login.js quando o utilizador sai
// ============================================================

function apiLogout() {
  limparSessao();
  return firebaseAuth.signOut();
}

// ============================================================
// apiObservarAuth — subscreve mudanças de estado de auth
//
// Usado para dois cenários:
//   A) Refresh de página com sessão persistida — Firebase
//      entrega o utilizador imediatamente; o listener
//      desbloqueia a página sem pedir login.
//   B) Logout — Firebase entrega user=null; o listener
//      mostra o ecrã de login.
//
// NÃO é o caminho de sucesso do login activo (tratado em
// apiAutenticar via callback). Quando _loginEmCurso=true
// ignora disparos intermédios causados por estados
// transitórios do Firebase.
// ============================================================

function apiObservarAuth(callback) {
  return firebaseAuth.onAuthStateChanged(function (user) {
    if (_loginEmCurso) return;

    if (user && !sessaoValida()) {
      limparSessao();
      firebaseAuth.signOut();
      return;
    }

    callback(user);
  });
}

// ============================================================
// Auxiliares privados
// ============================================================

function _mensagemErroAuth(err) {
  var mapa = {
    'auth/user-not-found':         'Email não registado.',
    'auth/wrong-password':         'Password incorrecta.',
    'auth/invalid-credential':     'Email ou password incorrectos.',
    'auth/invalid-email':          'Email inválido.',
    'auth/user-disabled':          'Conta desactivada. Contacte o administrador.',
    'auth/too-many-requests':      'Demasiadas tentativas. Aguarde uns momentos.',
    'auth/network-request-failed': 'Sem ligação à Internet.'
  };
  return mapa[err.code] || err.message;
}
