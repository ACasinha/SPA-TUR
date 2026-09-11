// ============================================================
// views/inicio/view.js
// View: Página Inicial — atalhos por módulo
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
// ============================================================

'use strict';

(function() {

  var _listeners = [];

  var MODULOS = [
    {
      id:     'registo',
      titulo: 'Registo Diário',
      desc:   'Registar turistas e visitantes por local e dia.',
      icone:  'list_alt',
      rota:   '/registo',
      visivel: function(p) { return p.role === 'administrador' || p.acessoRegisto === true; },
      indicador: _carregarIndicadorRegisto
    },
    {
      id:     'dashboard',
      titulo: 'Dashboard de Análise',
      desc:   'Gráficos e estatísticas de visitantes.',
      icone:  'analytics',
      rota:   '/dashboard',
      visivel: function(p) { return p.role === 'administrador' || p.acessoDashboard === true; }
    },
    {
      id:     'editor',
      titulo: 'Editor Mensal',
      desc:   'Corrigir e completar registos de meses anteriores.',
      icone:  'edit_document',
      rota:   '/editor',
      visivel: function(p) { return p.role === 'administrador' || p.acessoEditor === true; },
      indicador: _carregarIndicadorEditor
    },
    {
      id:     'inventario',
      titulo: 'Inventário de Material',
      desc:   'Gerir stock de material promocional turístico.',
      icone:  'inventory_2',
      rota:   '/inventario',
      visivel: function(p) { return p.role === 'administrador' || p.acessoInventario === true; },
      indicador: _carregarIndicadorInventario
    },
    {
      id:     'admin',
      titulo: 'Gestão de Utilizadores',
      desc:   'Criar contas e atribuir permissões de acesso.',
      icone:  'admin_panel_settings',
      rota:   '/admin',
      visivel: function(p) { return p.role === 'administrador'; },
      indicador: _carregarIndicadorAdmin
    }
  ];

  // ============================================================
  // CICLO DE VIDA
  // ============================================================

  function mount(perfil) {
    spaSetHeader({ titulo: 'Início' });

    var nomeEl = document.getElementById('inicioSaudacaoNome');
    if (nomeEl) nomeEl.textContent = 'Bem-vindo(a), ' + (perfil.nome || perfil.email || '');

    var badgeRole = document.getElementById('inicioBadgeRole');
    if (badgeRole) badgeRole.textContent = _labelRole(perfil);

    var ultimoLoginEl = document.getElementById('inicioUltimoLogin');
    if (ultimoLoginEl) {
      if (perfil.ultimoLoginEm) {
        var d = perfil.ultimoLoginEm.toDate ? perfil.ultimoLoginEm.toDate() : new Date(perfil.ultimoLoginEm);
        ultimoLoginEl.textContent = 'Última entrada: ' + d.toLocaleDateString('pt-PT') +
          ' às ' + d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
      } else {
        ultimoLoginEl.textContent = '';
      }
    }

    var grelha = document.getElementById('inicioGrelha');
    if (!grelha) return;
    grelha.innerHTML = '';

    var visiveis = MODULOS.filter(function(m) { return m.visivel(perfil); });

    if (!visiveis.length) {
      grelha.innerHTML = '<div class="inicio-vazio">Não tem módulos atribuídos. Contacte o administrador.</div>';
      return;
    }

    visiveis.forEach(function(m) {
      grelha.appendChild(_criarCartao(m));
      if (typeof m.indicador === 'function') {
        m.indicador('inicioBadge-' + m.id);
      }
    });

    // re-sincronizar o badge do Registo Diário quando a fila
  // offline for processada em segundo plano (ex: reconexão enquanto
  // o utilizador está no ecrã de Início)
  _al(window, 'rmz-sync-update', function() {
    _carregarIndicadorRegisto('inicioBadge-registo');
  });
 
  }

  function unmount() {
    _listeners.forEach(function(l) { l.target.removeEventListener(l.tipo, l.fn); });
    _listeners = [];
    spaResetHeader();
  }

  // ============================================================
  // CARTÕES
  // ============================================================

  function _criarCartao(modulo) {
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'inicio-card';
    card.innerHTML =
      '<span class="inicio-card-icone material-symbols-rounded">' + modulo.icone + '</span>' +
      '<span class="inicio-card-titulo">' + _esc(modulo.titulo) + '</span>' +
      '<span class="inicio-card-desc">' + _esc(modulo.desc) + '</span>' +
      '<span class="inicio-card-badge" id="inicioBadge-' + modulo.id + '"></span>';
    card.addEventListener('click', function() {
      if (typeof routerNavegar === 'function') routerNavegar(modulo.rota);
    });
    return card;
  }

  function _actualizarBadge(idBadge, n, texto, tipo, mostrarSempre) {
    var el = document.getElementById(idBadge);
    if (!el) return;
    if (n > 0 || mostrarSempre) {
      el.textContent = texto;
      el.className = 'inicio-card-badge badge-' + (tipo || 'info') + ' visivel';
    } else {
      el.className = 'inicio-card-badge';
    }
  }

  // ============================================================
  // INDICADORES — carregados de forma assíncrona, não bloqueiam o render
  // ============================================================

  // Registo — registos por sincronizar (IndexedDB local, sem custo de rede)
  function _carregarIndicadorRegisto(idBadge) {
    if (typeof syncContarActivos !== 'function') return;
    syncContarActivos().then(function(n) {
      _actualizarBadge(idBadge, n, n + (n === 1 ? ' registo por sincronizar' : ' registos por sincronizar'), 'aviso');
    }).catch(function() {});
  }

  // Editor — conflitos pendentes no mês actual, somados por local
  // (reutiliza a action 'obterConflitos' já usada no editor mensal)
  function _carregarIndicadorEditor(idBadge) {
    var hoje = new Date();
    var mes  = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
    var locais = []
      .concat(typeof LOCAIS_DETALHADOS !== 'undefined' ? LOCAIS_DETALHADOS : [])
      .concat(typeof LOCAIS_SIMPLES    !== 'undefined' ? LOCAIS_SIMPLES    : []);
    if (!locais.length || typeof chamarAPI !== 'function') return;

    Promise.all(locais.map(function(local) {
      return chamarAPI('obterConflitos', { local: local, mes: mes })
        .then(function(resp) { return (resp && resp.sucesso) ? Object.keys(resp.conflitos || {}).length : 0; })
        .catch(function() { return 0; });
    })).then(function(contagens) {
      var total = contagens.reduce(function(a, b) { return a + b; }, 0);
      _actualizarBadge(idBadge, total, total + (total === 1 ? ' conflito pendente' : ' conflitos pendentes'), 'aviso');
    });
  }

  // Inventário — materiais com stock baixo ou esgotado
  function _carregarIndicadorInventario(idBadge) {
    if (typeof db === 'undefined') return;
    db.collection('materiais').where('ativo', '==', true).get().then(function(snap) {
      var n = 0;
      snap.forEach(function(doc) {
        var d = doc.data();
        var total = 0;
        Object.keys(d.stockPorLocal || {}).forEach(function(l) { total += (d.stockPorLocal[l] || 0); });
        if (total <= 0 || total < (d.stockMinimo || 0)) n++;
      });
      _actualizarBadge(idBadge, n, n + (n === 1 ? ' material com stock baixo' : ' materiais com stock baixo'), 'erro');
    }).catch(function() {});
  }

  // Admin — utilizadores activos
  function _carregarIndicadorAdmin(idBadge) {
    if (typeof listarUtilizadores !== 'function') return;
    listarUtilizadores().then(function(lista) {
      var ativos = lista.filter(function(u) { return u.ativo; }).length;
      _actualizarBadge(idBadge, ativos, ativos + (ativos === 1 ? ' utilizador ativo' : ' utilizadores ativos'), 'info', true);
    }).catch(function() {});
  }

  // ============================================================
  // UTILITÁRIOS
  // ============================================================

  function _labelRole(perfil) {
    if (perfil.role === 'administrador') return 'Administrador';
    var extras = [];
    if (perfil.acessoRegisto)     extras.push('Registo');
    if (perfil.acessoDashboard)   extras.push('Dashboard');
    if (perfil.acessoEditor)      extras.push('Editor');
    if (perfil.acessoInventario)  extras.push('Inventário');
    return extras.length ? 'Utilizador · ' + extras.join(', ') : 'Utilizador';
  }

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ============================================================
  // REGISTAR A VIEW
  // ============================================================

  window.__views = window.__views || {};
  window.__views.inicio = {
    mount:   mount,
    unmount: unmount
  };

})();
