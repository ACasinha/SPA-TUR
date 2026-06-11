// ============================================================
// ui.js — Construção e atualização da interface
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
// ============================================================

// ============================================================
// UTILITÁRIOS
// ============================================================

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ============================================================
// CONSTRUÇÃO DA SECÇÃO DE PAÍSES
// ============================================================

var _paisesAdicionados = [];

function construirTabelaPaises() {
  // ── CORREÇÃO: Limpar os containers antes de reconstruir ──
  var container = document.getElementById('paisesContainer');
  if (container) container.innerHTML = '';

  var listaPesquisa = document.getElementById('listaPesquisaPaises');
  if (listaPesquisa) listaPesquisa.innerHTML = '';
  // ─────────────────────────────────────────────────────────

  var local  = (document.getElementById('local') || {}).value || '';
  var simples = (typeof modoSimplificado === 'function') && modoSimplificado(local);

  var titulo = document.getElementById('tituloPaises');
  if (titulo) {
    titulo.textContent = simples
      ? 'Nacionais / Estrangeiros'
      : 'Países — Turistas e Visitantes';
  }

  if (simples) {
    _construirModoSimples();
  } else {
    _construirModoDetalhado();
  }
}

function _construirModoSimples() {
  var container = document.getElementById('paisesContainer');
  container.innerHTML = '';

  var zonaPesquisa = document.getElementById('zonaPesquisaPaises');
  if (zonaPesquisa) zonaPesquisa.style.display = 'none';

  var tbody = document.createElement('tbody');
  tbody.id = 'tabelaPaises';

  PAISES_SIMPLES.forEach(function(pais) {
    tbody.appendChild(_criarLinhaPais(pais.nome, pais.destaque));
  });

  var table = document.createElement('table');
  table.className = 'paises-table';
  table.innerHTML =
    '<thead><tr>' +
      '<th>Tipo</th>' +
      '<th style="text-align:center">Turistas / Visitantes</th>' +
    '</tr></thead>';
  table.appendChild(tbody);

  var scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  scroll.appendChild(table);
  container.appendChild(scroll);
}

function _construirModoDetalhado() {
  var container = document.getElementById('paisesContainer');
  container.innerHTML = '';

  var tbodyDestaque = document.createElement('tbody');
  tbodyDestaque.id = 'tabelaPaises';

  PAISES.filter(function(p) { return p.destaque; }).forEach(function(pais) {
    tbodyDestaque.appendChild(_criarLinhaPais(pais.nome, true));
  });

  var tableDestaque = document.createElement('table');
  tableDestaque.className = 'paises-table';
  tableDestaque.innerHTML =
    '<thead><tr>' +
      '<th>País</th>' +
      '<th style="text-align:center">Turistas / Visitantes</th>' +
    '</tr></thead>';
  tableDestaque.appendChild(tbodyDestaque);

  var scrollDestaque = document.createElement('div');
  scrollDestaque.className = 'table-scroll';
  scrollDestaque.appendChild(tableDestaque);
  container.appendChild(scrollDestaque);

  var zonaAdicionados = document.createElement('div');
  zonaAdicionados.id = 'zonaAdicionados';
  zonaAdicionados.style.display = _paisesAdicionados.length ? '' : 'none';

  var tbodyExtra = document.createElement('tbody');
  tbodyExtra.id = 'tabelaPaisesExtra';

  _paisesAdicionados.forEach(function(p) {
    tbodyExtra.appendChild(_criarLinhaPaisExtra(p.nome));
  });

  var tableExtra = document.createElement('table');
  tableExtra.className = 'paises-table paises-table-extra';
  tableExtra.innerHTML =
    '<thead><tr>' +
      '<th>Outros países</th>' +
      '<th style="text-align:center">Turistas / Visitantes</th>' +
    '</tr></thead>';
  tableExtra.appendChild(tbodyExtra);

  var scrollExtra = document.createElement('div');
  scrollExtra.className = 'table-scroll';
  scrollExtra.appendChild(tableExtra);
  zonaAdicionados.appendChild(scrollExtra);
  container.appendChild(zonaAdicionados);

  var zonaPesquisa = document.getElementById('zonaPesquisaPaises');
  if (zonaPesquisa) {
    zonaPesquisa.style.display = '';
    _inicializarPesquisa();
  }

  _paisesAdicionados.forEach(function(p) {
    var inp = document.querySelector('.pais-input[data-pais="' + p.nome + '"]');
    if (inp && p.valor > 0) {
      inp.value = p.valor;
      _aplicarEstiloValor(inp);
    }
  });
}

function _criarLinhaPais(nomePais, destaque) {
  var tr = document.createElement('tr');
  if (destaque) tr.classList.add('row-destaque');
  tr.innerHTML =
    '<td>' + esc(nomePais) + '</td>' +
    '<td class="num-cell">' +
      '<div class="num-stepper">' +
        '<button type="button" class="btn-stepper btn-menos"' +
                ' onclick="stepPais(this,-1)" aria-label="Menos">−</button>' +
        '<input type="number" inputmode="numeric" class="num-input pais-input"' +
               ' min="0" placeholder="0" data-pais="' + esc(nomePais) + '"' +
               ' oninput="atualizarTotais(this)">' +
        '<button type="button" class="btn-stepper btn-mais"' +
                ' onclick="stepPais(this,1)" aria-label="Mais">+</button>' +
      '</div>' +
    '</td>';
  return tr;
}

function _criarLinhaPaisExtra(nomePais) {
  var tr = document.createElement('tr');
  tr.dataset.paisNome = nomePais;
  tr.innerHTML =
    '<td>' +
      '<span>' + esc(nomePais) + '</span>' +
      '<button type="button" class="btn-remover-pais" ' +
              'onclick="removerPaisExtra(this)" ' +
              'aria-label="Remover ' + esc(nomePais) + '" ' +
              'title="Remover">✕</button>' +
    '</td>' +
    '<td class="num-cell">' +
      '<div class="num-stepper">' +
        '<button type="button" class="btn-stepper btn-menos"' +
                ' onclick="stepPais(this,-1)" aria-label="Menos">−</button>' +
        '<input type="number" inputmode="numeric" class="num-input pais-input"' +
               ' min="0" placeholder="0" data-pais="' + esc(nomePais) + '"' +
               ' oninput="atualizarTotais(this)">' +
        '<button type="button" class="btn-stepper btn-mais"' +
                ' onclick="stepPais(this,1)" aria-label="Mais">+</button>' +
      '</div>' +
    '</td>';
  return tr;
}

// ── Pesquisa de países ────────────────────────────────────────

function _inicializarPesquisa() {
  var input = document.getElementById('inputPesquisaPais');
  if (!input) return;

  var lista = document.getElementById('listaPesquisaPaises');
  if (lista && lista.parentNode !== document.body) {
    document.body.appendChild(lista);
  }
  if (!lista) return;

  function posicionarDropdown() {
    var r = input.getBoundingClientRect();
    lista.style.position = 'fixed';
    lista.style.top      = (r.bottom) + 'px';
    lista.style.left     = r.left + 'px';
    lista.style.width    = r.width + 'px';
    lista.style.zIndex   = '9000';
  }

  var novoInput = input.cloneNode(true);
  input.parentNode.replaceChild(novoInput, input);
  input = novoInput;

  input.addEventListener('input', function() {
    posicionarDropdown();
    _filtrarPaises(input.value.trim());
  });
  input.addEventListener('focus', function() {
    if (input.value.trim()) {
      posicionarDropdown();
      _filtrarPaises(input.value.trim());
    }
  });

  window.addEventListener('scroll', function() {
    if (lista.style.display === 'block') posicionarDropdown();
  }, { passive: true });
  window.addEventListener('resize', function() {
    if (lista.style.display === 'block') posicionarDropdown();
  }, { passive: true });

  document.addEventListener('click', function(e) {
    if (e.target !== input && !lista.contains(e.target)) {
      lista.style.display = 'none';
    }
  });
}

function _filtrarPaises(termo) {
  var lista = document.getElementById('listaPesquisaPaises');
  if (!lista) return;

  var presentes = PAISES.filter(function(p) { return p.destaque; })
                        .map(function(p) { return p.nome; });
  _paisesAdicionados.forEach(function(p) { presentes.push(p.nome); });

  var disponiveis = PAISES.filter(function(p) {
    if (presentes.indexOf(p.nome) !== -1) return false;
    if (!termo) return false;
    return p.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .indexOf(termo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')) !== -1;
  });

  if (!disponiveis.length) {
    lista.style.display = 'none';
    return;
  }

  lista.innerHTML = '';
  disponiveis.forEach(function(pais) {
    var li = document.createElement('li');
    li.className = 'pais-sugestao';
    li.textContent = pais.nome;
    li.addEventListener('click', function() {
      adicionarPaisExtra(pais.nome);
      document.getElementById('inputPesquisaPais').value = '';
      lista.style.display = 'none';
    });
    lista.appendChild(li);
  });
  lista.style.display = 'block';
}

function adicionarPaisExtra(nomePais) {
  if (typeof verificarLocalEscolhido === 'function' && !verificarLocalEscolhido()) return;

  var jaExiste = _paisesAdicionados.some(function(p) { return p.nome === nomePais; });
  if (jaExiste) return;

  _paisesAdicionados.push({ nome: nomePais, valor: 0 });

  var tbody = document.getElementById('tabelaPaisesExtra');
  if (tbody) {
    tbody.appendChild(_criarLinhaPaisExtra(nomePais));
  }

  var zona = document.getElementById('zonaAdicionados');
  if (zona) zona.style.display = '';
}

function removerPaisExtra(btn) {
  var tr = btn.closest('tr');
  var nomePais = tr.dataset.paisNome;

  _paisesAdicionados = _paisesAdicionados.filter(function(p) { return p.nome !== nomePais; });

  tr.remove();

  var zona = document.getElementById('zonaAdicionados');
  var tbody = document.getElementById('tabelaPaisesExtra');
  if (zona && tbody && tbody.rows.length === 0) {
    zona.style.display = 'none';
  }

  recalcularTotais();
}

function stepPais(btn, delta) {
  if (typeof verificarLocalEscolhido === 'function' && !verificarLocalEscolhido()) return;
  var input = btn.closest('.num-stepper').querySelector('.pais-input');
  var atual = parseInt(input.value, 10) || 0;
  var novo  = Math.max(0, atual + delta);
  input.value = novo;
  atualizarTotais(input);
}

function opcoesNacionalidades(selecionada) {
  return PAISES.map(function(p) {
    var sel = p.nome === selecionada ? ' selected' : '';
    return '<option value="' + esc(p.nome) + '"' + sel + '>' + esc(p.nome) + '</option>';
  }).join('');
}

// ============================================================
// OPERADORES — Nova versão com cartões mobile + tabela desktop
// ============================================================

function construirTabelaOperadores(n, dados) {
  var secaoOp = document.getElementById('secaoOperadoresConteudo');
  if (!secaoOp) return;

  secaoOp.innerHTML = '';

  // ── Tabela desktop ────────────────────────────────────────
  var divDesktop = document.createElement('div');
  divDesktop.className = 'op-desktop-wrap';
  divDesktop.innerHTML =
    '<div class="table-scroll">' +
      '<table class="op-table" id="opTableDesktop">' +
        '<thead><tr>' +
          '<th>Operador / Agência</th>' +
          '<th>Nacionalidades</th>' +
          '<th>Total</th>' +
          '<th class="op-remover-th"></th>' +
        '</tr></thead>' +
        '<tbody id="tabelaOperadores"></tbody>' +
      '</table>' +
    '</div>';
  secaoOp.appendChild(divDesktop);

  
  // ── Área de cartões mobile ───────────────────────────────
  var divMobile = document.createElement('div');
  divMobile.className = 'op-mobile-wrap';
  divMobile.id = 'opMobileWrap';
  secaoOp.appendChild(divMobile);

  // ── Botões "Novo operador" (um por breakpoint) ───────────
  var btnDesktop = document.createElement('div');
  btnDesktop.className = 'op-btn-novo-wrap';
  btnDesktop.innerHTML =
    '<button type="button" class="btn-novo-operador op-desktop-only" onclick="adicionarLinhaOperadorDesktop()">' +
      '+ Novo Registo de Operador ou Agência' +
    '</button>' +
    '<button type="button" class="btn-novo-operador op-mobile-only" onclick="adicionarCartaoOperadorMobile()">' +
      '+ Novo Registo de Operador ou Agência' +
    '</button>';
  secaoOp.appendChild(btnDesktop);

  // ── Preencher dados ──────────────────────────────────────
  var tbody = document.getElementById('tabelaOperadores');

  if (dados && dados.length > 0) {
    dados.forEach(function(op) {
      _adicionarLinhaDesktop(tbody, op);
      _adicionarCartaoMobile(divMobile, op);
    });
    // Linha vazia extra no desktop para facilitar adição
    _adicionarLinhaDesktop(tbody, {});
  } else {
    // Apenas 1 linha vazia no desktop; nenhum cartão mobile
    _adicionarLinhaDesktop(tbody, {});
    // Mobile começa vazio — utilizador carrega via botão
  }
}

function removerLinhaOperadorDesktop(btn) {
  var tr = btn.closest('tr');
  if (tr) tr.remove();
}

// ── Adicionar linha no desktop ──────────────────────────────
function _adicionarLinhaDesktop(tbody, op) {
  op = op || {};
  var cls = op.operador ? 'input-carregado' : '';
  var pares = parsearNacionalidades(op.nacionalidades || '');

  var tr = document.createElement('tr');
tr.innerHTML =
  '<td>' +
    '<input type="text" class="op-nome ' + cls + '" placeholder="Nome do operador..."' +
           ' value="' + esc(op.operador || '') + '">' +
  '</td>' +
  '<td class="op-nac-cell">' +
    '<div class="op-nac-lista"></div>' +
    '<button type="button" class="btn-add-nac" onclick="adicionarNacOp(this)">+ Adicionar nacionalidade</button>' +
  '</td>' +
  '<td>' +
    '<input type="number" inputmode="numeric" class="op-total ' + cls + '"' +
           ' min="0" placeholder="0" value="' + esc(String(op.total || '')) + '" readonly>' +
  '</td>' +
  '<td class="op-remover-cell">' +
    '<button type="button" class="btn-remover-op-linha" onclick="removerLinhaOperadorDesktop(this)" aria-label="Remover operador">✕</button>' +
  '</td>';
tbody.appendChild(tr);

  var lista = tr.querySelector('.op-nac-lista');
  if (pares.length > 0) {
    pares.forEach(function(par) { adicionarLinhaOp(lista, par.pais, par.num); });
  } else {
    adicionarLinhaOp(lista, '', '');
  }
  recalcularTotalOp(tr);
}

// ── Remover linha no desktop ──────────────────────────────
function removerLinhaOperadorDesktop(btn) {
  var tr = btn.closest('tr');
  if (tr) tr.remove();
}

// ── Adicionar cartão mobile ──────────────────────────────────
function _adicionarCartaoMobile(wrap, op) {
  op = op || {};
  var pares = parsearNacionalidades(op.nacionalidades || '');

  var cartao = document.createElement('div');
  cartao.className = 'op-cartao';
  

 // Botão Remover
  var btnRemoverCartao = document.createElement('button');
btnRemoverCartao.type = 'button';
btnRemoverCartao.className = 'btn-remover-op-cartao';
btnRemoverCartao.setAttribute('aria-label', 'Remover operador');
btnRemoverCartao.innerHTML = '✕';
btnRemoverCartao.addEventListener('click', function() {
  cartao.remove();
});

  
  // Nome
  var divNome = document.createElement('div');
  divNome.className = 'op-cartao-secao';
  var inputNome = document.createElement('input');
  inputNome.type = 'text';
  inputNome.className = 'op-cartao-nome';
  inputNome.placeholder = 'Nome do operador ou agência';
  inputNome.value = op.operador || '';
  if (op.operador) inputNome.classList.add('input-carregado');
  inputNome.addEventListener('input', function() {
    if (typeof sinalizarAlteracao === 'function') sinalizarAlteracao();
  });
  divNome.appendChild(inputNome);
  cartao.appendChild(divNome);

  // Área de nacionalidades
  var divNacs = document.createElement('div');
  divNacs.className = 'op-cartao-nacs';

  if (pares.length > 0) {
    pares.forEach(function(par) {
      divNacs.appendChild(_criarLinhaNacMobile(par.pais, par.num, cartao));
    });
  } else {
    divNacs.appendChild(_criarLinhaNacMobile('', '', cartao));
  }
  cartao.appendChild(divNacs);

  // Botão adicionar nacionalidade
  var btnAddNac = document.createElement('button');
  btnAddNac.type = 'button';
  btnAddNac.className = 'btn-add-nac btn-add-nac-cartao';
  btnAddNac.textContent = '+ Adicionar nacionalidade';
  btnAddNac.addEventListener('click', function() {
    if (typeof verificarLocalEscolhido === 'function' && !verificarLocalEscolhido()) return;
    divNacs.appendChild(_criarLinhaNacMobile('', '', cartao));
  });
  cartao.appendChild(btnAddNac);

  // Total
  var divTotal = document.createElement('div');
  divTotal.className = 'op-cartao-total-wrap';
  var spanTotLabel = document.createElement('span');
  spanTotLabel.className = 'op-cartao-total-label';
  spanTotLabel.textContent = 'TOTAL';
  var inputTotal = document.createElement('input');
  inputTotal.type = 'number';
  inputTotal.className = 'op-cartao-total';
  inputTotal.min = '0';
  inputTotal.placeholder = '0';
  inputTotal.value = op.total || '';
  inputTotal.readOnly = true;
  inputTotal.setAttribute('readonly', '');
  divTotal.appendChild(btnRemoverCartao);
  divTotal.appendChild(spanTotLabel);
  divTotal.appendChild(inputTotal);
  cartao.appendChild(divTotal);

  _recalcularTotalCartao(cartao);
  wrap.appendChild(cartao);
  return cartao;
}

// ── Linha de nacionalidade dentro de cartão mobile ───────────
function _criarLinhaNacMobile(paisSel, num, cartao) {
  var div = document.createElement('div');
  div.className = 'op-cartao-nac-linha';

  var sel = document.createElement('select');
  sel.className = 'op-cartao-nac-select';
  sel.innerHTML = '<option value="">- País -</option>' + opcoesNacionalidades(paisSel);

  var inp = document.createElement('input');
  inp.type = 'number';
  inp.inputMode = 'numeric';
  inp.className = 'op-cartao-nac-num';
  inp.min = '0';
  inp.placeholder = '0';
  inp.value = num || '';

  var btnRem = document.createElement('button');
  btnRem.type = 'button';
  btnRem.className = 'btn-rem-nac btn-rem-nac-cartao';
  btnRem.innerHTML = '✕';
  btnRem.setAttribute('aria-label', 'Remover');

  div.appendChild(sel);
  div.appendChild(inp);
  div.appendChild(btnRem);

  // Eventos
  var recalc = function() {
    var c = div.closest('.op-cartao');
    if (c) _recalcularTotalCartao(c);
    if (typeof sinalizarAlteracao === 'function') sinalizarAlteracao();
  };
  sel.addEventListener('change', recalc);
  inp.addEventListener('input', recalc);
  btnRem.addEventListener('click', function() {
    var c = div.closest('.op-cartao');
    div.remove();
    if (c) _recalcularTotalCartao(c);
  });

  return div;
}

// ── Recalcular total de um cartão mobile ─────────────────────
function _recalcularTotalCartao(cartao) {
  if (!cartao) return;
  var total = 0;
  cartao.querySelectorAll('.op-cartao-nac-num').forEach(function(inp) {
    total += parseInt(inp.value, 10) || 0;
  });
  var totEl = cartao.querySelector('.op-cartao-total');
  if (totEl) totEl.value = total > 0 ? total : '';
}

// ── Funções públicas chamadas pelos botões ───────────────────
function adicionarLinhaOperadorDesktop() {
  if (typeof verificarLocalEscolhido === 'function' && !verificarLocalEscolhido()) return;
  var tbody = document.getElementById('tabelaOperadores');
  if (tbody) _adicionarLinhaDesktop(tbody, {});
}

function adicionarCartaoOperadorMobile() {
  if (typeof verificarLocalEscolhido === 'function' && !verificarLocalEscolhido()) return;
  var wrap = document.getElementById('opMobileWrap');
  if (wrap) _adicionarCartaoMobile(wrap, {});
}

// ── Operadores (compatibilidade com código existente) ────────
function parsearNacionalidades(str) {
  if (!str) return [];
  return str.split(',').map(function(s) {
    var partes = s.trim().split(':');
    return { pais: (partes[0] || '').trim(), num: (partes[1] || '').trim() };
  }).filter(function(p) { return p.pais; });
}

function adicionarLinhaOp(lista, paisSel, num) {
  var div = document.createElement('div');
  div.className = 'op-nac-linha';
  div.innerHTML =
    '<select class="op-nac-select" onchange="guardaLocalERecalcula(this)">' +
      '<option value="">— País —</option>' +
      opcoesNacionalidades(paisSel) +
    '</select>' +
    '<input type="number" inputmode="numeric" class="op-nac-num" min="0" placeholder="0"' +
      ' value="' + esc(String(num || '')) + '"' +
      ' oninput="guardaLocalERecalcula(this)">' +
    '<button type="button" class="btn-rem-nac" onclick="removerLinhaOp(this)" aria-label="Remover">✕</button>';
  lista.appendChild(div);
}

function guardaLocalERecalcula(el) {
  if (typeof verificarLocalEscolhido === 'function' && !verificarLocalEscolhido()) {
    el.value = '';
    return;
  }
  if (typeof sinalizarAlteracao === 'function') sinalizarAlteracao();
  recalcularTotalOp(el.closest('tr'));
}

function adicionarNacOp(btn) {
  if (typeof verificarLocalEscolhido === 'function' && !verificarLocalEscolhido()) return;
  var lista = btn.previousElementSibling;
  adicionarLinhaOp(lista, '', '');
}

function removerLinhaOp(btn) {
  var lista = btn.closest('.op-nac-lista');
  var tr    = btn.closest('tr');
  btn.closest('.op-nac-linha').remove();
  recalcularTotalOp(tr);
}

function recalcularTotalOp(tr) {
  var total = 0;
  tr.querySelectorAll('.op-nac-num').forEach(function(inp) {
    total += parseInt(inp.value, 10) || 0;
  });
  tr.querySelector('.op-total').value = total > 0 ? total : '';
}

function serializarNacOp(tr) {
  var pares = [];
  tr.querySelectorAll('.op-nac-linha').forEach(function(linha) {
    var pais = linha.querySelector('.op-nac-select').value;
    var num  = parseInt(linha.querySelector('.op-nac-num').value, 10) || 0;
    if (pais && num > 0) pares.push(pais + ': ' + num);
  });
  return pares.join(', ');
}

function onInputSugTexto(inp) {
  if (typeof verificarLocalEscolhido === 'function' && !verificarLocalEscolhido()) {
    inp.value = ''; return;
  }
  if (typeof sinalizarAlteracao === 'function') sinalizarAlteracao();
}

function construirTabelaSugestoes(n, dados) {
  var tbody = document.getElementById('tabelaSugestoes');
  tbody.innerHTML = '';

  for (var i = 0; i < n; i++) {
    var s   = (dados && dados[i]) ? dados[i] : {};
    var cls = s.sugestao ? 'input-carregado' : '';
    var tr  = document.createElement('tr');
    tr.innerHTML =
      '<td><input type="text" class="sug-texto ' + cls + '" placeholder="Escreva aqui..."' +
           ' value="' + esc(s.sugestao || '') + '"' +
           ' oninput="onInputSugTexto(this)"></td>' +
      '<td>' +
        '<select class="sug-nac ' + cls + '">' +
          '<option value="">— País —</option>' +
          opcoesNacionalidades(s.nacionalidade || '') +
        '</select>' +
      '</td>';
    tbody.appendChild(tr);
  }
}

// ============================================================
// RECOLHA DE DADOS — Operadores (agrega desktop + mobile)
// ============================================================

function recolherOperadores() {
  var lista = [];
  var nomesVistos = {};

  // Desktop
  var tbody = document.getElementById('tabelaOperadores');
  if (tbody) {
    tbody.querySelectorAll('tr').forEach(function(tr) {
      var nome = (tr.querySelector('.op-nome') || {}).value || '';
      nome = nome.trim();
      var nac  = serializarNacOp(tr);
      var tot  = parseInt((tr.querySelector('.op-total') || {}).value, 10) || 0;
      if (nome) {
        lista.push({ operador: nome, nacionalidades: nac, total: tot });
        nomesVistos[nome] = true;
      }
    });
  }

  // Mobile (só adiciona se não estiver já no desktop)
  var wrap = document.getElementById('opMobileWrap');
  if (wrap) {
    wrap.querySelectorAll('.op-cartao').forEach(function(cartao) {
      var nome = (cartao.querySelector('.op-cartao-nome') || {}).value || '';
      nome = nome.trim();
      if (!nome || nomesVistos[nome]) return;

      var nacs = [];
      cartao.querySelectorAll('.op-cartao-nac-linha').forEach(function(linha) {
        var p = (linha.querySelector('.op-cartao-nac-select') || {}).value || '';
        var n = parseInt((linha.querySelector('.op-cartao-nac-num') || {}).value, 10) || 0;
        if (p && n > 0) nacs.push(p + ': ' + n);
      });
      var tot = parseInt((cartao.querySelector('.op-cartao-total') || {}).value, 10) || 0;
      lista.push({ operador: nome, nacionalidades: nacs.join(', '), total: tot });
      nomesVistos[nome] = true;
    });
  }

  return lista;
}

function recolherSugestoes() {
  var lista = [];
  document.querySelectorAll('#tabelaSugestoes tr').forEach(function(tr) {
    var sug = tr.querySelector('.sug-texto')?.value.trim() || '';
    var nac = tr.querySelector('.sug-nac')?.value        || '';
    if (sug) lista.push({ sugestao: sug, nacionalidade: nac });
  });
  return lista;
}

// ============================================================
// TOTAIS
// ============================================================

function _aplicarEstiloValor(input) {
  var val = parseInt(input.value, 10) || 0;
  if (val > 0) {
    input.style.borderColor = 'var(--verde-light)';
    input.style.background  = 'rgba(61,90,62,0.05)';
    input.style.color       = 'var(--verde)';
    input.style.fontWeight  = '600';
  } else {
    input.style.cssText = '';
  }
}

function atualizarTotais(input) {
  if (typeof verificarLocalEscolhido === 'function' && !verificarLocalEscolhido()) {
    input.value = '';
    return;
  }
  if (typeof sinalizarAlteracao === 'function') sinalizarAlteracao();
  _aplicarEstiloValor(input);
  recalcularTotais();
}

function recalcularTotais() {
  var total = 0, count = 0;
  document.querySelectorAll('.pais-input').forEach(function(inp) {
    var v = parseInt(inp.value, 10) || 0;
    total += v;
    if (v > 0) count++;
  });
  document.getElementById('totalDiario').textContent = total;
  document.getElementById('totalGeral').textContent  = total;
  document.getElementById('contadorPaises').textContent =
    count + (count === 1 ? ' registo' : ' registos');
}

// ============================================================
// BANNER DE ESTADO
// ============================================================

function mostrarBanner(tipo, texto) {
  var banner  = document.getElementById('estadoBanner');
  var spinner = document.getElementById('estadoSpinner');
  var textoEl = document.getElementById('estadoTexto');
  banner.className      = 'estado-banner' + (tipo ? ' ' + tipo : '');
  spinner.style.display = tipo === 'verificando' ? 'block' : 'none';
  textoEl.textContent   = texto;
}

// ============================================================
// TOAST
// ============================================================

function mostrarToast(msg, tipo) {
  var t = document.getElementById('toast');
  if (!t) return;

  // Isto força o navegador a converter qualquer texto "escapado" de volta para HTML real
  var parser = new DOMParser();
  var doc = parser.parseFromString(msg, 'text/html');
  
  // Limpa o conteúdo antigo e coloca o HTML interpretado corretamente
  t.innerHTML = '';
  while (doc.body.firstChild) {
    t.appendChild(doc.body.firstChild);
  }
  
  t.className = 'toast ' + tipo + ' show';
  setTimeout(function() { t.classList.remove('show'); }, 3800);
}

// ============================================================
// LIMPAR
// ============================================================

function limparFormularioParcial() {
  _paisesAdicionados = [];

  document.querySelectorAll('.pais-input').forEach(function(inp) {
    inp.value = ''; inp.style.cssText = ''; inp.classList.remove('input-carregado');
  });
  document.getElementById('totalDiario').textContent = '0';
  document.getElementById('totalGeral').textContent  = '0';
  document.getElementById('contadorPaises').textContent = '0 registos';

  construirTabelaPaises();

  // Reconstruir operadores — volta ao estado inicial (1 linha desktop, sem cartões mobile)
  construirTabelaOperadores(NUM_LINHAS_OP);
  construirTabelaSugestoes(NUM_LINHAS_SUG);
  document.getElementById('observacoes').value = '';

  var inputPesquisa = document.getElementById('inputPesquisaPais');
  if (inputPesquisa) inputPesquisa.value = '';
  var listaPesquisa = document.getElementById('listaPesquisaPaises');
  if (listaPesquisa) listaPesquisa.style.display = 'none';
}

function limparFormulario() {
  if (!confirm('Tem a certeza que deseja limpar todos os dados?')) return;
  limparFormularioParcial();
  document.getElementById('data').valueAsDate = new Date();
  document.getElementById('local').value = '';
  mostrarBanner('', '');
  ultimoLocalVerificado = '';
  ultimaDataVerificada  = '';
  mostrarToast('Formulário limpo.', 'sucesso');
}

// ============================================================
// CARREGAR DADOS EXISTENTES
// ============================================================

function carregarDados(resp) {
  var paisesDestaque = PAISES.filter(function(p) { return p.destaque; })
                             .map(function(p) { return p.nome; });
  var paisesSimples  = PAISES_SIMPLES.map(function(p) { return p.nome; });

  _paisesAdicionados = [];
  Object.keys(resp.paises || {}).forEach(function(nomePais) {
    if (resp.paises[nomePais] > 0 &&
        paisesDestaque.indexOf(nomePais) === -1 &&
        paisesSimples.indexOf(nomePais) === -1) {
      _paisesAdicionados.push({ nome: nomePais, valor: resp.paises[nomePais] });
    }
  });

  construirTabelaPaises();

  document.querySelectorAll('.pais-input').forEach(function(inp) {
    var v = resp.paises[inp.dataset.pais];
    if (v && v > 0) {
      inp.value = v;
      inp.classList.add('input-carregado');
      inp.style.borderColor = 'var(--azul-light)';
      inp.style.background  = 'rgba(46,91,138,0.04)';
      inp.style.color       = 'var(--azul)';
      inp.style.fontWeight  = '600';
    }
  });

  var nOp  = Math.max(1, (resp.operadores || []).length);
  var nSug = Math.max(NUM_LINHAS_SUG, (resp.sugestoes  || []).length + 1);
  construirTabelaOperadores(nOp, resp.operadores || []);
  construirTabelaSugestoes(nSug, resp.sugestoes  || []);

  if (resp.observacoes) {
    document.getElementById('observacoes').value = resp.observacoes;
  }
  recalcularTotais();
}

// ============================================================
// SECÇÕES RECOLHÍVEIS
// ============================================================

function toggleSecao(idCorpo, idIcone) {
  var corpo  = document.getElementById(idCorpo);
  var icone  = document.getElementById(idIcone);
  var aberto = corpo.style.display !== 'none';
  corpo.style.display = aberto ? 'none' : '';
  icone.textContent   = aberto ? '▼' : '▲';
}
