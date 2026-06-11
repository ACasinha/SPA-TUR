// views/dashboard/view.js
'use strict';
(function() {
  var _perfil=null,_isAdmin=false,_tabAtiva=0,_secoes=[],_editando=null,_listeners=[];
  var ESTRUTURA_PADRAO=[{id:'visao-geral',titulo:'Visão Geral',icone:'📊',descricao:'Resumo geral de visitantes por período',graficos:[{id:'g1',titulo:'Total de Visitantes — Ano Atual',sub:'',url:'',largura:'total',altura:'md'},{id:'g2',titulo:'Visitantes por Mês',sub:'Evolução mensal',url:'',largura:'dois-tercos',altura:'md'},{id:'g3',titulo:'Top 5 Nacionalidades',sub:'Mês atual',url:'',largura:'metade',altura:'md'}]},{id:'nacionalidades',titulo:'Nacionalidades',icone:'🌍',descricao:'Distribuição por país de origem',graficos:[{id:'g4',titulo:'Todas as Nacionalidades',sub:'Ranking completo',url:'',largura:'total',altura:'lg'},{id:'g5',titulo:'Europa vs Resto do Mundo',sub:'',url:'',largura:'metade',altura:'md'},{id:'g6',titulo:'Países Ibéricos',sub:'Portugal e Espanha',url:'',largura:'metade',altura:'md'}]},{id:'locais',titulo:'Locais / Postos',icone:'📍',descricao:'Análise por local de registo',graficos:[{id:'g8',titulo:'Visitantes por Local',sub:'Comparativo',url:'',largura:'total',altura:'md'},{id:'g9',titulo:'Posto de Turismo de Monsaraz',sub:'Evolução',url:'',largura:'metade',altura:'md'},{id:'g10',titulo:'Museu do Fresco',sub:'Evolução',url:'',largura:'metade',altura:'md'}]},{id:'sazonalidade',titulo:'Sazonalidade',icone:'📅',descricao:'Padrões sazonais e tendências',graficos:[{id:'g12',titulo:'Distribuição Semanal',sub:'Dia da semana',url:'',largura:'metade',altura:'md'},{id:'g13',titulo:'Meses de Ponta',sub:'Comparativo histórico',url:'',largura:'metade',altura:'md'},{id:'g14',titulo:'Tendência Anual',sub:'Crescimento/declínio',url:'',largura:'total',altura:'lg'}]},{id:'operadores',titulo:'Operadores',icone:'🏨',descricao:'Visitas de operadores e agências',graficos:[{id:'g15',titulo:'Top Operadores',sub:'Por volume',url:'',largura:'dois-tercos',altura:'md'},{id:'g16',titulo:'Tipo de Grupo',sub:'Individual vs Grupo',url:'',largura:'metade',altura:'md'},{id:'g17',titulo:'Operadores por Mercado',sub:'',url:'',largura:'total',altura:'md'}]}];
  function _e(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function _ea(s){return String(s||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function _al(t,ev,fn){t.addEventListener(ev,fn);_listeners.push({target:t,tipo:ev,fn:fn});}

  function mount(perfil){
    _perfil=perfil;_isAdmin=perfil.role==='administrador';
    spaSetHeader({titulo:'Dashboard de Análise'});
    if(_isAdmin){var b=document.getElementById('adminBar');if(b)b.classList.add('visivel');}
    _carregar();
    _al(document,'keydown',function(e){if(e.key==='Escape')_fecharEdit();});
    var ov=document.getElementById('editOverlay');
    if(ov)_al(ov,'click',function(e){if(e.target===ov)_fecharEdit();});
  }
  function unmount(){
    _listeners.forEach(function(l){l.target.removeEventListener(l.tipo,l.fn);});
    _listeners=[];_secoes=[];_editando=null;spaResetHeader();
    window.__dash=null;
  }

  function _carregar(){
    db.collection('dashboard').doc('estrutura').get()
      .then(function(doc){
        _secoes=(doc.exists&&doc.data().secoes&&doc.data().secoes.length)?doc.data().secoes:JSON.parse(JSON.stringify(ESTRUTURA_PADRAO));
        _render();
      }).catch(function(){_secoes=JSON.parse(JSON.stringify(ESTRUTURA_PADRAO));_render();});
  }
  function _guardar(){
    if(!_isAdmin)return Promise.resolve();
    return db.collection('dashboard').doc('estrutura').set({secoes:_secoes,atualizadoEm:firebase.firestore.FieldValue.serverTimestamp(),atualizadoPor:(_perfil&&_perfil.email)||''})
      .then(function(){mostrarToast('✓ Dashboard guardado.','sucesso');})
      .catch(function(err){mostrarToast('Erro: '+err.message,'erro');});
  }

  function _render(){_renderTabs();_renderPaineis();_ativarTab(0);}
  function _renderTabs(){
    var bar=document.getElementById('tabsBar');if(!bar)return;bar.innerHTML='';
    _secoes.forEach(function(s,i){
      var btn=document.createElement('button');btn.className='tab-btn';
      btn.setAttribute('role','tab');btn.setAttribute('aria-selected','false');
      btn.innerHTML='<span class="tab-icone">'+_e(s.icone||'📊')+'</span><span>'+_e(s.titulo)+'</span><span class="tab-badge">'+(s.graficos?s.graficos.length:0)+'</span>';
      btn.addEventListener('click',function(){_ativarTab(i);});bar.appendChild(btn);
    });
  }
  function _renderPaineis(){
    var wrap=document.getElementById('paineis');if(!wrap)return;wrap.innerHTML='';
    _secoes.forEach(function(s,si){
      var panel=document.createElement('div');panel.className='tab-panel';panel.id='panel-'+si;panel.setAttribute('role','tabpanel');
      var hd=document.createElement('div');hd.className='secao-header';
      hd.innerHTML='<div><div class="secao-titulo">'+_e(s.icone||'')+' '+_e(s.titulo)+'</div>'+(s.descricao?'<div class="secao-descricao">'+_e(s.descricao)+'</div>':'')+'</div>'+
        (_isAdmin?'<div class="secao-meta"><button class="btn-iframe-toggle" onclick="window.__dash&&window.__dash.editSecao('+si+')">⚙️ Editar secção</button><button class="btn-iframe-toggle" onclick="window.__dash&&window.__dash.addGrafico('+si+')">➕ Gráfico</button></div>':'');
      panel.appendChild(hd);
      var gr=document.createElement('div');gr.className='graficos-grelha';
      if(!s.graficos||!s.graficos.length){
        gr.innerHTML='<div class="estado-vazio" style="grid-column:1/-1"><span class="estado-vazio-icone">📭</span><div>Nenhum gráfico.</div>'+(_isAdmin?'<div style="margin-top:8px"><button class="btn-iframe-toggle" onclick="window.__dash&&window.__dash.addGrafico('+si+')">➕ Adicionar</button></div>':'')+'</div>';
      } else {
        s.graficos.forEach(function(g,gi){gr.appendChild(_card(g,si,gi));});
      }
      panel.appendChild(gr);wrap.appendChild(panel);
    });
  }
  function _card(g,si,gi){
    var c=document.createElement('div');
    c.className='grafico-card largura-'+(g.largura||'metade')+' altura-'+(g.altura||'md');c.id='card-'+g.id;
    var ac=_isAdmin?'<div class="grafico-card-acoes"><button class="btn-iframe-toggle" onclick="window.__dash&&window.__dash.editGrafico('+si+','+gi+')">✏️ Editar</button><button class="btn-iframe-toggle" onclick="window.__dash&&window.__dash.delGrafico('+si+','+gi+')" style="color:var(--vermelho)">✕</button></div>':'';
    var body=g.url&&g.url.trim()
      ?'<div class="grafico-card-body"><div class="grafico-skeleton" id="sk-'+g.id+'">⏳ A carregar...</div><iframe class="grafico-iframe" src="'+_ea(g.url)+'" loading="lazy" allowfullscreen onload="var e=document.getElementById(\'sk-'+g.id+'\');if(e)e.classList.add(\'oculto\')"></iframe></div>'
      :'<div class="grafico-card-body"><div class="grafico-placeholder"><span class="grafico-placeholder-icone">📈</span><span class="grafico-placeholder-txt">Gráfico não configurado</span><span class="grafico-placeholder-sub">'+(_isAdmin?'Clique em ✏️ Editar':'Aguarda configuração')+'</span></div></div>';
    c.innerHTML='<div class="grafico-card-header"><div><div class="grafico-card-titulo">'+_e(g.titulo)+'</div>'+(g.sub?'<div class="grafico-card-sub">'+_e(g.sub)+'</div>':'')+'</div>'+ac+'</div>'+body;
    return c;
  }

  function _ativarTab(i){
    _tabAtiva=i;
    document.querySelectorAll('.tab-btn').forEach(function(b,j){b.classList.toggle('ativa',j===i);b.setAttribute('aria-selected',j===i?'true':'false');});
    document.querySelectorAll('.tab-panel').forEach(function(p,j){p.classList.toggle('ativo',j===i);});
  }

  function _abrirEdit(titulo){
    document.getElementById('editBoxTitulo').textContent=titulo;
    document.getElementById('editOverlay').classList.add('show');
    document.getElementById('editTitulo').focus();
  }
  function _fecharEdit(){
    var ov=document.getElementById('editOverlay');if(ov)ov.classList.remove('show');
    _editando=null;_resetLabels();
  }
  function _resetLabels(){
    document.getElementById('editLabelTitulo').textContent='Título';
    document.getElementById('editLabelSub').textContent='Subtítulo';
    document.getElementById('editLabelUrl').textContent='URL do iframe (Google Sheets)';
    document.getElementById('editGrupoLargura').style.display='';
    document.getElementById('editGrupoAltura').style.display='';
  }

  function editGrafico(si,gi){
    var g=_secoes[si].graficos[gi];_editando={tipo:'grafico',si:si,gi:gi};
    document.getElementById('editTitulo').value=g.titulo||'';
    document.getElementById('editSub').value=g.sub||'';
    document.getElementById('editUrl').value=g.url||'';
    document.getElementById('editLargura').value=g.largura||'metade';
    document.getElementById('editAltura').value=g.altura||'md';
    _abrirEdit('Editar Gráfico');
  }
  function addGrafico(si){
    _editando={tipo:'grafico',si:si,gi:-1};
    ['editTitulo','editSub','editUrl'].forEach(function(id){document.getElementById(id).value='';});
    document.getElementById('editLargura').value='metade';document.getElementById('editAltura').value='md';
    _abrirEdit('Novo Gráfico');
  }
  function editSecao(si){
    var s=_secoes[si];_editando={tipo:'secao',si:si};
    document.getElementById('editTitulo').value=s.titulo||'';
    document.getElementById('editSub').value=s.icone||'';
    document.getElementById('editUrl').value=s.descricao||'';
    document.getElementById('editLabelTitulo').textContent='Título da Secção';
    document.getElementById('editLabelSub').textContent='Ícone (emoji)';
    document.getElementById('editLabelUrl').textContent='Descrição';
    document.getElementById('editGrupoLargura').style.display='none';
    document.getElementById('editGrupoAltura').style.display='none';
    _abrirEdit('Editar Secção');
  }
  function delGrafico(si,gi){
    if(!confirm('Remover o gráfico "'+_secoes[si].graficos[gi].titulo+'"?'))return;
    _secoes[si].graficos.splice(gi,1);
    _guardar().then(function(){_render();_ativarTab(si);});
  }

  function _guardarEdicao(){
    if(!_editando)return;
    var titulo=document.getElementById('editTitulo').value.trim();
    if(!titulo){mostrarToast('O título é obrigatório.','erro');return;}
    if(_editando.tipo==='secao'){
      _secoes[_editando.si].titulo=titulo;
      _secoes[_editando.si].icone=document.getElementById('editSub').value.trim()||'📊';
      _secoes[_editando.si].descricao=document.getElementById('editUrl').value.trim();
    } else {
      var si=_editando.si,gi=_editando.gi;
      var obj={id:'g'+Date.now(),titulo:titulo,sub:document.getElementById('editSub').value.trim(),url:document.getElementById('editUrl').value.trim(),largura:document.getElementById('editLargura').value,altura:document.getElementById('editAltura').value};
      if(gi===-1){_secoes[si].graficos.push(obj);}else{Object.assign(_secoes[si].graficos[gi],obj);}
    }
    _fecharEdit();
    _guardar().then(function(){_render();_ativarTab(_editando?_editando.si:0);});
  }

  window.__dash={editGrafico:editGrafico,addGrafico:addGrafico,editSecao:editSecao,delGrafico:delGrafico};
  window.guardarEdicao=_guardarEdicao;
  window.fecharEditOverlay=_fecharEdit;

  window.__views=window.__views||{};
  window.__views.dashboard={mount:mount,unmount:unmount};
})();
