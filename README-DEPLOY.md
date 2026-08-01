# Como publicar essa versão

Não consigo rodar `npm install` nem `firebase deploy` daqui (sem acesso
à internet neste ambiente), então o código está pronto mas **você
precisa publicá-lo**. É rápido:

## 1. Instalar as ferramentas (uma vez só)
```bash
npm install -g firebase-tools
firebase login
```

## 2. Configurar o EmailJS pro backend (Cloud Function)
No painel do EmailJS (Account → API Keys) pegue a **Private Key** e rode:
```bash
firebase functions:config:set \
  emailjs.service_id="service_di1xxsi" \
  emailjs.template_id="template_yc3ld0p" \
  emailjs.public_key="A2Pfc5yt0mFKs4kCV" \
  emailjs.private_key="SUA_PRIVATE_KEY_AQUI"
```
(os 3 primeiros valores já são os mesmos que estavam no script.js original —
só a Private Key é nova, e ela nunca deve aparecer no código do site.)

## 3. Instalar as dependências das functions
```bash
cd functions
npm install
cd ..
```

## 4. Publicar tudo
```bash
firebase deploy
```
Isso publica: Hosting (o site), Realtime Database Rules e as Cloud Functions.

Se preferir publicar por partes:
```bash
firebase deploy --only database   # só as regras
firebase deploy --only functions  # só o backend
firebase deploy --only hosting    # só o site
```

## 5. Testar antes de ir pra produção (opcional, recomendado)
```bash
firebase emulators:start
```
Isso sobe Auth, Database e Functions localmente pra você testar
cadastro, verificação de e-mail, chat, denúncia/banimento e o Tarot
pago sem mexer nos dados reais.

## Sobre o app Android (cartomancia.apk)
O `.apk` enviado provavelmente é só um "wrapper" (WebView) que abre o
site publicado. Ele não teve mudança nenhuma aqui — as correções de
segurança valem automaticamente pra ele também assim que você publicar
o site, já que ele carrega o mesmo `index.html`/`script.js` pela
internet. Se ele foi gerado por alguma ferramenta (ex.: PWABuilder,
Median, GoNative), não precisa gerar de novo, a não ser que você
queira atualizar ícone/nome/versão.
