// ============================================================
// offline.js — Detecção de ligação, reconexão e geração de PDF
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
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
  var banner = document.getElementById('offlineBanner');
  if (!banner) return;

  if (!online) {
    _estavaSemLigacao    = true;
    banner.style.display = 'flex';
    if (typeof bloquearFormulario === 'function') bloquearFormulario(true);
    if (typeof mostrarToast === 'function') mostrarToast('Sem ligação à Internet.', 'erro');
  } else if (_estavaSemLigacao) {
    _estavaSemLigacao    = false;
    banner.style.display = 'none';
    var btnG = document.getElementById('btnGuardar');
    if (btnG) btnG.disabled = false;
    if (typeof bloquearFormulario === 'function') bloquearFormulario(false);
    resetarBotaoReconectar();
    if (typeof mostrarToast === 'function') mostrarToast('Ligação restabelecida.', 'sucesso');
    // Sincronizar fila offline ao reconectar (fallback iOS Safari)
    if (typeof syncSincronizarFila === 'function') {
      syncSincronizarFila();
    }
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
    if (typeof mostrarToast === 'function') mostrarToast('Aguarde ' + seg + 's antes de tentar novamente.', 'info');
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
  if (!modal) {
    modal = document.createElement('div');
    modal.id        = 'modalEscolhaPDF';
    modal.className = 'modal-overlay';
    modal.innerHTML =
      '<div class="modal-pdf-caixa">' +
        '<div class="modal-pdf-titulo">📄 Gerar Formulário PDF</div>' +
        '<div class="modal-pdf-sub">Escolha o tipo de formulário a gerar:</div>' +
        '<div class="modal-pdf-opcoes">' +
          '<button class="btn-pdf-opcao" onclick="gerarPDF(\'paises\');fecharModalPDF()">' +
            '<span class="pdf-opcao-icone">🌍</span>' +
            '<span class="pdf-opcao-titulo">Lista de Países</span>' +
            '<span class="pdf-opcao-desc">Formulário com todos os países<br>para registar visitantes por país</span>' +
          '</button>' +
          '<button class="btn-pdf-opcao" onclick="gerarPDF(\'simples\');fecharModalPDF()">' +
            '<span class="pdf-opcao-icone">🏠</span>' +
            '<span class="pdf-opcao-titulo">Nacionais / Estrangeiros</span>' +
            '<span class="pdf-opcao-desc">Formulário simplificado<br>apenas com Nacionais e Estrangeiros</span>' +
          '</button>' +
        '</div>' +
        '<button class="btn-pdf-fechar" onclick="fecharModalPDF()">Cancelar</button>' +
      '</div>';
    modal.addEventListener('click', function(e) {
      if (e.target === modal) fecharModalPDF();
    });
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
}

function fecharModalPDF() {
  var modal = document.getElementById('modalEscolhaPDF');
  if (modal) modal.style.display = 'none';
}

// ============================================================
// GERAÇÃO DE PDF — jsPDF + AutoTable
// CDN carregado no index.html
// ============================================================

function gerarPDF(tipo) {
  var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Paleta ──────────────────────────────────────────────────
  var COR_PRINCIPAL    = [139, 74,  43];   // #8B4A2B terra
  var COR_CLARO        = [245, 235, 224];  // #F5EBE0 bege
  var COR_TEXTO        = [44,  44,  44];   // quase preto
  var COR_BORDA        = [200, 185, 170];  // borda da tabela
  var COR_BORDA_INT    = [215, 205, 193];  // divisória interna suave
  var COR_ZEBRA_A      = [250, 245, 239];  // linha par
  var COR_ZEBRA_B      = [255, 255, 255];  // linha ímpar
  var COR_DEST_BG      = [255, 248, 240];  // fundo Portugal / Espanha
  var COR_DEST_TXT     = COR_PRINCIPAL;    // texto Portugal / Espanha

  var MARGEM     = 12;
  var LARGURA    = 210 - MARGEM * 2;   // 186 mm
  var PAGE_H     = 297;
  var MARGEM_INF = 16;                 // reserva para rodapé

  // ── Larguras da tabela de países ────────────────────────────
  // Col 0 (País):            52 mm
  // Col 2 (Total):           22 mm
  // Col 1 (Turistas/Visit.): 186 - 52 - 22 = 112 mm
  var COL0   = 32;
  var COL2   = 22;
  var COL1   = LARGURA - COL0 - COL2;
  var H_LIN  = 4.0;   // altura de cada sub-linha (mm)
  var H_HEAD = 5.0;   // altura do cabeçalho da tabela (mm)

  // ── Posições X ──────────────────────────────────────────────
  var X0 = MARGEM;
  var X1 = X0 + COL0;
  var X2 = X1 + COL1;

  // ── Helpers ─────────────────────────────────────────────────
  function sf(c) { doc.setFillColor(c[0], c[1], c[2]); }
  function sd(c) { doc.setDrawColor(c[0], c[1], c[2]); }
  function st(c) { doc.setTextColor(c[0], c[1], c[2]); }

  // Texto centrado verticalmente (com baseline middle)
  function celTxt(txt, cx, cy, cw, ch, align, cor, bold, sz) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(sz || 7.5);
    st(cor || COR_TEXTO);
    var tx = align === 'right'  ? cx + cw - 1.8 :
             align === 'center' ? cx + cw / 2    : cx + 1.8;
    doc.text(String(txt), tx, cy + ch / 2 + 0.5, { align: align || 'left', baseline: 'middle' });
  }

  // ── Cabeçalho de página ─────────────────────────────────────
  function cabecalho(numPag) {
    sf(COR_PRINCIPAL);
    doc.rect(0, 0, 210, 18, 'F');
    st([255, 255, 255]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Registo Di\u00e1rio de Nacionalidades', MARGEM, 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('Munic\u00edpio de Reguengos de Monsaraz  \u00b7  Servi\u00e7os de Turismo', MARGEM, 12);
    if (numPag) doc.text('P\u00e1g. ' + numPag, 210 - MARGEM, 12, { align: 'right' });
    st(COR_TEXTO);
    return 23;
  }

  // ── Local / Data ─────────────────────────────────────────────
  function camposLocalData(yp) {
    sf(COR_CLARO);
    doc.roundedRect(MARGEM, yp, LARGURA, 9, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    st(COR_PRINCIPAL);
    doc.text('LOCAL / POSTO:', MARGEM + 2, yp + 3.5);
    doc.text('DATA:', MARGEM + 100, yp + 3.5);
    sd(COR_PRINCIPAL);
    doc.setLineWidth(0.3);
    doc.line(MARGEM + 28, yp + 6.5, MARGEM + 95, yp + 6.5);
    doc.line(MARGEM + 110, yp + 6.5, MARGEM + 140, yp + 6.5);
    st(COR_TEXTO);
    return yp + 13;
  }

  // ── Rodapé ───────────────────────────────────────────────────
  function rodape(numPag, total) {
    var yR = PAGE_H - 10;
    sd([200, 200, 200]);
    doc.setLineWidth(0.2);
    doc.line(MARGEM, yR, 210 - MARGEM, yR);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    st([150, 150, 150]);
    doc.text('Registo Di\u00e1rio de Nacionalidades  \u00b7  Munic\u00edpio de Reguengos de Monsaraz', MARGEM, yR + 3.5);
    if (total !== undefined) {
      doc.setFont('helvetica', 'bold');
      st(COR_PRINCIPAL);
      doc.text('Total: ' + total, 210 - MARGEM, yR + 3.5, { align: 'right' });
    }
    st(COR_TEXTO);
  }

  // ── Assinatura ───────────────────────────────────────────────
  function assinatura(yp) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    st(COR_PRINCIPAL);
    doc.text('Assinatura do(a) Funcion\u00e1rio(a):', MARGEM, yp);
    doc.text('Data:', MARGEM + 120, yp);
    sd(COR_PRINCIPAL);
    doc.setLineWidth(0.4);
    doc.line(MARGEM,       yp + 7, MARGEM + 112, yp + 7);
    doc.line(MARGEM + 124, yp + 7, MARGEM + 152, yp + 7);
    st(COR_TEXTO);
    return yp + 12;
  }

  // ── Aviso final ──────────────────────────────────────────────
  function avisoFinal(yp) {
    doc.setFillColor(255, 248, 225);
    doc.setDrawColor(192, 57, 43);
    doc.setLineWidth(0.5);
    doc.roundedRect(MARGEM, yp, LARGURA, 8, 1, 1, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(192, 57, 43);
    doc.text('IMPORTANTE: Ap\u00f3s restabelecimento da Internet inserir dados na aplica\u00e7\u00e3o.', MARGEM + 3, yp + 5);
    st(COR_TEXTO);
    return yp + 11;
  }

  // ── Operadores ───────────────────────────────────────────────
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

  // ── Sugestões ────────────────────────────────────────────────
  function dadosSugestoes() {
    var rows = [];
    document.querySelectorAll('#tabelaSugestoes tr').forEach(function(tr) {
      var txt = (tr.querySelector('.sug-texto') || {}).value || '';
      var nac = (tr.querySelector('.sug-nac') || {}).value   || '';
      if (txt) rows.push([txt, nac]);
    });
    while (rows.length < 5) rows.push(['', '']);
    return rows;
  }

  var obs = (document.getElementById('observacoes') || {}).value || '';

  // ── Estilo base autoTable (pág. operadores/sugestões) ────────
  var estiloBase = {
    theme: 'grid',
    styles: {
      fontSize: 8, cellPadding: 2,
      textColor: COR_TEXTO, lineColor: COR_BORDA, lineWidth: 0.2
    },
    headStyles: {
      fillColor: COR_PRINCIPAL, textColor: [255, 255, 255],
      fontStyle: 'bold', fontSize: 8, cellPadding: 2.5
    },
    alternateRowStyles: { fillColor: [250, 245, 239] },
    margin: { left: MARGEM, right: MARGEM },
  };

  // ===========================================================
  // MODO PAÍSES — tabela desenhada inteiramente à mão
  // Garante rowspan real sem interferência do autoTable
  // ===========================================================
  if (tipo === 'paises') {

    // ── Lista de países ──────────────────────────────────────
    var listaPDF = [
      { nome: 'Portugal',           sub: 3, dest: true  },
      { nome: 'Espanha',            sub: 2, dest: true  },
      { nome: '\u00c1frica do Sul',      sub: 1, dest: false },
      { nome: 'Alb\u00e2nia',            sub: 1, dest: false },
      { nome: 'Alemanha',           sub: 1, dest: false },
      { nome: 'Angola',             sub: 1, dest: false },
      { nome: 'Argentina',          sub: 1, dest: false },
      { nome: 'Austr\u00e1lia',          sub: 1, dest: false },
      { nome: '\u00c1ustria',            sub: 1, dest: false },
      { nome: 'B\u00e9lgica',            sub: 1, dest: false },
      { nome: 'B\u00f3snia Herzegovina', sub: 1, dest: false },
      { nome: 'Brasil',             sub: 1, dest: false },
      { nome: 'Canad\u00e1',             sub: 1, dest: false },
      { nome: 'Chile',              sub: 1, dest: false },
      { nome: 'China',              sub: 1, dest: false },
      { nome: 'Chipre',             sub: 1, dest: false },
      { nome: 'Col\u00f4mbia',           sub: 1, dest: false },
      { nome: 'Coreia do Sul',      sub: 1, dest: false },
      { nome: 'Cro\u00e1cia',            sub: 1, dest: false },
      { nome: 'Dinamarca',          sub: 1, dest: false },
      { nome: 'Eslov\u00e9nia',          sub: 1, dest: false },
      { nome: 'Est\u00f3nia',            sub: 1, dest: false },
      { nome: 'EUA',                sub: 1, dest: false },
      { nome: 'Finl\u00e2ndia',          sub: 1, dest: false },
      { nome: 'Fran\u00e7a',             sub: 1, dest: false },
      { nome: 'Gr\u00e9cia',             sub: 1, dest: false },
      { nome: 'Holanda',            sub: 1, dest: false },
      { nome: 'Hungria',            sub: 1, dest: false },
      { nome: '\u00cdndia',              sub: 1, dest: false },
      { nome: 'Inglaterra',         sub: 1, dest: false },
      { nome: 'Irlanda',            sub: 1, dest: false },
      { nome: 'Isl\u00e2ndia',           sub: 1, dest: false },
      { nome: 'Israel',             sub: 1, dest: false },
      { nome: 'It\u00e1lia',             sub: 1, dest: false },
      { nome: 'Jap\u00e3o',              sub: 1, dest: false },
      { nome: 'Let\u00f3nia',            sub: 1, dest: false },
      { nome: 'Litu\u00e2nia',           sub: 1, dest: false },
      { nome: 'Luxemburgo',         sub: 1, dest: false },
      { nome: 'M\u00e9xico',             sub: 1, dest: false },
      { nome: 'Mold\u00e1via',           sub: 1, dest: false },
      { nome: 'M\u00f3naco',             sub: 1, dest: false },
      { nome: 'Noruega',            sub: 1, dest: false },
      { nome: 'Nova Zel\u00e2ndia',      sub: 1, dest: false },
      { nome: 'Pol\u00f3nia',            sub: 1, dest: false },
      { nome: 'Rep\u00fablica Checa',    sub: 1, dest: false },
      { nome: 'Rom\u00e9nia',            sub: 1, dest: false },
      { nome: 'R\u00fassia',             sub: 1, dest: false },
      { nome: 'Singapura',          sub: 1, dest: false },
      { nome: 'Su\u00e9cia',             sub: 1, dest: false },
      { nome: 'Su\u00ed\u00e7a',              sub: 1, dest: false },
      { nome: 'Ucr\u00e2nia',            sub: 1, dest: false },
      { nome: 'Venezuela',          sub: 1, dest: false },
      { nome: 'Outros Pa\u00edses',      sub: 1, dest: false },
    ];

    // Os nomes em listaPDF já têm diacríticos e coincidem com data.js.
    // O mapa apenas trata excepções de grafia entre os dois ficheiros.
    var mapa = {
      'Col\u00f4mbia': 'Col\u00f4mbia',   // coincide
    };

    // Ler valores registados
    var vals = {};
    document.querySelectorAll('.pais-input').forEach(function(inp) {
      vals[inp.dataset.pais] = parseInt(inp.value, 10) || 0;
    });

    var totalGeral = 0;
    listaPDF.forEach(function(p) {
      totalGeral += vals[p.nome] || 0;
    });

    // ── Cabeçalho da tabela de países ────────────────────────
    function cabecalhoTabela(yp) {
      // Fundo
      sf(COR_PRINCIPAL);
      doc.rect(X0, yp, LARGURA, H_HEAD, 'F');
      // Borda exterior
      sd(COR_BORDA);
      doc.setLineWidth(0.3);
      doc.rect(X0, yp, LARGURA, H_HEAD, 'S');
      // Divisórias verticais
      doc.line(X1, yp, X1, yp + H_HEAD);
      doc.line(X2, yp, X2, yp + H_HEAD);
      // Textos
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      st([255, 255, 255]);
      doc.text('Pa\u00eds / Regi\u00e3o de Origem',  X0 + COL0 / 2, yp + H_HEAD / 2 + 0.5, { align: 'center', baseline: 'middle' });
      doc.text('Turistas / Visitantes',    X1 + COL1 / 2, yp + H_HEAD / 2 + 0.5, { align: 'center', baseline: 'middle' });
      doc.text('Total',                    X2 + COL2 / 2, yp + H_HEAD / 2 + 0.5, { align: 'center', baseline: 'middle' });
      st(COR_TEXTO);
      return yp + H_HEAD;
    }

    // ── Desenhar um grupo (país) ──────────────────────────────
    // Desenha as 3 colunas do grupo a partir de yp.
    // Col 0 e Col 2: bloco único com altura total do grupo.
    // Col 1: sub-linhas individuais com divisórias internas suaves.
    function desenharGrupo(pais, yp, idx, valor) {
      var nSub  = pais.sub;
      var total = nSub * H_LIN;
      var fundo = pais.dest ? COR_DEST_BG : (idx % 2 === 0 ? COR_ZEBRA_A : COR_ZEBRA_B);

      // ── Col 0 — bloco inteiro ────────────────────────────
      sf(fundo);
      doc.rect(X0, yp, COL0, total, 'F');
      sd(COR_BORDA);
      doc.setLineWidth(0.25);
      doc.rect(X0, yp, COL0, total, 'S');
      // Texto do país centrado verticalmente no bloco
      celTxt(pais.nome, X0, yp, COL0, total, 'left',
        pais.dest ? COR_DEST_TXT : COR_TEXTO, pais.dest);

      // ── Col 2 — bloco inteiro ────────────────────────────
      sf(fundo);
      doc.rect(X2, yp, COL2, total, 'F');
      sd(COR_BORDA);
      doc.setLineWidth(0.25);
      doc.rect(X2, yp, COL2, total, 'S');
      // Valor digital se existir, centrado verticalmente
      if (valor > 0) {
        celTxt(String(valor), X2, yp, COL2, total, 'right', COR_TEXTO, true);
      }

      // ── Col 1 — sub-linhas ───────────────────────────────
      for (var s = 0; s < nSub; s++) {
        var ys = yp + s * H_LIN;

        // Fundo da sub-linha
        sf(fundo);
        doc.rect(X1, ys, COL1, H_LIN, 'F');

        // Bordas laterais (esq. e dir.)
        sd(COR_BORDA);
        doc.setLineWidth(0.25);
        doc.line(X1,        ys, X1,        ys + H_LIN);
        doc.line(X1 + COL1, ys, X1 + COL1, ys + H_LIN);

        // Borda superior:
        //   - 1ª sub-linha → linha de grupo (COR_BORDA, 0.25)
        //   - restantes    → divisória interna suave
        if (s === 0) {
          sd(COR_BORDA);
          doc.setLineWidth(0.25);
          doc.line(X1, ys, X1 + COL1, ys);
        } else {
          sd(COR_BORDA_INT);
          doc.setLineWidth(0.15);
          doc.line(X1, ys, X1 + COL1, ys);
        }

        // Borda inferior da última sub-linha
        if (s === nSub - 1) {
          sd(COR_BORDA);
          doc.setLineWidth(0.25);
          doc.line(X1, ys + H_LIN, X1 + COL1, ys + H_LIN);
        }

        // Valor digital na 1ª sub-linha (pequeno, à direita)
        if (s === 0 && valor > 0) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          st([110, 110, 110]);
          doc.text(String(valor), X1 + COL1 - 1.8, ys + H_LIN / 2 + 0.5, {
            align: 'right', baseline: 'middle'
          });
        }
      }
    }

    // ── Linha de total ────────────────────────────────────────
    function desenharTotal(yp) {
      sf(COR_CLARO);
      doc.rect(X0, yp, LARGURA, H_LIN, 'F');
      sd(COR_BORDA);
      doc.setLineWidth(0.3);
      doc.rect(X0, yp, LARGURA, H_LIN, 'S');
      doc.line(X1, yp, X1, yp + H_LIN);
      doc.line(X2, yp, X2, yp + H_LIN);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      st(COR_PRINCIPAL);
      doc.text('TOTAL', X0 + 2, yp + H_LIN / 2 + 0.5, { baseline: 'middle' });
      if (totalGeral > 0) {
        doc.text(String(totalGeral), X2 + COL2 - 1.8, yp + H_LIN / 2 + 0.5, {
          align: 'right', baseline: 'middle'
        });
      }
      st(COR_TEXTO);
      return yp + H_LIN;
    }

    // ── Renderizar todas as linhas com quebra de página ──────
    var pagina = 1;
    var yLimite = PAGE_H - MARGEM_INF;

    var yc = cabecalho(pagina);
    yc = camposLocalData(yc);
    yc = cabecalhoTabela(yc);

    listaPDF.forEach(function(pais, idx) {
      var orig  = pais.nome;
      var valor = vals[orig] || 0;
      var alturaGrupo = pais.sub * H_LIN;

      // Se o grupo não cabe, nova página
      if (yc + alturaGrupo > yLimite) {
        rodape(pagina, totalGeral > 0 ? totalGeral : '\u2014');
        doc.addPage();
        pagina++;
        yc = cabecalho(pagina);
        yc = cabecalhoTabela(yc);
      }

      desenharGrupo(pais, yc, idx, valor);
      yc += alturaGrupo;
    });

    // Linha de total (com quebra se necessário)
    if (yc + H_LIN > yLimite) {
      rodape(pagina, totalGeral > 0 ? totalGeral : '\u2014');
      doc.addPage();
      pagina++;
      yc = cabecalho(pagina);
      yc = cabecalhoTabela(yc);
    }
    yc = desenharTotal(yc);
    rodape(pagina, totalGeral > 0 ? totalGeral : '\u2014');

    // ── Página de operadores / sugestões / observações ───────
    doc.addPage();
    var y2 = cabecalho(pagina + 1);
    var ops  = dadosOperadores();
    var sugs = dadosSugestoes();

    doc.autoTable(Object.assign({}, estiloBase, {
      startY: y2,
      head: [['Operador / Ag\u00eancia', 'Nacionalidades', 'Total']],
      body: ops,
      columnStyles: { 0: { cellWidth: 55 }, 2: { cellWidth: 18, halign: 'right' } },
    }));
    y2 = doc.lastAutoTable.finalY + 5;

    doc.autoTable(Object.assign({}, estiloBase, {
      startY: y2,
      head: [['Sugest\u00e3o / Cr\u00edtica', 'Nacionalidade']],
      body: sugs,
      columnStyles: { 1: { cellWidth: 38 } },
    }));
    y2 = doc.lastAutoTable.finalY + 5;

    doc.autoTable(Object.assign({}, estiloBase, {
      startY: y2,
      head: [['Outras Observa\u00e7\u00f5es']],
      body: [[obs || '']],
      styles: Object.assign({}, estiloBase.styles, { minCellHeight: 12 }),
    }));
    y2 = doc.lastAutoTable.finalY + 8;

    y2 = assinatura(y2);
    avisoFinal(y2);
    rodape(pagina + 1);

  // ===========================================================
  // MODO SIMPLES — tabela desenhada manualmente (3 colunas,
  // 4 sub-linhas por tipo, rowspan real em Col 0 e Col 2)
  // ===========================================================
  } else {

    var y = cabecalho();
    y = camposLocalData(y);

    var vNac = 0, vEst = 0;
    document.querySelectorAll('.pais-input').forEach(function(inp) {
      if (inp.dataset.pais === 'Nacionais')    vNac = parseInt(inp.value, 10) || 0;
      if (inp.dataset.pais === 'Estrangeiros') vEst = parseInt(inp.value, 10) || 0;
    });
    var totalSimples = vNac + vEst;

    // ── Dimensões da tabela simplificada ──────────────────────
    // "Estrangeiros" é o texto mais longo (~28mm a 8pt + padding)
    var SC0 = 36;                     // Col 0 — Tipo de Visitante
    var SC2 = 22;                     // Col 2 — Total
    var SC1 = LARGURA - SC0 - SC2;    // Col 1 — Turistas / Visitantes
    var SX0 = MARGEM;
    var SX1 = SX0 + SC0;
    var SX2 = SX1 + SC1;
    var S_SUB = 4;                    // 4 sub-linhas por tipo
    var S_H   = H_LIN;                // mesma altura de linha do modo países

    // ── Cabeçalho da tabela simplificada ─────────────────────
    sf(COR_PRINCIPAL);
    doc.rect(SX0, y, LARGURA, H_HEAD, 'F');
    sd(COR_BORDA);
    doc.setLineWidth(0.3);
    doc.rect(SX0, y, LARGURA, H_HEAD, 'S');
    doc.line(SX1, y, SX1, y + H_HEAD);
    doc.line(SX2, y, SX2, y + H_HEAD);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    st([255, 255, 255]);
    doc.text('Tipo de Visitante',   SX0 + SC0 / 2, y + H_HEAD / 2 + 0.5, { align: 'center', baseline: 'middle' });
    doc.text('Turistas / Visitantes', SX1 + SC1 / 2, y + H_HEAD / 2 + 0.5, { align: 'center', baseline: 'middle' });
    doc.text('Total',               SX2 + SC2 / 2, y + H_HEAD / 2 + 0.5, { align: 'center', baseline: 'middle' });
    st(COR_TEXTO);
    y += H_HEAD;

    // ── Função: desenha um grupo (Nacionais ou Estrangeiros) ──
    function desenharGrupoSimples(label, valor, yg, fundoBase, destaque) {
      var altTotal = S_SUB * S_H;
      var fundo    = destaque ? COR_DEST_BG : fundoBase;
      var corTxt   = destaque ? COR_DEST_TXT : COR_TEXTO;

      // Col 0 — bloco único (rowspan)
      sf(fundo);
      doc.rect(SX0, yg, SC0, altTotal, 'F');
      sd(COR_BORDA);
      doc.setLineWidth(0.25);
      doc.rect(SX0, yg, SC0, altTotal, 'S');
      celTxt(label, SX0, yg, SC0, altTotal, 'left', corTxt, destaque);

      // Col 2 — bloco único (rowspan)
      sf(fundo);
      doc.rect(SX2, yg, SC2, altTotal, 'F');
      sd(COR_BORDA);
      doc.setLineWidth(0.25);
      doc.rect(SX2, yg, SC2, altTotal, 'S');
      if (valor > 0) {
        celTxt(String(valor), SX2, yg, SC2, altTotal, 'right', COR_TEXTO, true);
      }

      // Col 1 — sub-linhas individuais
      for (var s = 0; s < S_SUB; s++) {
        var ys = yg + s * S_H;

        sf(fundo);
        doc.rect(SX1, ys, SC1, S_H, 'F');

        // Bordas laterais
        sd(COR_BORDA);
        doc.setLineWidth(0.25);
        doc.line(SX1,        ys, SX1,        ys + S_H);
        doc.line(SX1 + SC1,  ys, SX1 + SC1,  ys + S_H);

        // Borda superior (grupo = grossa; interna = suave)
        if (s === 0) {
          sd(COR_BORDA);
          doc.setLineWidth(0.25);
          doc.line(SX1, ys, SX1 + SC1, ys);
        } else {
          sd(COR_BORDA_INT);
          doc.setLineWidth(0.15);
          doc.line(SX1, ys, SX1 + SC1, ys);
        }

        // Borda inferior da última sub-linha
        if (s === S_SUB - 1) {
          sd(COR_BORDA);
          doc.setLineWidth(0.25);
          doc.line(SX1, ys + S_H, SX1 + SC1, ys + S_H);
        }

        // Valor digital na 1ª sub-linha, a cinzento suave
        if (s === 0 && valor > 0) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          st([110, 110, 110]);
          doc.text(String(valor), SX1 + SC1 - 1.8, ys + S_H / 2 + 0.5, {
            align: 'right', baseline: 'middle'
          });
        }
      }

      return yg + altTotal;
    }

    // Nacionais (linha par → COR_ZEBRA_A, com destaque)
    y = desenharGrupoSimples('Nacionais',    vNac, y, COR_ZEBRA_A, true);
    // Estrangeiros (linha ímpar → COR_ZEBRA_B, com destaque)
    y = desenharGrupoSimples('Estrangeiros', vEst, y, COR_ZEBRA_B, true);

    // ── Linha de TOTAL ────────────────────────────────────────
    sf(COR_CLARO);
    doc.rect(SX0, y, LARGURA, S_H, 'F');
    sd(COR_BORDA);
    doc.setLineWidth(0.3);
    doc.rect(SX0, y, LARGURA, S_H, 'S');
    doc.line(SX1, y, SX1, y + S_H);
    doc.line(SX2, y, SX2, y + S_H);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    st(COR_PRINCIPAL);
    doc.text('TOTAL', SX0 + 2, y + S_H / 2 + 0.5, { baseline: 'middle' });
    if (totalSimples > 0) {
      doc.text(String(totalSimples), SX2 + SC2 - 1.8, y + S_H / 2 + 0.5, {
        align: 'right', baseline: 'middle'
      });
    }
    st(COR_TEXTO);
    y += S_H + 5;

    var ops  = dadosOperadores();
    var sugs = dadosSugestoes();

    doc.autoTable(Object.assign({}, estiloBase, {
      startY: y,
      head: [['Operador / Ag\u00eancia', 'Nacionalidades', 'Total']],
      body: ops,
      columnStyles: { 0: { cellWidth: 55 }, 2: { cellWidth: 18, halign: 'right' } },
    }));
    y = doc.lastAutoTable.finalY + 5;

    doc.autoTable(Object.assign({}, estiloBase, {
      startY: y,
      head: [['Sugest\u00e3o / Cr\u00edtica', 'Nacionalidade']],
      body: sugs,
      columnStyles: { 1: { cellWidth: 38 } },
    }));
    y = doc.lastAutoTable.finalY + 5;

    doc.autoTable(Object.assign({}, estiloBase, {
      startY: y,
      head: [['Outras Observa\u00e7\u00f5es']],
      body: [[obs || '']],
      styles: Object.assign({}, estiloBase.styles, { minCellHeight: 12 }),
    }));
    y = doc.lastAutoTable.finalY + 8;

    y = assinatura(y);
    avisoFinal(y);
    rodape();
  }

  // ── Guardar ─────────────────────────────────────────────────
  var dataHoje = new Date().toISOString().slice(0, 10);
  doc.save('Registo-Nacionalidades-' + tipo + '-' + dataHoje + '.pdf');
}

function imprimirPDF() { mostrarModalPDF(); }
