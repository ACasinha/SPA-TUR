// ============================================================
// data.js — Dados estáticos da aplicação
// Registo Diário de Nacionalidades — Município de Reguengos de Monsaraz
// ============================================================

'use strict';

// ── Lista completa de países (modo detalhado) ─────────────────
var PAISES = [
  { nome: 'Portugal',           destaque: true  },
  { nome: 'Espanha',            destaque: true  },
  { nome: 'Brasil',             destaque: true  },
  { nome: 'EUA',                destaque: true  },
  { nome: 'França',             destaque: true  },
  { nome: 'África do Sul',      destaque: false },
  { nome: 'Albânia',            destaque: false },
  { nome: 'Alemanha',           destaque: false },
  { nome: 'Angola',             destaque: false },
  { nome: 'Argentina',          destaque: false },
  { nome: 'Austrália',          destaque: false },
  { nome: 'Áustria',            destaque: false },
  { nome: 'Bélgica',            destaque: false },
  { nome: 'Bósnia Herzegovina', destaque: false },
  { nome: 'Canadá',             destaque: false },
  { nome: 'Chile',              destaque: false },
  { nome: 'China',              destaque: false },
  { nome: 'Chipre',             destaque: false },
  { nome: 'Colômbia',           destaque: false },
  { nome: 'Coreia do Sul',      destaque: false },
  { nome: 'Croácia',            destaque: false },
  { nome: 'Dinamarca',          destaque: false },
  { nome: 'Eslovénia',          destaque: false },
  { nome: 'Estónia',            destaque: false },
  { nome: 'Finlândia',          destaque: false },
  { nome: 'Grécia',             destaque: false },
  { nome: 'Holanda',            destaque: false },
  { nome: 'Hungria',            destaque: false },
  { nome: 'Índia',              destaque: false },
  { nome: 'Inglaterra',         destaque: false },
  { nome: 'Irlanda',            destaque: false },
  { nome: 'Islândia',           destaque: false },
  { nome: 'Israel',             destaque: false },
  { nome: 'Itália',             destaque: false },
  { nome: 'Japão',              destaque: false },
  { nome: 'Letónia',            destaque: false },
  { nome: 'Lituânia',           destaque: false },
  { nome: 'Luxemburgo',         destaque: false },
  { nome: 'México',             destaque: false },
  { nome: 'Moldávia',           destaque: false },
  { nome: 'Mónaco',             destaque: false },
  { nome: 'Noruega',            destaque: false },
  { nome: 'Nova Zelândia',      destaque: false },
  { nome: 'Polónia',            destaque: false },
  { nome: 'República Checa',    destaque: false },
  { nome: 'Roménia',            destaque: false },
  { nome: 'Rússia',             destaque: false },
  { nome: 'Singapura',          destaque: false },
  { nome: 'Suécia',             destaque: false },
  { nome: 'Suíça',              destaque: false },
  { nome: 'Ucrânia',            destaque: false },
  { nome: 'Venezuela',          destaque: false },
  { nome: 'Outros Países',      destaque: false },
];

// ── Lista simplificada (modo nacionais/estrangeiros) ──────────
var PAISES_SIMPLES = [
  { nome: 'Nacionais',    destaque: true  },
  { nome: 'Estrangeiros', destaque: false },
];

// ── Locais com lista detalhada de países ─────────────────────
var LOCAIS_DETALHADOS = [
  'Posto de Turismo de Monsaraz',
  'Posto de Turismo de Reguengos',
  'Museu José Mestre Batista',
  'Casa do Barro',
];

// ── Locais com lista simplificada (Nacionais / Estrangeiros) ──
var LOCAIS_SIMPLES = [
  'Museu do Fresco',
  'Casa da Inquisição',
  'Igreja de Santiago',
  'Igreja da Misericórdia',
  'Arte Contemporânea',
  'Auditório António Marcelino',
];

/**
 * Devolve true se o local usa a lista simplificada.
 * @param {string} local
 * @returns {boolean}
 */
function modoSimplificado(local) {
  return LOCAIS_SIMPLES.indexOf(local) !== -1;
}

/**
 * Devolve a lista de países adequada ao local.
 * @param {string} local
 * @returns {Array}
 */
function listaPaises(local) {
  return modoSimplificado(local) ? PAISES_SIMPLES : PAISES;
}

var NUM_LINHAS_OP  = 1;
var NUM_LINHAS_SUG = 3;
