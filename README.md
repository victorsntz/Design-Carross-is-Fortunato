# Criador de Carrosséis

Editor web para montar carrosséis no formato da metodologia: **comparação → desenvolvimento → final**.
O design já vem pronto e travado — quem usa só troca fotos, vídeos e textos apertando botões.
Nada de arrastar elementos: a diagramação nunca quebra.

## O que dá pra fazer

- **5 tipos de slide** com o design fixo do formato:
  - **Tela partida** — duas fotos e dois textos no mesmo slide (o par de comparação),
    cada metade com sua moldura tracejada
  - **Foto de fundo** — foto ou vídeo inteiro + frase curta com sombra de contraste
  - **Desenvolvimento** — fundo preto + parágrafos + frase de fechamento em negrito
  - **Livro / Oferta** — imagem do produto centralizada + texto
  - **Final (CTA)** — texto "Me segue se…" à esquerda + foto à direita
- **Tudo por botões**: trocar mídia, aumentar/diminuir texto (5 tamanhos), posição do texto,
  reordenar, duplicar e excluir slides.
- **Colar imagem sem baixar**: copiou uma imagem (no Google, por exemplo)? O botão
  **"Colar imagem"** joga a imagem direto no espaço certo do slide. Ctrl+V também funciona.
  No celular: toque e segure a imagem → "Copiar imagem" → botão "Colar imagem".
- **Vídeo direto no slide**: sobe o vídeo, ele vira o fundo do slide, e o app exporta o
  vídeo pronto com a arte (textos, borda, granulado) por cima — sem precisar de Figma + editor.
- **Exportações**:
  - PNG 1080×1350 por slide, ou todos de uma vez em ZIP
  - Vídeo do slide com o áudio original (MP4 no Chrome; WebM em navegadores sem
    suporte a MP4); trocar de aba pausa a gravação e ela retoma quando você volta
  - Arte transparente (PNG sem a mídia) pra compor sobre vídeo em qualquer editor
- **Mini-formatação nos textos**: `**negrito**`, `*itálico*`, `_sublinhado_`.
  Linha em branco separa parágrafos.
- **Projeto salvo sozinho** no navegador, e dá pra baixar/abrir o projeto como arquivo `.json`
  (vídeos não ficam salvos no projeto — só valem na sessão atual).

## Rodando localmente

```bash
npm install
npm run dev
```

## Publicando no GitHub Pages

O deploy é automático: todo push na branch principal roda o workflow
`.github/workflows/deploy.yml`, que compila o site e publica na branch
`gh-pages` — em repositório público o GitHub Pages ativa sozinho a partir
dela. Se as Settings do Pages forem alteradas algum dia, o esperado é
**Settings → Pages → Deploy from a branch → gh-pages**.

## Stack

- React + TypeScript + Vite (100% no navegador, sem servidor)
- `modern-screenshot` para gerar os PNGs a partir do slide renderizado
- `MediaRecorder` + canvas para a exportação de vídeo
- Fonte: Tinos (serifada, métrica de Times New Roman), embarcada via Fontsource
