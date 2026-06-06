// ============================================================
// admin.js — Lógica do Admin - Gestor de Utilizadores
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
// ============================================================

'use strict';

// ============================================================
// INFORMAÇÕES DE ROLE
// ============================================================

var ROLE_INFO = {
  utilizador:    'Pode fazer login na app e registar visitantes diariamente. Sem acesso ao dashboard nem à administração.',
  visualizador:  'Pode fazer login no dashboard e consultar os gráficos e estatísticas. Não pode registar dados nem gerir utilizadores.',
  administrador: 'Acesso completo: registo de dados, dashboard, editor mensal, gestão de utilizadores e configuração dos gráficos.'
};

function atualizarRoleInfo(selectId, infoId) {
  var role = document.getElementById(selectId).value;
  var el   = document.getElementById(infoId);
  if (el) {
    el.textContent   = ROLE_INFO[role] || '';
    el.style.display = role ? 'block' : 'none';
  }
}

// Mostrar/ocultar checkboxes de acesso conforme o role
// Só fazem sentido para 'utilizador' — os outros têm acesso implícito ou não se aplica
function atualizarCheckboxesNovo() {
  var role  = document.getElementById('userRole').value;
  var grupo = document.getElementById('grupoAcessosNovo');
  if (grupo) grupo.style.display = role === 'utilizador' ? '' : 'none';
}

function atualizarCheckboxesEditar() {
  var role  = document.getElementById('editUserRole').value;
  var grupo = document.getElementById('grupoAcessosEditar');
  if (grupo) grupo.style.display = role === 'utilizador' ? '' : 'none';
}

// ============================================================
// LOGOUT e BOTÃO VOLTAR PARA A APP
// ============================================================

function fazerLogout() {
  logout(false); // do login.js
}

function voltarParaApp()   { window.location.href = 'index.html'; }

// ============================================================
// NOME NO HEADER
// ============================================================

function mostrarNomeUtilizador() {
  obterPerfilUtilizador()
    .then(function(perfil) {
      var nome = perfil.nome || (firebaseAuth.currentUser && firebaseAuth.currentUser.email) || '—';
      document.getElementById('headerNomeFuncionario').textContent = nome;
    })
    .catch(function() {
      var user = firebaseAuth.currentUser;
      document.getElementById('headerNomeFuncionario').textContent = (user && user.email) || '—';
    });
}

// ============================================================
// CARREGAR UTILIZADORES
// ============================================================

function formatarDataHora(ts) {
  if (!ts) return '—';
  var d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('pt-PT') + ' ' +
         d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}


function carregarUtilizadores() {
  var loading = document.getElementById('loadingUsers');
  var tbody   = document.getElementById('usersTableBody');

  loading.classList.add('show');

  listarUtilizadores()
    .then(function(users) {
      loading.classList.remove('show');

      if (users.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="5" class="empty-state">' +
            '<span class="empty-state-icon">👥</span>' +
            '<div>Nenhum utilizador encontrado.</div>' +
          '</td></tr>';
        return;
      }

      tbody.innerHTML = '';
      users.forEach(function(user) {
        var tr    = document.createElement('tr');
        var nome  = esc(user.nome  || '—');
        var email = esc(user.email || '—');
        var uid   = user.uid;

        var badgeRole   = badgeRoleHtml(user.role, user.acessoDashboard, user.acessoEditor);
        var badgeEstado =
          '<span class="estado-pill">' +
            '<span class="badge-status ' + (user.ativo ? 'ativo' : 'inativo') + '"></span>' +
            (user.ativo ? 'Ativo' : 'Inativo') +
          '</span>';

        var ultimoLogin = formatarDataHora(user.ultimoLoginEm);

        var btnEditar =
          '<button class="btn-action btn-editar" onclick="abrirModalEditar(\'' + uid + '\')">' +
            '✏️ Editar' +
          '</button>';
        var btnToggle = user.ativo
          ? '<button class="btn-action btn-desativar" onclick="toggleAtivo(\'' + uid + '\', false)">🚫 Desativar</button>'
          : '<button class="btn-action btn-ativar"    onclick="toggleAtivo(\'' + uid + '\', true)">✅ Ativar</button>';

        tr.innerHTML =
          // ── Cartão mobile ──────────────────────────────────
          '<div class="user-card-header">' +
            '<span class="user-card-nome">' + nome + '</span>' +
            '<span class="user-card-badges">' + badgeRole + badgeEstado + '</span>' +
          '</div>' +
          '<div class="user-card-email">' + email + '</div>' +
          '<div class="user-card-ultimo-login">🕐 Último Login: ' + ultimoLogin + '</div>' +
          '<div class="user-card-actions">' + btnEditar + btnToggle + '</div>' +

          // ── Tabela desktop ─────────────────────────────────
          '<td data-label="Utilizador">' +
            '<strong>' + nome + '</strong>' +
            '<span class="user-email-sub">' + email + '</span>' +
          '</td>' +
          '<td data-label="Role">'         + badgeRole   + '</td>' +
          '<td data-label="Estado">'       + badgeEstado + '</td>' +
          '<td data-label="Último Login">' +
            '<span class="ultimo-login-txt">' + ultimoLogin + '</span>' +
          '</td>' +
          '<td data-label="Ações">' +
            '<div class="user-actions">' + btnEditar + btnToggle + '</div>' +
          '</td>';

        tbody.appendChild(tr);
      });
    })
    .catch(function(err) {
      loading.classList.remove('show');
      mostrarToast('Erro ao carregar utilizadores: ' + err.message, 'erro');
      tbody.innerHTML =
        '<tr><td colspan="5" class="empty-state">' +
          '<span class="empty-state-icon">⚠️</span>' +
          '<div>Erro ao carregar utilizadores.</div>' +
        '</td></tr>';
    });
}


// Gera o HTML do badge de role, incluindo os ícones de acesso extra
function badgeRoleHtml(role, acessoDashboard, acessoEditor) {
  if (role === 'administrador') {
    return '<span class="badge-role badge-admin">Admin</span>';
  }
  if (role === 'visualizador') {
    return '<span class="badge-role badge-visualizador">Visualizador</span>';
  }
  // Utilizador — mostrar ícones dos acessos extra activos
  var extras = '';
  if (acessoDashboard) extras += ' 📊';
  if (acessoEditor)    extras += ' ✏️';
  if (extras) {
    return '<span class="badge-role badge-user badge-user-extra">Utilizador' + extras + '</span>';
  }
  return '<span class="badge-role badge-user">Utilizador</span>';
}

// ============================================================
// MODAL NOVO UTILIZADOR
// ============================================================

function abrirModalNovoUtilizador() {
  document.getElementById('userNome').value     = '';
  document.getElementById('userEmail').value    = '';
  document.getElementById('userPassword').value = '';
  document.getElementById('userRole').value     = 'utilizador';
  document.getElementById('userAcessoDashboard').checked = false;
  document.getElementById('userAcessoEditor').checked    = false;
  document.getElementById('grupoAcessosNovo').style.display = ''; // 'utilizador' é o default
  document.getElementById('roleInfoNovo').textContent    = ROLE_INFO.utilizador;
  document.getElementById('roleInfoNovo').style.display  = 'block';
  document.getElementById('passwordGroup').style.display = 'block';
  document.getElementById('modalTitulo').textContent     = 'Novo Utilizador';
  document.getElementById('modalNovoUser').classList.add('show');
}

function fecharModal() {
  document.getElementById('modalNovoUser').classList.remove('show');
}

function guardarUtilizador() {
  var nome     = document.getElementById('userNome').value.trim();
  var email    = document.getElementById('userEmail').value.trim();
  var password = document.getElementById('userPassword').value;
  var role     = document.getElementById('userRole').value;

  // Os acessos booleanos só são relevantes para 'utilizador'
  var acessoDashboard = role === 'utilizador'
    ? document.getElementById('userAcessoDashboard').checked : false;
  var acessoEditor = role === 'utilizador'
    ? document.getElementById('userAcessoEditor').checked    : false;

  if (!nome || !email || !password) {
    mostrarToast('Por favor preencha todos os campos obrigatórios.', 'erro');
    return;
  }
  if (password.length < 6) {
    mostrarToast('A password deve ter no mínimo 6 caracteres.', 'erro');
    return;
  }

  var btn = document.getElementById('btnGuardarUser');
  btn.disabled = true;
  btn.textContent = '⏳ A guardar...';

  criarUtilizador({ email: email, password: password, nome: nome, role: role,
                    acessoDashboard: acessoDashboard, acessoEditor: acessoEditor })
    .then(function(resp) {
      btn.disabled = false;
      btn.textContent = 'Guardar';
      if (resp.sucesso) {
        mostrarToast('✓ ' + resp.mensagem, 'sucesso');
        fecharModal();
        carregarUtilizadores();
      } else {
        mostrarToast('✗ ' + resp.mensagem, 'erro');
      }
    })
    .catch(function(err) {
      btn.disabled = false;
      btn.textContent = 'Guardar';
      mostrarToast('Erro: ' + err.message, 'erro');
    });
}

// ============================================================
// MODAL EDITAR UTILIZADOR
// ============================================================

function abrirModalEditar(uid) {
  listarUtilizadores()
    .then(function(users) {
      var user = users.find(function(u) { return u.uid === uid; });
      if (!user) { mostrarToast('Utilizador não encontrado.', 'erro'); return; }

      document.getElementById('editUserUid').value   = uid;
      document.getElementById('editUserNome').value  = user.nome  || '';
      document.getElementById('editUserEmail').value = user.email;
      document.getElementById('editUserRole').value  = user.role  || 'utilizador';
      document.getElementById('editAcessoDashboard').checked = !!user.acessoDashboard;
      document.getElementById('editAcessoEditor').checked    = !!user.acessoEditor;

      atualizarCheckboxesEditar();
      atualizarRoleInfo('editUserRole', 'roleInfoEditar');
      document.getElementById('modalEditarUser').classList.add('show');
    })
    .catch(function(err) {
      mostrarToast('Erro ao carregar utilizador: ' + err.message, 'erro');
    });
}

function fecharModalEditar() {
  document.getElementById('modalEditarUser').classList.remove('show');
}

function guardarEdicaoUtilizador() {
  var uid  = document.getElementById('editUserUid').value;
  var nome = document.getElementById('editUserNome').value.trim();
  var role = document.getElementById('editUserRole').value;

  var acessoDashboard = role === 'utilizador'
    ? document.getElementById('editAcessoDashboard').checked : false;
  var acessoEditor = role === 'utilizador'
    ? document.getElementById('editAcessoEditor').checked    : false;

  if (!nome) { mostrarToast('O nome não pode estar vazio.', 'erro'); return; }

  atualizarUtilizador(uid, { nome: nome, role: role,
                              acessoDashboard: acessoDashboard,
                              acessoEditor:    acessoEditor })
    .then(function(resp) {
      mostrarToast('✓ ' + resp.mensagem, 'sucesso');
      fecharModalEditar();
      carregarUtilizadores();
    })
    .catch(function(err) {
      mostrarToast('Erro: ' + err.message, 'erro');
    });
}

// ============================================================
// ATIVAR / DESATIVAR
// ============================================================

function toggleAtivo(uid, ativar) {
  var acao = ativar ? 'ativar' : 'desativar';
  if (!confirm('Tem a certeza que deseja ' + acao + ' este utilizador?')) return;
  var fn = ativar ? ativarUtilizador : desativarUtilizador;
  fn(uid)
    .then(function(resp) {
      mostrarToast('✓ ' + resp.mensagem, 'sucesso');
      carregarUtilizadores();
    })
    .catch(function(err) {
      mostrarToast('Erro: ' + err.message, 'erro');
    });
}

// ============================================================
// UTILITÁRIOS
// ============================================================

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function mostrarToast(msg, tipo) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + tipo + ' show';
  setTimeout(function() { t.classList.remove('show'); }, 3800);
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
  inicializarLogin({
    idWrap:            'adminContainer',
    verificarAcesso:   function(perfil) {
      return perfil.role === 'administrador';
    },
    mensagemSemAcesso: 'Acesso negado. Apenas administradores podem aceder a esta área.',
    onSucesso:         function(perfil) {
      mostrarNomeUtilizador();
      carregarUtilizadores();

      if (typeof construirMenuNav === 'function') construirMenuNav(perfil);
    }
  });
});
