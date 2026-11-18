// views/admin/view.js
'use strict';
(function(){
  var _listeners=[];
  var _users=[];
  var ROLE_INFO={
    utilizador:'Pode fazer login na app e usar apenas os módulos que lhe forem atribuídos abaixo.',
    administrador:'Acesso completo: registo, vendas, dashboard, editor, inventário e gestão de utilizadores.'
  };
  function _e(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function _al(t,ev,fn){if(!t)return;t.addEventListener(ev,fn);_listeners.push({target:t,tipo:ev,fn:fn});}

  function mount(perfil){
    spaSetHeader({titulo:'Gestão de Utilizadores'});
    _carregar();

    _al(document.getElementById('adminPesquisa'),'input',_renderUtilizadores);
    _al(document.getElementById('adminFiltroRole'),'change',_renderUtilizadores);
    _al(document.getElementById('adminFiltroEstado'),'change',_renderUtilizadores);

    ['userNome','userEmail','userPassword'].forEach(function(id){
      _al(document.getElementById(id),'keydown',function(e){
        if(e.key==='Enter'){e.preventDefault();guardar();}
      });
    });
    _al(document.getElementById('editUserNome'),'keydown',function(e){
      if(e.key==='Enter'){e.preventDefault();guardarEdicao();}
    });
    _al(document.getElementById('alterarEmailNovo'),'keydown',function(e){
      if(e.key==='Enter'){e.preventDefault();guardarAlterarEmail();}
    });

    _al(document,'keydown',function(e){
      if(e.key==='Escape'){_fecharModal();_fecharModalEditar();fecharAlterarEmail();_fecharModalLink();}
    });
    ['modalNovoUser','modalEditarUser','modalAlterarEmail','modalLinkPassword'].forEach(function(id){
      var el=document.getElementById(id);
      if(el)_al(el,'click',function(e){
        if(e.target===el){
          if(id==='modalNovoUser')_fecharModal();
          else if(id==='modalEditarUser')_fecharModalEditar();
          else if(id==='modalAlterarEmail')fecharAlterarEmail();
          else _fecharModalLink();
        }
      });
    });
    // Inicializar visibilidade dos grupos de acesso
    onRoleChange('userRole','roleInfoNovo','grupoAcessosNovo');
    onRoleChange('editUserRole','roleInfoEditar','grupoAcessosEditar');
  }

  function unmount(){
    _listeners.forEach(function(l){l.target.removeEventListener(l.tipo,l.fn);});
    _listeners=[];_users=[];spaResetHeader();window.__admin=null;
  }

  function _setBtnLoading(id,loading,defaultHtml,loadingText){
    var btn=document.getElementById(id);
    if(!btn)return;
    btn.disabled=!!loading;
    btn.innerHTML=loading
      ?'<span class="material-symbols-rounded" aria-hidden="true">hourglass_top</span>'+_e(loadingText||'A guardar...')
      :defaultHtml;
  }

  function _fmt(ts){
    if(!ts)return '—';
    var d=ts.toDate?ts.toDate():new Date(ts);
    return d.toLocaleDateString('pt-PT')+' '+d.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'});
  }

  function _badgeRole(role,aR,aD,aE,aI,aV){
    if(role==='administrador')return '<span class="badge-role badge-admin">Admin</span>';
    var icons=[];
    if(aR)icons.push('<span class="material-symbols-rounded" aria-label="Registo Diário" title="Registo Diário">edit_document</span>');
    if(aV)icons.push('<span class="material-symbols-rounded" aria-label="Vendas" title="Vendas">point_of_sale</span>');
    if(aD)icons.push('<span class="material-symbols-rounded" aria-label="Dashboard" title="Dashboard">analytics</span>');
    if(aE)icons.push('<span class="material-symbols-rounded" aria-label="Editor Mensal" title="Editor Mensal">edit_calendar</span>');
    if(aI)icons.push('<span class="material-symbols-rounded" aria-label="Inventário" title="Inventário">inventory_2</span>');
    var ex=icons.length?' '+icons.join(' '):'';
    return '<span class="badge-role badge-user'+(icons.length?' badge-user-extra':'')+'">Utilizador'+ex+'</span>';
  }

  function _carregar(){
    var lo=document.getElementById('loadingUsers');
    if(lo)lo.classList.add('show');
    listarUtilizadores()
      .then(function(users){
        if(lo)lo.classList.remove('show');
        _users=Array.isArray(users)?users:[];
        _renderUtilizadores();
      })
      .catch(function(err){
        if(lo)lo.classList.remove('show');
        mostrarToast('Erro ao carregar: '+err.message,'erro');
      });
  }

  function _renderUtilizadores(){
    var tb=document.getElementById('usersTableBody');
    var countEl=document.getElementById('adminCount');
    if(!tb)return;

    var q=((document.getElementById('adminPesquisa')||{}).value||'').trim().toLowerCase();
    var fRole=(document.getElementById('adminFiltroRole')||{}).value||'todos';
    var fEstado=(document.getElementById('adminFiltroEstado')||{}).value||'todos';

    var filtrados=_users.filter(function(u){
      if(fRole!=='todos' && u.role!==fRole)return false;
      if(fEstado==='ativo' && !u.ativo)return false;
      if(fEstado==='inativo' && u.ativo)return false;
      if(q){
        var nome=(u.nome||'').toLowerCase();
        var email=(u.email||'').toLowerCase();
        if(nome.indexOf(q)===-1 && email.indexOf(q)===-1)return false;
      }
      return true;
    });

    var total=_users.length;
    var ativos=_users.filter(function(u){return !!u.ativo;}).length;
    if(countEl){
      if(!total){
        countEl.textContent='';
      } else if(filtrados.length===total){
        countEl.textContent=total+(total===1?' utilizador':' utilizadores')+' · '+ativos+(ativos===1?' ativo':' ativos');
      } else {
        countEl.textContent='A mostrar '+filtrados.length+' de '+total+(total===1?' utilizador':' utilizadores')+' · '+ativos+(ativos===1?' ativo':' ativos');
      }
    }

    if(!total){
      tb.innerHTML='<tr><td colspan="5" class="empty-state"><span class="empty-state-icon material-symbols-rounded" aria-hidden="true">group</span><div>Nenhum utilizador encontrado.</div></td></tr>';
      return;
    }

    if(!filtrados.length){
      tb.innerHTML='<tr><td colspan="5" class="empty-state"><span class="empty-state-icon material-symbols-rounded" aria-hidden="true">search_off</span><div>Nenhum utilizador corresponde aos filtros aplicados.</div></td></tr>';
      return;
    }

    tb.innerHTML='';
    filtrados.forEach(function(u){
      var tr=document.createElement('tr');
      var nomeTxt=u.nome||'—';
      var nome=_e(nomeTxt),email=_e(u.email||'—'),uid=u.uid;
      var bRole=_badgeRole(u.role,u.acessoRegisto,u.acessoDashboard,u.acessoEditor,u.acessoInventario,u.acessoVendas);
      var bEst='<span class="estado-pill"><span class="badge-status '+(u.ativo?'ativo':'inativo')+'"></span>'+(u.ativo?'Ativo':'Inativo')+'</span>';
      var ul=_fmt(u.ultimoLoginEm);
      var bEd='<button type="button" class="btn-action btn-editar" aria-label="Editar '+nome+'" onclick="window.__admin&&window.__admin.abrirEditar(\''+uid+'\')"><span class="material-symbols-rounded" aria-hidden="true">edit</span>Editar</button>';
      var bTg=u.ativo
        ?'<button type="button" class="btn-action btn-desativar" aria-label="Desativar '+nome+'" onclick="window.__admin&&window.__admin.toggle(\''+uid+'\',false)"><span class="material-symbols-rounded" aria-hidden="true">block</span>Desativar</button>'
        :'<button type="button" class="btn-action btn-ativar" aria-label="Ativar '+nome+'" onclick="window.__admin&&window.__admin.toggle(\''+uid+'\',true)"><span class="material-symbols-rounded" aria-hidden="true">check_circle</span>Ativar</button>';
      tr.innerHTML=
        '<div class="user-card-header"><span class="user-card-nome">'+nome+'</span><span class="user-card-badges">'+bRole+bEst+'</span></div>'+
        '<div class="user-card-email"><span class="material-symbols-rounded" aria-hidden="true">mail</span><span>'+email+'</span></div>'+
        '<div class="user-card-ultimo-login"><span class="material-symbols-rounded" aria-hidden="true" style="font-size:14px">schedule</span>Último Login: '+ul+'</div>'+
        '<div class="user-card-actions">'+bEd+bTg+'</div>'+
        '<td data-label="Utilizador"><strong>'+nome+'</strong><span class="user-email-sub">'+email+'</span></td>'+
        '<td data-label="Role">'+bRole+'</td>'+
        '<td data-label="Estado">'+bEst+'</td>'+
        '<td data-label="Último Login"><span class="ultimo-login-txt">'+ul+'</span></td>'+
        '<td data-label="Ações"><div class="user-actions">'+bEd+bTg+'</div></td>';
      tb.appendChild(tr);
    });
  }

  function onRoleChange(selId,infoId,grupoId){
    var role=(document.getElementById(selId)||{}).value;
    var infoEl=document.getElementById(infoId);
    var grupoEl=document.getElementById(grupoId);
    if(infoEl){infoEl.textContent=ROLE_INFO[role]||'';infoEl.style.display=role?'block':'none';}
    if(grupoEl){grupoEl.style.display=role==='utilizador'?'':'none';}
  }

  function abrirNovo(){
    ['userNome','userEmail','userPassword'].forEach(function(id){var e=document.getElementById(id);if(e)e.value='';});
    var chk=document.getElementById('userDefinirPasswordAgora'); if(chk) chk.checked=false;
    var r=document.getElementById('userRole');if(r)r.value='utilizador';
    ['userAcessoRegisto','userAcessoDashboard','userAcessoEditor','userAcessoInventario','userAcessoVendas'].forEach(function(id){var e=document.getElementById(id);if(e)e.checked=false;});
    onTogglePasswordAgora();
    var mt=document.getElementById('modalTitulo');if(mt)mt.textContent='Novo Utilizador';
    onRoleChange('userRole','roleInfoNovo','grupoAcessosNovo');
    var m=document.getElementById('modalNovoUser');if(m)m.classList.add('show');
    var n=document.getElementById('userNome');if(n)setTimeout(function(){n.focus();},50);
  }

  function _fecharModal(){var m=document.getElementById('modalNovoUser');if(m)m.classList.remove('show');}

  function guardar(){
    var nome  = (document.getElementById('userNome')  || {}).value || '';
    var email = (document.getElementById('userEmail') || {}).value || '';
    var role  = (document.getElementById('userRole')  || {}).value || 'utilizador';
    var definirAgora = (document.getElementById('userDefinirPasswordAgora') || {}).checked || false;
    var pass  = definirAgora ? ((document.getElementById('userPassword') || {}).value || '') : '';
    var aR=role==='utilizador'&&((document.getElementById('userAcessoRegisto')||{}).checked||false);
    var aD=role==='utilizador'&&((document.getElementById('userAcessoDashboard')||{}).checked||false);
    var aE=role==='utilizador'&&((document.getElementById('userAcessoEditor')||{}).checked||false);
    var aI=role==='utilizador'&&((document.getElementById('userAcessoInventario')||{}).checked||false);
    var aV=role==='utilizador'&&((document.getElementById('userAcessoVendas')||{}).checked||false);

    if(!nome.trim()||!email.trim()){mostrarToast('Por favor preencha nome e e-mail.','erro');return;}
    if(definirAgora && pass.length<6){mostrarToast('A password deve ter no mínimo 6 caracteres.','erro');return;}
    if(role==='utilizador'&&!aR&&!aD&&!aE&&!aI&&!aV){mostrarToast('Escolha pelo menos um acesso para este utilizador.','erro');return;}

    var defHtml='<span class="material-symbols-rounded" aria-hidden="true">save</span>Guardar';
    _setBtnLoading('btnGuardarUser',true,defHtml,'A guardar...');

    var dados={email:email.trim(),nome:nome.trim(),role:role,acessoRegisto:aR,acessoDashboard:aD,acessoEditor:aE,acessoInventario:aI,acessoVendas:aV};
    if(definirAgora) dados.password=pass;

    criarUtilizador(dados)
      .then(function(resp){
        _setBtnLoading('btnGuardarUser',false,defHtml);
        if(!resp.sucesso){ mostrarToast(resp.mensagem,'erro'); return; }

        _fecharModal();_carregar();

        if (resp.link) {
          mostrarToast('Utilizador criado.', 'sucesso');
          _abrirModalLink(resp.link);
        } else if (resp.avisoLink) {
          mostrarToast(resp.avisoLink, 'info');
        } else {
          mostrarToast(resp.mensagem, 'sucesso');
        }
      })
      .catch(function(err){
        _setBtnLoading('btnGuardarUser',false,defHtml);
        mostrarToast('Erro: '+err.message,'erro');
      });
  }

  function _preencherModalEditar(u){
    document.getElementById('editUserUid').value=u.uid;
    document.getElementById('editUserNome').value=u.nome||'';
    document.getElementById('editUserEmail').value=u.email||'';
    document.getElementById('editUserRole').value=u.role||'utilizador';
    document.getElementById('editAcessoRegisto').checked=!!u.acessoRegisto;
    document.getElementById('editAcessoDashboard').checked=!!u.acessoDashboard;
    document.getElementById('editAcessoEditor').checked=!!u.acessoEditor;
    document.getElementById('editAcessoInventario').checked=!!u.acessoInventario;
    document.getElementById('editAcessoVendas').checked=!!u.acessoVendas;
    onRoleChange('editUserRole','roleInfoEditar','grupoAcessosEditar');
    var m=document.getElementById('modalEditarUser');if(m)m.classList.add('show');
  }

  function abrirEditar(uid){
    var cached=_users.find(function(x){return x.uid===uid;});
    if(cached){_preencherModalEditar(cached);return;}
    listarUtilizadores().then(function(users){
      var u=users.find(function(x){return x.uid===uid;});
      if(!u){mostrarToast('Utilizador não encontrado.','erro');return;}
      _preencherModalEditar(u);
    }).catch(function(err){mostrarToast('Erro: '+err.message,'erro');});
  }

  function _fecharModalEditar(){var m=document.getElementById('modalEditarUser');if(m)m.classList.remove('show');}

  function guardarEdicao(){
    var uid=(document.getElementById('editUserUid')||{}).value||'';
    var nome=(document.getElementById('editUserNome')||{}).value||'';
    var role=(document.getElementById('editUserRole')||{}).value||'utilizador';
    var aR=role==='utilizador'&&((document.getElementById('editAcessoRegisto')||{}).checked||false);
    var aD=role==='utilizador'&&((document.getElementById('editAcessoDashboard')||{}).checked||false);
    var aE=role==='utilizador'&&((document.getElementById('editAcessoEditor')||{}).checked||false);
    var aI=role==='utilizador'&&((document.getElementById('editAcessoInventario')||{}).checked||false);
    var aV=role==='utilizador'&&((document.getElementById('editAcessoVendas')||{}).checked||false);
    if(!nome.trim()){mostrarToast('O nome não pode estar vazio.','erro');return;}
    if(role==='utilizador'&&!aR&&!aD&&!aE&&!aI&&!aV){mostrarToast('Escolha pelo menos um acesso para este utilizador.','erro');return;}

    var defHtml='<span class="material-symbols-rounded" aria-hidden="true">save</span>Guardar';
    _setBtnLoading('btnGuardarEdicao',true,defHtml,'A guardar...');

    atualizarUtilizador(uid,{nome:nome.trim(),role:role,acessoRegisto:aR,acessoDashboard:aD,acessoEditor:aE,acessoInventario:aI,acessoVendas:aV})
      .then(function(resp){
        _setBtnLoading('btnGuardarEdicao',false,defHtml);
        mostrarToast(resp.mensagem,'sucesso');
        _fecharModalEditar();
        _carregar();
      })
      .catch(function(err){
        _setBtnLoading('btnGuardarEdicao',false,defHtml);
        mostrarToast('Erro: '+err.message,'erro');
      });
  }

  function toggle(uid,ativar){
    var msg='Tem a certeza que deseja '+(ativar?'ativar':'desativar')+' este utilizador?';
    var pedir=typeof window.spaConfirmar==='function'
      ?window.spaConfirmar(msg,{
        titulo:ativar?'Ativar utilizador':'Desativar utilizador',
        textoConfirmar:ativar?'Ativar':'Desativar',
        perigo:!ativar
      })
      :Promise.resolve(true);
    pedir.then(function(ok){
      if(!ok)return;
      (ativar?ativarUtilizador:desativarUtilizador)(uid)
        .then(function(resp){mostrarToast(resp.mensagem,'sucesso');_carregar();})
        .catch(function(err){mostrarToast('Erro: '+err.message,'erro');});
    });
  }

  function abrirAlterarEmail() {
    var uid   = (document.getElementById('editUserUid')  || {}).value || '';
    var email = (document.getElementById('editUserEmail')|| {}).value || '';
    document.getElementById('alterarEmailUid').value = uid;
    document.getElementById('alterarEmailNovo').value = email;
    var m = document.getElementById('modalAlterarEmail');
    if (m) m.classList.add('show');
    var inp = document.getElementById('alterarEmailNovo');
    if (inp) setTimeout(function(){ inp.focus(); inp.select(); }, 50);
  }

  function fecharAlterarEmail() {
    var m = document.getElementById('modalAlterarEmail');
    if (m) m.classList.remove('show');
  }

  function guardarAlterarEmail() {
    var uid = (document.getElementById('alterarEmailUid') || {}).value || '';
    var novoEmail = (document.getElementById('alterarEmailNovo') || {}).value || '';
    if (!novoEmail.trim()) { mostrarToast('Indique o novo e-mail.', 'erro'); return; }

    var defHtml='<span class="material-symbols-rounded" aria-hidden="true">save</span>Guardar';
    _setBtnLoading('btnGuardarAlterarEmail',true,defHtml,'A guardar...');

    alterarEmailUtilizador(uid, novoEmail.trim())
      .then(function (resp) {
        _setBtnLoading('btnGuardarAlterarEmail',false,defHtml);
        mostrarToast(resp.mensagem, 'sucesso');
        fecharAlterarEmail();
        _fecharModalEditar();
        _carregar();
      })
      .catch(function (err) {
        _setBtnLoading('btnGuardarAlterarEmail',false,defHtml);
        mostrarToast('Erro: ' + err.message, 'erro');
      });
  }

  function gerarNovoLink() {
    var uid = (document.getElementById('editUserUid') || {}).value || '';
    if (!uid) return;
    var defHtml='<span class="material-symbols-rounded" aria-hidden="true">link</span>Gerar novo link';
    _setBtnLoading('btnGerarNovoLink',true,defHtml,'A gerar...');
    gerarLinkPassword(uid)
      .then(function (resp) {
        _setBtnLoading('btnGerarNovoLink',false,defHtml);
        if (!resp.sucesso) { mostrarToast('Erro: ' + resp.mensagem, 'erro'); return; }
        _abrirModalLink(resp.link);
      })
      .catch(function (err) {
        _setBtnLoading('btnGerarNovoLink',false,defHtml);
        mostrarToast('Erro: ' + err.message, 'erro');
      });
  }

  function confirmarApagar() {
    var uid  = (document.getElementById('editUserUid')  || {}).value || '';
    var nome = (document.getElementById('editUserNome') || {}).value || '';
    var p1 = typeof window.spaConfirmar === 'function'
      ? window.spaConfirmar('Eliminar definitivamente "' + nome + '"? Esta ação não pode ser desfeita.', {
          titulo: 'Eliminar utilizador',
          textoConfirmar: 'Continuar',
          perigo: true
        })
      : Promise.resolve(true);
    p1.then(function(ok) {
      if (!ok) return;
      var p2 = typeof window.spaConfirmar === 'function'
        ? window.spaConfirmar('Confirma novamente: a conta e todo o histórico de acesso serão removidos permanentemente.', {
            titulo: 'Confirmação final',
            textoConfirmar: 'Eliminar definitivamente',
            perigo: true
          })
        : Promise.resolve(true);
      p2.then(function(ok2) {
        if (!ok2) return;
        apagarUtilizador(uid)
          .then(function (resp) {
            mostrarToast(resp.mensagem, 'sucesso');
            _fecharModalEditar();
            _carregar();
          })
          .catch(function (err) { mostrarToast('Erro: ' + err.message, 'erro'); });
      });
    });
  }

  function onTogglePasswordAgora(){
    var chk     = document.getElementById('userDefinirPasswordAgora');
    var grpPass = document.getElementById('passwordGroupNovo');
    var info    = document.getElementById('infoConvitePorEmail');
    var marcado = chk && chk.checked;
    if (grpPass) grpPass.style.display = marcado ? '' : 'none';
    if (info)    info.style.display    = marcado ? 'none' : 'block';
    if (!marcado) {
      var p = document.getElementById('userPassword');
      if (p) p.value = '';
    }
  }

  var _linkPasswordAtual = '';

  function _abrirModalLink(link) {
    _linkPasswordAtual = link;
    document.getElementById('linkPasswordValor').value = link;
    document.getElementById('linkPasswordCopiado').style.display = 'none';
    var m = document.getElementById('modalLinkPassword');
    if (m) m.classList.add('show');
  }

  function _fecharModalLink() {
    var m = document.getElementById('modalLinkPassword');
    if (m) m.classList.remove('show');
    _linkPasswordAtual = '';
  }

  function _copiarLink() {
    if (!_linkPasswordAtual) return;
    var mostrarConfirmacao = function () {
      var el = document.getElementById('linkPasswordCopiado');
      if (el) el.style.display = 'flex';
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(_linkPasswordAtual).then(mostrarConfirmacao).catch(function () {
        _copiarFallback(mostrarConfirmacao);
      });
    } else {
      _copiarFallback(mostrarConfirmacao);
    }
  }

  function _copiarFallback(callback) {
    var input = document.getElementById('linkPasswordValor');
    if (!input) return;
    input.select();
    try { document.execCommand('copy'); callback(); } catch (e) {}
  }

  window.__admin={
    abrirNovo:abrirNovo,fecharModal:_fecharModal,guardar:guardar,
    abrirEditar:abrirEditar,fecharModalEditar:_fecharModalEditar,
    guardarEdicao:guardarEdicao,toggle:toggle,onRoleChange:onRoleChange,
    onTogglePasswordAgora:onTogglePasswordAgora,
    abrirAlterarEmail:abrirAlterarEmail,fecharAlterarEmail:fecharAlterarEmail,
    guardarAlterarEmail:guardarAlterarEmail,
    gerarNovoLink:gerarNovoLink,
    fecharModalLink:_fecharModalLink,
    copiarLink:_copiarLink,
    confirmarApagar:confirmarApagar
  };
  window.__views=window.__views||{};
  window.__views.admin={mount:mount,unmount:unmount};
})();
