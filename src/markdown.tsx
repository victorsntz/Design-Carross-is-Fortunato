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

/**
 * Versão DOM da renderização usada DURANTE a edição (contentEditable):
 * o estilo aparece na hora — negrito engorda, ==frase== cresce — e os
 * marcadores ficam visíveis porém apagadinhos, contando como caracteres
 * normais pra posição do cursor bater com o texto salvo.
 */
export function buildEditingFragment(text: string): DocumentFragment {
  const frag = document.createDocumentFragment()
  const mk = (m: string) => {
    const s = document.createElement('span')
    s.className = 'sl-mk'
    s.textContent = m
    return s
  }
  const styled = (tag: string, cls: string | null, marker: string, inner: string) => {
    const el = document.createElement(tag)
    if (cls) el.className = cls
    el.appendChild(buildEditingFragment(inner))
    frag.append(mk(marker), el, mk(marker))
  }
  for (const part of text.split(TOKEN_RE)) {
    if (!part) continue
    if (/^\*\*\*[^*]+\*\*\*$/.test(part)) {
      const strong = document.createElement('strong')
      const em = document.createElement('em')
      em.appendChild(buildEditingFragment(part.slice(3, -3)))
      strong.appendChild(em)
      frag.append(mk('***'), strong, mk('***'))
    } else if (/^\*\*[^*]+\*\*$/.test(part)) styled('strong', null, '**', part.slice(2, -2))
    else if (/^==[^=]+==$/.test(part)) styled('span', 'sl-big', '==', part.slice(2, -2))
    else if (/^\*[^*]+\*$/.test(part)) styled('em', null, '*', part.slice(1, -1))
    else if (/^_[^_]+_$/.test(part)) styled('u', null, '_', part.slice(1, -1))
    else frag.append(document.createTextNode(part))
  }
  return frag
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
