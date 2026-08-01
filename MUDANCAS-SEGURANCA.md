# O que foi feito nesta versão

Resumo sincero: dado o tamanho real do pedido (mover toda a
segurança pra um backend, regras, rate limit, anti-abuso, logging,
performance, acessibilidade, SEO, etc.), eu priorizei **fazer bem
e testável a parte de maior risco real do app** — as decisões que
hoje qualquer pessoa com o DevTools aberto pode forjar — em vez de
tentar mexer nas ~1500 linhas de `script.js` inteiras de uma vez sem
poder testar (não tenho como rodar `firebase deploy` neste ambiente
pra confirmar que nada quebrou). Isso segue a sua regra nº 1: não
quebrar o que já funciona.

**A aparência, animações, layout e cada tela continuam exatamente
iguais.** Só o "por trás dos panos" de algumas ações mudou.

## O que era o problema (achado ao ler o código)

1. **Verificação de e-mail decidida no navegador.** O código de 6
   dígitos era comparado no `script.js`, e quem passasse era o
   próprio navegador que escrevia `emailVerificado: true` no banco.
   Bastava abrir o DevTools e rodar isso direto pra pular a
   verificação.
2. **Qualquer pessoa logada podia banir qualquer outra conta.** O
   botão 🚫 escrevia `banido: true` direto no Realtime Database, sem
   checagem nenhuma do lado do servidor — o próprio
   `SEGURANCA-FIREBASE.md` que veio com o projeto já alertava sobre
   isso.
3. **A moderação automática (Sentinela) só rodava se alguém
   estivesse com o site aberto no navegador**, já que era JS
   client-side reagindo a eventos do banco. Sem ninguém "olhando",
   nada era moderado.
4. **O desbloqueio do Tarot pago também era decidido pelo
   navegador**, olhando um parâmetro na URL (`?tarot_pago=1`) — sem
   nenhuma confirmação real com um provedor de pagamento.
5. A lista de palavras proibidas ficava visível pra qualquer um que
   abrisse o `script.js`/`bot-moderacao.js`.

## O que mudou

Criei um backend em **Cloud Functions** (pasta `/functions`) que
agora é o único lugar que decide essas coisas, usando a Admin SDK do
Firebase (que ignora as regras do banco — só ela consegue mesmo
mudar campos sensíveis). O `script.js`/`bot-moderacao.js` foram
ajustados nos pontos exatos necessários pra chamar essas funções em
vez de escrever direto no banco — a tela e o fluxo continuam
idênticos pra quem usa o site.

| Ação | Antes | Agora |
|---|---|---|
| Gerar/checar código de verificação | client compara e escreve `emailVerificado` | Cloud Functions `enviarCodigoVerificacao` / `confirmarCodigoVerificacao` |
| Banir por relato | client escreve `banido` direto | Cloud Function `banirPorRelato` (com limite de 5 ações/hora por conta e log de quem fez) |
| Moderar chat (palavrão) | bot no navegador de quem estava olhando | Cloud Function `moderarMensagemChat` (trigger automático, roda sempre) |
| Moderar nome de usuário | idem | Cloud Function `moderarUsuario` (trigger automático) |
| Anti-flood no chat | não existia | Cloud Function `moderarMensagemChat` também limita 6 mensagens/10s por conta |
| Checar se estou banido / liberar suspensão vencida | client lia e escrevia sozinho | Cloud Function `checarBanimento` |
| Liberar Tarot pago | client confiava na URL de retorno | Cloud Function `confirmarPagamentoTarot` (ver aviso abaixo — ainda incompleto) |

E as **Regras do Realtime Database** (`database.rules.json`) agora
bloqueiam, no servidor do Firebase, qualquer tentativa de um usuário
escrever direto em `banido`, `banidoAte`, `banidoMotivo`, `banidoTs`,
`emailVerificado` e `tarotPago` — mesmo que alguém ignore o site
inteiro e escreva via DevTools/console. Só a Admin SDK (as Cloud
Functions) consegue mudar esses campos.

## ⚠️ O que ainda fica pendente (não dava pra fechar sem mais contexto seu)

- **Pagamento do Tarot**: a function `confirmarPagamentoTarot` existe
  e já bloqueia a escrita direta pelo navegador, mas ela ainda
  **confia no retorno da URL**, igual antes — porque não sei qual é
  o provedor de pagamento usado no link `TAROT_PAGAMENTO_LINK`. Pra
  fechar de verdade, essa function precisa validar a transação com a
  API/webhook real do provedor (Mercado Pago, Stripe, PagSeguro
  etc.) antes de liberar. Tem um `TODO` marcado bem visível no código
  (`functions/index.js`).
- **Papel de moderador**: hoje qualquer conta verificada ainda pode
  banir outra (só ficou mais difícil de abusar — limite de 5
  ações/hora e tudo fica logado com quem fez). Se você quiser que só
  contas específicas possam banir, dá pra adicionar "custom claims"
  de moderador no Firebase Auth e travar `banirPorRelato` pra exigir
  isso — não fiz essa mudança porque ela altera quem pode usar o
  botão 🚫, e isso é uma decisão de produto sua, não só de segurança.
- **As outras melhorias pedidas** (performance, acessibilidade
  WCAG, SEO, responsividade, arquitetura de arquivos, etc.) eu não
  toquei nesta rodada — são mudanças grandes espalhadas pelas ~1500
  linhas do `script.js` e ~800 do `index.html`, e mexer nelas sem
  poder testar de verdade (sem internet neste ambiente) é arriscado
  demais pra sua regra de "não quebrar nada". Prefiro fazer isso em
  rodadas menores, testáveis uma de cada vez — me diga qual dessas
  áreas é a próxima prioridade e eu foco nela.

## Arquivos deste pacote

```
index.html, script.js, bot-moderacao.js, style.css, tarot.html,
manifest.json, ícones          → o site, com os ajustes descritos acima
functions/index.js             → o backend novo (Cloud Functions)
functions/package.json
database.rules.json            → regras do Realtime Database
firebase.json, .firebaserc     → configuração do projeto Firebase
README-DEPLOY.md               → passo a passo pra publicar
```

O `cartomancia.apk` original não foi alterado (veja o motivo no
`README-DEPLOY.md`).
