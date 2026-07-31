/* ============================================================
   Cartomancia — lógica do app
   Firebase (auth + realtime database) + UI
   ============================================================ */

const APP_VERSION = '2.0.0';

const firebaseConfig = {
  apiKey: "AIzaSyAqgPPmWG6cM3xpFLtOBjQJ8PmAVV7YgaY",
  authDomain: "chatt-4bfcd.firebaseapp.com",
  databaseURL: "https://chatt-4bfcd-default-rtdb.firebaseio.com",
  projectId: "chatt-4bfcd",
  storageBucket: "chatt-4bfcd.firebasestorage.app",
  messagingSenderId: "1056039006721",
  appId: "1:1056039006721:web:7df8605c6dc1b77b460600"
};

let auth = null, db = null, firebaseReady = false;
try{
  if (typeof firebase !== 'undefined'){
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.database();
    // Mantém a sessão salva no navegador entre visitas.
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    firebaseReady = true;
  }
} catch(e){ console.error('Falha ao iniciar o Firebase:', e); }

/* ---------------- Splash / versão ---------------- */
function hideSplash(){
  const splash = document.getElementById('screenLoading');
  if (splash) splash.classList.add('fade-out');
}
const versionEl = document.getElementById('appVersion');
if (versionEl) versionEl.textContent = 'v' + APP_VERSION;

/* ---------------- Starfield ---------------- */
const canvas = document.getElementById('stars');
const ctx = canvas.getContext('2d');
let w, h, stars;
function resize(){
  w = canvas.width = window.innerWidth;
  h = canvas.height = window.innerHeight;
  const count = Math.floor((w*h)/9000);
  stars = Array.from({length: count}, () => ({
    x: Math.random()*w, y: Math.random()*h, r: Math.random()*1.3+0.2,
    base: Math.random()*0.5+0.3, speed: Math.random()*0.02+0.005, phase: Math.random()*Math.PI*2
  }));
}
function drawStars(t){
  ctx.clearRect(0,0,w,h);
  for(const s of stars){
    const tw = s.base + Math.sin(t*s.speed + s.phase)*0.35;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.fillStyle = `rgba(227,201,138,${Math.max(0, tw)})`; ctx.fill();
  }
  requestAnimationFrame(drawStars);
}
window.addEventListener('resize', resize);
resize(); requestAnimationFrame(drawStars);

/* ---------------- Tarot card flip ---------------- */
document.getElementById('tarotCard').addEventListener('click', function(){
  if (isGuest){ exigirConta('jogar as cartas'); return; }
  this.classList.toggle('flipped');
});

/* ================= AUTH ================= */
let authMode = 'signup';
const modeThumb = document.getElementById('modeThumb');

function setAuthMode(mode){
  authMode = mode;
  document.getElementById('tabSignup').classList.toggle('active', mode === 'signup');
  document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
  document.getElementById('signupFields').classList.toggle('hidden', mode !== 'signup');
  if (modeThumb) modeThumb.classList.toggle('right', mode === 'login');
  document.getElementById('authSub').textContent = mode === 'signup' ? 'Crie sua conta para entrar na mesa.' : 'Que bom te ver de novo.';
  document.getElementById('authSubmitLabel').textContent = mode === 'signup' ? 'Criar conta' : 'Entrar';
  document.getElementById('authFoot').innerHTML = mode === 'signup'
    ? 'Já tem conta? <a id="authSwitch">Entrar</a>'
    : 'Ainda não tem conta? <a id="authSwitch">Criar conta</a>';
  document.getElementById('authSwitch').addEventListener('click', () => setAuthMode(mode === 'signup' ? 'login' : 'signup'));
  hideAuthErr();
  hideGuestNotice();
}
document.getElementById('tabSignup').addEventListener('click', () => setAuthMode('signup'));
document.getElementById('tabLogin').addEventListener('click', () => setAuthMode('login'));
document.getElementById('authSwitch').addEventListener('click', () => setAuthMode('login'));

document.getElementById('eyeBtn').addEventListener('click', () => {
  const p = document.getElementById('fSenha');
  p.type = p.type === 'password' ? 'text' : 'password';
});

function showAuthErr(msg){
  document.getElementById('authErrText').textContent = msg;
  document.getElementById('authErr').classList.add('show');
}
function hideAuthErr(){ document.getElementById('authErr').classList.remove('show'); }

function traduzErro(code){
  const map = {
    'auth/email-already-in-use': 'Esse e-mail já tem conta. Toque em "Entrar".',
    'auth/invalid-email': 'Digite um e-mail válido.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/user-not-found': 'Não achamos conta com esse e-mail.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente de novo.',
    'auth/network-request-failed': 'Falha de conexão. Verifique sua internet.',
    'auth/requires-recent-login': 'Por segurança, confirme sua senha atual de novo.'
  };
  return map[code] || 'Algo deu errado. Tente de novo.';
}

document.getElementById('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAuthErr();

  if (!firebaseReady){
    showAuthErr('Não foi possível conectar ao servidor agora. Verifique sua internet e tente de novo.');
    return;
  }

  const email = document.getElementById('fEmail').value.trim();
  const senha = document.getElementById('fSenha').value;
  const btn = document.getElementById('authSubmit');
  const spinner = document.getElementById('authSpinner');
  btn.disabled = true; spinner.classList.add('show');

  try{
    if (authMode === 'signup'){
      const nome = document.getElementById('fNome').value.trim();
      const nick = document.getElementById('fNick').value.trim();
      const ano = document.getElementById('fAno').value;
      const mes = document.getElementById('fMes').value;
      const dia = document.getElementById('fDia').value;
      const genero = document.getElementById('fGenero').value;

      if (!nome || !ano || !mes || !dia || !genero){
        showAuthErr('Preencha nome, data de nascimento e gênero.');
        btn.disabled = false; spinner.classList.remove('show');
        return;
      }

      const cred = await auth.createUserWithEmailAndPassword(email, senha);
      await cred.user.updateProfile({ displayName: nome });
      await db.ref('usuarios/' + cred.user.uid).set({
        nome, nick: nick || nome, ano, mes, dia, genero, email
      });
      if (chatPublicoRef){
        chatPublicoRef.push({
          uid: 'bot', nome: 'Cartomancia',
          texto: 'Bem-vindo, ' + (nick || nome) + '!',
          ts: Date.now(), expiraEm: Date.now() + 40000
        });
      }
    } else {
      await auth.signInWithEmailAndPassword(email, senha);
    }
    // onAuthStateChanged cuida de trocar de tela
  } catch(err){
    showAuthErr(traduzErro(err.code));
  } finally {
    btn.disabled = false; spinner.classList.remove('show');
  }
});

/* ================= ESTADO DE SESSÃO ================= */
let perfilAtual = null;
let isGuest = false;

/* Convidado: entra sem conta, mas cartas e chat ficam bloqueados. */
function hideGuestNotice(){
  document.getElementById('guestNotice').classList.remove('show');
}
function exigirConta(motivo){
  mostrarTela('auth');
  setAuthMode('signup');
  document.getElementById('guestNoticeText').textContent = 'Crie uma conta para ' + motivo + '.';
  document.getElementById('guestNotice').classList.add('show');
}
document.getElementById('guestBtn').addEventListener('click', () => {
  isGuest = true;
  perfilAtual = { nome: 'Convidado', nick: 'Convidado' };
  document.getElementById('greetName').textContent = 'Convidado';
  mostrarTela('app');
});

function mostrarTela(tela){
  document.getElementById('screenAuth').classList.toggle('hidden', tela !== 'auth');
  document.getElementById('screenApp').classList.toggle('hidden', tela !== 'app');
  hideSplash();
}

if (firebaseReady){
  auth.onAuthStateChanged(async (user) => {
    if (user){
      isGuest = false;
      const snap = await db.ref('usuarios/' + user.uid).once('value');
      perfilAtual = snap.val() || { nome: user.displayName || 'visitante' };
      document.getElementById('greetName').textContent = perfilAtual.nick || perfilAtual.nome || 'visitante';
      document.getElementById('setNome').value = perfilAtual.nome || '';
      mostrarTela('app');
    } else {
      mostrarTela('auth');
    }
  });
} else {
  // Sem Firebase disponível (ex.: sem internet): mostra a tela de entrada mesmo assim,
  // pra pessoa não ficar olhando pra uma tela em branco.
  mostrarTela('auth');
}

/* ================= TABS ================= */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('panelCartaz').classList.toggle('hidden', tab !== 'cartaz');
    document.getElementById('panelChat').classList.toggle('hidden', tab !== 'chat');
    document.getElementById('panelPrecos').classList.toggle('hidden', tab !== 'precos');
  });
});

/* ================= BOTÃO DE BAIXAR APP (robô) ================= */
const dlFab = document.getElementById('dlFab');
const dlPop = document.getElementById('dlPop');
if (dlFab && dlPop){
  dlFab.addEventListener('click', (e) => {
    e.stopPropagation();
    const showing = dlPop.classList.toggle('hidden') === false;
    dlFab.setAttribute('aria-expanded', String(showing));
  });
  document.addEventListener('click', (e) => {
    if (!dlPop.classList.contains('hidden') && !dlPop.contains(e.target) && e.target !== dlFab){
      dlPop.classList.add('hidden');
      dlFab.setAttribute('aria-expanded', 'false');
    }
  });
}

/* ================= MENU DE CONTA ================= */
const accountPop = document.getElementById('accountPop');
document.getElementById('accountBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  accountPop.classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!accountPop.classList.contains('hidden') && !accountPop.contains(e.target)){
    accountPop.classList.add('hidden');
  }
});
document.getElementById('btnSairConta').addEventListener('click', () => {
  accountPop.classList.add('hidden');
  if (isGuest){ isGuest = false; mostrarTela('auth'); setAuthMode('login'); return; }
  if (firebaseReady) auth.signOut();
});
document.getElementById('btnNovaConta').addEventListener('click', async () => {
  accountPop.classList.add('hidden');
  isGuest = false;
  if (firebaseReady) await auth.signOut();
  setAuthMode('signup');
});

/* ================= CONFIGURAÇÕES ================= */
document.getElementById('settingsBtn').addEventListener('click', () => {
  clearSetMsgs();
  document.getElementById('settingsModal').classList.remove('hidden');
});
document.getElementById('closeSettings').addEventListener('click', () => {
  document.getElementById('settingsModal').classList.add('hidden');
});

function clearSetMsgs(){
  document.getElementById('setErr').classList.remove('show');
  document.getElementById('setOk').classList.remove('show');
}
function setErr(msg){
  clearSetMsgs();
  document.getElementById('setErrText').textContent = msg;
  document.getElementById('setErr').classList.add('show');
}
function setOk(msg){
  clearSetMsgs();
  document.getElementById('setOkText').textContent = msg;
  document.getElementById('setOk').classList.add('show');
}

// Trocar nome — não precisa reautenticar, é só um dado de perfil.
document.getElementById('btnSalvarNome').addEventListener('click', async () => {
  const novoNome = document.getElementById('setNome').value.trim();
  if (!novoNome) { setErr('Digite um nome.'); return; }
  try{
    const user = auth.currentUser;
    await user.updateProfile({ displayName: novoNome });
    await db.ref('usuarios/' + user.uid + '/nome').set(novoNome);
    perfilAtual.nome = novoNome;
    document.getElementById('greetName').textContent = perfilAtual.nick || novoNome;
    setOk('Nome atualizado.');
  } catch(err){ setErr(traduzErro(err.code)); }
});

// Trocar e-mail — precisa confirmar com a senha atual (reautenticação).
document.getElementById('btnSalvarEmail').addEventListener('click', async () => {
  const novoEmail = document.getElementById('setNovoEmail').value.trim();
  const senhaAtual = document.getElementById('setSenhaAtual').value;
  if (!novoEmail || !senhaAtual) { setErr('Preencha o novo e-mail e a senha atual.'); return; }
  try{
    const user = auth.currentUser;
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, senhaAtual);
    await user.reauthenticateWithCredential(cred);
    await user.updateEmail(novoEmail);
    await db.ref('usuarios/' + user.uid + '/email').set(novoEmail);
    document.getElementById('setNovoEmail').value = '';
    document.getElementById('setSenhaAtual').value = '';
    setOk('E-mail atualizado.');
  } catch(err){ setErr(traduzErro(err.code)); }
});

// Trocar senha — não precisa da senha antiga (sessão já está ativa).
document.getElementById('btnSalvarSenha').addEventListener('click', async () => {
  const novaSenha = document.getElementById('setNovaSenha').value;
  if (!novaSenha || novaSenha.length < 6) { setErr('A nova senha precisa ter pelo menos 6 caracteres.'); return; }
  try{
    const user = auth.currentUser;
    await user.updatePassword(novaSenha);
    document.getElementById('setNovaSenha').value = '';
    setOk('Senha atualizada.');
  } catch(err){ setErr(traduzErro(err.code)); }
});

/* ================= CHAT PÚBLICO ================= */
// Lista simples de termos a filtrar (pode ser ampliada). O objetivo é
// manter a conversa respeitosa — não é um sistema perfeito, é um filtro básico.
const palavrasBloqueadas = ['porra','merda','caralho','viado','puta','fdp','arrombado','desgraça','idiota','burro','otario','otário'];

function contemPalavraRuim(texto){
  const limpo = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return palavrasBloqueadas.some(p => limpo.includes(p));
}

const UMA_HORA = 60 * 60 * 1000;
const chatPublicoRef = firebaseReady ? db.ref('chatPublico/mensagens') : null;
const expiryMap = {}; // key -> timestamp de expiração, usado pelo cronômetro

function iniciais(nome){
  return (nome || '?').trim().charAt(0).toUpperCase();
}

function renderPublicMsg(key, val){
  const expiraEm = val.expiraEm || (val.ts + UMA_HORA);
  if (Date.now() >= expiraEm) return; // já expirou, nem mostra
  expiryMap[key] = expiraEm;

  const win = document.getElementById('chatWindow');
  const isOwn = auth.currentUser && val.uid === auth.currentUser.uid;
  const isBot = val.uid === 'bot';

  const row = document.createElement('div');
  row.className = 'msg-row ' + (isOwn ? 'own' : 'other');
  row.dataset.key = key;

  const avatar = document.createElement('div');
  avatar.className = 'avatar' + (isBot ? ' bot' : '') + (isOwn ? ' no-click' : '');
  avatar.textContent = isBot ? '✦' : iniciais(val.nome);
  if (!isOwn && !isBot){
    avatar.addEventListener('click', () => abrirConversaPrivada(val.uid, val.nome));
  }

  const col = document.createElement('div');
  col.className = 'msg-col';
  if (!isOwn){
    const nameEl = document.createElement('div');
    nameEl.className = 'msg-name';
    nameEl.textContent = val.nome;
    col.appendChild(nameEl);
  }
  const bubble = document.createElement('div');
  bubble.className = 'msg ' + (isBot ? 'bot' : (isOwn ? 'user' : 'bot'));
  bubble.textContent = val.texto;
  col.appendChild(bubble);

  row.appendChild(avatar);
  row.appendChild(col);
  win.appendChild(row);
  win.scrollTop = win.scrollHeight;
}

function removerPublicMsgDom(key){
  delete expiryMap[key];
  const el = document.querySelector('#chatWindow [data-key="' + key + '"]');
  if (el) el.remove();
}

if (chatPublicoRef){
  chatPublicoRef.limitToLast(100).on('child_added', (snap) => renderPublicMsg(snap.key, snap.val()));
  chatPublicoRef.on('child_removed', (snap) => removerPublicMsgDom(snap.key));

  // Limpeza periódica: remove do banco quem já passou da validade.
  setInterval(() => {
    chatPublicoRef.once('value').then((snapshot) => {
      const agora = Date.now();
      snapshot.forEach((child) => {
        const val = child.val();
        const expiraEm = val.expiraEm || (val.ts + UMA_HORA);
        if (agora >= expiraEm) chatPublicoRef.child(child.key).remove();
      });
    });
  }, 5000);
}

// Cronômetro no topo do chat: mostra quanto falta para a próxima mensagem sumir.
setInterval(() => {
  const agora = Date.now();
  Object.keys(expiryMap).forEach((key) => {
    if (expiryMap[key] <= agora) removerPublicMsgDom(key);
  });
  const restantes = Object.values(expiryMap).filter(t => t > agora);
  const el = document.getElementById('chatTimer');
  if (!restantes.length){ el.textContent = '—:—'; return; }
  const proxima = Math.min(...restantes) - agora;
  const mm = Math.floor(proxima / 60000);
  const ss = Math.floor((proxima % 60000) / 1000);
  el.textContent = String(mm).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
}, 1000);

function enviarMensagem(){
  if (isGuest){ exigirConta('mandar mensagens no chat'); return; }
  const input = document.getElementById('chatInput');
  const texto = input.value.trim();
  const user = auth.currentUser;
  if (!texto || !chatPublicoRef || !user || !perfilAtual) return;
  input.value = '';
  const nome = perfilAtual.nick || perfilAtual.nome || 'visitante';

  chatPublicoRef.push({ uid: user.uid, nome, texto, ts: Date.now() });

  if (contemPalavraRuim(texto)){
    chatPublicoRef.push({
      uid: 'bot', nome: 'Cartomancia',
      texto: 'Vamos manter esse espaço tranquilo 🙏 tenta reformular a mensagem.',
      ts: Date.now()
    });
  }
}

document.getElementById('chatSend').addEventListener('click', enviarMensagem);
document.getElementById('chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') enviarMensagem();
});

/* ================= CONVERSA PRIVADA (não expira) ================= */
let privateRefAtual = null;
let privateListenerAtual = null;
let privateOutroUid = null;

function abrirConversaPrivada(outroUid, outroNome){
  if (isGuest){ exigirConta('conversar em privado'); return; }
  if (!auth.currentUser) return;
  privateOutroUid = outroUid;
  document.getElementById('privateNomeTitulo').textContent = 'Conversa com ' + outroNome;
  document.getElementById('privateWindow').innerHTML = '';

  if (privateRefAtual && privateListenerAtual){
    privateRefAtual.off('child_added', privateListenerAtual);
  }

  const pairKey = [auth.currentUser.uid, outroUid].sort().join('_');
  privateRefAtual = db.ref('chatsPrivados/' + pairKey + '/mensagens');
  privateListenerAtual = (snap) => renderPrivateMsg(snap.val());
  privateRefAtual.on('child_added', privateListenerAtual);

  document.getElementById('privateModal').classList.remove('hidden');
}

function renderPrivateMsg(val){
  const win = document.getElementById('privateWindow');
  const isOwn = auth.currentUser && val.de === auth.currentUser.uid;
  const row = document.createElement('div');
  row.className = 'msg-row ' + (isOwn ? 'own' : 'other');
  const bubble = document.createElement('div');
  bubble.className = 'msg ' + (isOwn ? 'user' : 'bot');
  bubble.textContent = val.texto;
  row.appendChild(bubble);
  win.appendChild(row);
  win.scrollTop = win.scrollHeight;
}

function enviarPrivada(){
  const input = document.getElementById('privateInput');
  const texto = input.value.trim();
  if (!texto || !privateRefAtual || !auth.currentUser) return;
  input.value = '';
  privateRefAtual.push({ de: auth.currentUser.uid, texto, ts: Date.now() });
}

document.getElementById('privateSend').addEventListener('click', enviarPrivada);
document.getElementById('privateInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') enviarPrivada();
});
document.getElementById('closePrivate').addEventListener('click', () => {
  document.getElementById('privateModal').classList.add('hidden');
  if (privateRefAtual && privateListenerAtual) privateRefAtual.off('child_added', privateListenerAtual);
  privateRefAtual = null; privateListenerAtual = null;
});
