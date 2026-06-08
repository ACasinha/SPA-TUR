// ============================================================
// offline.js — Detecção de ligação, reconexão e geração de PDF
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
//
// Adaptações SPA:
//   • verificarLigacao() actua apenas se o banner offline
//     estiver no DOM (só existe na view registo)
//   • gerarPDF() lê elementos do outlet activo — não depende
//     de IDs globais que já não existem fora da view
//   • mostrarModalPDF() / fecharModalPDF() trabalham com o
//     modal declarado no view.html do registo
// ============================================================

'use strict';

var _tentativasReconectar   = 0;
var _ultimaJanelaReconectar = 0;
var JANELA_RECONECTAR_MS    = 2 * 60 * 1000;
var MAX_TENTATIVAS_JANELA   = 5;
var _estavaSemLigacao       = false;

// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
  verificarLigacao();
  window.addEventListener('online',  function() { verificarLigacao(); });
  window.addEventListener('offline', function() { verificarLigacao(); });
});

// ============================================================
// VERIFICAR LIGAÇÃO
// ============================================================

function verificarLigacao() {
  var online = navigator.onLine;
  // O banner só existe quando a view registo está montada
  var banner = document.getElementById('offlineBanner');

  if (!online) {
    _estavaSemLigacao = true;
    if (banner) banner.style.display = 'flex';
    if (typeof bloquearFormulario === 'function') bloquearFormulario(true);
    if (typeof mostrarToast === 'function') mostrarToast('Sem ligação à Internet.', 'erro');
  } else if (_estavaSemLigacao) {
    _estavaSemLigacao = false;
    if (banner) banner.style.display = 'none';
    var btnG = document.getElementById('btnGuardar');
    if (btnG) btnG.disabled = false;
    if (typeof bloquearFormulario === 'function') bloquearFormulario(false);
    resetarBotaoReconectar();
    if (typeof mostrarToast === 'function') mostrarToast('Ligação restabelecida.', 'sucesso');
    if (typeof syncSincronizarFila === 'function') syncSincronizarFila();
  }
}

// ============================================================
// RECONEXÃO (anti-abuso)
// ============================================================

function tentarReconectar() {
  var agora = Date.now();
  if (agora - _ultimaJanelaReconectar > JANELA_RECONECTAR_MS) {
    _tentativasReconectar   = 0;
    _ultimaJanelaReconectar = agora;
  }
  if (_tentativasReconectar >= MAX_TENTATIVAS_JANELA) {
    var seg = Math.ceil((JANELA_RECONECTAR_MS - (agora - _ultimaJanelaReconectar)) / 1000);
    if (typeof mostrarToast === 'function')
      mostrarToast('Aguarde ' + seg + 's antes de tentar novamente.', 'info');
    return;
  }
  _tentativasReconectar++;
  var btn = document.getElementById('btnReconectar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ A verificar...'; }

  fetch(window.location.origin + '/manifest.json', { cache: 'no-store', mode: 'no-cors' })
    .then(function() {
      verificarLigacao();
      if (!navigator.onLine) {
        if (btn) { btn.disabled = false; btn.textContent = '🔄 Verificar ligação'; }
        var r = MAX_TENTATIVAS_JANELA - _tentativasReconectar;
        if (typeof mostrarToast === 'function')
          mostrarToast('Ainda sem ligação.' + (r > 0 ? ' ' + r + ' tentativa(s) restante(s).' : ''), 'erro');
      } else {
        resetarBotaoReconectar();
      }
    })
    .catch(function() {
      verificarLigacao();
      if (btn) { btn.disabled = false; btn.textContent = '🔄 Verificar ligação'; }
    });
}

function resetarBotaoReconectar() {
  var btn = document.getElementById('btnReconectar');
  if (btn) { btn.disabled = false; btn.textContent = '🔄 Verificar ligação'; }
  _tentativasReconectar = 0;
}

// ============================================================
// MODAL DE ESCOLHA DE PDF
// ============================================================

function mostrarModalPDF() {
  var modal = document.getElementById('modalEscolhaPDF');
  if (!modal) return;
  // Fechar ao clicar fora (ligar uma única vez)
  if (!modal._overlayListenerAdded) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) fecharModalPDF();
    });
    modal._overlayListenerAdded = true;
  }
  modal.style.display = 'flex';
}

function fecharModalPDF() {
  var modal = document.getElementById('modalEscolhaPDF');
  if (modal) modal.style.display = 'none';
}

function imprimirPDF() { mostrarModalPDF(); }

// ============================================================
// GERAÇÃO DE PDF — jsPDF + AutoTable
// ============================================================

function gerarPDF(tipo) {
  // Verificar que as bibliotecas estão disponíveis
  if (!window.jspdf || !window.jspdf.jsPDF) {
    if (typeof mostrarToast === 'function')
      mostrarToast('Biblioteca de PDF não carregada. Aguarde e tente novamente.', 'erro');
    return;
  }

  var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Paleta ──────────────────────────────────────────────────
  var COR_PRINCIPAL = [139, 74,  43];
  var COR_CLARO     = [245, 235, 224];
  var COR_TEXTO     = [44,  44,  44];
  var COR_BORDA     = [200, 185, 170];
  var COR_BORDA_INT = [215, 205, 193];
  var COR_ZEBRA_A   = [250, 245, 239];
  var COR_ZEBRA_B   = [255, 255, 255];
  var COR_DEST_BG   = [255, 248, 240];
  var COR_DEST_TXT  = COR_PRINCIPAL;

  var MARGEM     = 12;
  var LARGURA    = 210 - MARGEM * 2;
  var PAGE_H     = 297;
  var MARGEM_INF = 16;
  var COL0 = 32, COL2 = 22, COL1 = LARGURA - COL0 - COL2;
  var H_LIN = 4.0, H_HEAD = 5.0;
  var X0 = MARGEM, X1 = X0 + COL0, X2 = X1 + COL1;

  function sf(c) { doc.setFillColor(c[0], c[1], c[2]); }
  function sd(c) { doc.setDrawColor(c[0], c[1], c[2]); }
  function st(c) { doc.setTextColor(c[0], c[1], c[2]); }

  function celTxt(txt, cx, cy, cw, ch, align, cor, bold, sz) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(sz || 7.5);
    st(cor || COR_TEXTO);
    var tx = align === 'right'  ? cx + cw - 1.8 :
             align === 'center' ? cx + cw / 2    : cx + 1.8;
    doc.text(String(txt), tx, cy + ch / 2 + 0.5, { align: align || 'left', baseline: 'middle' });
  }

  function cabecalho(numPag) {
    sf(COR_PRINCIPAL);
    doc.rect(0, 0, 210, 18, 'F');
    st([255, 255, 255]);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('Registo Di\u00e1rio de Nacionalidades', MARGEM, 7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.text('Munic\u00edpio de Reguengos de Monsaraz  \u00b7  Servi\u00e7os de Turismo', MARGEM, 12);
    if (numPag) doc.text('P\u00e1g. ' + numPag, 210 - MARGEM, 12, { align: 'right' });
    st(COR_TEXTO);
    return 23;
  }

  function camposLocalData(yp) {
    sf(COR_CLARO);
    doc.roundedRect(MARGEM, yp, LARGURA, 9, 1, 1, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); st(COR_PRINCIPAL);
    doc.text('LOCAL / POSTO:', MARGEM + 2, yp + 3.5);
    doc.text('DATA:', MARGEM + 100, yp + 3.5);
    sd(COR_PRINCIPAL); doc.setLineWidth(0.3);
    doc.line(MARGEM + 28, yp + 6.5, MARGEM + 95, yp + 6.5);
    doc.line(MARGEM + 110, yp + 6.5, MARGEM + 140, yp + 6.5);
    st(COR_TEXTO);
    return yp + 13;
  }

  function rodape(numPag, total) {
    var yR = PAGE_H - 10;
    sd([200, 200, 200]); doc.setLineWidth(0.2);
    doc.line(MARGEM, yR, 210 - MARGEM, yR);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); st([150, 150, 150]);
    doc.text('Registo Di\u00e1rio de Nacionalidades  \u00b7  Munic\u00edpio de Reguengos de Monsaraz', MARGEM, yR + 3.5);
    if (total !== undefined) {
      doc.setFont('helvetica', 'bold'); st(COR_PRINCIPAL);
      doc.text('Total: ' + total, 210 - MARGEM, yR + 3.5, { align: 'right' });
    }
    st(COR_TEXTO);
  }

  function assinatura(yp) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); st(COR_PRINCIPAL);
    doc.text('Assinatura do(a) Funcion\u00e1rio(a):', MARGEM, yp);
    doc.text('Data:', MARGEM + 120, yp);
    sd(COR_PRINCIPAL); doc.setLineWidth(0.4);
    doc.line(MARGEM, yp + 7, MARGEM + 112, yp + 7);
    doc.line(MARGEM + 124, yp + 7, MARGEM + 152, yp + 7);
    st(COR_TEXTO);
    return yp + 12;
  }

  function avisoFinal(yp) {
    doc.setFillColor(255, 248, 225); doc.setDrawColor(192, 57, 43); doc.setLineWidth(0.5);
    doc.roundedRect(MARGEM, yp, LARGURA, 8, 1, 1, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(192, 57, 43);
    doc.text('IMPORTANTE: Ap\u00f3s restabelecimento da Internet inserir dados na aplica\u00e7\u00e3o.', MARGEM + 3, yp + 5);
    st(COR_TEXTO);
    return yp + 11;
  }

  // ── Recolher dados do DOM da view activa ─────────────────────
  function dadosOperadores() {
    var rows = [];
    document.querySelectorAll('#tabelaOperadores tr').forEach(function(tr) {
      var nome = (tr.querySelector('.op-nome') || {}).value || '';
      var tot  = (tr.querySelector('.op-total') || {}).value || '';
      var nacs = [];
      tr.querySelectorAll('.op-nac-linha').forEach(function(l) {
        var p = (l.querySelector('.op-nac-select') || {}).value || '';
        var n = parseInt((l.querySelector('.op-nac-num') || {}).value, 10) || 0;
        if (p && n > 0) nacs.push(p + ': ' + n);
      });
      if (nome) rows.push([nome, nacs.join(', '), tot || '0']);
    });
    while (rows.length < 5) rows.push(['', '', '']);
    return rows;
  }

  function dadosSugestoes() {
    var rows = [];
    document.querySelectorAll('#tabelaSugestoes tr').forEach(function(tr) {
      var txt = (tr.querySelector('.sug-texto') || {}).value || '';
      var nac = (tr.querySelector('.sug-nac')   || {}).value || '';
      if (txt) rows.push([txt, nac]);
    });
    while (rows.length < 5) rows.push(['', '']);
    return rows;
  }

  // Ler valores dos inputs de países (no outlet activo)
  var vals = {};
  document.querySelectorAll('.pais-input').forEach(function(inp) {
    vals[inp.dataset.pais] = parseInt(inp.value, 10) || 0;
  });

  var obs = (document.getElementById('observacoes') || {}).value || '';

  var estiloBase = {
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, textColor: COR_TEXTO, lineColor: COR_BORDA, lineWidth: 0.2 },
    headStyles: { fillColor: COR_PRINCIPAL, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: [250, 245, 239] },
    margin: { left: MARGEM, right: MARGEM }
  };

  // ============================================================
  // MODO PAÍSES
  // ============================================================
  if (tipo === 'paises') {

    var listaPDF = [
      { nome: 'Portugal',                 sub: 3, dest: true  },
      { nome: 'Espanha',                  sub: 2, dest: true  },
      { nome: '\u00c1frica do Sul',        sub: 1, dest: false },
      { nome: 'Alb\u00e2nia',              sub: 1, dest: false },
      { nome: 'Alemanha',                 sub: 1, dest: false },
      { nome: 'Angola',                   sub: 1, dest: false },
      { nome: 'Argentina',                sub: 1, dest: false },
      { nome: 'Austr\u00e1lia',            sub: 1, dest: false },
      { nome: '\u00c1ustria',              sub: 1, dest: false },
      { nome: 'B\u00e9lgica',              sub: 1, dest: false },
      { nome: 'B\u00f3snia Herzegovina',   sub: 1, dest: false },
      { nome: 'Brasil',                   sub: 1, dest: false },
      { nome: 'Canad\u00e1',               sub: 1, dest: false },
      { nome: 'Chile',                    sub: 1, dest: false },
      { nome: 'China',                    sub: 1, dest: false },
      { nome: 'Chipre',                   sub: 1, dest: false },
      { nome: 'Col\u00f4mbia',             sub: 1, dest: false },
      { nome: 'Coreia do Sul',            sub: 1, dest: false },
      { nome: 'Cro\u00e1cia',              sub: 1, dest: false },
      { nome: 'Dinamarca',                sub: 1, dest: false },
      { nome: 'Eslov\u00e9nia',            sub: 1, dest: false },
      { nome: 'Est\u00f3nia',              sub: 1, dest: false },
      { nome: 'EUA',                      sub: 1, dest: false },
      { nome: 'Finl\u00e2ndia',            sub: 1, dest: false },
      { nome: 'Fran\u00e7a',               sub: 1, dest: false },
      { nome: 'Gr\u00e9cia',               sub: 1, dest: false },
      { nome: 'Holanda',                  sub: 1, dest: false },
      { nome: 'Hungria',                  sub: 1, dest: false },
      { nome: '\u00cdndia',                sub: 1, dest: false },
      { nome: 'Inglaterra',               sub: 1, dest: false },
      { nome: 'Irlanda',                  sub: 1, dest: false },
      { nome: 'Isl\u00e2ndia',             sub: 1, dest: false },
      { nome: 'Israel',                   sub: 1, dest: false },
      { nome: 'It\u00e1lia',               sub: 1, dest: false },
      { nome: 'Jap\u00e3o',                sub: 1, dest: false },
      { nome: 'Let\u00f3nia',              sub: 1, dest: false },
      { nome: 'Litu\u00e2nia',             sub: 1, dest: false },
      { nome: 'Luxemburgo',               sub: 1, dest: false },
      { nome: 'M\u00e9xico',               sub: 1, dest: false },
      { nome: 'Mold\u00e1via',             sub: 1, dest: false },
      { nome: 'M\u00f3naco',               sub: 1, dest: false },
      { nome: 'Noruega',                  sub: 1, dest: false },
      { nome: 'Nova Zel\u00e2ndia',        sub: 1, dest: false },
      { nome: 'Pol\u00f3nia',              sub: 1, dest: false },
      { nome: 'Rep\u00fablica Checa',      sub: 1, dest: false },
      { nome: 'Rom\u00e9nia',              sub: 1, dest: false },
      { nome: 'R\u00fassia',               sub: 1, dest: false },
      { nome: 'Singapura',                sub: 1, dest: false },
      { nome: 'Su\u00e9cia',               sub: 1, dest: false },
      { nome: 'Su\u00ed\u00e7a',           sub: 1, dest: false },
      { nome: 'Ucr\u00e2nia',              sub: 1, dest: false },
      { nome: 'Venezuela',                sub: 1, dest: false },
      { nome: 'Outros Pa\u00edses',        sub: 1, dest: false }
    ];

    var totalGeral = 0;
    listaPDF.forEach(function(p) { totalGeral += vals[p.nome] || 0; });

    function cabecalhoTabela(yp) {
      sf(COR_PRINCIPAL); doc.rect(X0, yp, LARGURA, H_HEAD, 'F');
      sd(COR_BORDA); doc.setLineWidth(0.3); doc.rect(X0, yp, LARGURA, H_HEAD, 'S');
      doc.line(X1, yp, X1, yp + H_HEAD); doc.line(X2, yp, X2, yp + H_HEAD);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); st([255,255,255]);
      doc.text('Pa\u00eds / Regi\u00e3o de Origem', X0 + COL0/2, yp + H_HEAD/2 + 0.5, { align: 'center', baseline: 'middle' });
      doc.text('Turistas / Visitantes',   X1 + COL1/2, yp + H_HEAD/2 + 0.5, { align: 'center', baseline: 'middle' });
      doc.text('Total',                   X2 + COL2/2, yp + H_HEAD/2 + 0.5, { align: 'center', baseline: 'middle' });
      st(COR_TEXTO); return yp + H_HEAD;
    }

    function desenharGrupo(pais, yp, idx, valor) {
      var nSub  = pais.sub;
      var total = nSub * H_LIN;
      var fundo = pais.dest ? COR_DEST_BG : (idx % 2 === 0 ? COR_ZEBRA_A : COR_ZEBRA_B);
      sf(fundo); doc.rect(X0, yp, COL0, total, 'F');
      sd(COR_BORDA); doc.setLineWidth(0.25); doc.rect(X0, yp, COL0, total, 'S');
      celTxt(pais.nome, X0, yp, COL0, total, 'left', pais.dest ? COR_DEST_TXT : COR_TEXTO, pais.dest);
      sf(fundo); doc.rect(X2, yp, COL2, total, 'F');
      sd(COR_BORDA); doc.setLineWidth(0.25); doc.rect(X2, yp, COL2, total, 'S');
      if (valor > 0) celTxt(String(valor), X2, yp, COL2, total, 'right', COR_TEXTO, true);
      for (var s = 0; s < nSub; s++) {
        var ys = yp + s * H_LIN;
        sf(fundo); doc.rect(X1, ys, COL1, H_LIN, 'F');
        sd(COR_BORDA); doc.setLineWidth(0.25);
        doc.line(X1, ys, X1, ys + H_LIN); doc.line(X1 + COL1, ys, X1 + COL1, ys + H_LIN);
        if (s === 0) { sd(COR_BORDA); doc.setLineWidth(0.25); doc.line(X1, ys, X1 + COL1, ys); }
        else         { sd(COR_BORDA_INT); doc.setLineWidth(0.15); doc.line(X1, ys, X1 + COL1, ys); }
        if (s === nSub - 1) { sd(COR_BORDA); doc.setLineWidth(0.25); doc.line(X1, ys + H_LIN, X1 + COL1, ys + H_LIN); }
        if (s === 0 && valor > 0) {
          doc.setFont('helvetica','normal'); doc.setFontSize(6.5); st([110,110,110]);
          doc.text(String(valor), X1 + COL1 - 1.8, ys + H_LIN/2 + 0.5, { align:'right', baseline:'middle' });
        }
      }
    }

    function desenharTotal(yp) {
      sf(COR_CLARO); doc.rect(X0, yp, LARGURA, H_LIN, 'F');
      sd(COR_BORDA); doc.setLineWidth(0.3); doc.rect(X0, yp, LARGURA, H_LIN, 'S');
      doc.line(X1, yp, X1, yp + H_LIN); doc.line(X2, yp, X2, yp + H_LIN);
      doc.setFont('helvetica','bold'); doc.setFontSize(8.5); st(COR_PRINCIPAL);
      doc.text('TOTAL', X0 + 2, yp + H_LIN/2 + 0.5, { baseline:'middle' });
      if (totalGeral > 0) doc.text(String(totalGeral), X2 + COL2 - 1.8, yp + H_LIN/2 + 0.5, { align:'right', baseline:'middle' });
      st(COR_TEXTO); return yp + H_LIN;
    }

    var pagina  = 1;
    var yLimite = PAGE_H - MARGEM_INF;
    var yc      = cabecalho(pagina);
    yc = camposLocalData(yc);
    yc = cabecalhoTabela(yc);

    listaPDF.forEach(function(pais, idx) {
      var valor        = vals[pais.nome] || 0;
      var alturaGrupo  = pais.sub * H_LIN;
      if (yc + alturaGrupo > yLimite) {
        rodape(pagina, totalGeral > 0 ? totalGeral : '\u2014');
        doc.addPage(); pagina++;
        yc = cabecalho(pagina);
        yc = cabecalhoTabela(yc);
      }
      desenharGrupo(pais, yc, idx, valor);
      yc += alturaGrupo;
    });

    if (yc + H_LIN > yLimite) {
      rodape(pagina, totalGeral > 0 ? totalGeral : '\u2014');
      doc.addPage(); pagina++;
      yc = cabecalho(pagina);
      yc = cabecalhoTabela(yc);
    }
    yc = desenharTotal(yc);
    rodape(pagina, totalGeral > 0 ? totalGeral : '\u2014');

    // Página de operadores / sugestões / observações
    doc.addPage();
    var y2 = cabecalho(pagina + 1);
    var ops  = dadosOperadores();
    var sugs = dadosSugestoes();

    doc.autoTable(Object.assign({}, estiloBase, {
      startY: y2,
      head: [['Operador / Ag\u00eancia', 'Nacionalidades', 'Total']],
      body: ops,
      columnStyles: { 0: { cellWidth: 55 }, 2: { cellWidth: 18, halign: 'right' } }
    }));
    y2 = doc.lastAutoTable.finalY + 5;

    doc.autoTable(Object.assign({}, estiloBase, {
      startY: y2,
      head: [['Sugest\u00e3o / Cr\u00edtica', 'Nacionalidade']],
      body: sugs,
      columnStyles: { 1: { cellWidth: 38 } }
    }));
    y2 = doc.lastAutoTable.finalY + 5;

    doc.autoTable(Object.assign({}, estiloBase, {
      startY: y2,
      head: [['Outras Observa\u00e7\u00f5es']],
      body: [[obs || '']],
      styles: Object.assign({}, estiloBase.styles, { minCellHeight: 12 })
    }));
    y2 = doc.lastAutoTable.finalY + 8;
    y2 = assinatura(y2);
    avisoFinal(y2);
    rodape(pagina + 1);

  // ============================================================
  // MODO SIMPLES
  // ============================================================
  } else {

    var y = cabecalho();
    y = camposLocalData(y);

    var vNac = vals['Nacionais']    || 0;
    var vEst = vals['Estrangeiros'] || 0;
    var totalSimples = vNac + vEst;

    var SC0 = 36, SC2 = 22, SC1 = LARGURA - SC0 - SC2;
    var SX0 = MARGEM, SX1 = SX0 + SC0, SX2 = SX1 + SC1;
    var S_SUB = 4, S_H = H_LIN;

    // Cabeçalho tabela simplificada
    sf(COR_PRINCIPAL); doc.rect(SX0, y, LARGURA, H_HEAD, 'F');
    sd(COR_BORDA); doc.setLineWidth(0.3); doc.rect(SX0, y, LARGURA, H_HEAD, 'S');
    doc.line(SX1, y, SX1, y + H_HEAD); doc.line(SX2, y, SX2, y + H_HEAD);
    doc.setFont('helvetica','bold'); doc.setFontSize(8); st([255,255,255]);
    doc.text('Tipo de Visitante',     SX0 + SC0/2, y + H_HEAD/2 + 0.5, { align:'center', baseline:'middle' });
    doc.text('Turistas / Visitantes', SX1 + SC1/2, y + H_HEAD/2 + 0.5, { align:'center', baseline:'middle' });
    doc.text('Total',                 SX2 + SC2/2, y + H_HEAD/2 + 0.5, { align:'center', baseline:'middle' });
    st(COR_TEXTO); y += H_HEAD;

    function desenharGrupoSimples(label, valor, yg, fundoBase) {
      var altTotal = S_SUB * S_H;
      sf(COR_DEST_BG); doc.rect(SX0, yg, SC0, altTotal, 'F');
      sd(COR_BORDA); doc.setLineWidth(0.25); doc.rect(SX0, yg, SC0, altTotal, 'S');
      celTxt(label, SX0, yg, SC0, altTotal, 'left', COR_DEST_TXT, true);
      sf(COR_DEST_BG); doc.rect(SX2, yg, SC2, altTotal, 'F');
      sd(COR_BORDA); doc.setLineWidth(0.25); doc.rect(SX2, yg, SC2, altTotal, 'S');
      if (valor > 0) celTxt(String(valor), SX2, yg, SC2, altTotal, 'right', COR_TEXTO, true);
      for (var s = 0; s < S_SUB; s++) {
        var ys = yg + s * S_H;
        sf(fundoBase); doc.rect(SX1, ys, SC1, S_H, 'F');
        sd(COR_BORDA); doc.setLineWidth(0.25);
        doc.line(SX1, ys, SX1, ys + S_H); doc.line(SX1 + SC1, ys, SX1 + SC1, ys + S_H);
        if (s === 0) { sd(COR_BORDA); doc.setLineWidth(0.25); doc.line(SX1, ys, SX1 + SC1, ys); }
        else         { sd(COR_BORDA_INT); doc.setLineWidth(0.15); doc.line(SX1, ys, SX1 + SC1, ys); }
        if (s === S_SUB - 1) { sd(COR_BORDA); doc.setLineWidth(0.25); doc.line(SX1, ys + S_H, SX1 + SC1, ys + S_H); }
        if (s === 0 && valor > 0) {
          doc.setFont('helvetica','normal'); doc.setFontSize(6.5); st([110,110,110]);
          doc.text(String(valor), SX1 + SC1 - 1.8, ys + S_H/2 + 0.5, { align:'right', baseline:'middle' });
        }
      }
      return yg + altTotal;
    }

    y = desenharGrupoSimples('Nacionais',    vNac, y, COR_ZEBRA_A);
    y = desenharGrupoSimples('Estrangeiros', vEst, y, COR_ZEBRA_B);

    // Total
    sf(COR_CLARO); doc.rect(SX0, y, LARGURA, S_H, 'F');
    sd(COR_BORDA); doc.setLineWidth(0.3); doc.rect(SX0, y, LARGURA, S_H, 'S');
    doc.line(SX1, y, SX1, y + S_H); doc.line(SX2, y, SX2, y + S_H);
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); st(COR_PRINCIPAL);
    doc.text('TOTAL', SX0 + 2, y + S_H/2 + 0.5, { baseline:'middle' });
    if (totalSimples > 0) doc.text(String(totalSimples), SX2 + SC2 - 1.8, y + S_H/2 + 0.5, { align:'right', baseline:'middle' });
    st(COR_TEXTO); y += S_H + 5;

    var ops2  = dadosOperadores();
    var sugs2 = dadosSugestoes();

    doc.autoTable(Object.assign({}, estiloBase, {
      startY: y,
      head: [['Operador / Ag\u00eancia', 'Nacionalidades', 'Total']],
      body: ops2,
      columnStyles: { 0: { cellWidth: 55 }, 2: { cellWidth: 18, halign: 'right' } }
    }));
    y = doc.lastAutoTable.finalY + 5;

    doc.autoTable(Object.assign({}, estiloBase, {
      startY: y,
      head: [['Sugest\u00e3o / Cr\u00edtica', 'Nacionalidade']],
      body: sugs2,
      columnStyles: { 1: { cellWidth: 38 } }
    }));
    y = doc.lastAutoTable.finalY + 5;

    doc.autoTable(Object.assign({}, estiloBase, {
      startY: y,
      head: [['Outras Observa\u00e7\u00f5es']],
      body: [[obs || '']],
      styles: Object.assign({}, estiloBase.styles, { minCellHeight: 12 })
    }));
    y = doc.lastAutoTable.finalY + 8;
    y = assinatura(y);
    avisoFinal(y);
    rodape();
  }

  // ── Guardar ficheiro ─────────────────────────────────────────
  var dataHoje = new Date().toISOString().slice(0, 10);
  doc.save('Registo-Nacionalidades-' + tipo + '-' + dataHoje + '.pdf');
}