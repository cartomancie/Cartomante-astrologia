/* ============================================================
   SENTINELA — painel de moderação da Cartomancia (client)
   ------------------------------------------------------------
   Arquivo independente, carregado depois de script.js.
   Usa as mesmas variáveis globais (db, auth, fns, perfilAtual,
   chatPublicoRef, firebaseReady) já criadas em script.js.

   IMPORTANTE — o que mudou:
   Toda DECISÃO sensível (apagar mensagem, dar aviso, banir conta,
   confirmar e-mail) agora roda nas Cloud Functions do projeto
   (pasta /functions), não mais aqui no navegador. Isso fecha o
   buraco descrito no antigo SEGURANCA-FIREBASE.md: antes, alguém
   com o DevTools aberto conseguia escrever direto no Firebase e
   ignorar essa camada (ou até banir qualquer pessoa, já que o botão
   de banir escrevia direto no banco). Agora as Regras de Segurança
   do Realtime Database bloqueiam essas escritas vindas do navegador,
   então só o backend (que usa a Admin SDK, sem restrição de regras)
   consegue de fato mudar `banido`, `emailVerificado`, etc.

   O que sobra aqui é só:
   1. A UI da aba "Sentinela" (avisos, verificadas, estatísticas) —
      continua lendo os mesmos caminhos, agora escritos pelo backend.
   2. Uma checagem client-side de nome NA HORA do cadastro — é só
      uma conveniência de UX (evita a pessoa preencher tudo e só
      descobrir depois); a barreira de verdade é o backend.
   3. Chamadas para as Cloud Functions no fluxo de relato/banimento.
   Veja MUDANCAS-SEGURANCA.md pra visão completa.
   ============================================================ */

const SENTINELA = {
  uid: 'bot-sentinela',
  nome: 'Sentinela'
};

/* ---------------- lista de termos (só para a checagem de UX) ----------------
   A lista "oficial", usada pra realmente barrar mensagens e nomes, vive
   só no backend agora (functions/index.js) — não dá mais pra lê-la
   abrindo o código do site. Esta cópia aqui serve só de feedback rápido
   no formulário de cadastro; o backend sempre confere de novo. */
const SENTINELA_TERMOS_UX = ['porra','merda','caralho','viado','puta','fdp','arrombado','desgraça','idiota','burro','otario','otário'];

function sentinelaNormalizar(txt){
  return (txt || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[@]/g, 'a').replace(/0/g, 'o').replace(/1/g, 'i')
    .replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's')
    .replace(/[^a-z0-9]/g, '')
    .replace(/(.)\1{2,}/g, '$1$1');
}
const SENTINELA_TERMOS_UX_NORM = SENTINELA_TERMOS_UX.map(sentinelaNormalizar);

function sentinelaChecarTexto(texto){
  const limpo = sentinelaNormalizar(texto);
  if (!limpo) return null;
  for (let i = 0; i < SENTINELA_TERMOS_UX_NORM.length; i++){
    if (SENTINELA_TERMOS_UX_NORM[i] && limpo.includes(SENTINELA_TERMOS_UX_NORM[i])) return SENTINELA_TERMOS_UX[i];
  }
  return null;
}

// Usado no cadastro, ANTES de enviar — só feedback rápido de UX.
// A validação que realmente conta roda no backend (moderarUsuario).
function SentinelaVerificarNome(nome){
  return sentinelaChecarTexto(nome);
}

/* ---------------- proteção de vítimas (feedback de UX) ----------------
   Só decide se o botão de banir aparece/funciona na tela. A checagem
   que realmente impede (não deixar banir a si mesmo, o bot, etc.)
   roda de novo dentro da Cloud Function `banirPorRelato`. */
function sentinelaPodeBanir(uidAlvo){
  if (!uidAlvo) return false;
  if (uidAlvo === SENTINELA.uid || uidAlvo === 'bot') return false;
  if (auth && auth.currentUser && auth.currentUser.uid === uidAlvo) return false;
  return true;
}

/* ---------------- relato: agora via Cloud Function ---------------- */
async function sentinelaRegistrarRelatoUsuario(uidAlvo, nomeAlvo, textoOriginal, motivoRelato){
  if (!firebaseReady) return null;
  const resp = await fns.httpsCallable('denunciarMensagem')({
    uidAlvo, nomeAlvo, textoOriginal, motivoRelato
  });
  return resp.data;
}

// Mantido por compatibilidade de nome — a análise já vem no retorno
// de sentinelaRegistrarRelatoUsuario, feita no backend.
async function sentinelaAnalisarRelato(uidAlvo, textoOriginal, motivoRelato){
  return sentinelaRegistrarRelatoUsuario(uidAlvo, null, textoOriginal, motivoRelato);
}

async function sentinelaBanir(uidAlvo, nomeAlvo, duracao){
  if (!firebaseReady || !uidAlvo) return;
  await fns.httpsCallable('banirPorRelato')({ uidAlvo, nomeAlvo, duracao });
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

/* ---------------- checar se EU estou banido ao abrir o app ----------------
   Antes, o próprio navegador decidia isso e até se auto-liberava quando
   a suspensão vencia. Agora pergunta pro backend (Cloud Function
   `checarBanimento`), que é quem de fato consegue ler/limpar o campo. */
if (typeof auth !== 'undefined' && auth){
  auth.onAuthStateChanged(async (user) => {
    if (!user || typeof fns === 'undefined' || !fns) return;
    try{
      const resp = await fns.httpsCallable('checarBanimento')();
      const val = resp.data;
      if (!val || !val.banido) return;
      sentinelaMostrarTelaBanido(val.motivo, val.banidoAte);
      setTimeout(() => auth.signOut(), 50);
    } catch(e){ console.error('Falha ao checar banimento:', e); }
  });
}

/* ================= UI da aba "Sentinela" =================
   Só leitura — os dados são escritos pelas Cloud Functions. */

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
