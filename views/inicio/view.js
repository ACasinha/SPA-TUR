// ============================================================
// views/inicio/view.js
// View: Página Inicial — atalhos por módulo
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
// ============================================================

'use strict';

(function() {

  var _listeners = [];

  function _al(target, tipo, fn) {
    target.addEventListener(tipo, fn);
    _listeners.push({ target: target, tipo: tipo, fn: fn });
  }

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

  // ── Cache de indicadores ──────────────────────────────────
  var TTL_INDICADORES = 3 * 60 * 1000; // 3 minutos
  var _cacheIndicadores = {};

  function _comCache(chave, fnCarregar) {
    var agora = Date.now();
    var entrada = _cacheIndicadores[chave];
    if (entrada && (agora - entrada.timestamp) < TTL_INDICADORES) {
      return Promise.resolve(entrada.valor);
    }
    return fnCarregar().then(function(valor) {
      _cacheIndicadores[chave] = { valor: valor, timestamp: Date.now() };
      return valor;
    });
  }

  // Variante com timeout de segurança — evita que indicadores
  // que falham silenciosamente bloqueiem indefinidamente
  function _comCacheETimeout(chave, fnCarregar, timeoutMs) {
    return _comCache(chave, function() {
      return Promise.race([
        fnCarregar(),
        new Promise(function(_, reject) {
          setTimeout(function() {
            reject(new Error('timeout indicador ' + chave));
          }, timeoutMs || 8000);
        })
      ]);
    });
  }

  // ============================================================
  // CICLO DE VIDA
  // ============================================================

  function mount(perfil) {
    spaSetHeader({ titulo: 'Início' });

    // ── Saudação ──────────────────────────────────────────────
    var nomeEl = document.getElementById('inicioSaudacaoNome');
    if (nomeEl) nomeEl.textContent = 'Bem-vindo(a), ' + (perfil.nome || perfil.email || '');

    // ── Badge de role ─────────────────────────────────────────
    var badgeRole = document.getElementById('inicioBadgeRole');
    if (badgeRole) badgeRole.textContent = _labelRole(perfil);

    // ── Último login — defensivo contra timestamps pendentes ──
    var ultimoLoginEl = document.getElementById('inicioUltimoLogin');
    if (ultimoLoginEl) {
      ultimoLoginEl.textContent = _formatarUltimoLogin(perfil.ultimoLoginEm);
    }

    // ── Grelha de módulos ─────────────────────────────────────
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

    // Refrescar badge do registo quando a fila offline é processada
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
  // INDICADORES
  // ============================================================

  // Registo — registos por sincronizar (IndexedDB, sem rede)
  function _carregarIndicadorRegisto(idBadge) {
    if (typeof syncContarActivos !== 'function') return;
    syncContarActivos()
      .then(function(n) {
        _actualizarBadge(idBadge, n,
          n + (n === 1 ? ' registo por sincronizar' : ' registos por sincronizar'),
          'aviso');
      })
      .catch(function() {});
  }

  // Editor — conflitos pendentes no mês actual
  function _carregarIndicadorEditor(idBadge) {
    var hoje = new Date();
    var mes  = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
    var locais = []
      .concat(typeof LOCAIS_DETALHADOS !== 'undefined' ? LOCAIS_DETALHADOS : [])
      .concat(typeof LOCAIS_SIMPLES    !== 'undefined' ? LOCAIS_SIMPLES    : []);
    if (!locais.length || typeof chamarAPI !== 'function') return;

    _comCacheETimeout('editor', function() {
      return Promise.all(locais.map(function(local) {
        return chamarAPI('obterConflitos', { local: local, mes: mes })
          .then(function(resp) {
            return (resp && resp.sucesso) ? Object.keys(resp.conflitos || {}).length : 0;
          })
          .catch(function() { return 0; });
      })).then(function(contagens) {
        return contagens.reduce(function(a, b) { return a + b; }, 0);
      });
    }, 10000).then(function(total) {
      _actualizarBadge(idBadge, total,
        total + (total === 1 ? ' conflito pendente' : ' conflitos pendentes'),
        'aviso');
    }).catch(function() {});
  }

  // Inventário — materiais com stock baixo ou esgotado
  // Lê directo do Firestore (cache local do SDK, sem Cloud Function)
  function _carregarIndicadorInventario(idBadge) {
    if (typeof db === 'undefined') return;
    _comCacheETimeout('inventario', function() {
      return db.collection('materiais').where('ativo', '==', true).get()
        .then(function(snap) {
          var n = 0;
          snap.forEach(function(doc) {
            var d = doc.data();
            var total = 0;
            Object.keys(d.stockPorLocal || {}).forEach(function(l) {
              total += (d.stockPorLocal[l] || 0);
            });
            if (total <= 0 || total < (d.stockMinimo || 0)) n++;
          });
          return n;
        });
    }, 8000).then(function(n) {
      _actualizarBadge(idBadge, n,
        n + (n === 1 ? ' material com stock baixo' : ' materiais com stock baixo'),
        'erro');
    }).catch(function() {});
  }

  // Admin — utilizadores ativos
  // Lê directo do Firestore em vez de passar pela Cloud Function
  function _carregarIndicadorAdmin(idBadge) {
    if (typeof db === 'undefined') return;
    _comCacheETimeout('admin', function() {
      return db.collection('users').where('ativo', '==', true).get()
        .then(function(snap) { return snap.size; });
    }, 8000).then(function(ativos) {
      _actualizarBadge(idBadge, ativos,
        ativos + (ativos === 1 ? ' utilizador ativo' : ' utilizadores ativos'),
        'info', true);
    }).catch(function() {});
  }

  // ============================================================
  // UTILITÁRIOS
  // ============================================================

  // Formata o timestamp de último login de forma defensiva.
  // O Firestore pode devolver null em serverTimestamp() ainda
  // pendente de confirmação do servidor (escrita feita há
  // poucos ms no auth.js durante o login).
  function _formatarUltimoLogin(ts) {
    if (!ts) return '';
    try {
      var d = ts.toDate ? ts.toDate() : new Date(ts);
      if (!d || isNaN(d.getTime())) return '';
      return 'Última entrada: ' +
        d.toLocaleDateString('pt-PT') +
        ' às ' +
        d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  function _labelRole(perfil) {
    if (perfil.role === 'administrador') return 'Administrador';
    var extras = [];
    if (perfil.acessoRegisto)    extras.push('Registo');
    if (perfil.acessoDashboard)  extras.push('Dashboard');
    if (perfil.acessoEditor)     extras.push('Editor');
    if (perfil.acessoInventario) extras.push('Inventário');
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
