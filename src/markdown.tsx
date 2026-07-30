import type { ReactNode } from 'react'
import { Fragment } from 'react'

// Mini-formatação usada nos textos dos slides:
//   **negrito**   *itálico*   _sublinhado_
// Quebra de linha simples vira <br/>; linha em branco separa parágrafos.

// O sublinhado exige borda de palavra pros dois lados: um "_" no meio de
// @nome_de_usuario não pode virar formatação.
const TOKEN_RE =
  /(\*\*[^*]+?\*\*|\*[^*\n]+?\*|(?<![\p{L}\p{N}_])_[^_\n]+?_(?![\p{L}\p{N}_]))/gu

function withBreaks(text: string, keyBase: string): ReactNode[] {
  const lines = text.split('\n')
  return lines.flatMap((line, i) =>
    i === 0 ? [line] : [<br key={`${keyBase}-br-${i}`} />, line],
  )
}

export function renderInline(text: string): ReactNode {
  const parts = text.split(TOKEN_RE)
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={i}>{withBreaks(part.slice(2, -2), `s${i}`)}</strong>
    }
    if (/^\*[^*]+\*$/.test(part)) {
      return <em key={i}>{withBreaks(part.slice(1, -1), `e${i}`)}</em>
    }
    if (/^_[^_]+_$/.test(part)) {
      return <u key={i}>{withBreaks(part.slice(1, -1), `u${i}`)}</u>
    }
    return <Fragment key={i}>{withBreaks(part, `t${i}`)}</Fragment>
  })
}

export function renderParagraphs(text: string): ReactNode {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim() !== '')
  return paragraphs.map((p, i) => <p key={i}>{renderInline(p.trim())}</p>)
}
