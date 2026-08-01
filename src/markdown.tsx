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

function tokenOf(part: string): { m: number; inner: string } | null {
  if (/^\*\*\*[^*]+\*\*\*$/.test(part)) return { m: 3, inner: part.slice(3, -3) }
  if (/^\*\*[^*]+\*\*$/.test(part)) return { m: 2, inner: part.slice(2, -2) }
  if (/^==[^=]+==$/.test(part)) return { m: 2, inner: part.slice(2, -2) }
  if (/^\*[^*]+\*$/.test(part)) return { m: 1, inner: part.slice(1, -1) }
  if (/^_[^_]+_$/.test(part)) return { m: 1, inner: part.slice(1, -1) }
  return null
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
        const name = n.nodeName
        if (name === 'STRONG' || name === 'B') out += `**${inner}**`
        else if (name === 'EM' || name === 'I') out += `*${inner}*`
        else if (name === 'U') out += `_${inner}_`
        else if ((n as HTMLElement).classList?.contains('sl-big')) out += `==${inner}==`
        else out += inner
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

/**
 * Aplica/remove um marcador de formatação numa seleção de texto, aparando
 * espaços das bordas e expandindo seleção que parou no meio de palavra.
 * Compartilhado pelos atalhos Ctrl+B/I/U/E do editor.
 */
export function applyMarker(
  value: string,
  selStart: number,
  selEnd: number,
  marker: string,
): { value: string; start: number; end: number } {
  const isWord = (ch: string | undefined) =>
    ch !== undefined && /[\p{L}\p{N}_]/u.test(ch)
  let s = selStart
  let e = selEnd
  while (s < e && /\s/.test(value[s])) s++
  while (e > s && /\s/.test(value[e - 1])) e--
  while (s > 0 && isWord(value[s - 1]) && isWord(value[s])) s--
  while (e < value.length && isWord(value[e - 1]) && isWord(value[e])) e++
  // Nada selecionado e sem palavra em volta: não tem o que formatar.
  if (s === e) return { value, start: selStart, end: selEnd }

  const sel = value.slice(s, e)
  const before = value.slice(0, s)
  const after = value.slice(e)
  const m = marker.length

  const leadRun = (str: string) => {
    let i = 0
    while (i < str.length && '*_='.includes(str[i])) i++
    return str.slice(0, i)
  }
  const tailRun = (str: string) => {
    let i = str.length
    while (i > 0 && '*_='.includes(str[i - 1])) i--
    return str.slice(i)
  }
  const stars = (str: string) => (str.match(/\*/g) ?? []).length

  // Seleção inclui os próprios marcadores (ex.: selecionou "**palavra**"
  // inteiro): tira só esse marcador. O teste de paridade impede confundir
  // o "*" do itálico com o "**" do negrito.
  const selWrapped =
    sel.length >= 2 * m && sel.startsWith(marker) && sel.endsWith(marker)
  const selStarsOk =
    marker !== '*' ||
    (stars(leadRun(sel)) % 2 === 1 && stars(tailRun(sel)) % 2 === 1)
  if (selWrapped && selStarsOk) {
    return { value: before + sel.slice(m, -m) + after, start: s, end: e - 2 * m }
  }

  // Os marcadores colados na seleção pelos dois lados dizem quais formatos
  // já estão ativos. O clique alterna o formato pedido e o conjunto inteiro
  // é reescrito em ordem fixa (frase maior › sublinhado › negrito › itálico)
  // — é isso que deixa empilhar tudo junto sem os asteriscos se embolarem.
  const runB = tailRun(before)
  const runA = leadRun(after)
  const flags = {
    big: runB.includes('==') && runA.includes('=='),
    und: runB.includes('_') && runA.includes('_'),
    bold: stars(runB) >= 2 && stars(runA) >= 2,
    ital: stars(runB) % 2 === 1 && stars(runA) % 2 === 1,
  }
  const flagOf: Record<string, keyof typeof flags> = {
    '==': 'big',
    _: 'und',
    '**': 'bold',
    '*': 'ital',
  }
  flags[flagOf[marker]] = !flags[flagOf[marker]]

  let wrapped = sel
  for (const [flag, mk] of [
    ['ital', '*'],
    ['bold', '**'],
    ['und', '_'],
    ['big', '=='],
  ] as const) {
    if (flags[flag]) wrapped = mk + wrapped + mk
  }
  const stem = before.slice(0, before.length - runB.length)
  const stemAfter = after.slice(runA.length)
  const inner = (wrapped.length - sel.length) / 2
  const start = stem.length + inner
  return {
    value: stem + wrapped + stemAfter,
    start,
    end: start + sel.length,
  }
}
