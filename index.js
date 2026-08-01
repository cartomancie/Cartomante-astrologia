/* ============================================================
   CARTOMANCIA — Cloud Functions (backend seguro)
   ------------------------------------------------------------
   Tudo que decide algo sensível mora aqui agora, não mais no
   navegador de quem visita o site:
     - confirmar e-mail (gerar/checar código)
     - banir conta (por relato ou automático)
     - moderar mensagens do chat público (palavrão + flood)
     - moderar nome de usuário
     - checar/expirar banimento no login

   O app continua chamando essas funções pelo SDK do Firebase
   (httpsCallable) — a interface para quem usa o site é idêntica,
   só o "onde a decisão é tomada" mudou.
   ============================================================ */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.database();

/* ---------------- config sensível (nunca no client) ----------------
   Defina com:
     firebase functions:config:set emailjs.service_id="xxx" \
       emailjs.template_id="xxx" emailjs.private_key="xxx"
   (a Private Key fica em EmailJS → Account → API Keys; ela permite
   mandar e-mail direto do servidor sem depender da origem do site) */
const cfg = functions.config();
const EMAILJS_SERVICE_ID = (cfg.emailjs && cfg.emailjs.service_id) || '';
const EMAILJS_TEMPLATE_ID = (cfg.emailjs && cfg.emailjs.template_id) || '';
const EMAILJS_PRIVATE_KEY = (cfg.emailjs && cfg.emailjs.private_key) || '';
const EMAILJS_PUBLIC_KEY = (cfg.emailjs && cfg.emailjs.public_key) || '';

/* =================================================================
   LISTA DE TERMOS PROIBIDOS
   Fica só no servidor agora — no client dava pra ler a lista inteira
   abrindo o script.js. Ajuste/expanda à vontade.
   ================================================================= */
const TERMOS_PROIBIDOS = [
  'porra', 'merda', 'caralho', 'viado', 'puta', 'fdp', 'arrombado',
  'desgraça', 'idiota', 'burro', 'otario', 'otário'
];

function normalizar(txt) {
  return (txt || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[@]/g, 'a').replace(/0/g, 'o').replace(/1/g, 'i')
    .replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's')
    .replace(/[^a-z0-9]/g, '')
    .replace(/(.)\1{2,}/g, '$1$1');
}
const TERMOS_NORM = TERMOS_PROIBIDOS.map(normalizar);

function checarTexto(texto) {
  const limpo = normalizar(texto);
  if (!limpo) return null;
  for (let i = 0; i < TERMOS_NORM.length; i++) {
    if (TERMOS_NORM[i] && limpo.includes(TERMOS_NORM[i])) return TERMOS_PROIBIDOS[i];
  }
  return null;
}

function exigirLogin(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'É preciso estar logado.');
  }
  return context.auth.uid;
}

/* =================================================================
   1) VERIFICAÇÃO DE E-MAIL
   ================================================================= */
const CODIGO_VALIDADE_MS = 10 * 60 * 1000;
const REENVIO_ESPERA_MS = 60 * 1000;

function gerarCodigo6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Chamado no cadastro e no "reenviar código".
// O código nunca é exposto para o client: fica só em /verificacoesSeguras
// (nó que as regras do Realtime Database bloqueiam para qualquer leitura
// vinda do navegador). O e-mail também é disparado a partir do servidor.
exports.enviarCodigoVerificacao = functions.https.onCall(async (data, context) => {
  const uid = exigirLogin(context);
  const email = context.auth.token.email;
  if (!email) {
    throw new functions.https.HttpsError('failed-precondition', 'Conta sem e-mail associado.');
  }

  const seguraRef = db.ref('verificacoesSeguras/' + uid);
  const atual = (await seguraRef.once('value')).val();
  if (atual && atual.criadoEm && Date.now() < atual.criadoEm + REENVIO_ESPERA_MS) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'Aguarde antes de pedir outro código.'
    );
  }

  const codigo = gerarCodigo6();
  const criadoEm = Date.now();
  const expiraEm = criadoEm + CODIGO_VALIDADE_MS;

  await seguraRef.set({ codigo, criadoEm, expiraEm, tentativas: 0 });
  // Metadado público (sem o código) só pra UI mostrar o cronômetro de reenvio.
  await db.ref('verificacoes/' + uid).set({ criadoEm, expiraEm });

  if (EMAILJS_PRIVATE_KEY && EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID) {
    const resp = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        accessToken: EMAILJS_PRIVATE_KEY,
        template_params: {
          email,
          passcode: codigo,
          time: new Date(expiraEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        }
      })
    });
    if (!resp.ok) {
      const txt = await resp.text();
      console.error('EmailJS falhou:', resp.status, txt);
      throw new functions.https.HttpsError('internal', 'Não deu para enviar o e-mail agora.');
    }
  } else {
    console.warn('EmailJS não configurado (functions:config:set emailjs.*) — código gerado mas não enviado:', codigo);
  }

  return { ok: true };
});

// Chamado quando a pessoa digita o código na tela de verificação.
exports.confirmarCodigoVerificacao = functions.https.onCall(async (data, context) => {
  const uid = exigirLogin(context);
  const digitado = String((data && data.codigo) || '').trim();
  if (!digitado) {
    throw new functions.https.HttpsError('invalid-argument', 'Digite o código recebido por e-mail.');
  }

  const seguraRef = db.ref('verificacoesSeguras/' + uid);
  const snap = await seguraRef.once('value');
  const dados = snap.val();

  if (!dados) {
    throw new functions.https.HttpsError('not-found', 'Nenhum código pendente. Toque em "Reenviar código".');
  }
  if (Date.now() > dados.expiraEm) {
    throw new functions.https.HttpsError('deadline-exceeded', 'Esse código expirou. Toque em "Reenviar código".');
  }
  // Trava contra força-bruta: no máximo 5 tentativas por código.
  if ((dados.tentativas || 0) >= 5) {
    throw new functions.https.HttpsError('resource-exhausted', 'Muitas tentativas. Peça um código novo.');
  }
  if (String(digitado) !== String(dados.codigo)) {
    await seguraRef.update({ tentativas: (dados.tentativas || 0) + 1 });
    throw new functions.https.HttpsError('invalid-argument', 'Código incorreto. Confira e tente de novo.');
  }

  await db.ref('usuarios/' + uid + '/emailVerificado').set(true);
  await seguraRef.remove();
  await db.ref('verificacoes/' + uid).remove();
  return { ok: true };
});

/* =================================================================
   2) CHECAR/EXPIRAR BANIMENTO NO LOGIN
   ================================================================= */
exports.checarBanimento = functions.https.onCall(async (data, context) => {
  const uid = exigirLogin(context);
  const snap = await db.ref('usuarios/' + uid).once('value');
  const val = snap.val();
  if (!val || val.banido !== true) return { banido: false };

  if (val.banidoAte && Date.now() >= val.banidoAte) {
    await db.ref('usuarios/' + uid).update({ banido: false, banidoAte: null });
    return { banido: false };
  }
  return { banido: true, motivo: val.banidoMotivo || null, banidoAte: val.banidoAte || null };
});

/* =================================================================
   3) RELATO E BANIMENTO POR DENÚNCIA
   Substitui o clique que antes escrevia direto em usuarios/{uid}.
   Mantém a mesma UX (qualquer pessoa logada, não-convidada, pode
   denunciar e banir por 1 dia ou permanente), mas agora com:
   - checagem de "não pode banir a si mesmo / bot" no servidor
   - limite de quantas ações de banimento por hora por conta
   - tudo fica registrado com quem executou a ação (logging)
   ================================================================= */
const LIMITE_BANIMENTOS_POR_HORA = 5;

exports.denunciarMensagem = functions.https.onCall(async (data, context) => {
  const uidDenunciante = exigirLogin(context);
  const { uidAlvo, nomeAlvo, textoOriginal, motivoRelato } = data || {};
  if (!uidAlvo || !motivoRelato) {
    throw new functions.https.HttpsError('invalid-argument', 'Dados do relato incompletos.');
  }
  const perfilDenunciante = (await db.ref('usuarios/' + uidDenunciante).once('value')).val();

  const ref = db.ref('relatosModeracao').push();
  await ref.set({
    uidAlvo, nomeAlvo: nomeAlvo || '', textoOriginal: textoOriginal || '',
    motivoRelato: String(motivoRelato).slice(0, 300),
    uidDenunciante, nomeDenunciante: (perfilDenunciante && (perfilDenunciante.nick || perfilDenunciante.nome)) || 'visitante',
    ts: Date.now()
  });

  const termoNoOriginal = checarTexto(textoOriginal);
  const termoNoMotivo = checarTexto(motivoRelato);
  const avisosSnap = await db.ref('avisos/' + uidAlvo).once('value');
  const avisosAnteriores = avisosSnap.numChildren();
  const suspeito = !!(termoNoOriginal || termoNoMotivo || avisosAnteriores > 0);

  return { suspeito, termo: termoNoOriginal || termoNoMotivo || null, avisosAnteriores, relatoId: ref.key };
});

exports.banirPorRelato = functions.https.onCall(async (data, context) => {
  const uidExecutor = exigirLogin(context);
  const { uidAlvo, nomeAlvo, duracao } = data || {}; // duracao: '1dia' | 'permanente'

  if (!uidAlvo) throw new functions.https.HttpsError('invalid-argument', 'Faltou o alvo.');
  if (uidAlvo === uidExecutor) throw new functions.https.HttpsError('permission-denied', 'Você não pode banir a si mesmo.');
  if (uidAlvo === 'bot-sentinela' || uidAlvo === 'bot') {
    throw new functions.https.HttpsError('permission-denied', 'Essa conta não pode ser banida.');
  }

  // limite de abuso: no máx. N ações de banimento por hora por executor
  const umaHoraAtras = Date.now() - 60 * 60 * 1000;
  const logSnap = await db.ref('logsBanimento').orderByChild('uidExecutor').equalTo(uidExecutor).once('value');
  let recentes = 0;
  logSnap.forEach((c) => { if (c.val().ts > umaHoraAtras) recentes++; });
  if (recentes >= LIMITE_BANIMENTOS_POR_HORA) {
    throw new functions.https.HttpsError('resource-exhausted', 'Muitas ações de banimento em pouco tempo. Tente mais tarde.');
  }

  const duracaoMs = duracao === '1dia' ? 24 * 60 * 60 * 1000 : null;
  const banidoAte = duracaoMs ? Date.now() + duracaoMs : null;
  const motivo = duracaoMs
    ? 'Suspenso por 1 dia após relato de outro usuário.'
    : 'Banido permanentemente após relato de outro usuário.';

  await db.ref('usuarios/' + uidAlvo).update({
    banido: true, banidoMotivo: motivo, banidoTs: Date.now(), banidoAte
  });
  await db.ref('logsBanimento').push({ uidAlvo, nomeAlvo: nomeAlvo || '', uidExecutor, motivo, ts: Date.now() });
  await db.ref('chatPublico/mensagens').push({
    uid: 'bot-sentinela', nome: 'Sentinela',
    texto: banidoAte
      ? '🛡️ Uma conta foi suspensa por 1 dia por violar as regras do chat.'
      : '🛡️ Uma conta foi banida permanentemente por violar as regras do chat.',
    ts: Date.now()
  });

  return { ok: true, banidoAte };
});

/* =================================================================
   4) MODERAÇÃO AUTOMÁTICA DO CHAT PÚBLICO (roda no servidor)
   Dispara para toda mensagem nova. Antes isso rodava no navegador
   de quem estivesse com o site aberto (bot-moderacao.js); agora
   roda garantido, sempre, no backend do Firebase.
   ================================================================= */
const LIMITE_AVISOS = 3;
const FLOOD_JANELA_MS = 10 * 1000;
const FLOOD_MAX_MENSAGENS = 6;

async function registrarAviso(uid, motivo, origem) {
  const avisoRef = db.ref('avisos/' + uid).push();
  await avisoRef.set({ motivo, origem, ts: Date.now() });
  const snap = await db.ref('avisos/' + uid).once('value');
  const total = snap.numChildren();
  if (total >= LIMITE_AVISOS) {
    await banirAutomatico(uid, 'Acumulou ' + total + ' avisos por linguagem imprópria no chat.');
  }
  return total;
}

async function banirAutomatico(uid, motivo) {
  await db.ref('usuarios/' + uid).update({
    banido: true, banidoMotivo: motivo, banidoTs: Date.now(), banidoAte: null
  });
  await db.ref('chatPublico/mensagens').push({
    uid: 'bot-sentinela', nome: 'Sentinela',
    texto: '🛡️ Uma conta foi banida automaticamente por violar as regras do chat.',
    ts: Date.now()
  });
}

async function logVerificada(nome, status, detalhe) {
  const ref = db.ref('sentinelaVerificadas').push();
  await ref.set({ nome: nome || '', status, detalhe, ts: Date.now() });
  const MAX = 40;
  const todas = await db.ref('sentinelaVerificadas').once('value');
  if (todas.numChildren() > MAX) {
    let excesso = todas.numChildren() - MAX;
    const remocoes = [];
    todas.forEach((child) => {
      if (excesso > 0) { remocoes.push(child.ref.remove()); excesso--; }
    });
    await Promise.all(remocoes);
  }
}

exports.moderarMensagemChat = functions.database
  .ref('/chatPublico/mensagens/{msgId}')
  .onCreate(async (snap, context) => {
    const val = snap.val();
    if (!val || val.uid === 'bot-sentinela' || val.uid === 'bot') return null;

    // limite de tamanho — reforça o que já existia no client
    if (val.texto && val.texto.length > 200) {
      await snap.ref.remove();
      return null;
    }

    // anti-flood: muitas mensagens em pouco tempo
    if (val.uid) {
      const floodRef = db.ref('floodControl/' + val.uid);
      const floodSnap = await floodRef.once('value');
      const floodVal = floodSnap.val() || { inicio: Date.now(), contagem: 0 };
      const dentroDaJanela = Date.now() - floodVal.inicio < FLOOD_JANELA_MS;
      const novaContagem = dentroDaJanela ? floodVal.contagem + 1 : 1;
      await floodRef.set({ inicio: dentroDaJanela ? floodVal.inicio : Date.now(), contagem: novaContagem });
      if (dentroDaJanela && novaContagem > FLOOD_MAX_MENSAGENS) {
        await snap.ref.remove();
        await registrarAviso(val.uid, 'Enviou mensagens rápido demais (flood) no chat público.', 'anti-flood');
        return null;
      }
    }

    const termoNome = checarTexto(val.nome);
    if (termoNome) {
      await snap.ref.remove();
      await logVerificada(val.nome, 'removida', 'nome de usuário impróprio');
      if (val.uid) await banirAutomatico(val.uid, 'Nome de usuário com linguagem imprópria.');
      return null;
    }

    const termoMsg = checarTexto(val.texto);
    if (termoMsg) {
      await snap.ref.remove();
      await logVerificada(val.nome, 'removida', 'mensagem com linguagem imprópria');
      if (val.uid) await registrarAviso(val.uid, 'Mensagem removida do chat público por linguagem imprópria.', 'chat público');
      return null;
    }

    await logVerificada(val.nome, 'ok', 'sem problemas');
    return null;
  });

// Pega troca de nome/nick feita por qualquer caminho (inclusive alguém
// tentando escrever direto no banco), e barra nomes proibidos.
exports.moderarUsuario = functions.database
  .ref('/usuarios/{uid}')
  .onWrite(async (change, context) => {
    const val = change.after.val();
    if (!val || val.banido) return null;
    const termo = checarTexto(val.nome) || checarTexto(val.nick);
    if (termo) {
      await banirAutomatico(context.params.uid, 'Nome de usuário com linguagem imprópria.');
    }
    return null;
  });

/* =================================================================
   5) PAGAMENTO DO TAROT
   ⚠️ IMPORTANTE — isto aqui é só o encaixe, não a solução completa.
   Antes, o client liberava o Tarot sozinho ao ver "?tarot_pago=1" na
   URL, sem checar nada com o provedor de pagamento — ou seja,
   qualquer pessoa podia acessar essa URL manualmente e liberar de
   graça. Pra fechar esse buraco de verdade, esta function PRECISA
   validar a transação com o provedor de pagamento real (ex.: webhook
   assinado do Mercado Pago/Stripe/PagSeguro confirmando o pagamento
   antes de marcar tarotPago = true). Como não temos aqui qual é o
   provedor usado, deixamos o encaixe pronto e um TODO bem visível.
   Enquanto isso não for plugado, tarotPago não pode ser considerado
   protegido contra fraude — apenas contra escrita direta pelo
   DevTools (que já é bloqueada pelas regras do banco).
   ================================================================= */
exports.confirmarPagamentoTarot = functions.https.onCall(async (data, context) => {
  const uid = exigirLogin(context);

  // TODO: validar de verdade com o provedor de pagamento antes de liberar.
  // Exemplo (Mercado Pago): buscar o pagamento pelo payment_id recebido
  // do redirect e conferir status === 'approved' antes do update abaixo.
  console.warn('confirmarPagamentoTarot chamada sem validação real de pagamento — ver TODO no código.');

  await db.ref('usuarios/' + uid + '/tarotPago').set(true);
  return { ok: true };
});
