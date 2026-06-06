// ============================================================
// Cloud Function - Endpoint para gestão de utilizadores
// ADICIONAR à Cloud Function existente (rmz-api)
// ============================================================

const admin = require('firebase-admin');

// Inicializar (se ainda não inicializado)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ============================================================
// HANDLER: criarUtilizador (apenas admins)
// ============================================================

async function criarUtilizador(payload, uid) {
  try {
    // 1. Verificar se quem chama é admin
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || userDoc.data().role !== 'administrador') {
      return { sucesso: false, codigo: 403, mensagem: 'Acesso negado. Apenas administradores podem criar utilizadores.' };
    }

    // 2. Validar dados
    const { email, password, nome, role } = payload;
    if (!email || !password || !nome || !role) {
      return { sucesso: false, codigo: 400, mensagem: 'Dados incompletos.' };
    }

    if (password.length < 6) {
      return { sucesso: false, codigo: 400, mensagem: 'A password deve ter no mínimo 6 caracteres.' };
    }

    if (!['utilizador', 'administrador'].includes(role)) {
      return { sucesso: false, codigo: 400, mensagem: 'Role inválida.' };
    }

    // 3. Verificar se email já existe
    try {
      await admin.auth().getUserByEmail(email);
      return { sucesso: false, codigo: 400, mensagem: 'Este email já está registado.' };
    } catch (err) {
      // Email não existe - OK, podemos criar
      if (err.code !== 'auth/user-not-found') {
        throw err;
      }
    }

    // 4. Criar utilizador no Firebase Auth
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: nome,
      emailVerified: true
    });

    // 5. Criar perfil no Firestore
    await db.collection('users').doc(userRecord.uid).set({
      email: email,
      nome: nome,
      role: role,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      ativo: true
    });

    // 6. Definir custom claim para role (opcional, para maior segurança)
    await admin.auth().setCustomUserClaims(userRecord.uid, { role: role });

    return {
      sucesso: true,
      codigo: 200,
      mensagem: 'Utilizador criado com sucesso.',
      uid: userRecord.uid
    };

  } catch (err) {
    console.error('[criarUtilizador] Erro:', err);
    return {
      sucesso: false,
      codigo: 500,
      mensagem: 'Erro ao criar utilizador: ' + err.message
    };
  }
}

// ============================================================
// ADICIONAR AO SWITCH PRINCIPAL DA CLOUD FUNCTION
// ============================================================

/*
No ficheiro index.js da Cloud Function existente, adicionar este case:

exports.rmzApi = functions.https.onRequest(async (req, res) => {
  // ... código existente ...
  
  const { action, payload, idToken } = req.body;
  
  // ... verificação de token existente ...
  
  let resultado;
  
  switch (action) {
    case 'verificarDados':
      resultado = await verificarDados(payload, decodedToken.uid);
      break;
    
    case 'guardarRegisto':
      resultado = await guardarRegisto(payload, decodedToken.uid);
      break;
    
    // ▼ NOVO CASE ▼
    case 'criarUtilizador':
      resultado = await criarUtilizador(payload, decodedToken.uid);
      break;
    // ▲ NOVO CASE ▲
    
    default:
      resultado = { sucesso: false, codigo: 400, mensagem: 'Ação inválida.' };
  }
  
  res.status(resultado.codigo || 200).json(resultado);
});
*/

// ============================================================
// REGRAS DE SEGURANÇA FIRESTORE
// ============================================================

/*
Adicionar ao firestore.rules:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Função auxiliar para verificar se é admin
    function isAdmin() {
      return request.auth != null && 
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'administrador';
    }
    
    // Coleção users
    match /users/{userId} {
      // Leitura:
      // - Próprio utilizador pode ler o seu perfil
      // - Admins podem ler todos
      allow read: if request.auth != null && 
                     (request.auth.uid == userId || isAdmin());
      
      // Criação: apenas admins
      allow create: if isAdmin();
      
      // Atualização:
      // - Próprio utilizador pode atualizar apenas o nome
      // - Admins podem atualizar tudo
      allow update: if request.auth != null && 
                       (request.auth.uid == userId && 
                        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['nome', 'atualizadoEm'])) ||
                       isAdmin();
      
      // Eliminação: apenas admins
      allow delete: if isAdmin();
    }
    
    // Coleção registos (existente - sem alterações)
    match /registos/{registoId} {
      allow read, write: if request.auth != null;
    }
  }
}
*/

// ============================================================
// ÍNDICES FIRESTORE RECOMENDADOS
// ============================================================

/*
Criar índices compostos (via Firebase Console ou CLI):

1. Coleção: users
   Campos: role (ASC), email (ASC)
   
2. Coleção: users
   Campos: ativo (ASC), email (ASC)

Estes índices melhoram queries de listagem e filtros.
*/

module.exports = { criarUtilizador };
