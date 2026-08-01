import type { ReactNode } from 'react'
import { Fragment } from 'react'

// Mini-formatação usada nos textos dos slides:
//   **negrito**   *itálico*   _sublinhado_   ==frase maior==
// Quebra de linha simples vira <br/>; linha em branco separa parágrafos.

// O sublinhado exige borda de palavra pros dois lados: um "_" no meio de
// @nome_de_usuario não pode virar formatação.
const TOKEN_RE =
  /(\*\*[^*]+?\*\*|==[^=\n]+?==|\*[^*\n]+?\*|(?<![\p{L}\p{N}_])_[^_\n]+?_(?![\p{L}\p{N}_]))/gu

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
  if (before.endsWith(marker) && after.startsWith(marker)) {
    // já formatado por fora: desfaz
    return {
      value: before.slice(0, -m) + sel + after.slice(m),
      start: s - m,
      end: e - m,
    }
  }
  if (sel.length >= 2 * m && sel.startsWith(marker) && sel.endsWith(marker)) {
    // seleção inclui os marcadores: desfaz
    return { value: before + sel.slice(m, -m) + after, start: s, end: e - 2 * m }
  }
  return { value: before + marker + sel + marker + after, start: s + m, end: e + m }
}
