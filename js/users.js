// ============================================================
// users.js — Perfis e gestão de utilizadores (Firestore)
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
//
// Responsabilidade:
//   • Expor a instância única de Firestore (var db)
//   • Ler e guardar perfis de utilizador
//   • Listar, criar, activar e desactivar utilizadores (admins)
//   • Cache de perfil com TTL de 5 minutos
//
// NÃO contém: Firebase init (api.js), autenticação/sessão
// (auth.js), UI (login.js / admin.js), lógica de negócio
// das páginas (app.js / editor.js).
//
// Dependências em tempo de execução (devem carregar antes):
//   api.js  → firebase (app já inicializado), chamarAPI
//   auth.js → firebaseAuth
// ============================================================

'use strict';

// ── Instância única de Firestore ─────────────────────────────
// api.js já chamou firebase.initializeApp(); aqui apenas
// obtemos a referência à base de dados.
var db = firebase.firestore();

// ── Cache de perfil ──────────────────────────────────────────

var _cacheUtilizador = null;
var _timestampCache  = 0;
var CACHE_TTL_MS     = 5 * 60 * 1000; // 5 minutos

// Roles aceites pela aplicação
var ROLES_VALIDAS = ['utilizador', 'visualizador', 'administrador'];

// ============================================================
// obterPerfilUtilizador
//
// Lê o documento do utilizador autenticado em /users/{uid}.
// Se não existir, cria um perfil base com role 'utilizador'.
// Resultado em cache durante CACHE_TTL_MS.
//
// forcar = true → ignora cache (útil após edição de perfil)
// ============================================================

function obterPerfilUtilizador(forcar) {
  var agora = Date.now();

  if (!forcar && _cacheUtilizador && (agora - _timestampCache < CACHE_TTL_MS)) {
    return Promise.resolve(_cacheUtilizador);
  }

  var user = firebaseAuth.currentUser;
  if (!user) {
    return Promise.reject(new Error('Utilizador não autenticado.'));
  }

  return db.collection('users').doc(user.uid).get()
    .then(function (doc) {
      if (!doc.exists) {
        return _criarPerfilBase(user);
      }

      var perfil = doc.data();
      perfil.uid = doc.id;
      return _normalizarPerfil(perfil);
    })
    .then(function (perfil) {
      _cacheUtilizador = perfil;
      _timestampCache  = Date.now();
      return perfil;
    })
    .catch(function (err) {
      console.error('[users] Erro ao obter perfil:', err);
      throw err;
    });
}

// ============================================================
// limparCacheUtilizador — chamado por auth.js no logout
// ============================================================

function limparCacheUtilizador() {
  _cacheUtilizador = null;
  _timestampCache  = 0;
}

// ============================================================
// Helpers de acesso — evitam repetição de lógica de role
// Cada um aceita um objecto perfil e devolve boolean.
// ============================================================

function _temAcessoDashboard(perfil) {
  return perfil.role === 'administrador'
      || perfil.role === 'visualizador'
      || perfil.acessoDashboard === true;
}

function _temAcessoEditor(perfil) {
  return perfil.role === 'administrador'
      || perfil.acessoEditor === true;
}

function _temAcessoInventario(perfil) {
  return perfil.role === 'administrador'
      || perfil.acessoInventario === true;
}

function _eAdmin(perfil) {
  return perfil.role === 'administrador';
}

// Versões assíncronas — usadas quando o perfil ainda não está em cache
function verificarSeAdmin() {
  return obterPerfilUtilizador().then(_eAdmin).catch(function () { return false; });
}

function verificarAcessoDashboard() {
  return obterPerfilUtilizador().then(_temAcessoDashboard).catch(function () { return false; });
}

function verificarAcessoEditor() {
  return obterPerfilUtilizador().then(_temAcessoEditor).catch(function () { return false; });
}

function verificarAcessoInventario() {
  return obterPerfilUtilizador().then(_temAcessoInventario).catch(function () { return false; });
}

// ============================================================
// Gestão de utilizadores — apenas administradores
// ============================================================

// ── Listar todos os utilizadores ─────────────────────────────

function listarUtilizadores() {
  return _exigirAdmin()
    .then(function () {
      return db.collection('users').orderBy('email').get();
    })
    .then(function (snapshot) {
      var users = [];
      snapshot.forEach(function (doc) {
        var data = doc.data();
        data.uid = doc.id;
        users.push(_normalizarPerfil(data));
      });
      return users;
    });
}

// ── Actualizar campos de um utilizador ───────────────────────

function atualizarUtilizador(uid, dados) {
  var user = firebaseAuth.currentUser;
  if (!user) return Promise.reject(new Error('Utilizador não autenticado.'));

  return obterPerfilUtilizador()
    .then(function (perfilAtual) {
      var eOProprio = user.uid === uid;
      var eAdmin    = _eAdmin(perfilAtual);

      if (!eAdmin && !eOProprio) {
        throw new Error('Sem permissão para editar este utilizador.');
      }

      // Utilizador comum só pode alterar o próprio nome
      var dadosFiltrados = eAdmin ? dados : { nome: dados.nome };

      if (dadosFiltrados.role && ROLES_VALIDAS.indexOf(dadosFiltrados.role) === -1) {
        throw new Error('Role inválida: ' + dadosFiltrados.role);
      }

      dadosFiltrados.atualizadoEm = firebase.firestore.FieldValue.serverTimestamp();
      return db.collection('users').doc(uid).update(dadosFiltrados);
    })
    .then(function () {
      // Invalidar cache se for o próprio utilizador
      if (firebaseAuth.currentUser && firebaseAuth.currentUser.uid === uid) {
        limparCacheUtilizador();
      }
      return { sucesso: true, mensagem: 'Utilizador atualizado com sucesso.' };
    });
}

// ── Criar utilizador (via Cloud Function — admin only) ───────
// A criação no Firebase Auth só pode ser feita server-side;
// chamarAPI delega em auth.js para obter o JWT.

function criarUtilizador(dados) {
  return _exigirAdmin()
    .then(function () {
      if (dados.role && ROLES_VALIDAS.indexOf(dados.role) === -1) {
        throw new Error('Role inválida: ' + dados.role);
      }
      return chamarAPI('criarUtilizador', dados);
    });
}

// ── Activar / desactivar ──────────────────────────────────────

function ativarUtilizador(uid) {
  return atualizarUtilizador(uid, { ativo: true });
}

function desativarUtilizador(uid) {
  return atualizarUtilizador(uid, { ativo: false });
}

// ── Atalho para o utilizador alterar o próprio nome ──────────

function atualizarMeuNome(novoNome) {
  var user = firebaseAuth.currentUser;
  if (!user) return Promise.reject(new Error('Utilizador não autenticado.'));
  return atualizarUtilizador(user.uid, { nome: novoNome.trim() });
}

// ============================================================
// Auxiliares privados
// ============================================================

// Garante que o utilizador actual é administrador antes de
// executar operações sensíveis. Lança erro se não for.
function _exigirAdmin() {
  return obterPerfilUtilizador().then(function (perfil) {
    if (!_eAdmin(perfil)) {
      throw new Error('Acesso negado. Apenas administradores podem executar esta operação.');
    }
  });
}

// Cria um perfil base no Firestore para utilizadores que
// autenticaram mas ainda não têm documento (primeiro login).
function _criarPerfilBase(user) {
  var perfil = {
    email:            user.email,
    nome:             user.displayName || user.email.split('@')[0],
    role:             'utilizador',
    acessoDashboard:  false,
    acessoEditor:     false,
    acessoInventario: false,
    criadoEm:         firebase.firestore.FieldValue.serverTimestamp(),
    atualizadoEm:     firebase.firestore.FieldValue.serverTimestamp(),
    ativo:            true
  };
  return db.collection('users').doc(user.uid).set(perfil)
    .then(function () {
      perfil.uid = user.uid;
      return _normalizarPerfil(perfil);
    });
}

// Garante retrocompatibilidade: campos booleanos opcionais
// podem estar ausentes em documentos criados antes da sua adição.
function _normalizarPerfil(perfil) {
  if (perfil.acessoDashboard  === undefined) perfil.acessoDashboard  = false;
  if (perfil.acessoEditor     === undefined) perfil.acessoEditor     = false;
  if (perfil.acessoInventario === undefined) perfil.acessoInventario = false;
  if (perfil.ativo            === undefined) perfil.ativo            = true;
  return perfil;
}