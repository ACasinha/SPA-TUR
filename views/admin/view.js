// views/admin/view.js
'use strict';
(function(){
  var _listeners=[];
  var ROLE_INFO={
    utilizador:'Pode fazer login na app e registar visitantes diariamente.',
    visualizador:'Pode consultar os gráficos do dashboard. Não pode registar dados.',
    administrador:'Acesso completo: registo, dashboard, editor e gestão de utilizadores.'
  };
  function _e(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function _al(t,ev,fn){t.addEventListener(ev,fn);_listeners.push({target:t,tipo:ev,fn:fn});}

  function mount(perfil){
    spaSetHeader({titulo:'Gestão de Utilizadores'});
    _carregar();
    _al(document,'keydown',function(e){
      if(e.key==='Escape'){_fecharModal();_fecharModalEditar();}
    });
    ['modalNovoUser','modalEditarUser'].forEach(function(id){
      var el=document.getElementById(id);
      if(el)_al(el,'click',function(e){if(e.target===el){if(id==='modalNovoUser')_fecharModal();else _fecharModalEditar();}});
    });
    // Inicializar visibilidade dos grupos de acesso
    onRoleChange('userRole','roleInfoNovo','grupoAcessosNovo');
    onRoleChange('editUserRole','roleInfoEditar','grupoAcessosEditar');
  }

  function unmount(){
    _listeners.forEach(function(l){l.target.removeEventListener(l.tipo,l.fn);});
    _listeners=[];spaResetHeader();window.__admin=null;
  }

  function _fmt(ts){
    if(!ts)return '—';
    var d=ts.toDate?ts.toDate():new Date(ts);
    return d.toLocaleDateString('pt-PT')+' '+d.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'});
  }

  function _badgeRole(role,aD,aE){
    if(role==='administrador')return '<span class="badge-role badge-admin">Admin</span>';
    if(role==='visualizador') return '<span class="badge-role badge-visualizador">Visualizador</span>';
    var ex='';if(aD)ex+=' 📊';if(aE)ex+=' ✏️';
    return '<span class="badge-role badge-user'+(ex?' badge-user-extra':'')+'">Utilizador'+ex+'</span>';
  }

  function _carregar(){
    var lo=document.getElementById('loadingUsers');
    var tb=document.getElementById('usersTableBody');
    if(lo)lo.classList.add('show');
    listarUtilizadores()
      .then(function(users){
        if(lo)lo.classList.remove('show');
        if(!users.length){
          tb.innerHTML='<tr><td colspan="5" class="empty-state"><span class="empty-state-icon">👥</span><div>Nenhum utilizador encontrado.</div></td></tr>';
          return;
        }
        tb.innerHTML='';
        users.forEach(function(u){
          var tr=document.createElement('tr');
          var nome=_e(u.nome||'—'),email=_e(u.email||'—'),uid=u.uid;
          var bRole=_badgeRole(u.role,u.acessoDashboard,u.acessoEditor);
          var bEst='<span class="estado-pill"><span class="badge-status '+(u.ativo?'ativo':'inativo')+'"></span>'+(u.ativo?'Ativo':'Inativo')+'</span>';
          var ul=_fmt(u.ultimoLoginEm);
          var bEd='<button class="btn-action btn-editar" onclick="window.__admin&&window.__admin.abrirEditar(\''+uid+'\')">✏️ Editar</button>';
          var bTg=u.ativo
            ?'<button class="btn-action btn-desativar" onclick="window.__admin&&window.__admin.toggle(\''+uid+'\',false)">🚫 Desativar</button>'
            :'<button class="btn-action btn-ativar" onclick="window.__admin&&window.__admin.toggle(\''+uid+'\',true)">✅ Ativar</button>';
          tr.innerHTML=
            '<div class="user-card-header"><span class="user-card-nome">'+nome+'</span><span class="user-card-badges">'+bRole+bEst+'</span></div>'+
            '<div class="user-card-email">'+email+'</div>'+
            '<div class="user-card-ultimo-login">🕐 Último Login: '+ul+'</div>'+
            '<div class="user-card-actions">'+bEd+bTg+'</div>'+
            '<td data-label="Utilizador"><strong>'+nome+'</strong><span class="user-email-sub">'+email+'</span></td>'+
            '<td data-label="Role">'+bRole+'</td>'+
            '<td data-label="Estado">'+bEst+'</td>'+
            '<td data-label="Último Login"><span class="ultimo-login-txt">'+ul+'</span></td>'+
            '<td data-label="Ações"><div class="user-actions">'+bEd+bTg+'</div></td>';
          tb.appendChild(tr);
        });
      })
      .catch(function(err){
        if(lo)lo.classList.remove('show');
        mostrarToast('Erro ao carregar: '+err.message,'erro');
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
    var r=document.getElementById('userRole');if(r)r.value='utilizador';
    ['userAcessoDashboard','userAcessoEditor'].forEach(function(id){var e=document.getElementById(id);if(e)e.checked=false;});
    var pg=document.getElementById('passwordGroup');if(pg)pg.style.display='block';
    var mt=document.getElementById('modalTitulo');if(mt)mt.textContent='Novo Utilizador';
    onRoleChange('userRole','roleInfoNovo','grupoAcessosNovo');
    var m=document.getElementById('modalNovoUser');if(m)m.classList.add('show');
  }

  function _fecharModal(){var m=document.getElementById('modalNovoUser');if(m)m.classList.remove('show');}

  function guardar(){
    var nome=(document.getElementById('userNome')||{}).value||'';
    var email=(document.getElementById('userEmail')||{}).value||'';
    var pass=(document.getElementById('userPassword')||{}).value||'';
    var role=(document.getElementById('userRole')||{}).value||'utilizador';
    var aD=role==='utilizador'&&((document.getElementById('userAcessoDashboard')||{}).checked||false);
    var aE=role==='utilizador'&&((document.getElementById('userAcessoEditor')||{}).checked||false);
    if(!nome.trim()||!email.trim()||!pass){mostrarToast('Por favor preencha todos os campos.','erro');return;}
    if(pass.length<6){mostrarToast('A password deve ter no mínimo 6 caracteres.','erro');return;}
    var btn=document.getElementById('btnGuardarUser');
    if(btn){btn.disabled=true;btn.textContent='⏳ A guardar...';}
    criarUtilizador({email:email.trim(),password:pass,nome:nome.trim(),role:role,acessoDashboard:aD,acessoEditor:aE})
      .then(function(resp){
        if(btn){btn.disabled=false;btn.textContent='Guardar';}
        if(resp.sucesso){mostrarToast('✓ '+resp.mensagem,'sucesso');_fecharModal();_carregar();}
        else{mostrarToast('✗ '+resp.mensagem,'erro');}
      })
      .catch(function(err){
        if(btn){btn.disabled=false;btn.textContent='Guardar';}
        mostrarToast('Erro: '+err.message,'erro');
      });
  }

  function abrirEditar(uid){
    listarUtilizadores().then(function(users){
      var u=users.find(function(x){return x.uid===uid;});
      if(!u){mostrarToast('Utilizador não encontrado.','erro');return;}
      document.getElementById('editUserUid').value=uid;
      document.getElementById('editUserNome').value=u.nome||'';
      document.getElementById('editUserEmail').value=u.email||'';
      document.getElementById('editUserRole').value=u.role||'utilizador';
      document.getElementById('editAcessoDashboard').checked=!!u.acessoDashboard;
      document.getElementById('editAcessoEditor').checked=!!u.acessoEditor;
      onRoleChange('editUserRole','roleInfoEditar','grupoAcessosEditar');
      var m=document.getElementById('modalEditarUser');if(m)m.classList.add('show');
    }).catch(function(err){mostrarToast('Erro: '+err.message,'erro');});
  }

  function _fecharModalEditar(){var m=document.getElementById('modalEditarUser');if(m)m.classList.remove('show');}

  function guardarEdicao(){
    var uid=(document.getElementById('editUserUid')||{}).value||'';
    var nome=(document.getElementById('editUserNome')||{}).value||'';
    var role=(document.getElementById('editUserRole')||{}).value||'utilizador';
    var aD=role==='utilizador'&&((document.getElementById('editAcessoDashboard')||{}).checked||false);
    var aE=role==='utilizador'&&((document.getElementById('editAcessoEditor')||{}).checked||false);
    if(!nome.trim()){mostrarToast('O nome não pode estar vazio.','erro');return;}
    atualizarUtilizador(uid,{nome:nome.trim(),role:role,acessoDashboard:aD,acessoEditor:aE})
      .then(function(resp){mostrarToast('✓ '+resp.mensagem,'sucesso');_fecharModalEditar();_carregar();})
      .catch(function(err){mostrarToast('Erro: '+err.message,'erro');});
  }

  function toggle(uid,ativar){
    if(!confirm('Tem a certeza que deseja '+(ativar?'ativar':'desativar')+' este utilizador?'))return;
    (ativar?ativarUtilizador:desativarUtilizador)(uid)
      .then(function(resp){mostrarToast('✓ '+resp.mensagem,'sucesso');_carregar();})
      .catch(function(err){mostrarToast('Erro: '+err.message,'erro');});
  }

  window.__admin={abrirNovo:abrirNovo,fecharModal:_fecharModal,guardar:guardar,abrirEditar:abrirEditar,fecharModalEditar:_fecharModalEditar,guardarEdicao:guardarEdicao,toggle:toggle,onRoleChange:onRoleChange};
  window.__views=window.__views||{};
  window.__views.admin={mount:mount,unmount:unmount};
})();
