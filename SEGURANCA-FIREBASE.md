# Segurança do Firebase — leia antes de usar o bot em produção

O Sentinela (bot de moderação) roda inteiramente no navegador de quem
visita o site. Isso é suficiente pra maioria das pessoas, mas alguém
com conhecimento técnico pode abrir o DevTools e escrever direto no
Firebase, ignorando o bot. A única forma de bloquear isso de verdade
é com **Regras de Segurança do Realtime Database**, que rodam no
servidor do Firebase e ninguém consegue burlar pelo navegador.

## Onde configurar

Console do Firebase → seu projeto (`chatt-4bfcd`) → **Realtime Database**
→ aba **Regras**.

## Regras sugeridas

```json
{
  "rules": {
    "usuarios": {
      "$uid": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $uid && !(data.child('banido').val() === true)"
      }
    },
    "chatPublico": {
      "mensagens": {
        ".read": "auth != null",
        "$msgId": {
          ".write": "auth != null && (!data.exists() || data.child('uid').val() === auth.uid) && root.child('usuarios').child(auth.uid).child('banido').val() !== true"
        }
      }
    },
    "avisos": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null"
      }
    },
    "sentinelaVerificadas": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

O que isso garante:

- Uma conta marcada como `banido: true` não consegue mais escrever
  em `usuarios/{uid}` nem mandar mensagem em `chatPublico`, mesmo
  escrevendo direto pelo console do navegador.
- Cada pessoa só consegue editar o próprio perfil, nunca o de outra.
- Cada pessoa só lê os próprios avisos.

Ajuste os caminhos (`chatsPrivados`, `relatos`, `verificacoes` etc.)
seguindo a mesma lógica antes de publicar de verdade — o exemplo
acima cobre só as partes que o Sentinela usa.

## Novidades: banir pelo ícone 🚫 e relatos com prazo

Agora qualquer pessoa pode denunciar uma mensagem de outra e, depois
da análise do Sentinela, banir por **1 dia** (`banidoAte` = timestamp
futuro) ou **permanente** (`banidoAte` = null). Isso grava em dois
lugares novos:

- `usuarios/{uidDenunciado}/banidoAte` — some campo extra dentro do
  mesmo nó de `usuarios`, já coberto pela regra acima.
- `relatosModeracao/{id}` — histórico de quem denunciou quem e por quê.
  Sugestão de regra: `".read": "auth != null", ".write": "auth != null"`.

**Atenção, mesma limitação de sempre:** como o app é 100% client-side,
o clique em "Banir" roda no navegador de quem denuncia — ou seja, é a
conta de quem denuncia que precisa ter permissão de escrever no
`usuarios/{uidDenunciado}` de OUTRA pessoa. A regra de exemplo lá em
cima (`auth.uid === $uid`) impede isso por segurança. Pra esse botão
funcionar de verdade contra alguém malicioso, o ideal é mover a ação
de banir para uma **Cloud Function** (o app manda só o relato, e uma
function do lado do servidor decide e bane). Sem isso, o botão de
banir funciona normalmente entre usuários de boa-fé, mas alguém com
DevTools poderia tentar bloquear o próprio banimento.
