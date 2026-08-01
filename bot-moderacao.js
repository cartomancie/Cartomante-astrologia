/* ============================================================
   SENTINELA — bot de moderação da Cartomancia
   ------------------------------------------------------------
   Arquivo independente, carregado depois de script.js.
   Usa as mesmas variáveis globais (db, auth, perfilAtual,
   chatPublicoRef, firebaseReady) já criadas em script.js.

   O que ele faz:
   1. Observa toda mensagem nova do chat público e confere o
      texto E o nome de quem mandou.
   2. Observa a lista de usuários e confere o nome sempre que
      alguém cria conta ou troca de nome.
   3. Nome proibido -> bani a conta na hora.
   4. Mensagem com palavra proibida -> apaga a mensagem, registra
      um aviso pra pessoa; ao acumular vários avisos, bani.
   5. Guarda um histórico (avisos, mensagens verificadas) que
      alimenta a aba "Sentinela" no app.

   IMPORTANTE — limite de um app 100% client-side:
   Tudo aqui roda no navegador de quem visita. Um usuário capaz
   de mexer no DevTools consegue ignorar essa camada. Pra valer
   de verdade contra alguém assim, as Regras de Segurança do
   Firebase (Realtime Database Rules) também precisam negar
   escrita para quem estiver com usuarios/{uid}/banido = true.
   Veja o arquivo SEGURANCA-FIREBASE.md com as regras prontas
   pra colar no console do Firebase.
   ============================================================ */

const SENTINELA = {
  uid: 'bot-sentinela',
  nome: 'Sentinela',
  limiteAvisos: 3,          // quantos avisos até banir por mensagem
  maxVerificadas: 40,       // quantas linhas guardar na aba "Verificadas"
  UM_DIA: 24 * 60 * 60 * 1000
};

/* ---------------- proteção de vítimas ----------------
   Regra simples e inegociável: ninguém consegue banir a si mesmo,
   nem o próprio Sentinela/bot do sistema. O botão de banir só some
   nas mensagens de terceiros (ver script.js), mas a checagem aqui
   é a barreira final — mesmo que alguém tente forçar pelo console. */
function sentinelaPodeBanir(uidAlvo){
  if (!uidAlvo) return false;
  if (uidAlvo === SENTINELA.uid || uidAlvo === 'bot') return false;
  if (auth && auth.currentUser && auth.currentUser.uid === uidAlvo) return false;
  return true;
}

/* ---------------- análise de relato ----------------
   Roda quando alguém escreve um relato sobre uma mensagem/pessoa.
   Confere o texto original denunciado + o motivo escrito pelo
   denunciante em busca de termos proibidos, e olha o histórico de
   avisos da pessoa denunciada pra dar mais contexto pra decisão. */
async function sentinelaAnalisarRelato(uidAlvo, textoOriginal, motivoRelato){
  const termoNoOriginal = sentinelaChecarTexto(textoOriginal);
  const termoNoMotivo = sentinelaChecarTexto(motivoRelato);
  let avisosAnteriores = 0;
  if (firebaseReady && uidAlvo){
    const snap = await db.ref('avisos/' + uidAlvo).once('value');
    avisosAnteriores = snap.numChildren();
  }
  const suspeito = !!(termoNoOriginal || termoNoMotivo || avisosAnteriores > 0);
  return { suspeito, termo: termoNoOriginal || termoNoMotivo || null, avisosAnteriores };
}

async function sentinelaRegistrarRelatoUsuario(uidAlvo, nomeAlvo, textoOriginal, motivoRelato, uidDenunciante, nomeDenunciante){
  if (!firebaseReady) return;
  const ref = db.ref('relatosModeracao').push();
  await ref.set({
    uidAlvo, nomeAlvo, textoOriginal: textoOriginal || '', motivoRelato,
    uidDenunciante, nomeDenunciante, ts: Date.now()
  });
}

/* ---------------- lista de termos proibidos ----------------
   Reaproveita a lista que já existia em script.js (palavrasBloqueadas)
   e acrescenta variações comuns de disfarce (com número, ponto,
   espaço ou letra repetida no meio da palavra). */
const SENTINELA_TERMOS = (typeof palavrasBloqueadas !== 'undefined'
  ? palavrasBloqueadas
  : ['porra','merda','caralho','viado','puta','fdp','arrombado','desgraça','idiota','burro','otario','otário']
);

// Troca leet-speak comum por letra normal antes de comparar.
function sentinelaNormalizar(txt){
  return (txt || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // remove acento
    .replace(/[@]/g, 'a').replace(/0/g, 'o').replace(/1/g, 'i')
    .replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's')
    .replace(/[^a-z0-9]/g, '')                            // tira espaço, ponto, símbolo
    .replace(/(.)\1{2,}/g, '$1$1');                        // "aaaa" -> "aa"
}

const SENTINELA_TERMOS_NORM = SENTINELA_TERMOS.map(sentinelaNormalizar);

// Retorna o termo encontrado, ou null se o texto estiver limpo.
function sentinelaChecarTexto(texto){
  const limpo = sentinelaNormalizar(texto);
  if (!limpo) return null;
  for (let i = 0; i < SENTINELA_TERMOS_NORM.length; i++){
    if (SENTINELA_TERMOS_NORM[i] && limpo.includes(SENTINELA_TERMOS_NORM[i])){
      return SENTINELA_TERMOS[i];
    }
  }
  return null;
}

// Usado no cadastro e na troca de nome, ANTES de salvar — barra na hora.
function SentinelaVerificarNome(nome){
  return sentinelaChecarTexto(nome);
}

/* ---------------- registrar aviso / banir ---------------- */

function sentinelaBotMsgChat(texto){
  if (!chatPublicoRef) return;
  chatPublicoRef.push({ uid: SENTINELA.uid, nome: SENTINELA.nome, texto, ts: Date.now() });
}

async function sentinelaRegistrarAviso(uid, nomeExibido, motivo, origem){
  if (!firebaseReady || !uid) return 0;
  const avisoRef = db.ref('avisos/' + uid).push();
  await avisoRef.set({ motivo, origem, ts: Date.now() });
  const snap = await db.ref('avisos/' + uid).once('value');
  const total = snap.numChildren();
  if (total >= SENTINELA.limiteAvisos){
    await sentinelaBanir(uid, nomeExibido, 'Acumulou ' + total + ' avisos por linguagem imprópria no chat.');
  }
  return total;
}

async function sentinelaBanir(uid, nomeExibido, motivo, duracaoMs){
  if (!firebaseReady || !uid) return;
  // duracaoMs: null/undefined = permanente. Número = temporário (ex.: SENTINELA.UM_DIA).
  const banidoAte = duracaoMs ? (Date.now() + duracaoMs) : null;
  await db.ref('usuarios/' + uid).update({
    banido: true, banidoMotivo: motivo, banidoTs: Date.now(), banidoAte
  });
  sentinelaBotMsgChat(banidoAte
    ? '🛡️ Uma conta foi suspensa por 1 dia por violar as regras do chat.'
    : '🛡️ Uma conta foi banida permanentemente por violar as regras do chat.');
  // Se for a pessoa usando o app agora, derruba a sessão na hora.
  if (auth && auth.currentUser && auth.currentUser.uid === uid){
    sentinelaMostrarTelaBanido(motivo, banidoAte);
    setTimeout(() => auth.signOut(), 50);
  }
}

function sentinelaMostrarTelaBanido(motivo, banidoAte){
  const tela = document.getElementById('banidoScreen');
  const texto = document.getElementById('banidoMotivo');
  let msg = motivo || 'Violação das regras do chat.';
  if (banidoAte){
    msg += ' Suspensão termina em ' + new Date(banidoAte).toLocaleString('pt-BR') + '.';
  } else {
    msg += ' Banimento permanente.';
  }
  if (texto) texto.textContent = msg;
  if (tela) tela.classList.remove('hidden');
}

/* ---------------- log pra aba "Verificadas" ---------------- */

async function sentinelaLogVerificada(nome, status, detalhe){
  if (!firebaseReady) return;
  const ref = db.ref('sentinelaVerificadas').push();
  await ref.set({ nome, status, detalhe, ts: Date.now() });
  const todas = await db.ref('sentinelaVerificadas').once('value');
  if (todas.numChildren() > SENTINELA.maxVerificadas){
    const excesso = todas.numChildren() - SENTINELA.maxVerificadas;
    let apagados = 0;
    todas.forEach((child) => {
      if (apagados < excesso){ db.ref('sentinelaVerificadas/' + child.key).remove(); apagados++; }
    });
  }
}

/* ---------------- observador do chat público ----------------
   Roda pra toda mensagem nova (inclusive as antigas que já
   existiam antes de o bot ligar — não tem problema reprocessar). */
if (typeof chatPublicoRef !== 'undefined' && chatPublicoRef){
  chatPublicoRef.limitToLast(1).on('child_added', async (snap) => {
    const val = snap.val();
    if (!val || val.uid === SENTINELA.uid || val.uid === 'bot') return;

    const termoNome = sentinelaChecarTexto(val.nome);
    if (termoNome){
      snap.ref.remove();
      await sentinelaLogVerificada(val.nome, 'removida', 'nome de usuário impróprio');
      await sentinelaBanir(val.uid, val.nome, 'Nome de usuário com linguagem imprópria.');
      return;
    }

    const termoMsg = sentinelaChecarTexto(val.texto);
    if (termoMsg){
      snap.ref.remove();
      await sentinelaLogVerificada(val.nome, 'removida', 'mensagem com linguagem imprópria');
      const total = await sentinelaRegistrarAviso(val.uid, val.nome, 'Mensagem removida do chat público por linguagem imprópria.', 'chat público');
      if (total < SENTINELA.limiteAvisos && auth && auth.currentUser && auth.currentUser.uid === val.uid){
        sentinelaAtualizarAvisos();
      }
      return;
    }

    await sentinelaLogVerificada(val.nome, 'ok', 'sem problemas');
  });
}

/* ---------------- observador da lista de usuários ----------------
   Pega troca de nome feita fora do fluxo normal (ex.: alguém
   editando direto pelo DevTools) e nomes que só apareceriam
   se a pessoa nunca mandou mensagem no chat público. */
if (typeof db !== 'undefined' && db && typeof firebaseReady !== 'undefined' && firebaseReady){
  db.ref('usuarios').on('child_changed', (snap) => {
    const val = snap.val();
    if (!val) return;
    const termo = sentinelaChecarTexto(val.nome) || sentinelaChecarTexto(val.nick);
    if (termo && !val.banido){
      sentinelaBanir(snap.key, val.nick || val.nome, 'Nome de usuário com linguagem imprópria.');
    }
  });
}

/* ---------------- checar se EU estou banido ao abrir o app ---------------- */
if (typeof auth !== 'undefined' && auth){
  auth.onAuthStateChanged(async (user) => {
    if (!user) return;
    const snap = await db.ref('usuarios/' + user.uid).once('value');
    const val = snap.val();
    if (!val || val.banido !== true) return;

    // Suspensão temporária (1 dia) que já venceu: libera sozinho e segue o login.
    if (val.banidoAte && Date.now() >= val.banidoAte){
      await db.ref('usuarios/' + user.uid).update({ banido: false, banidoAte: null });
      return;
    }

    sentinelaMostrarTelaBanido(val.banidoMotivo, val.banidoAte);
    setTimeout(() => auth.signOut(), 50);
  });
}

/* ================= UI da aba "Sentinela" ================= */

function sentinelaTrocarSubaba(sub){
  document.querySelectorAll('.sentinela-subtab').forEach(b => b.classList.toggle('active', b.dataset.sub === sub));
  document.querySelectorAll('.sentinela-subpanel').forEach(p => p.classList.toggle('hidden', p.dataset.sub !== sub));
  if (sub === 'avisos') sentinelaAtualizarAvisos();
  if (sub === 'verificadas') sentinelaAtualizarVerificadas();
  if (sub === 'verificacao') sentinelaAtualizarStats();
}

document.querySelectorAll('.sentinela-subtab').forEach(btn => {
  btn.addEventListener('click', () => sentinelaTrocarSubaba(btn.dataset.sub));
});

async function sentinelaAtualizarAvisos(){
  const lista = document.getElementById('avisosList');
  const vazio = document.getElementById('avisosVazio');
  if (!lista || !auth || !auth.currentUser) return;
  const snap = await db.ref('avisos/' + auth.currentUser.uid).once('value');
  lista.innerHTML = '';
  const itens = [];
  snap.forEach((child) => itens.push(child.val()));
  itens.sort((a, b) => b.ts - a.ts);
  if (vazio) vazio.classList.toggle('hidden', itens.length > 0);
  itens.forEach((item) => {
    const li = document.createElement('div');
    li.className = 'aviso-item';
    const data = new Date(item.ts).toLocaleString('pt-BR');
    li.innerHTML = '<span class="aviso-ico">⚠️</span><div><div class="aviso-motivo"></div><div class="aviso-data"></div></div>';
    li.querySelector('.aviso-motivo').textContent = item.motivo;
    li.querySelector('.aviso-data').textContent = data;
    lista.appendChild(li);
  });
}

async function sentinelaAtualizarVerificadas(){
  const lista = document.getElementById('verificadasList');
  if (!lista || !firebaseReady) return;
  const snap = await db.ref('sentinelaVerificadas').limitToLast(30).once('value');
  const itens = [];
  snap.forEach((child) => itens.push(child.val()));
  itens.sort((a, b) => b.ts - a.ts);
  lista.innerHTML = '';
  itens.forEach((item) => {
    const li = document.createElement('div');
    li.className = 'verificada-item ' + (item.status === 'ok' ? 'ok' : 'removida');
    const hora = new Date(item.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    li.innerHTML = '<span class="verificada-badge"></span><span class="verificada-nome"></span><span class="verificada-hora"></span>';
    li.querySelector('.verificada-badge').textContent = item.status === 'ok' ? '✓' : '✕';
    li.querySelector('.verificada-nome').textContent = item.nome + ' — ' + (item.status === 'ok' ? 'sem problemas' : item.detalhe);
    li.querySelector('.verificada-hora').textContent = hora;
    lista.appendChild(li);
  });
}

async function sentinelaAtualizarStats(){
  const elMsgs = document.getElementById('sentinelaStatMsgs');
  const elBans = document.getElementById('sentinelaStatBans');
  if (!firebaseReady) return;
  if (elMsgs){
    const snap = await db.ref('sentinelaVerificadas').once('value');
    let removidas = 0;
    snap.forEach((c) => { if (c.val().status !== 'ok') removidas++; });
    elMsgs.textContent = snap.numChildren() + ' mensagens verificadas (' + removidas + ' removidas)';
  }
  if (elBans){
    const snap = await db.ref('usuarios').once('value');
    let bans = 0;
    snap.forEach((c) => { if (c.val().banido) bans++; });
    elBans.textContent = bans + ' contas banidas no total';
  }
}

// Atualiza a aba assim que ela for exibida pela primeira vez.
document.addEventListener('DOMContentLoaded', () => {
  const btnAtivo = document.querySelector('.sentinela-subtab.active');
  if (btnAtivo) sentinelaTrocarSubaba(btnAtivo.dataset.sub);
});
