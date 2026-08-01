/* ============================================================
   Cartomancia — lógica do app
   Firebase (auth + realtime database) + UI
   ============================================================ */

const APP_VERSION = '2.1.0';

const firebaseConfig = {
  apiKey: "AIzaSyAqgPPmWG6cM3xpFLtOBjQJ8PmAVV7YgaY",
  authDomain: "chatt-4bfcd.firebaseapp.com",
  databaseURL: "https://chatt-4bfcd-default-rtdb.firebaseio.com",
  projectId: "chatt-4bfcd",
  storageBucket: "chatt-4bfcd.firebasestorage.app",
  messagingSenderId: "1056039006721",
  appId: "1:1056039006721:web:7df8605c6dc1b77b460600"
};

/* ---- EmailJS: envia o código de verificação por e-mail ----
   Crie uma conta grátis em https://www.emailjs.com/, crie um "Service"
   (ex.: Gmail) e um "Template" com as variáveis {{email}}, {{passcode}} e {{time}},
   depois troque os 3 valores abaixo pelos seus. */
const EMAILJS_PUBLIC_KEY = 'A2Pfc5yt0mFKs4kCV';
const EMAILJS_SERVICE_ID = 'service_di1xxsi';
const EMAILJS_TEMPLATE_ID = 'template_yc3ld0p';
try{
  if (typeof emailjs !== 'undefined') emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
} catch(e){ console.error('Falha ao iniciar o EmailJS:', e); }

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
  document.getElementById('forgotLine').classList.toggle('hidden', mode !== 'login');
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

      if (typeof SentinelaVerificarNome === 'function' && (SentinelaVerificarNome(nome) || SentinelaVerificarNome(nick))){
        showAuthErr('Esse nome não pode ser usado — escolha outro.');
        btn.disabled = false; spinner.classList.remove('show');
        return;
      }

      const cred = await auth.createUserWithEmailAndPassword(email, senha);
      await cred.user.updateProfile({ displayName: nome });
      await db.ref('usuarios/' + cred.user.uid).set({
        nome, nick: nick || nome, ano, mes, dia, genero, email, emailVerificado: false
      });
      await enviarCodigoVerificacao(cred.user.uid, email);
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

/* ================= VERIFICAÇÃO DE E-MAIL (código) ================= */
const CODIGO_VALIDADE_MS = 10 * 60 * 1000; // 10 minutos

function gerarCodigo6(){
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Gera um código novo, salva em /verificacoes/{uid} com prazo de validade,
// e manda por e-mail via EmailJS. Reaproveitada no cadastro e no "reenviar".
async function enviarCodigoVerificacao(uid, email){
  const codigo = gerarCodigo6();
  await db.ref('verificacoes/' + uid).set({
    codigo, criadoEm: Date.now(), expiraEm: Date.now() + CODIGO_VALIDADE_MS
  });
  if (typeof emailjs === 'undefined') {
    console.error('EmailJS não carregou — verifique a tag <script> no index.html.');
    return;
  }
  await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    email, passcode: codigo, time: new Date(Date.now() + CODIGO_VALIDADE_MS).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  });
}

function showVerifyErr(msg){
  document.getElementById('verifyOk').classList.remove('show');
  document.getElementById('verifyErrText').textContent = msg;
  document.getElementById('verifyErr').classList.add('show');
}
function showVerifyOk(msg){
  document.getElementById('verifyErr').classList.remove('show');
  document.getElementById('verifyOkText').textContent = msg;
  document.getElementById('verifyOk').classList.add('show');
}

// "Confirmar código": compara o que a pessoa digitou com o que está salvo
// em /verificacoes/{uid}, checando se ainda está dentro do prazo.
document.getElementById('verifyCheckBtn').addEventListener('click', async () => {
  const btn = document.getElementById('verifyCheckBtn');
  const spinner = document.getElementById('verifySpinner');
  const digitado = document.getElementById('verifyCodigoInput').value.trim();
  if (!digitado){ showVerifyErr('Digite o código recebido por e-mail.'); return; }

  btn.disabled = true; spinner.classList.add('show');
  try{
    const user = auth.currentUser;
    const snap = await db.ref('verificacoes/' + user.uid).once('value');
    const dados = snap.val();

    if (!dados){
      showVerifyErr('Nenhum código pendente. Toque em "Reenviar código".');
    } else if (Date.now() > dados.expiraEm){
      showVerifyErr('Esse código expirou. Toque em "Reenviar código".');
    } else if (String(digitado) !== String(dados.codigo)){
      showVerifyErr('Código incorreto. Confira e tente de novo.');
    } else {
      await db.ref('usuarios/' + user.uid + '/emailVerificado').set(true);
      await db.ref('verificacoes/' + user.uid).remove();
      showVerifyOk('E-mail confirmado! Entrando...');
      isGuest = false;
      const snapUser = await db.ref('usuarios/' + user.uid).once('value');
      perfilAtual = snapUser.val() || { nome: user.displayName || 'visitante' };
      document.getElementById('greetName').textContent = perfilAtual.nick || perfilAtual.nome || 'visitante';
      document.getElementById('setNome').value = perfilAtual.nome || '';
      document.getElementById('setNick').value = perfilAtual.nick || '';
      mostrarTela('app');
    }
  } catch(err){
    showVerifyErr('Não deu pra checar agora. Tente de novo.');
  } finally {
    btn.disabled = false; spinner.classList.remove('show');
  }
});

// Espera 60s entre reenvios, pra não estourar a cota do EmailJS nem
// deixar a pessoa clicando várias vezes achando que "bugou".
const REENVIO_ESPERA_MS = 60 * 1000;
let proximoReenvioLiberadoEm = 0;
let reenvioIntervalo = null;

function atualizarBotaoReenvio(){
  const btn = document.getElementById('verifyResendBtn');
  const restante = proximoReenvioLiberadoEm - Date.now();
  if (restante > 0){
    btn.classList.add('disabled');
    btn.textContent = 'Aguarde ' + Math.ceil(restante / 1000) + 's pra reenviar';
  } else {
    btn.classList.remove('disabled');
    btn.textContent = 'Reenviar código';
    if (reenvioIntervalo){ clearInterval(reenvioIntervalo); reenvioIntervalo = null; }
  }
}

document.getElementById('verifyResendBtn').addEventListener('click', async () => {
  if (Date.now() < proximoReenvioLiberadoEm) return; // ainda em espera, ignora o clique
  try{
    const user = auth.currentUser;
    await enviarCodigoVerificacao(user.uid, user.email);
    showVerifyOk('Código reenviado.');
    proximoReenvioLiberadoEm = Date.now() + REENVIO_ESPERA_MS;
    atualizarBotaoReenvio();
    reenvioIntervalo = setInterval(atualizarBotaoReenvio, 1000);
  } catch(err){
    showVerifyErr('Não deu pra reenviar agora. Tente de novo em instantes.');
  }
});

document.getElementById('verifySairBtn').addEventListener('click', async () => {
  await auth.signOut();
  mostrarTela('auth');
  setAuthMode('login');
});

/* ================= ESQUECI SENHA =================
   Importante: o Firebase Auth não deixa trocar a senha de alguém que
   não está logado usando só um código de 6 dígitos (isso exigiria um
   servidor próprio com permissão de administrador). O jeito seguro e
   sem precisar de servidor é o Firebase mandar um LINK por e-mail: a
   pessoa toca no link, cai direto na tela "Criar nova senha" aqui
   dentro do app, e troca a senha. Pra esse link abrir dentro do app
   (e não numa página genérica do Firebase), confirme no Firebase
   Console → Authentication → Settings → Authorized domains, se o
   domínio onde esse site fica hospedado está autorizado. */

function hideForgotMsgs(){
  document.getElementById('forgotErr').classList.remove('show');
  document.getElementById('forgotOk').classList.remove('show');
}

document.getElementById('forgotBtn').addEventListener('click', () => {
  hideForgotMsgs();
  document.getElementById('forgotFormWrap').classList.remove('hidden');
  document.getElementById('forgotEmail').value = document.getElementById('fEmail').value || '';
  mostrarTela('forgot');
});

document.getElementById('forgotBackBtn').addEventListener('click', () => {
  mostrarTela('auth');
  setAuthMode('login');
});

document.getElementById('forgotSendBtn').addEventListener('click', async () => {
  hideForgotMsgs();
  const email = document.getElementById('forgotEmail').value.trim();
  if (!email){
    document.getElementById('forgotErrText').textContent = 'Digite seu e-mail.';
    document.getElementById('forgotErr').classList.add('show');
    return;
  }
  if (!firebaseReady){
    document.getElementById('forgotErrText').textContent = 'Não foi possível conectar ao servidor agora. Verifique sua internet.';
    document.getElementById('forgotErr').classList.add('show');
    return;
  }
  const btn = document.getElementById('forgotSendBtn');
  const spinner = document.getElementById('forgotSpinner');
  btn.disabled = true; spinner.classList.add('show');
  try{
    await auth.sendPasswordResetEmail(email, {
      url: window.location.origin + window.location.pathname,
      handleCodeInApp: true
    });
    document.getElementById('forgotOkText').textContent = 'Link enviado! Abra seu e-mail e toque no link para criar a nova senha.';
    document.getElementById('forgotOk').classList.add('show');
    document.getElementById('forgotFormWrap').classList.add('hidden');
  } catch(err){
    document.getElementById('forgotErrText').textContent = traduzErro(err.code);
    document.getElementById('forgotErr').classList.add('show');
  } finally {
    btn.disabled = false; spinner.classList.remove('show');
  }
});

// Se a pessoa chegou aqui pelo link do e-mail (?mode=resetPassword&oobCode=...),
// já mostra direto a tela de criar nova senha.
(function checarLinkRecuperacaoSenha(){
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const oobCode = params.get('oobCode');
  if (mode !== 'resetPassword' || !oobCode || !firebaseReady) return;

  auth.verifyPasswordResetCode(oobCode).then((email) => {
    document.getElementById('novaSenhaEmailAlvo').textContent = email;
    mostrarTela('novaSenha');

    document.getElementById('novaSenhaBtn').addEventListener('click', async () => {
      const novaSenha = document.getElementById('novaSenhaInput').value;
      const errBox = document.getElementById('novaSenhaErr');
      const errText = document.getElementById('novaSenhaErrText');
      errBox.classList.remove('show');
      if (!novaSenha || novaSenha.length < 6){
        errText.textContent = 'A senha precisa ter pelo menos 6 caracteres.';
        errBox.classList.add('show');
        return;
      }
      const btn = document.getElementById('novaSenhaBtn');
      const spinner = document.getElementById('novaSenhaSpinner');
      btn.disabled = true; spinner.classList.add('show');
      try{
        await auth.confirmPasswordReset(oobCode, novaSenha);
        document.getElementById('novaSenhaOkText').textContent = 'Senha atualizada! Redirecionando para entrar...';
        document.getElementById('novaSenhaOk').classList.add('show');
        setTimeout(() => {
          window.location.href = window.location.origin + window.location.pathname;
        }, 1800);
      } catch(err){
        errText.textContent = traduzErro(err.code);
        errBox.classList.add('show');
      } finally {
        btn.disabled = false; spinner.classList.remove('show');
      }
    }, { once: true });
  }).catch(() => {
    // Link inválido ou expirado: volta pra tela de entrar.
    mostrarTela('auth');
    setAuthMode('login');
  });
})();

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
  document.getElementById('screenVerify').classList.toggle('hidden', tela !== 'verify');
  document.getElementById('screenForgot').classList.toggle('hidden', tela !== 'forgot');
  document.getElementById('screenNovaSenha').classList.toggle('hidden', tela !== 'novaSenha');
  document.getElementById('screenApp').classList.toggle('hidden', tela !== 'app');
  hideSplash();
}

if (firebaseReady){
  auth.onAuthStateChanged(async (user) => {
    // Convidado não passa por e-mail/senha, então não tem o que verificar.
    if (user && !isGuest){
      const snapVer = await db.ref('usuarios/' + user.uid + '/emailVerificado').once('value');
      const verificado = snapVer.val() === true;
      if (!verificado){
        document.getElementById('verifyEmailAlvo').textContent = user.email || 'seu e-mail';
        // Garante que sempre haja um código válido esperando quando a tela abre.
        const snapCodigo = await db.ref('verificacoes/' + user.uid).once('value');
        let codigoAtual = snapCodigo.val();
        if (!codigoAtual || Date.now() > codigoAtual.expiraEm){
          try{
            await enviarCodigoVerificacao(user.uid, user.email);
            codigoAtual = { criadoEm: Date.now() };
          } catch(e){ console.error('Falha ao enviar código:', e); }
        }
        // Mantém o botão de reenviar em espera se o código ainda for recente.
        if (codigoAtual && codigoAtual.criadoEm){
          proximoReenvioLiberadoEm = codigoAtual.criadoEm + REENVIO_ESPERA_MS;
          atualizarBotaoReenvio();
          if (Date.now() < proximoReenvioLiberadoEm && !reenvioIntervalo){
            reenvioIntervalo = setInterval(atualizarBotaoReenvio, 1000);
          }
        }
        mostrarTela('verify');
        return;
      }
    }
    if (user){
      isGuest = false;
      const snap = await db.ref('usuarios/' + user.uid).once('value');
      perfilAtual = snap.val() || { nome: user.displayName || 'visitante' };
      document.getElementById('greetName').textContent = perfilAtual.nick || perfilAtual.nome || 'visitante';
      document.getElementById('setNome').value = perfilAtual.nome || '';
      document.getElementById('setNick').value = perfilAtual.nick || '';
      mostrarTela('app');
      mostrarTarot();
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
    const tab = btn.dataset.tab;
    if (tab === 'tarot' && isGuest){ exigirConta('jogar o tarot'); return; }
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panelCartaz').classList.toggle('hidden', tab !== 'cartaz');
    document.getElementById('panelChat').classList.toggle('hidden', tab !== 'chat');
    document.getElementById('panelRelatos').classList.toggle('hidden', tab !== 'relatos');
    document.getElementById('panelPrecos').classList.toggle('hidden', tab !== 'precos');
    document.getElementById('panelTarot').classList.toggle('hidden', tab !== 'tarot');
    document.getElementById('panelBot').classList.toggle('hidden', tab !== 'bot');
    if (tab === 'tarot') mostrarTarot();
    if (tab === 'bot' && typeof sentinelaTrocarSubaba === 'function'){
      const ativa = document.querySelector('.sentinela-subtab.active');
      sentinelaTrocarSubaba(ativa ? ativa.dataset.sub : 'verificacao');
    }
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
  if (typeof SentinelaVerificarNome === 'function' && SentinelaVerificarNome(novoNome)){
    setErr('Esse nome não pode ser usado — escolha outro.');
    return;
  }
  try{
    const user = auth.currentUser;
    await user.updateProfile({ displayName: novoNome });
    await db.ref('usuarios/' + user.uid + '/nome').set(novoNome);
    perfilAtual.nome = novoNome;
    document.getElementById('greetName').textContent = perfilAtual.nick || novoNome;
    setOk('Nome atualizado.');
  } catch(err){ setErr(traduzErro(err.code)); }
});

// Trocar nome de cartomante (nick) — é o nome que tem prioridade em todo
// o app (chat, relatos, saudação). É o que resolve a confusão de "troquei
// o nome e não mudou em lugar nenhum": o nick sempre vence o nome comum.
document.getElementById('btnSalvarNick').addEventListener('click', async () => {
  const novoNick = document.getElementById('setNick').value.trim();
  if (!novoNick) { setErr('Digite um nome de cartomante.'); return; }
  if (typeof SentinelaVerificarNome === 'function' && SentinelaVerificarNome(novoNick)){
    setErr('Esse nome não pode ser usado — escolha outro.');
    return;
  }
  try{
    const user = auth.currentUser;
    await db.ref('usuarios/' + user.uid + '/nick').set(novoNick);
    perfilAtual.nick = novoNick;
    document.getElementById('greetName').textContent = novoNick;
    setOk('Nome de cartomante atualizado.');
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

/* ================= REAÇÕES: CURTIR 👍 / NÃO CURTIR 👎 =================
   Sistema reaproveitado no chat público, no privado e nos relatos.
   Cada mensagem tem DOIS nós no Firebase: curtidas/{uid} = {nome, ts}
   e naogostei/{uid} = {nome, ts} — são independentes, mas marcar um
   remove o outro (não dá pra curtir e não-curtir ao mesmo tempo).
   - Duplo clique na bolha: curte / descurte.
   - Deslizar pra direita: curte. Deslizar pra esquerda: não curte.
   - Clique no polegar (👍 ou 👎): abre painel de quem reagiu assim.
   - No painel, um "x" ao lado do seu próprio nome remove sua reação. */
let likesModalRef = null;
let likesModalListener = null;

function meuUsuario(){
  if (isGuest || !auth.currentUser || !perfilAtual) return null;
  return { uid: auth.currentUser.uid, nome: perfilAtual.nick || perfilAtual.nome || 'visitante' };
}

// Define (ou remove) minha reação num dos dois nós, sempre limpando o outro.
function definirReacao(curtidasRef, naogosteiRef, tipo){
  const eu = meuUsuario();
  if (!eu){ exigirConta('reagir a mensagens'); return; }
  const meuLike = curtidasRef.child(eu.uid);
  const meuDeslike = naogosteiRef.child(eu.uid);
  if (tipo === 'like'){
    meuLike.once('value').then((snap) => {
      if (snap.exists()){ meuLike.remove(); }
      else { meuLike.set({ nome: eu.nome, ts: Date.now() }); meuDeslike.remove(); }
    });
  } else {
    meuDeslike.once('value').then((snap) => {
      if (snap.exists()){ meuDeslike.remove(); }
      else { meuDeslike.set({ nome: eu.nome, ts: Date.now() }); meuLike.remove(); }
    });
  }
}

function dispararBurst(bubbleEl, tipo){
  const burst = document.createElement('div');
  burst.className = 'like-burst' + (tipo === 'dislike' ? ' dislike-burst' : '');
  burst.textContent = tipo === 'dislike' ? '👎' : '👍';
  bubbleEl.appendChild(burst);
  setTimeout(() => burst.remove(), 800);
}

function abrirPainelCurtidas(reacaoRef, titulo, icone){
  const modal = document.getElementById('likesModal');
  const lista = document.getElementById('likesList');
  const tituloEl = modal.querySelector('h3');
  const subEl = modal.querySelector('.modal-sub');
  if (tituloEl) tituloEl.textContent = icone + ' ' + titulo;
  if (subEl) subEl.textContent = 'Quem reagiu assim a essa mensagem';
  if (likesModalRef && likesModalListener) likesModalRef.off('value', likesModalListener);
  likesModalRef = reacaoRef;

  likesModalListener = (snap) => {
    lista.innerHTML = '';
    const eu = meuUsuario();
    const itens = [];
    snap.forEach((child) => { itens.push({ uid: child.key, ...child.val() }); });
    if (!itens.length){
      lista.innerHTML = '<div class="likes-empty">Ninguém reagiu assim ainda ✦</div>';
      return;
    }
    itens.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    itens.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'like-item';
      const who = document.createElement('div');
      who.className = 'who';
      const av = document.createElement('div');
      av.className = 'mini-avatar';
      av.textContent = iniciais(item.nome);
      const nomeSpan = document.createElement('span');
      nomeSpan.textContent = item.nome + (eu && item.uid === eu.uid ? ' (você)' : '');
      const ico = document.createElement('span');
      ico.className = 'heart-ico';
      ico.textContent = icone;
      who.appendChild(av);
      who.appendChild(nomeSpan);
      row.appendChild(who);
      if (eu && item.uid === eu.uid){
        const x = document.createElement('button');
        x.className = 'remove-x';
        x.setAttribute('aria-label', 'Remover reação');
        x.textContent = '✕';
        x.addEventListener('click', () => reacaoRef.child(item.uid).remove());
        row.appendChild(x);
      } else {
        row.appendChild(ico);
      }
      lista.appendChild(row);
    });
  };
  reacaoRef.on('value', likesModalListener);
  modal.classList.remove('hidden');
}

document.getElementById('closeLikes').addEventListener('click', () => {
  document.getElementById('likesModal').classList.add('hidden');
  if (likesModalRef && likesModalListener) likesModalRef.off('value', likesModalListener);
  likesModalRef = null; likesModalListener = null;
});

// Cria os dois badges (👍 curtir / 👎 não curtir), liga os eventos de duplo
// clique, deslizar e clique nos badges. Retorna a função de "desligar" os
// listeners, pra chamar quando a mensagem sumir da tela.
function ligarCurtidas(curtidasRef, bubbleEl, colEl, alinharDireita){
  const naogosteiRef = curtidasRef.parent.child('naogostei');

  const wrap = document.createElement('div');
  wrap.className = 'reacoes-wrap';
  if (alinharDireita) wrap.style.alignSelf = 'flex-end';

  const likeBadge = document.createElement('div');
  likeBadge.className = 'like-badge';
  const likeIco = document.createElement('span');
  likeIco.className = 'heart-ico';
  likeIco.textContent = '👍';
  const likeCount = document.createElement('span');
  likeCount.className = 'count';
  likeBadge.appendChild(likeIco);
  likeBadge.appendChild(likeCount);

  const dislikeBadge = document.createElement('div');
  dislikeBadge.className = 'like-badge dislike-badge';
  const dislikeIco = document.createElement('span');
  dislikeIco.className = 'heart-ico';
  dislikeIco.textContent = '👎';
  const dislikeCount = document.createElement('span');
  dislikeCount.className = 'count';
  dislikeBadge.appendChild(dislikeIco);
  dislikeBadge.appendChild(dislikeCount);

  wrap.appendChild(likeBadge);
  wrap.appendChild(dislikeBadge);
  colEl.appendChild(wrap);

  likeBadge.addEventListener('click', () => abrirPainelCurtidas(curtidasRef, 'Curtidas', '👍'));
  dislikeBadge.addEventListener('click', () => abrirPainelCurtidas(naogosteiRef, 'Não curtiram', '👎'));

  const listenerLike = (snap) => {
    const eu = meuUsuario();
    const total = snap.numChildren();
    const souEu = !!(eu && snap.hasChild(eu.uid));
    likeBadge.classList.add('show');
    likeBadge.classList.toggle('liked', souEu);
    likeCount.textContent = String(total);
  };
  const listenerDislike = (snap) => {
    const eu = meuUsuario();
    const total = snap.numChildren();
    const souEu = !!(eu && snap.hasChild(eu.uid));
    dislikeBadge.classList.add('show');
    dislikeBadge.classList.toggle('liked', souEu);
    dislikeCount.textContent = String(total);
  };
  curtidasRef.on('value', listenerLike);
  naogosteiRef.on('value', listenerDislike);

  bubbleEl.addEventListener('dblclick', () => {
    const eu = meuUsuario();
    if (!eu){ exigirConta('curtir mensagens'); return; }
    dispararBurst(bubbleEl, 'like');
    definirReacao(curtidasRef, naogosteiRef, 'like');
  });

  ativarSwipeCurtir(bubbleEl, curtidasRef, naogosteiRef);

  return () => { curtidasRef.off('value', listenerLike); naogosteiRef.off('value', listenerDislike); };
}

/* ---------------- deslizar pra curtir / não curtir ----------------
   Deslizar a bolha da mensagem pra direita = curte (👍).
   Deslizar pra esquerda = não curte (👎).
   Funciona com toque (celular) e com o mouse (arrastar). */
function ativarSwipeCurtir(bubbleEl, curtidasRef, naogosteiRef){
  let inicioX = 0, inicioY = 0, arrastando = false, valeu = false;
  const LIMIAR = 46;

  function comeca(x, y){
    inicioX = x; inicioY = y; arrastando = true; valeu = false;
    bubbleEl.classList.add('swiping');
  }
  function move(x, y){
    if (!arrastando) return;
    const dx = x - inicioX, dy = y - inicioY;
    if (Math.abs(dx) < Math.abs(dy)) return; // gesto vertical: ignora (é scroll)
    const clamp = Math.max(-70, Math.min(70, dx));
    bubbleEl.style.transform = 'translateX(' + clamp + 'px)';
    if (Math.abs(dx) > LIMIAR) valeu = true;
    bubbleEl.classList.toggle('swipe-like', dx > LIMIAR);
    bubbleEl.classList.toggle('swipe-unlike', dx < -LIMIAR);
  }
  function termina(x){
    if (!arrastando) return;
    arrastando = false;
    bubbleEl.classList.remove('swiping', 'swipe-like', 'swipe-unlike');
    bubbleEl.style.transform = '';
    if (!valeu) return;
    const dx = x - inicioX;
    const eu = meuUsuario();
    if (!eu){ exigirConta('curtir mensagens'); return; }
    if (dx > LIMIAR){
      dispararBurst(bubbleEl, 'like');
      definirReacao(curtidasRef, naogosteiRef, 'like');
    } else if (dx < -LIMIAR){
      dispararBurst(bubbleEl, 'dislike');
      definirReacao(curtidasRef, naogosteiRef, 'dislike');
    }
  }

  // stopPropagation pra não acionar junto o "segurar pra apagar" da linha (mensagem própria).
  bubbleEl.addEventListener('touchstart', (e) => {
    e.stopPropagation();
    const t = e.touches[0]; comeca(t.clientX, t.clientY);
  }, { passive: true });
  bubbleEl.addEventListener('touchmove', (e) => {
    const t = e.touches[0]; move(t.clientX, t.clientY);
  }, { passive: true });
  bubbleEl.addEventListener('touchend', (e) => {
    e.stopPropagation();
    termina(e.changedTouches[0].clientX);
  });

  bubbleEl.addEventListener('mousedown', (e) => { e.stopPropagation(); comeca(e.clientX, e.clientY); });
  bubbleEl.addEventListener('mousemove', (e) => { move(e.clientX, e.clientY); });
  bubbleEl.addEventListener('mouseup', (e) => { e.stopPropagation(); termina(e.clientX); });
  bubbleEl.addEventListener('mouseleave', () => {
    if (arrastando){ arrastando = false; bubbleEl.classList.remove('swiping','swipe-like','swipe-unlike'); bubbleEl.style.transform = ''; }
  });
}

/* ================= SEGURAR PRA APAGAR / ALTERAR (1s) =================
   Usado nas próprias mensagens do chat público, privado e relatos.
   Segura a mensagem por 1 segundo -> mostra o painel com as opções
   de apagar ou (quando disponível) alterar o texto. */
function ativarSegurarApagar(rowEl, aoConfirmar, opcoes){
  let timer = null;
  function comecarSegurar(){
    rowEl.classList.add('segurando');
    timer = setTimeout(() => {
      rowEl.classList.remove('segurando');
      if (navigator.vibrate) navigator.vibrate(25);
      abrirPainelApagar(aoConfirmar, opcoes);
    }, 1000);
  }
  function cancelarSegurar(){
    clearTimeout(timer);
    rowEl.classList.remove('segurando');
  }
  rowEl.addEventListener('touchstart', comecarSegurar, { passive: true });
  rowEl.addEventListener('touchend', cancelarSegurar);
  rowEl.addEventListener('touchmove', cancelarSegurar);
  rowEl.addEventListener('mousedown', comecarSegurar);
  rowEl.addEventListener('mouseup', cancelarSegurar);
  rowEl.addEventListener('mouseleave', cancelarSegurar);
}

// opcoes: { textoAtual, aoSalvarEdicao(novoTexto) } — omitido quando a
// mensagem não pode ser editada (ex.: já expirou o tempo de edição).
function abrirPainelApagar(aoConfirmar, opcoes){
  const modal = document.getElementById('confirmDeleteModal');
  const viewApagar = document.getElementById('confirmDeleteView');
  const viewEditar = document.getElementById('confirmEditView');
  const btnIrEditar = document.getElementById('goEditBtn');
  modal.classList.remove('hidden');
  viewApagar.classList.remove('hidden');
  viewEditar.classList.add('hidden');

  btnIrEditar.classList.toggle('hidden', !opcoes);

  const btnConfirmar = document.getElementById('confirmDeleteBtn');
  const novoBtnConfirmar = btnConfirmar.cloneNode(true); // limpa listeners antigos
  btnConfirmar.parentNode.replaceChild(novoBtnConfirmar, btnConfirmar);
  novoBtnConfirmar.addEventListener('click', () => {
    aoConfirmar();
    modal.classList.add('hidden');
  });

  const novoBtnEditar = btnIrEditar.cloneNode(true);
  btnIrEditar.parentNode.replaceChild(novoBtnEditar, btnIrEditar);
  if (opcoes){
    novoBtnEditar.addEventListener('click', () => {
      viewApagar.classList.add('hidden');
      viewEditar.classList.remove('hidden');
      const input = document.getElementById('editMsgInput');
      input.value = opcoes.textoAtual || '';
      input.focus();

      const btnSalvar = document.getElementById('saveEditBtn');
      const novoBtnSalvar = btnSalvar.cloneNode(true);
      btnSalvar.parentNode.replaceChild(novoBtnSalvar, btnSalvar);
      novoBtnSalvar.addEventListener('click', () => {
        const novoTexto = input.value.trim();
        if (!novoTexto) return;
        opcoes.aoSalvarEdicao(novoTexto);
        modal.classList.add('hidden');
      });
    });
  }
}

document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
  document.getElementById('confirmDeleteModal').classList.add('hidden');
});
document.getElementById('cancelEditBtn').addEventListener('click', () => {
  document.getElementById('confirmDeleteModal').classList.add('hidden');
});

/* ================= ÍCONE DE BANIR + RELATO =================
   Aparece do lado (um pouco abaixo) das mensagens de outras pessoas.
   Abre o painel de relato: a pessoa escreve o que aconteceu, o
   Sentinela analisa o texto denunciado + o motivo, e então dá pra
   banir por 1 dia ou permanentemente. Nunca é possível banir a si
   mesmo — o botão nem aparece na própria mensagem. */
function criarBotaoBanir(uid, nome, textoOriginal){
  const btn = document.createElement('button');
  btn.className = 'ban-ico';
  btn.type = 'button';
  btn.title = 'Denunciar / banir ' + nome;
  btn.textContent = '🚫';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    abrirReportModal(uid, nome, textoOriginal);
  });
  return btn;
}

let reportAlvo = null; // { uid, nome, texto }

function abrirReportModal(uid, nome, texto){
  if (isGuest){ exigirConta('denunciar uma mensagem'); return; }
  if (typeof sentinelaPodeBanir === 'function' && !sentinelaPodeBanir(uid)){
    return; // proteção de vítima: não deixa seguir se o alvo não pode ser banido
  }
  reportAlvo = { uid, nome, texto };
  document.getElementById('reportNomeAlvo').textContent = nome;
  document.getElementById('reportMotivo').value = '';
  document.getElementById('reportResultado').classList.add('hidden');
  document.getElementById('reportForm').classList.remove('hidden');
  document.getElementById('reportModal').classList.remove('hidden');
}

document.getElementById('closeReport').addEventListener('click', () => {
  document.getElementById('reportModal').classList.add('hidden');
  reportAlvo = null;
});

document.getElementById('reportEnviar').addEventListener('click', async () => {
  if (!reportAlvo || !auth.currentUser || !perfilAtual) return;
  const motivo = document.getElementById('reportMotivo').value.trim().slice(0, 300);
  if (!motivo){ return; }
  const meuNome = perfilAtual.nick || perfilAtual.nome || 'visitante';

  if (typeof sentinelaRegistrarRelatoUsuario === 'function'){
    await sentinelaRegistrarRelatoUsuario(reportAlvo.uid, reportAlvo.nome, reportAlvo.texto, motivo, auth.currentUser.uid, meuNome);
  }

  let analise = { suspeito: false, avisosAnteriores: 0 };
  if (typeof sentinelaAnalisarRelato === 'function'){
    analise = await sentinelaAnalisarRelato(reportAlvo.uid, reportAlvo.texto, motivo);
  }

  document.getElementById('reportForm').classList.add('hidden');
  const resultado = document.getElementById('reportResultado');
  resultado.classList.remove('hidden');
  document.getElementById('reportResultadoTexto').textContent = analise.suspeito
    ? '🛡️ O Sentinela encontrou indícios de violação das regras nessa conta (' + analise.avisosAnteriores + ' aviso(s) anterior(es)).'
    : '🛡️ Não encontramos uma violação clara automaticamente, mas seu relato foi registrado. Se tiver certeza, você ainda pode banir.';
});

document.getElementById('reportBanir1Dia').addEventListener('click', async () => {
  if (!reportAlvo || typeof sentinelaPodeBanir !== 'function' || !sentinelaPodeBanir(reportAlvo.uid)) return;
  await sentinelaBanir(reportAlvo.uid, reportAlvo.nome, 'Suspenso por 1 dia após relato de outro usuário.', SENTINELA.UM_DIA);
  document.getElementById('reportModal').classList.add('hidden');
  reportAlvo = null;
});

document.getElementById('reportBanirPermanente').addEventListener('click', async () => {
  if (!reportAlvo || typeof sentinelaPodeBanir !== 'function' || !sentinelaPodeBanir(reportAlvo.uid)) return;
  await sentinelaBanir(reportAlvo.uid, reportAlvo.nome, 'Banido permanentemente após relato de outro usuário.', null);
  document.getElementById('reportModal').classList.add('hidden');
  reportAlvo = null;
});

// Diretório nick -> uid, construído a partir de quem já apareceu no chat público.
// É o que permite o @menção encontrar a pessoa certa (e alimenta o painel de sugestão).
const nomeParaUid = {};
const nomeExibicao = {}; // chave -> nome com acentuação original, pra mostrar no painel
function chaveNome(nome){
  return (nome || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function renderPublicMsg(key, val){
  const expiraEm = val.expiraEm || (val.ts + UMA_HORA);
  if (Date.now() >= expiraEm) return; // já expirou, nem mostra
  expiryMap[key] = expiraEm;

  if (val.uid && val.uid !== 'bot'){
    nomeParaUid[chaveNome(val.nome)] = val.uid;
    nomeExibicao[chaveNome(val.nome)] = val.nome;
  }

  // Mensagem gigante que passou de algum jeito do limite: o bot apaga.
  if (val.texto && val.texto.length > 200){
    if (chatPublicoRef) chatPublicoRef.child(key).remove();
    return;
  }

  // Mensagem com @menção: só o remetente e a pessoa marcada enxergam.
  if (val.mencionadoUid){
    const souRemetente = auth.currentUser && val.uid === auth.currentUser.uid;
    const souMencionado = auth.currentUser && val.mencionadoUid === auth.currentUser.uid;
    if (!souRemetente && !souMencionado) return;
  }

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
  if (val.mencionadoUid){
    const tag = document.createElement('div');
    tag.className = 'mention-tag';
    tag.textContent = '🔒 só pra @' + val.mencionadoNome;
    col.appendChild(tag);
  }
  const bubble = document.createElement('div');
  bubble.className = 'msg ' + (isBot ? 'bot' : (isOwn ? 'user' : 'bot')) + (val.mencionadoUid ? ' mention' : '');
  bubble.textContent = val.texto;
  col.appendChild(bubble);

  row.appendChild(avatar);
  row.appendChild(col);
  win.appendChild(row);
  win.scrollTop = win.scrollHeight;

  if (!isBot){
    const likesRef = chatPublicoRef.child(key).child('curtidas');
    likeListeners[key] = ligarCurtidas(likesRef, bubble, col, isOwn);
  }

  if (isOwn){
    ativarSegurarApagar(row, () => chatPublicoRef.child(key).remove(), {
      textoAtual: val.texto,
      aoSalvarEdicao: (novoTexto) => chatPublicoRef.child(key).update({ texto: novoTexto.slice(0, 200), editado: true })
    });
  } else if (!isBot){
    col.appendChild(criarBotaoBanir(val.uid, val.nome, val.texto));
  }
}

// Atualiza o texto de uma mensagem já na tela quando ela é editada no Firebase.
function atualizarTextoDom(containerId, key, novoTexto){
  const row = document.querySelector('#' + containerId + ' [data-key="' + key + '"]');
  if (!row) return;
  const bolha = row.querySelector('.msg, .relato-texto');
  if (bolha) bolha.textContent = novoTexto;
}

const likeListeners = {}; // key -> função pra desligar o listener de curtidas

function removerPublicMsgDom(key){
  delete expiryMap[key];
  if (likeListeners[key]){ likeListeners[key](); delete likeListeners[key]; }
  const el = document.querySelector('#chatWindow [data-key="' + key + '"]');
  if (el) el.remove();
}

if (chatPublicoRef){
  chatPublicoRef.limitToLast(100).on('child_added', (snap) => renderPublicMsg(snap.key, snap.val()));
  chatPublicoRef.on('child_removed', (snap) => removerPublicMsgDom(snap.key));
  chatPublicoRef.on('child_changed', (snap) => atualizarTextoDom('chatWindow', snap.key, snap.val().texto));

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
  const texto = input.value.trim().slice(0, 200);
  const user = auth.currentUser;
  if (!texto || !chatPublicoRef || !user || !perfilAtual) return;
  input.value = '';
  const nome = perfilAtual.nick || perfilAtual.nome || 'visitante';

  // @menção: se o texto citar um @nome que já apareceu no chat, a mensagem
  // fica marcada como visível só pro remetente e pra pessoa marcada.
  const payload = { uid: user.uid, nome, texto, ts: Date.now() };
  const marcado = texto.match(/@([^\s@]+)/);
  if (marcado){
    const uidAlvo = nomeParaUid[chaveNome(marcado[1])];
    if (uidAlvo && uidAlvo !== user.uid){
      payload.mencionadoUid = uidAlvo;
      payload.mencionadoNome = marcado[1];
    }
  }

  chatPublicoRef.push(payload);

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

// Contador de caracteres ao vivo (chat público).
const chatCharCount = document.getElementById('chatCharCount');
document.getElementById('chatInput').addEventListener('input', function(){
  const max = this.maxLength;
  chatCharCount.textContent = this.value.length + '/' + max;
  chatCharCount.classList.toggle('limit', this.value.length >= max);
});

/* ---- painel de sugestão do @menção ---- */
const mentionPop = document.getElementById('mentionPop');
const chatInputEl = document.getElementById('chatInput');

function fecharMentionPop(){
  mentionPop.classList.add('hidden');
  mentionPop.innerHTML = '';
}

chatInputEl.addEventListener('input', () => {
  const valor = chatInputEl.value;
  const cursor = chatInputEl.selectionStart;
  const antesCursor = valor.slice(0, cursor);
  const m = antesCursor.match(/@([^\s@]*)$/);
  if (!m){ fecharMentionPop(); return; }

  const filtro = chaveNome(m[1]);
  const meuNome = perfilAtual ? chaveNome(perfilAtual.nick || perfilAtual.nome) : '';
  const candidatos = Object.keys(nomeExibicao)
    .filter(chave => chave !== meuNome && chave.startsWith(filtro))
    .map(chave => nomeExibicao[chave]);

  if (!candidatos.length){ fecharMentionPop(); return; }

  mentionPop.innerHTML = '';
  candidatos.slice(0, 6).forEach(nome => {
    const item = document.createElement('div');
    item.className = 'mention-pop-item';
    item.textContent = '@' + nome;
    item.addEventListener('click', () => {
      const inicioArroba = cursor - m[0].length;
      chatInputEl.value = valor.slice(0, inicioArroba) + '@' + nome + ' ' + valor.slice(cursor);
      fecharMentionPop();
      chatInputEl.focus();
    });
    mentionPop.appendChild(item);
  });
  mentionPop.classList.remove('hidden');
});

document.addEventListener('click', (e) => {
  if (!mentionPop.classList.contains('hidden') && !mentionPop.contains(e.target) && e.target !== chatInputEl){
    fecharMentionPop();
  }
});

/* ================= RELATOS ================= *
   Feed permanente (não expira) pra reportar bugs ou contar algo que
   aconteceu. Usa o mesmo sistema de curtidas do chat público. */
const relatosRef = firebaseReady ? db.ref('relatos/itens') : null;
const relatoLikeListeners = {};

function renderRelato(key, val){
  if (val.texto && val.texto.length > 500){
    if (relatosRef) relatosRef.child(key).remove();
    return;
  }
  const win = document.getElementById('relatosWindow');
  const isOwn = auth.currentUser && val.uid === auth.currentUser.uid;

  const row = document.createElement('div');
  row.className = 'msg-row relato-row';
  row.dataset.key = key;

  const card = document.createElement('div');
  card.className = 'relato-card';

  const head = document.createElement('div');
  head.className = 'relato-head';
  const av = document.createElement('div');
  av.className = 'mini-avatar';
  av.textContent = iniciais(val.nome);
  const nomeEl = document.createElement('span');
  nomeEl.className = 'nome';
  nomeEl.textContent = val.nome + (isOwn ? ' (você)' : '');
  const dataEl = document.createElement('span');
  dataEl.className = 'data';
  const d = new Date(val.ts || Date.now());
  dataEl.textContent = d.toLocaleDateString('pt-BR') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  head.appendChild(av);
  head.appendChild(nomeEl);
  head.appendChild(dataEl);

  const texto = document.createElement('div');
  texto.className = 'relato-texto';
  texto.textContent = val.texto;

  const col = document.createElement('div');
  col.className = 'msg-col';

  card.appendChild(head);
  card.appendChild(texto);
  col.appendChild(card);
  row.appendChild(col);
  win.appendChild(row);
  win.scrollTop = win.scrollHeight;

  const likesRef = relatosRef.child(key).child('curtidas');
  relatoLikeListeners[key] = ligarCurtidas(likesRef, texto, col, false);

  if (val.uid === 'bot'){
    // mensagem do próprio Sentinela, sem ações
  } else if (isOwn){
    ativarSegurarApagar(row, () => relatosRef.child(key).remove(), {
      textoAtual: val.texto,
      aoSalvarEdicao: (novoTexto) => relatosRef.child(key).update({ texto: novoTexto.slice(0, 500), editado: true })
    });
  } else {
    col.appendChild(criarBotaoBanir(val.uid, val.nome, val.texto));
  }
}

function removerRelatoDom(key){
  if (relatoLikeListeners[key]){ relatoLikeListeners[key](); delete relatoLikeListeners[key]; }
  const el = document.querySelector('#relatosWindow [data-key="' + key + '"]');
  if (el) el.remove();
}

if (relatosRef){
  relatosRef.limitToLast(200).on('child_added', (snap) => renderRelato(snap.key, snap.val()));
  relatosRef.on('child_removed', (snap) => removerRelatoDom(snap.key));
  relatosRef.on('child_changed', (snap) => atualizarTextoDom('relatosWindow', snap.key, snap.val().texto));
}

function enviarRelato(){
  if (isGuest){ exigirConta('enviar um relato'); return; }
  const input = document.getElementById('relatoInput');
  const texto = input.value.trim().slice(0, 500);
  const user = auth.currentUser;
  if (!texto || !relatosRef || !user || !perfilAtual) return;
  input.value = '';
  input.style.height = 'auto';
  relatoCharCount.textContent = '0/500';
  const nome = perfilAtual.nick || perfilAtual.nome || 'visitante';
  relatosRef.push({ uid: user.uid, nome, texto, ts: Date.now() });
}

/* Limpa todo o feed de relatos de uma vez. Depois de apagar tudo, o
   Sentinela publica um aviso confirmando que os relatos foram revisados. */
const btnLimparRelatos = document.getElementById('relatoLimparTudo');
const wipeRelatosModal = document.getElementById('wipeRelatosModal');
if (btnLimparRelatos && wipeRelatosModal){
  btnLimparRelatos.addEventListener('click', () => {
    if (isGuest){ exigirConta('gerenciar os relatos'); return; }
    if (!relatosRef) return;
    wipeRelatosModal.classList.remove('hidden');
  });
  document.getElementById('cancelWipeRelatosBtn').addEventListener('click', () => {
    wipeRelatosModal.classList.add('hidden');
  });
  document.getElementById('confirmWipeRelatosBtn').addEventListener('click', async () => {
    if (!relatosRef) return;
    const btn = document.getElementById('confirmWipeRelatosBtn');
    const spinner = document.getElementById('wipeRelatosSpinner');
    btn.disabled = true;
    if (spinner) spinner.classList.remove('hidden');
    try{
      await relatosRef.remove();
      await relatosRef.push({
        uid: 'bot', nome: 'Sentinela',
        texto: '🧹 Todos os relatos foram revisados e limpos agora. Se algo ainda precisar de atenção, é só relatar de novo!',
        ts: Date.now()
      });
    } finally {
      btn.disabled = false;
      if (spinner) spinner.classList.add('hidden');
      wipeRelatosModal.classList.add('hidden');
    }
  });
}

document.getElementById('relatoSend').addEventListener('click', enviarRelato);
const relatoInputEl = document.getElementById('relatoInput');
relatoInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); enviarRelato(); }
});
// Textarea cresce junto com o texto (até o limite definido no CSS).
relatoInputEl.addEventListener('input', function(){
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

const relatoCharCount = document.getElementById('relatoCharCount');
relatoInputEl.addEventListener('input', function(){
  const max = this.maxLength;
  relatoCharCount.textContent = this.value.length + '/' + max;
  relatoCharCount.classList.toggle('limit', this.value.length >= max);
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
  Object.values(privateLikeListeners).forEach(fn => fn());
  for (const k in privateLikeListeners) delete privateLikeListeners[k];
  privateListenerAtual = (snap) => renderPrivateMsg(snap.key, snap.val());
  privateRefAtual.on('child_added', privateListenerAtual);
  if (privateChangedListenerAtual) privateRefAtual.off('child_changed', privateChangedListenerAtual);
  privateChangedListenerAtual = (snap) => atualizarTextoDom('privateWindow', snap.key, snap.val().texto);
  privateRefAtual.on('child_changed', privateChangedListenerAtual);

  document.getElementById('privateModal').classList.remove('hidden');
}
let privateChangedListenerAtual = null;

const privateLikeListeners = {}; // key -> função pra desligar o listener de curtidas

function renderPrivateMsg(key, val){
  const win = document.getElementById('privateWindow');
  const isOwn = auth.currentUser && val.de === auth.currentUser.uid;
  const row = document.createElement('div');
  row.className = 'msg-row ' + (isOwn ? 'own' : 'other');
  row.dataset.key = key;
  const col = document.createElement('div');
  col.className = 'msg-col';
  const bubble = document.createElement('div');
  bubble.className = 'msg ' + (isOwn ? 'user' : 'bot');
  bubble.textContent = val.texto;
  col.appendChild(bubble);
  row.appendChild(col);
  win.appendChild(row);
  win.scrollTop = win.scrollHeight;

  if (privateRefAtual){
    const likesRef = privateRefAtual.child(key).child('curtidas');
    privateLikeListeners[key] = ligarCurtidas(likesRef, bubble, col, isOwn);
  }

  if (isOwn){
    const refAtual = privateRefAtual;
    ativarSegurarApagar(row, () => refAtual && refAtual.child(key).remove(), {
      textoAtual: val.texto,
      aoSalvarEdicao: (novoTexto) => refAtual && refAtual.child(key).update({ texto: novoTexto.slice(0, 200), editado: true })
    });
  } else if (privateOutroUid){
    const nomeOutro = (document.getElementById('privateNomeTitulo').textContent || '').replace('Conversa com ', '');
    col.appendChild(criarBotaoBanir(privateOutroUid, nomeOutro, val.texto));
  }
}

function enviarPrivada(){
  const input = document.getElementById('privateInput');
  const texto = input.value.trim().slice(0, 200);
  if (!texto || !privateRefAtual || !auth.currentUser) return;
  input.value = '';
  privateRefAtual.push({ de: auth.currentUser.uid, texto, ts: Date.now() });
}

document.getElementById('privateSend').addEventListener('click', enviarPrivada);
document.getElementById('privateInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') enviarPrivada();
});

// Contador de caracteres ao vivo (conversa privada).
const privateCharCount = document.getElementById('privateCharCount');
document.getElementById('privateInput').addEventListener('input', function(){
  const max = this.maxLength;
  privateCharCount.textContent = this.value.length + '/' + max;
  privateCharCount.classList.toggle('limit', this.value.length >= max);
});
document.getElementById('closePrivate').addEventListener('click', () => {
  document.getElementById('privateModal').classList.add('hidden');
  if (privateRefAtual && privateListenerAtual) privateRefAtual.off('child_added', privateListenerAtual);
  Object.values(privateLikeListeners).forEach(fn => fn());
  for (const k in privateLikeListeners) delete privateLikeListeners[k];
  privateRefAtual = null; privateListenerAtual = null;
});

/* ================= TAROT — DESBLOQUEIO PAGO =================
   O tarot fica atrás de um cadeado até a pessoa pagar R$ 1,00.
   O estado "pago" fica salvo em usuarios/{uid}/tarotPago no Firebase,
   então uma vez desbloqueado continua liberado nos próximos acessos.

   IMPORTANTE — isso ainda precisa da sua parte:
   Não dá pra cobrar de verdade sem ligar a um meio de pagamento real
   (Mercado Pago, PagSeguro, PIX, etc). Cole abaixo o link de cobrança
   de R$ 1,00 gerado por esse serviço (ex.: "Link de pagamento" do
   Mercado Pago). Configure lá a URL de retorno de sucesso apontando
   pra esta mesma página com "?tarot_pago=1" no final — assim, quando
   a pessoa pagar e voltar, o app libera o tarot sozinho. Sem esse
   link configurado, o botão avisa que ainda falta configurar. */
const TAROT_PAGAMENTO_LINK = ''; // <- cole aqui o link de pagamento (R$ 1,00)

const tarotLock = document.getElementById('tarotLock');
const tarotFrameEl = document.getElementById('tarotFrame');
const tarotPayBtn = document.getElementById('tarotPayBtn');
const tarotLockNote = document.getElementById('tarotLockNote');

function mostrarTarot(){
  const pago = !!(perfilAtual && perfilAtual.tarotPago);
  if (tarotLock) tarotLock.classList.toggle('hidden', pago);
  if (tarotFrameEl) tarotFrameEl.classList.toggle('hidden', !pago);
}

if (tarotPayBtn){
  tarotPayBtn.addEventListener('click', () => {
    if (!TAROT_PAGAMENTO_LINK){
      if (tarotLockNote) tarotLockNote.textContent = 'Pagamento ainda não configurado — fale com quem cuida do app.';
      return;
    }
    window.location.href = TAROT_PAGAMENTO_LINK;
  });
}

// Voltou do pagamento com sucesso (?tarot_pago=1): libera e salva no Firebase.
(function checarRetornoPagamentoTarot(){
  const params = new URLSearchParams(window.location.search);
  if (params.get('tarot_pago') !== '1' || !firebaseReady) return;
  window.history.replaceState({}, '', window.location.pathname);
  auth.onAuthStateChanged(async (user) => {
    if (!user || !db) return;
    await db.ref('usuarios/' + user.uid + '/tarotPago').set(true);
    if (perfilAtual) perfilAtual.tarotPago = true;
    mostrarTarot();
  });
})();

/* ================= TAROT — IFRAME ==================
   O conteúdo do Tarot vive em tarot.html, carregado via iframe
   dentro de #panelTarot. Aqui só escutamos a altura real da página
   para o iframe crescer/encolher sem barra de rolagem dupla. */
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'tarotHeight') {
    const frame = document.getElementById('tarotFrame');
    if (frame) frame.style.height = Math.max(600, event.data.height) + 'px';
  }
});
