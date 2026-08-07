import type { Slide, SlideType } from './types'
import { makeSlide } from './state'

/**
 * Leitor dos .md de roteiro: transforma o texto do documento nos slides
 * do carrossel.
 *
 * O formato é o que já se escreve naturalmente — um título por slide e o
 * conteúdo embaixo:
 *
 *   # Nome do carrossel
 *
 *   ## Slide 1 — tela partida
 *   Cima: a primeira metade
 *   Baixo: a segunda metade
 *
 *   ## Slide 2 — desenvolvimento 1
 *   Primeiro parágrafo.
 *
 *   Segundo parágrafo.
 *
 * Nada disso é obrigatório: sem o tipo escrito no título, o leitor deduz
 * pelo formato do conteúdo. A ideia é aceitar o documento como ele já
 * vem, não obrigar ninguém a decorar marcação.
 */

export interface ResultadoImportacao {
  titulo: string
  slides: Slide[]
  captionLeft?: string
  captionRight?: string
  /** O que o leitor deduziu sozinho, pra pessoa conferir depois. */
  avisos: string[]
}

const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Tipo do slide escrito no título ("Slide 3 — desenvolvimento 2"). */
function tipoDoTitulo(
  titulo: string,
): { type: SlideType; vertical?: boolean } | null {
  const t = semAcento(titulo)
  if (/(em pe|vertical|lado a lado|colunas|duas colunas)/.test(t)) {
    return { type: 'split', vertical: true }
  }
  if (/(tela partida|partida|comparativ|comparacao|par de|antes e depois)/.test(t)) {
    return { type: 'split' }
  }
  if (/(desenvolvimento\s*3|dev\s*3|d3|foto (em|de) cima|foto deitada|imagem em cima)/.test(t)) {
    return { type: 'photoTop' }
  }
  if (/(desenvolvimento\s*2|dev\s*2|d2|respiro|foto (a|na|à) direita|final|convite|cta|chamada)/.test(t)) {
    return { type: 'final' }
  }
  if (/(desenvolvimento\s*1|dev\s*1|d1|desenvolvimento|foto de fundo|texto corrido|texto)/.test(t)) {
    return { type: 'development' }
  }
  return null
}

/** Tira a marcação que não vira nada no slide e uniformiza o negrito. */
function limpaInline(linha: string): string {
  return linha
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/__([^_\n]+)__/g, '**$1**')
    .replace(/^\s*>\s?/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .trimEnd()
}

const ROTULO_A =
  /^\s*(cima|topo|em cima|acima|esquerda|lado a|lado esquerdo|antes|primeiro|a)\s*[:\-–—]\s*/i
const ROTULO_B =
  /^\s*(baixo|embaixo|abaixo|direita|lado b|lado direito|depois|segundo|b)\s*[:\-–—]\s*/i

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
  return paras
}

/**
 * Acha as duas metades de uma tela partida. Aceita rótulos ("Cima:",
 * "Lado A:", "Esquerda:"), uma régua --- no meio, ou simplesmente dois
 * parágrafos.
 */
function duasMetades(linhas: string[]): [string, string] | null {
  const marcadas = { a: [] as string[], b: [] as string[] }
  let lado: 'a' | 'b' | null = null
  let achouA = false
  let achouB = false
  for (const l of linhas) {
    if (ROTULO_A.test(l)) {
      lado = 'a'
      achouA = true
      const resto = l.replace(ROTULO_A, '').trim()
      if (resto) marcadas.a.push(resto)
      continue
    }
    if (ROTULO_B.test(l)) {
      lado = 'b'
      achouB = true
      const resto = l.replace(ROTULO_B, '').trim()
      if (resto) marcadas.b.push(resto)
      continue
    }
    if (lado && l.trim() !== '') marcadas[lado].push(l.trim())
  }
  if (achouA && achouB) {
    return [marcadas.a.join('\n').trim(), marcadas.b.join('\n').trim()]
  }

  // régua no meio do slide
  const corte = linhas.findIndex((l) => /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l))
  if (corte > 0) {
    const cima = emParagrafos(linhas.slice(0, corte)).join('\n\n').trim()
    const baixo = emParagrafos(linhas.slice(corte + 1)).join('\n\n').trim()
    if (cima && baixo) return [cima, baixo]
  }

  const paras = emParagrafos(linhas)
  if (paras.length === 2) return [paras[0].trim(), paras[1].trim()]
  return null
}

/** Vira o slide de verdade, já com o texto no lugar certo. */
function montaSlide(
  tipo: { type: SlideType; vertical?: boolean },
  linhas: string[],
  avisos: string[],
  numero: number,
): Slide | null {
  const paras = emParagrafos(linhas)
  const corpo = paras.join('\n\n').trim()
  if (corpo === '') return null

  const slide = makeSlide(tipo.type)
  if (slide.type === 'split') {
    if (tipo.vertical) slide.orientation = 'vertical'
    const metades = duasMetades(linhas)
    if (metades) {
      slide.top.text = metades[0]
      slide.bottom.text = metades[1]
    } else {
      slide.top.text = corpo
      slide.bottom.text = ''
      avisos.push(
        `Slide ${numero}: não achei as duas metades, então tudo entrou na primeira. ` +
          `Pra separar, escreva "Cima:" e "Baixo:" (ou --- entre as duas).`,
      )
    }
    return slide
  }
  if (slide.type === 'photoTop') {
    // A abertura em destaque é o primeiro parágrafo, se ele for curto e
    // ainda não estiver formatado.
    const [primeiro, ...resto] = paras
    const curto = primeiro.length <= 120 && !primeiro.includes('\n')
    const jaTemDestaque = /^(==|\*\*)/.test(primeiro.trim())
    slide.body =
      curto && !jaTemDestaque && resto.length > 0
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

/** Sem tipo escrito, o formato do conteúdo entrega qual é. */
function deduzTipo(linhas: string[]): { type: SlideType; vertical?: boolean } {
  if (duasMetades(linhas) && emParagrafos(linhas).length <= 4) {
    const temRotulo = linhas.some((l) => ROTULO_A.test(l) || ROTULO_B.test(l))
    const temRegua = linhas.some((l) => /^\s*-{3,}\s*$/.test(l))
    if (temRotulo || temRegua) return { type: 'split' }
  }
  const paras = emParagrafos(linhas)
  const total = paras.join(' ').length
  if (paras.length === 1 && total <= 180) return { type: 'final' }
  return { type: 'development' }
}

export function lerMarkdown(fonte: string): ResultadoImportacao {
  const avisos: string[] = []
  const linhas = fonte.replace(/\r\n?/g, '\n').split('\n')

  // Fora de blocos de código, pra ``` não virar conteúdo
  const uteis: string[] = []
  let dentroDeCodigo = false
  for (const l of linhas) {
    if (/^\s*```/.test(l)) {
      dentroDeCodigo = !dentroDeCodigo
      continue
    }
    if (!dentroDeCodigo) uteis.push(l)
  }

  const nivel = (l: string) => {
    const m = /^(#{1,6})\s+/.exec(l)
    return m ? m[1].length : 0
  }
  const contagem = [0, 0, 0, 0, 0, 0, 0]
  for (const l of uteis) contagem[nivel(l)]++

  // O nível que separa os slides é o menor que aparece mais de uma vez;
  // um "#" sozinho no começo é o nome do carrossel, não um slide.
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
  let atual: { titulo: string; linhas: string[] } | null = null
  const preambulo: string[] = []

  for (const bruta of uteis) {
    const n = nivel(bruta)
    const texto = bruta.replace(/^#{1,6}\s+/, '').trim()
    if (n > 0 && nivelSlide > 0 && n === nivelSlide) {
      if (atual) blocos.push(atual)
      atual = { titulo: texto, linhas: [] }
      continue
    }
    if (n > 0 && n < nivelSlide && titulo === '' && !atual) {
      titulo = texto
      continue
    }
    if (n > 0 && atual) {
      // subtítulo dentro do slide vira abertura em destaque
      atual.linhas.push('', `==**${limpaInline(texto)}**==`, '')
      continue
    }
    const limpa = limpaInline(bruta)
    if (atual) atual.linhas.push(limpa)
    else preambulo.push(limpa)
  }
  if (atual) blocos.push(atual)

  // Assinaturas e título soltos antes do primeiro slide
  for (const l of preambulo) {
    const mEsq = /^\s*assinatura\s*(da\s*)?(esquerda|esq)\s*[:\-–—]\s*(.+)$/i.exec(l)
    const mDir = /^\s*assinatura\s*(da\s*)?(direita|dir)\s*[:\-–—]\s*(.+)$/i.exec(l)
    const mTit = /^\s*(titulo|título)\s*[:\-–—]\s*(.+)$/i.exec(l)
    if (mEsq) captionLeft = mEsq[3].trim().replace(/\s*\|\s*/g, '\n')
    else if (mDir) captionRight = mDir[3].trim().replace(/\s*\|\s*/g, '\n')
    else if (mTit && titulo === '') titulo = mTit[2].trim()
  }

  // Documento sem título nenhum: a régua --- vira o separador
  if (blocos.length === 0) {
    const corpo = preambulo.join('\n')
    const partes = corpo
      .split(/^\s*-{3,}\s*$/m)
      .map((p) => p.trim())
      .filter((p) => p !== '')
    if (partes.length > 1) {
      partes.forEach((p, i) => blocos.push({ titulo: `Slide ${i + 1}`, linhas: p.split('\n') }))
    } else if (corpo.trim() !== '') {
      blocos.push({ titulo: 'Slide 1', linhas: corpo.split('\n') })
      avisos.push(
        'Não achei títulos de slide no arquivo, então tudo virou um slide só. ' +
          'Use "## Slide 1", "## Slide 2"… pra separar.',
      )
    }
  }

  const slides: Slide[] = []
  blocos.forEach((bloco, i) => {
    const numero = i + 1
    const escrito = tipoDoTitulo(bloco.titulo)
    const tipo = escrito ?? deduzTipo(bloco.linhas)
    if (!escrito) {
      const nomes: Record<SlideType, string> = {
        split: 'tela partida',
        comparison: 'foto de fundo',
        development: 'Desenvolvimento 1',
        book: 'livro',
        final: 'Desenvolvimento 2',
        photoTop: 'Desenvolvimento 3',
      }
      avisos.push(`Slide ${numero}: sem tipo escrito, usei ${nomes[tipo.type]}.`)
    }
    const slide = montaSlide(tipo, bloco.linhas, avisos, numero)
    if (slide) slides.push(slide)
  })

  return { titulo: titulo.trim(), slides, captionLeft, captionRight, avisos }
}

/** Arquivo de exemplo, pra quem abrir o botão saber o que escrever. */
export const MODELO_MD = `# Nome do carrossel

Assinatura esquerda: SUA ASSINATURA | DA SÉRIE
Assinatura direita: BRANDING, ESTRATÉGIA | E DIREÇÃO CRIATIVA

## Slide 1 — tela partida
Cima: O dado mais forte que você tem, curto e verificável.
Baixo: O contraste que faz a percepção virar.

## Slide 2 — tela partida em pé
Esquerda: A primeira imagem da comparação.
Direita: A segunda, lado a lado.

## Slide 3 — desenvolvimento 1
Aqui entra o texto corrido, em parágrafos curtos de duas ou três linhas.

Linha em branco separa parágrafos. Use **negrito**, *itálico* e ==frase maior== à vontade.

## Slide 4 — desenvolvimento 3
A frase de abertura, curta e forte.

O corpo do texto vem depois dela, embaixo da foto deitada.

## Slide 5 — desenvolvimento 2
Me segue se você acha que este assunto merece mais atenção do que vem recebendo.
`
