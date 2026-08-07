# Padrões estéticos por cliente

Cada arquivo aqui é o padrão visual de um login, publicado junto do site.
No primeiro acesso daquela pessoa o Criador aplica tudo sozinho — ela abre
e já está com a cara do carrossel dela, sem configurar nada.

    estilos/<usuario>.json

O `<usuario>` é o mesmo nome de `usuarios.json`.

## Como se monta

Estes padrões são feitos por nós, no estúdio, a partir do design que o
cliente já usa (normalmente um arquivo do Figma). Não é função do produto:
quem entra no Criador não precisa nem saber que isto existe.

Dois caminhos:

1. Montar o carrossel modelo no próprio Criador, clicar em **Salvar este
   como padrão** e depois em **Baixar padrão** — o .json baixado é este
   arquivo.
2. Escrever o .json à mão a partir do design de referência.

## O que o arquivo guarda

```json
{
  "font": "serif | sans | custom",
  "customFont": { "name": "Nome da fonte", "dataUrl": "data:font/..." },
  "captionLeft": "ASSINATURA\nDA ESQUERDA",
  "captionRight": "ASSINATURA\nDA DIREITA",
  "palette": { "bg": "#0b0b0b", "text": "#ffffff", "caption": "#f2f2f2" },
  "tipos": {
    "split":       { "sizeStep": 2, "lineHeight": 1.3,  "letterSpacing": 0 },
    "development": { "sizeStep": 2, "lineHeight": 1.5 },
    "final":       { "sizeStep": 4 },
    "photoTop":    { "sizeStep": 2 }
  }
}
```

Tudo é opcional: o que faltar fica no padrão da casa. `sizeStep` conta de 0
(menor) até o máximo do tipo; `lineHeight` vai de 1.0 a 1.6;
`letterSpacing` de -0.06 a 0.06 em em.

## Regra de precedência

O padrão publicado aqui é o **ponto de partida**. Se a pessoa salvar um
padrão próprio dentro do app, o dela passa a valer — o arquivo daqui não
sobrescreve o trabalho dela depois.
