import type { ReactNode } from 'react'
import { Fragment } from 'react'

// Mini-formatação usada nos textos dos slides:
//   **negrito**   *itálico*   _sublinhado_   ==frase maior==
// Quebra de linha simples vira <br/>; linha em branco separa parágrafos.

// O sublinhado exige borda de palavra pros dois lados: um "_" no meio de
// @nome_de_usuario não pode virar formatação.
// "***texto***" = negrito + itálico juntos (vem antes do "**" no teste
// porque senão o negrito engoliria dois dos três asteriscos).
const TOKEN_RE =
  /(\*\*\*[^*\n]+?\*\*\*|\*\*[^*]+?\*\*|==[^=\n]+?==|\*[^*\n]+?\*|(?<![\p{L}\p{N}_])_[^_\n]+?_(?![\p{L}\p{N}_]))/gu

function withBreaks(text: string, keyBase: string): ReactNode[] {
  const lines = text.split('\n')
  return lines.flatMap((line, i) =>
    i === 0 ? [line] : [<br key={`${keyBase}-br-${i}`} />, line],
  )
}

export function renderInline(text: string): ReactNode {
  const parts = text.split(TOKEN_RE)
  return parts.map((part, i) => {
    // Formato dentro de formato funciona (ex.: **_negrito sublinhado_**):
    // o conteúdo interno passa de novo pelo renderizador.
    if (/^\*\*\*[^*]+\*\*\*$/.test(part)) {
      return (
        <strong key={i}>
          <em>{renderInline(part.slice(3, -3))}</em>
        </strong>
      )
    }
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={i}>{renderInline(part.slice(2, -2))}</strong>
    }
    if (/^==[^=]+==$/.test(part)) {
      return (
        <span className="sl-big" key={i}>
          {renderInline(part.slice(2, -2))}
        </span>
      )
    }
    if (/^\*[^*]+\*$/.test(part)) {
      return <em key={i}>{renderInline(part.slice(1, -1))}</em>
    }
    if (/^_[^_]+_$/.test(part)) {
      return <u key={i}>{renderInline(part.slice(1, -1))}</u>
    }
    return <Fragment key={i}>{withBreaks(part, `t${i}`)}</Fragment>
  })
}

export function renderParagraphs(text: string): ReactNode {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim() !== '')
  return paragraphs.map((p, i) => <p key={i}>{renderInline(p.trim())}</p>)
}

// ===== Suporte ao editor direto na arte (contentEditable) =====
// Durante a edição os marcadores NÃO aparecem: a pessoa vê o texto já
// formatado, igualzinho ao slide final. O texto salvo continua sendo o
// mini-markdown; o que faz a ponte é o mapa de posições visível↔cru e o
// serializador que lê a formatação de volta do DOM.

/** Separador de parágrafo — o mesmo critério do renderParagraphs. */
export const PARA_RE = /(\n\s*\n)/

// Cada formato é um bit: uma letra pode carregar todos ao mesmo tempo.
export const BIG = 1
export const UND = 2
export const BOLD = 4
export const ITAL = 8

/** Ordem de escrita, de fora pra dentro: ==_***texto***_== */
const NESTING: [number, string][] = [
  [BIG, '=='],
  [UND, '_'],
  [BOLD, '**'],
  [ITAL, '*'],
]

const BIT_OF: Record<string, number> = {
  '==': BIG,
  _: UND,
  '**': BOLD,
  '*': ITAL,
}

function tokenOf(part: string): { m: number; inner: string; bit: number } | null {
  if (/^\*\*\*[^*]+\*\*\*$/.test(part))
    return { m: 3, inner: part.slice(3, -3), bit: BOLD | ITAL }
  if (/^\*\*[^*]+\*\*$/.test(part))
    return { m: 2, inner: part.slice(2, -2), bit: BOLD }
  if (/^==[^=]+==$/.test(part)) return { m: 2, inner: part.slice(2, -2), bit: BIG }
  if (/^\*[^*]+\*$/.test(part)) return { m: 1, inner: part.slice(1, -1), bit: ITAL }
  if (/^_[^_]+_$/.test(part)) return { m: 1, inner: part.slice(1, -1), bit: UND }
  return null
}

/**
 * Desmonta UMA linha em letras + os formatos de cada letra. É o modelo que
 * torna qualquer combinação possível: negrito, itálico, sublinhado e frase
 * maior convivem porque viram bits na mesma letra, em vez de marcadores
 * que precisam se aninhar direitinho no texto.
 */
export function parseLine(raw: string): {
  text: string
  marks: number[]
  visOf: number[]
} {
  const text: string[] = []
  const marks: number[] = []
  const visOf = new Array<number>(raw.length + 1).fill(0)
  const walk = (str: string, base: number, active: number) => {
    let p = base
    for (const part of str.split(TOKEN_RE)) {
      if (!part) continue
      const t = tokenOf(part)
      if (t) {
        for (let k = 0; k < t.m; k++) visOf[p + k] = text.length
        walk(t.inner, p + t.m, active | t.bit)
        for (let k = 0; k < t.m; k++) visOf[p + part.length - t.m + k] = text.length
      } else {
        for (let k = 0; k < part.length; k++) {
          visOf[p + k] = text.length
          text.push(part[k])
          marks.push(active)
        }
      }
      p += part.length
    }
  }
  walk(raw, 0, 0)
  visOf[raw.length] = text.length
  return { text: text.join(''), marks, visOf }
}

/** Remonta a linha a partir das letras e seus formatos, sempre na mesma
 *  ordem de aninhamento — nunca sobra marcador solto no texto. */
export function serializeLine(text: string, marks: number[]): string {
  let out = ''
  let aberto = 0
  for (let i = 0; i <= text.length; i++) {
    const atual = i < text.length ? marks[i] : 0
    if (atual !== aberto) {
      for (let k = NESTING.length - 1; k >= 0; k--) {
        if (aberto & NESTING[k][0]) out += NESTING[k][1]
      }
      for (const [bit, mk] of NESTING) if (atual & bit) out += mk
      aberto = atual
    }
    if (i < text.length) out += text[i]
  }
  return out
}

/** Conteúdo de UMA linha/bloco do editor: formatado, sem marcadores. */
export function buildEditingFragment(text: string): DocumentFragment {
  const frag = document.createDocumentFragment()
  for (const part of text.split(TOKEN_RE)) {
    if (!part) continue
    const t = tokenOf(part)
    if (!t) {
      frag.append(document.createTextNode(part))
      continue
    }
    let el: HTMLElement
    if (t.m === 3) {
      el = document.createElement('strong')
      const em = document.createElement('em')
      em.appendChild(buildEditingFragment(t.inner))
      el.appendChild(em)
    } else if (part.startsWith('**')) {
      el = document.createElement('strong')
      el.appendChild(buildEditingFragment(t.inner))
    } else if (part.startsWith('==')) {
      el = document.createElement('span')
      el.className = 'sl-big'
      el.appendChild(buildEditingFragment(t.inner))
    } else if (part.startsWith('*')) {
      el = document.createElement('em')
      el.appendChild(buildEditingFragment(t.inner))
    } else {
      el = document.createElement('u')
      el.appendChild(buildEditingFragment(t.inner))
    }
    frag.append(el)
  }
  return frag
}

export interface EditorMap {
  /** índice no texto cru (0..len) -> índice visível */
  toVis: number[]
  /** índice visível -> índice do caractere no texto cru */
  toRaw: number[]
  visLen: number
}

/**
 * Mapa entre o texto cru (com marcadores) e o texto visível (sem eles).
 * Em modo parágrafos, o separador \n\n também é invisível (vira espaço
 * entre blocos, não caracteres).
 */
export function buildEditorMap(value: string, paragraphs: boolean): EditorMap {
  const toVis = new Array<number>(value.length + 1)
  const toRaw: number[] = []
  let v = 0
  const inline = (text: string, base: number) => {
    let pos = base
    for (const part of text.split(TOKEN_RE)) {
      if (!part) continue
      const t = tokenOf(part)
      if (t) {
        for (let k = 0; k < t.m; k++) toVis[pos + k] = v
        inline(t.inner, pos + t.m)
        for (let k = 0; k < t.m; k++) toVis[pos + part.length - t.m + k] = v
      } else {
        for (let k = 0; k < part.length; k++) {
          toVis[pos + k] = v
          toRaw[v] = pos + k
          v++
        }
      }
      pos += part.length
    }
  }
  if (!paragraphs) {
    inline(value, 0)
  } else {
    const parts = value.split(PARA_RE)
    let pos = 0
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] ?? ''
      if (i % 2 === 1) {
        for (let k = 0; k < part.length; k++) toVis[pos + k] = v
      } else {
        inline(part, pos)
      }
      pos += part.length
    }
  }
  toVis[value.length] = v
  return { toVis, toRaw, visLen: v }
}

/**
 * Lê o texto cru de volta do DOM do editor: a estrutura (strong/em/u/
 * sl-big) vira marcadores de novo. O <br> sentinela no fim de cada bloco
 * (posto só pra linha vazia final aparecer) não conta.
 */
export function editorValueOf(root: HTMLElement, paragraphs: boolean): string {
  const mdOf = (node: Node): string => {
    let out = ''
    const kids = node.childNodes
    for (let i = 0; i < kids.length; i++) {
      const n = kids[i]
      if (n.nodeType === Node.TEXT_NODE) {
        out += (n as Text).data
      } else if (n.nodeName === 'BR') {
        if (i < kids.length - 1) out += '\n'
      } else {
        const inner = mdOf(n)
        if (inner === '') continue
        // O navegador nem sempre devolve <strong>/<em>: digitando por cima
        // de um trecho formatado ele às vezes cria <b>, <i> ou um <span>
        // com estilo. Todos precisam virar marcador, senão a formatação
        // some sozinha ao editar.
        const el = n as HTMLElement
        const nome = n.nodeName
        const estilo = el.style
        const peso = estilo?.fontWeight ?? ''
        let bits = 0
        if (nome === 'STRONG' || nome === 'B' || peso === 'bold' || +peso >= 600) {
          bits |= BOLD
        }
        if (nome === 'EM' || nome === 'I' || estilo?.fontStyle === 'italic') {
          bits |= ITAL
        }
        if (nome === 'U' || estilo?.textDecorationLine?.includes('underline')) {
          bits |= UND
        }
        if (el.classList?.contains('sl-big')) bits |= BIG
        let env = inner
        for (let k = NESTING.length - 1; k >= 0; k--) {
          const [bit, mk] = NESTING[k]
          if (bits & bit) env = mk + env + mk
        }
        out += env
      }
    }
    return out
  }
  if (!paragraphs) return mdOf(root)
  const blocks: string[] = []
  root.childNodes.forEach((n) => {
    if (n.nodeName === 'P' || n.nodeName === 'DIV') {
      blocks.push(mdOf(n))
    } else {
      const t =
        n.nodeType === Node.TEXT_NODE
          ? (n as Text).data
          : n.nodeName === 'BR'
            ? ''
            : mdOf(n)
      if (blocks.length === 0) blocks.push(t)
      else blocks[blocks.length - 1] += t
    }
  })
  return blocks.join('\n\n')
}

// ===== Aplicar/remover formatação numa seleção =====

const isWord = (ch: string | undefined) =>
  ch !== undefined && /[\p{L}\p{N}_]/u.test(ch)

/** Apara espaços das bordas e completa palavra cortada no meio — inclusive
 *  quando é só o cursor piscando dentro dela. Tudo em letras visíveis. */
function expandVis(text: string, a: number, b: number): [number, number] {
  let s = Math.max(0, Math.min(a, text.length))
  let e = Math.max(0, Math.min(b, text.length))
  while (s < e && /\s/.test(text[s])) s++
  while (e > s && /\s/.test(text[e - 1])) e--
  while (s > 0 && isWord(text[s - 1]) && isWord(text[s])) s--
  while (e < text.length && isWord(text[e - 1]) && isWord(text[e])) e++
  return [s, e]
}

/** Primeira posição no texto cru que cai na letra visível pedida. */
function visToRaw(visOf: number[], vis: number): number {
  for (let r = 0; r < visOf.length; r++) if (visOf[r] === vis) return r
  return visOf.length - 1
}

/**
 * Liga/desliga um formato na seleção — usado pelos botões N/I/S/Frase
 * maior e pelos atalhos Ctrl+B/I/U e Cmd+M.
 *
 * Trabalha linha a linha porque marcador não atravessa quebra de
 * parágrafo: um "**" aberto num parágrafo e fechado no seguinte não é
 * formatação nenhuma — os asteriscos apareceriam escritos no slide.
 * Selecionar o texto inteiro e clicar em Negrito formata cada parágrafo
 * por dentro, e é isso que deixa aplicar tudo de uma vez.
 */
export function applyMarker(
  value: string,
  selStart: number,
  selEnd: number,
  marker: string,
): { value: string; start: number; end: number } {
  const bit = BIT_OF[marker]
  if (!bit) return { value, start: selStart, end: selEnd }
  const lo = Math.min(selStart, selEnd)
  const hi = Math.max(selStart, selEnd)

  const linhas: { raw: string; ini: number }[] = []
  let pos = 0
  for (const raw of value.split('\n')) {
    linhas.push({ raw, ini: pos })
    pos += raw.length + 1
  }

  const alvos: { i: number; p: ReturnType<typeof parseLine>; a: number; b: number }[] =
    []
  for (let i = 0; i < linhas.length; i++) {
    const { raw, ini } = linhas[i]
    if (ini + raw.length < lo || ini > hi) continue
    const p = parseLine(raw)
    const [a, b] = expandVis(
      p.text,
      p.visOf[Math.max(lo - ini, 0)] ?? 0,
      p.visOf[Math.min(hi - ini, raw.length)] ?? p.text.length,
    )
    if (a < b) alvos.push({ i, p, a, b })
  }
  // Só espaço selecionado (ou nada): não tem o que formatar.
  if (alvos.length === 0) return { value, start: selStart, end: selEnd }

  // Decisão única pro conjunto: se TUDO já tem o formato, o clique tira de
  // tudo; senão põe em tudo. Sem isso, uma seleção meio formatada ficaria
  // alternando pedaço sim, pedaço não.
  const ligar = !alvos.every(({ p, a, b }) => {
    for (let k = a; k < b; k++) if (!(p.marks[k] & bit)) return false
    return true
  })

  for (const { i, p, a, b } of alvos) {
    for (let k = a; k < b; k++) {
      p.marks[k] = ligar ? p.marks[k] | bit : p.marks[k] & ~bit
    }
    linhas[i].raw = serializeLine(p.text, p.marks)
  }

  const out = linhas.map((l) => l.raw).join('\n')
  // Posições novas: as letras visíveis não mudaram, só os marcadores em
  // volta — então é só reabrir as linhas mexidas já reescritas.
  let ini = 0
  const inicios = linhas.map((l) => {
    const v = ini
    ini += l.raw.length + 1
    return v
  })
  const prim = alvos[0]
  const ult = alvos[alvos.length - 1]
  const pPrim = parseLine(linhas[prim.i].raw)
  const pUlt = parseLine(linhas[ult.i].raw)
  return {
    value: out,
    start: inicios[prim.i] + visToRaw(pPrim.visOf, prim.a),
    end: inicios[ult.i] + visToRaw(pUlt.visOf, ult.b),
  }
}
