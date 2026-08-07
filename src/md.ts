import type { Slide, SlideType } from './types'
import { makeSlide } from './state'

/**
 * Leitor dos .md de roteiro.
 *
 * A regra que organiza tudo: o documento mistura duas coisas — a
 * ORIENTAÇÃO (o que é cada slide, onde vai cada texto) e o TEXTO que sai
 * publicado. O leitor separa as duas.
 *
 * É orientação: o título do slide e o que vem entre parênteses nele, os
 * rótulos "Texto de cima:", "Baixo:", "Esquerda:", as seções de notas de
 * produção e a legenda do post.
 *
 * É texto publicável: o que está dentro dos blocos de código ``` — que é
 * como os roteiros já marcam o que vai no ar (é o bloco com botão de
 * copiar). Havendo blocos no slide, SÓ eles viram texto; o resto é
 * instrução e fica de fora.
 *
 * Sem blocos de código, o leitor cai no formato simples: o texto depois
 * do rótulo, ou os parágrafos soltos.
 */

export interface ResultadoImportacao {
  titulo: string
  slides: Slide[]
  captionLeft?: string
  captionRight?: string
  /** O que o leitor deduziu ou deixou de fora, pra pessoa conferir. */
  avisos: string[]
}

const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Seções que existem no roteiro mas não são slides. */
const SECAO_IGNORADA =
  /^(legenda|nota|notas|observ|refer|fonte|fontes|checklist|status|estrutura|briefing|copy do post)\b|nao publicar/

/** Tipo do slide escrito no título ("SLIDE 5 (desenvolvimento)"). */
function tipoDoTitulo(titulo: string): { type: SlideType; vertical?: boolean } | null {
  const t = semAcento(titulo)
  if (/(em pe|vertical|lado a lado|colunas|duas colunas)/.test(t)) {
    return { type: 'split', vertical: true }
  }
  if (/(tela partida|partida|comparativ|comparacao|par de|antes e depois)/.test(t)) {
    return { type: 'split' }
  }
  if (/(desenvolvimento\s*3|\bdev\s*3\b|\bd3\b|foto (em|de) cima|foto deitada|imagem em cima)/.test(t)) {
    return { type: 'photoTop' }
  }
  if (
    /(desenvolvimento\s*2|\bdev\s*2\b|\bd2\b|respiro|foto (a|na|à) direita|\bfinal\b|fechamento|encerramento|conclusao|convite|\bcta\b|chamada|newsletter|me segue)/.test(
      t,
    )
  ) {
    return { type: 'final' }
  }
  if (/(desenvolvimento|\bdev\s*1\b|\bd1\b|foto de fundo|texto corrido|\btexto\b)/.test(t)) {
    return { type: 'development' }
  }
  return null
}

/** Tira do texto o que o slide não sabe mostrar. */
function limpaTexto(linha: string): string {
  return linha
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/__([^_\n]+)__/g, '**$1**')
    .trimEnd()
}

/** Fora dos blocos de código, também some a marcação de lista e citação. */
function limpaLinhaSolta(linha: string): string {
  return limpaTexto(
    linha
      .replace(/^\s*>\s?/, '')
      .replace(/^\s*[-*+]\s+/, '')
      .replace(/^\s*\d+[.)]\s+/, '')
      .replace(/`([^`]+)`/g, '$1'),
  )
}

const PALAVRAS_A =
  /^(cima|topo|em cima|acima|esquerda|lado a|lado esquerdo|coluna da esquerda|antes|primeiro|a)$/
const PALAVRAS_B =
  /^(baixo|embaixo|abaixo|direita|lado b|lado direito|coluna da direita|depois|segundo|b)$/

/**
 * Reconhece a linha que só diz ONDE o texto vai — "Texto de cima:",
 * "**Baixo:**", "Esquerda:", "Lado A —". Ela é orientação, não conteúdo:
 * some do slide e manda o que vem depois pra metade certa.
 */
function rotuloDaLinha(linha: string): { lado: 'a' | 'b'; resto: string } | null {
  const t = linha.trim().replace(/^[-*+>\s]+/, '')
  if (t === '') return null
  const m = /^(.{1,42}?)\s*[:\-–—]\s*(.*)$/.exec(t)
  if (!m) return null
  const alvo = semAcento(m[1])
    .replace(/[*_`#]/g, '')
    .replace(/^texto\s+(de|da|do|na|no|pra|para)\s+/, '')
    .replace(/^(frase|bloco|parte)\s+(de|da|do)\s+/, '')
    .trim()
  const resto = m[2].trim().replace(/^\*+/, '').replace(/\*+$/, '').trim()
  if (PALAVRAS_A.test(alvo)) return { lado: 'a', resto }
  if (PALAVRAS_B.test(alvo)) return { lado: 'b', resto }
  return null
}

const eRegua = (l: string) => /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)

/** Junta as linhas em parágrafos (linha em branco separa). */
function emParagrafos(linhas: string[]): string[] {
  const paras: string[] = []
  let atual: string[] = []
  for (const l of linhas) {
    if (l.trim() === '') {
      if (atual.length) paras.push(atual.join('\n'))
      atual = []
    } else {
      atual.push(l)
    }
  }
  if (atual.length) paras.push(atual.join('\n'))
  return paras.map((p) => p.trim()).filter((p) => p !== '')
}

interface Parte {
  lado: 'a' | 'b' | null
  texto: string
}

/**
 * Separa um slide em partes de texto, respeitando os rótulos e os blocos
 * de código. Havendo blocos, só eles contam.
 */
function partesDoSlide(linhas: string[]): { partes: Parte[]; comBloco: boolean } {
  const blocos: Parte[] = []
  const soltas: { lado: 'a' | 'b' | null; linhas: string[] }[] = [
    { lado: null, linhas: [] },
  ]
  let dentro = false
  let buffer: string[] = []
  let rotuloAtual: 'a' | 'b' | null = null

  for (const bruta of linhas) {
    if (/^\s*```/.test(bruta)) {
      if (dentro) {
        const texto = emParagrafos(buffer).join('\n\n')
        if (texto) blocos.push({ lado: rotuloAtual, texto })
        buffer = []
        rotuloAtual = null
        dentro = false
      } else {
        dentro = true
        buffer = []
      }
      continue
    }
    if (dentro) {
      buffer.push(limpaTexto(bruta))
      continue
    }
    const r = rotuloDaLinha(bruta)
    if (r) {
      rotuloAtual = r.lado
      soltas.push({ lado: r.lado, linhas: r.resto ? [limpaTexto(r.resto)] : [] })
      continue
    }
    // régua entre slides não é conteúdo
    if (eRegua(bruta)) continue
    soltas[soltas.length - 1].linhas.push(limpaLinhaSolta(bruta))
  }
  if (dentro) {
    const texto = emParagrafos(buffer).join('\n\n')
    if (texto) blocos.push({ lado: rotuloAtual, texto })
  }

  if (blocos.length > 0) return { partes: blocos, comBloco: true }
  const partes = soltas
    .map((s) => ({ lado: s.lado, texto: emParagrafos(s.linhas).join('\n\n') }))
    .filter((s) => s.texto !== '')
  return { partes, comBloco: false }
}

/** As duas metades da tela partida, a partir das partes já separadas. */
function metades(partes: Parte[], linhas: string[]): [string, string] | null {
  const a = partes.filter((p) => p.lado === 'a').map((p) => p.texto)
  const b = partes.filter((p) => p.lado === 'b').map((p) => p.texto)
  if (a.length && b.length) return [a.join('\n\n'), b.join('\n\n')]

  const semLado = partes.filter((p) => p.lado === null)
  if (semLado.length === 2) return [semLado[0].texto, semLado[1].texto]

  // uma parte só: tenta a régua no meio, ou dois parágrafos
  if (semLado.length === 1) {
    const corte = linhas.findIndex(eRegua)
    if (corte > 0) {
      const cima = emParagrafos(linhas.slice(0, corte).map(limpaLinhaSolta)).join('\n\n')
      const baixo = emParagrafos(linhas.slice(corte + 1).map(limpaLinhaSolta)).join('\n\n')
      if (cima && baixo) return [cima, baixo]
    }
    const paras = semLado[0].texto.split('\n\n')
    if (paras.length === 2) return [paras[0], paras[1]]
  }
  return null
}

/** Sem tipo escrito, o formato do conteúdo entrega qual é. */
function deduzTipo(partes: Parte[], linhas: string[]): { type: SlideType } {
  const temRotulo = partes.some((p) => p.lado !== null)
  if (temRotulo) return { type: 'split' }
  if (partes.length === 2 && partes.every((p) => p.texto.length <= 220)) {
    return { type: 'split' }
  }
  if (partes.length === 1 && linhas.some(eRegua) && partes[0].texto.length <= 440) {
    const m = metades(partes, linhas)
    if (m) return { type: 'split' }
  }
  const total = partes.map((p) => p.texto).join(' ')
  const paras = total.split('\n\n').filter((p) => p.trim() !== '')
  if (paras.length === 1 && total.length <= 180) return { type: 'final' }
  return { type: 'development' }
}

function montaSlide(
  tipo: { type: SlideType; vertical?: boolean },
  partes: Parte[],
  linhas: string[],
  avisos: string[],
  rotulo: string,
): Slide | null {
  const corpo = partes
    .map((p) => p.texto)
    .filter((t) => t !== '')
    .join('\n\n')
  if (corpo.trim() === '') return null

  const slide = makeSlide(tipo.type)
  if (slide.type === 'split') {
    if (tipo.vertical) slide.orientation = 'vertical'
    const m = metades(partes, linhas)
    if (m) {
      slide.top.text = m[0]
      slide.bottom.text = m[1]
    } else {
      slide.top.text = corpo
      slide.bottom.text = ''
      avisos.push(
        `${rotulo}: não achei as duas metades. Marque com "Texto de cima:" e ` +
          `"Texto de baixo:" (ou deixe dois blocos, um pra cada).`,
      )
    }
    return slide
  }
  if (slide.type === 'photoTop') {
    const paras = corpo.split('\n\n')
    const [primeiro, ...resto] = paras
    const curto = primeiro.length <= 120 && !primeiro.includes('\n')
    const jaDestacado = /^(==|\*\*)/.test(primeiro.trim())
    slide.body =
      curto && !jaDestacado && resto.length > 0
        ? [`==**${primeiro.trim()}**==`, ...resto].join('\n\n')
        : corpo
    return slide
  }
  if (slide.type === 'development' || slide.type === 'book') {
    slide.body = corpo
    return slide
  }
  slide.text = corpo
  return slide
}

/**
 * Ritmo de tipos do cliente: quando o roteiro não diz qual é o slide, a
 * sequência do padrão dele manda. O tipo escrito no título sempre vence.
 */
export interface OpcoesLeitura {
  sequencia?: SlideType[]
}

export function lerMarkdown(
  fonte: string,
  opcoes: OpcoesLeitura = {},
): ResultadoImportacao {
  const avisos: string[] = []
  const linhas = fonte.replace(/\r\n?/g, '\n').split('\n')

  // Nível de título que separa os slides: o menor que se repete. Um "#"
  // sozinho no começo é o nome do carrossel, não um slide.
  const nivel = (l: string) => {
    const m = /^(#{1,6})\s+/.exec(l)
    return m ? m[1].length : 0
  }
  const contagem = [0, 0, 0, 0, 0, 0, 0]
  let emBloco = false
  for (const l of linhas) {
    if (/^\s*```/.test(l)) emBloco = !emBloco
    else if (!emBloco) contagem[nivel(l)]++
  }
  let nivelSlide = 0
  for (let n = 1; n <= 6; n++) {
    if (contagem[n] >= 2) {
      nivelSlide = n
      break
    }
  }
  if (nivelSlide === 0) {
    for (let n = 2; n <= 6; n++) {
      if (contagem[n] === 1) {
        nivelSlide = n
        break
      }
    }
  }

  let titulo = ''
  let captionLeft: string | undefined
  let captionRight: string | undefined
  const blocos: { titulo: string; linhas: string[] }[] = []
  const preambulo: string[] = []
  let atual: { titulo: string; linhas: string[] } | null = null
  emBloco = false

  for (const bruta of linhas) {
    if (/^\s*```/.test(bruta)) emBloco = !emBloco
    const n = emBloco ? 0 : nivel(bruta)
    const texto = bruta.replace(/^#{1,6}\s+/, '').trim()

    if (n > 0 && nivelSlide > 0 && n === nivelSlide) {
      if (atual) blocos.push(atual)
      atual = { titulo: texto, linhas: [] }
      continue
    }
    if (n > 0 && n < nivelSlide && titulo === '' && !atual) {
      titulo = texto.replace(/^carrossel\s*[:\-–—]\s*/i, '')
      continue
    }
    if (n > 0 && n > nivelSlide && atual) {
      // subtítulo dentro do slide vira abertura em destaque
      atual.linhas.push('', `==**${limpaTexto(texto)}**==`, '')
      continue
    }
    if (n > 0 && !atual) {
      // título fora de slide antes do primeiro: orientação geral, não entra
      preambulo.push(texto)
      continue
    }
    if (atual) atual.linhas.push(bruta)
    else preambulo.push(bruta)
  }
  if (atual) blocos.push(atual)

  for (const l of preambulo) {
    const mEsq = /^\s*\**\s*assinatura\s*(da\s*)?(esquerda|esq)\s*\**\s*[:\-–—]\s*(.+)$/i.exec(l)
    const mDir = /^\s*\**\s*assinatura\s*(da\s*)?(direita|dir)\s*\**\s*[:\-–—]\s*(.+)$/i.exec(l)
    const mTit = /^\s*\**\s*(titulo|título)\s*\**\s*[:\-–—]\s*(.+)$/i.exec(l)
    if (mEsq) captionLeft = mEsq[3].trim().replace(/\s*\|\s*/g, '\n')
    else if (mDir) captionRight = mDir[3].trim().replace(/\s*\|\s*/g, '\n')
    else if (mTit && titulo === '') titulo = mTit[2].trim()
  }

  // Documento sem título de slide nenhum: a régua vira o separador
  if (blocos.length === 0) {
    const corpo = preambulo.join('\n')
    const partes = corpo
      .split(/^\s*-{3,}\s*$/m)
      .map((p) => p.trim())
      .filter((p) => p !== '')
    if (partes.length > 1) {
      partes.forEach((p, i) =>
        blocos.push({ titulo: `Slide ${i + 1}`, linhas: p.split('\n') }),
      )
    } else if (corpo.trim() !== '') {
      blocos.push({ titulo: 'Slide 1', linhas: corpo.split('\n') })
      avisos.push(
        'Não achei títulos de slide no arquivo, então tudo virou um slide só. ' +
          'Use "## Slide 1", "## Slide 2"… pra separar.',
      )
    }
  }

  const slides: Slide[] = []
  const ignoradas: string[] = []
  blocos.forEach((bloco, i) => {
    const chave = semAcento(bloco.titulo).replace(/^[^a-z]*/, '')
    if (SECAO_IGNORADA.test(chave)) {
      ignoradas.push(bloco.titulo.trim())
      return
    }
    const rotulo = bloco.titulo.trim() || `Slide ${i + 1}`
    const { partes } = partesDoSlide(bloco.linhas)
    if (partes.length === 0) return
    const escrito = tipoDoTitulo(bloco.titulo)
    // Ordem de decisão: o que está escrito > o ritmo do cliente > o palpite
    const doRitmo = opcoes.sequencia?.[slides.length]
    const tipo = escrito ?? (doRitmo ? { type: doRitmo } : deduzTipo(partes, bloco.linhas))
    if (!escrito && !doRitmo) {
      const nomes: Record<SlideType, string> = {
        split: 'tela partida',
        comparison: 'foto de fundo',
        development: 'Desenvolvimento 1',
        book: 'livro',
        final: 'Desenvolvimento 2',
        photoTop: 'Desenvolvimento 3',
      }
      avisos.push(`${rotulo}: sem tipo escrito, usei ${nomes[tipo.type]}.`)
    }
    const slide = montaSlide(tipo, partes, bloco.linhas, avisos, rotulo)
    if (slide) slides.push(slide)
  })

  if (ignoradas.length > 0) {
    avisos.push(`Fora do carrossel (é orientação, não slide): ${ignoradas.join(', ')}.`)
  }

  return { titulo: titulo.trim(), slides, captionLeft, captionRight, avisos }
}

/** Arquivo de exemplo, pra quem abrir o botão saber o que escrever. */
export const MODELO_MD = `# Nome do carrossel

Assinatura esquerda: SUA ASSINATURA | DA SÉRIE
Assinatura direita: BRANDING, ESTRATÉGIA | E DIREÇÃO CRIATIVA

## SLIDE 1 (comparativo)

**Texto de cima:**
\`\`\`
O dado mais forte que você tem, curto e verificável.
\`\`\`

**Texto de baixo:**
\`\`\`
O contraste que faz a percepção virar.
\`\`\`

---

## SLIDE 2 (comparativo em pé)

**Texto de cima:**
\`\`\`
A primeira imagem da comparação, à esquerda.
\`\`\`

**Texto de baixo:**
\`\`\`
A segunda, à direita.
\`\`\`

---

## SLIDE 3 (desenvolvimento)

\`\`\`
O texto corrido entra aqui, em parágrafos curtos de duas ou três linhas.

Linha em branco separa parágrafos. Use **negrito**, *itálico* e ==frase maior== à vontade.
\`\`\`

---

## SLIDE 4 (desenvolvimento 3)

\`\`\`
A frase de abertura, curta e forte.

O corpo do texto vem depois dela, embaixo da foto deitada.
\`\`\`

---

## SLIDE 5 (CTA)

\`\`\`
Me segue se você acha que este assunto merece mais atenção do que vem recebendo.
\`\`\`

---

## LEGENDA

\`\`\`
Esta seção não vira slide: o leitor sabe que legenda e notas de produção
são orientação, não texto do carrossel.
\`\`\`

---

## NOTAS DE PRODUÇÃO (não publicar)

**Estrutura:** o que está aqui embaixo também fica de fora do carrossel.
`
