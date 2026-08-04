import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type {
  BookSlide,
  ComparisonSlide,
  DevelopmentSlide,
  FinalSlide,
  PhotoTopSlide,
  Project,
  Slide,
  SlideMedia,
  SplitHalf,
  SplitSlide,
} from '../types'
import {
  applyMarker,
  buildEditingFragment,
  buildEditorMap,
  editorValueOf,
  PARA_RE,
  renderInline,
  renderParagraphs,
} from '../markdown'

/** Campo de texto de um slide, pra edição direto na arte. */
export type EditField = 'text' | 'body' | 'top' | 'bottom'

export const SLIDE_W = 1080
export const SLIDE_H = 1350

/** Fração da largura ocupada pela foto no slide final. */
export const FINAL_MEDIA_FRAC = 0.44

/** Altura da faixa de foto do Desenvolvimento 3 (igual ao CSS .sl-pt-media). */
export const PHOTO_TOP_H = 660

// Calibrado pra densidade real do formato: os slides carregam bastante
// texto, então os padrões assumem parágrafos cheios. Cada tipo tem sua
// escala (o Desenvolvimento 2 desce até 28px pra textos bem longos).
const FONT_SIZES: Record<Slide['type'], number[]> = {
  split: [28, 32, 36, 40, 45],
  comparison: [32, 36, 40, 45, 50],
  development: [26, 30, 34, 38, 43],
  book: [26, 30, 34, 38, 42],
  final: [28, 33, 38, 43, 48, 54, 60],
  photoTop: [26, 30, 34, 38, 43],
}

/** Passo padrão de cada tipo (mantém o tamanho visual de sempre). */
export const DEFAULT_STEPS: Record<Slide['type'], number> = {
  split: 2,
  comparison: 2,
  development: 2,
  book: 2,
  final: 4,
  photoTop: 2,
}

export function sizeStepsFor(type: Slide['type']): number {
  return FONT_SIZES[type].length
}

export function fontSizeFor(slide: Slide): number {
  const sizes = FONT_SIZES[slide.type]
  const step = Math.min(Math.max(slide.sizeStep, 0), sizes.length - 1)
  return sizes[step]
}

// Tipografia ajustável com guarda-corpo: nem esmagada, nem espalhada.
export const LINE_HEIGHT_MIN = 1.15
export const LINE_HEIGHT_MAX = 1.6
export const LETTER_SPACING_MIN = -0.03
export const LETTER_SPACING_MAX = 0.06

const DEFAULT_LINE_HEIGHT: Record<Slide['type'], number> = {
  split: 1.3,
  comparison: 1.3,
  development: 1.5,
  book: 1.5,
  final: 1.32,
  photoTop: 1.45,
}

export function lineHeightFor(slide: Slide): number {
  const v = slide.lineHeight ?? DEFAULT_LINE_HEIGHT[slide.type]
  return Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, v))
}

export function letterSpacingFor(slide: Slide): number {
  const v = slide.letterSpacing ?? 0
  return Math.min(LETTER_SPACING_MAX, Math.max(LETTER_SPACING_MIN, v))
}

/** Estilo tipográfico completo do texto do slide. */
export function slideTextStyle(slide: Slide): CSSProperties {
  return {
    fontSize: fontSizeFor(slide),
    lineHeight: lineHeightFor(slide),
    letterSpacing: `${letterSpacingFor(slide)}em`,
  }
}

/**
 * full: editor (mostra placeholders de espaço vazio)
 * export: saída final (sem placeholders)
 * overlay: arte transparente (sem mídias e sem fundo)
 */
export type RenderMode = 'full' | 'export' | 'overlay'

interface RendererProps {
  slide: Slide
  project: Project
  /** Largura de exibição em px; o slide é desenhado em 1080x1350 e escalado. */
  width: number
  mode?: RenderMode
  /** Miniatura: vídeos ficam parados no primeiro frame. */
  thumbnail?: boolean
  /** Com isso definido, os textos viram editáveis com clique direto na arte. */
  onTextEdit?: (field: EditField, value: string) => void
}

// ===== Editor de texto direto na arte (contentEditable) =====
// A pessoa vê o texto formatado, sem marcador nenhum — igual ao slide
// final. A digitação corre solta no DOM (o navegador cuida); a cada tecla
// o valor cru é relido da estrutura (editorValueOf). Reconstrução do DOM
// só acontece ao abrir, dar Enter, colar ou usar um botão de formatação —
// e aí o cursor é recolocado via mapa visível↔cru (buildEditorMap).

/** Nº de caracteres visíveis entre o início de `root` e o ponto
 *  (container, offset) de um Range. <br> conta zero (só existem os
 *  sentinelas de fim de bloco). */
function visOffsetIn(root: HTMLElement, container: Node, offset: number): number {
  let chars = 0
  let found = false
  const walk = (node: Node) => {
    if (found) return
    if (node === container && node.nodeType === Node.TEXT_NODE) {
      chars += offset
      found = true
      return
    }
    if (node.nodeType === Node.TEXT_NODE) {
      chars += (node as Text).data.length
      return
    }
    if (node.nodeName === 'BR') {
      if (node === container) found = true
      return
    }
    const kids = node.childNodes
    for (let i = 0; i < kids.length; i++) {
      if (node === container && i === offset) {
        found = true
        return
      }
      walk(kids[i])
      if (found) return
    }
    if (node === container) found = true
  }
  walk(root)
  return chars
}

/** Acha o ponto DOM do offset visível dentro de `root` (pro Range). */
function locateIn(root: HTMLElement, vis: number): { node: Node; offset: number } {
  let chars = 0
  let res: { node: Node; offset: number } | null = null
  let last: { node: Node; offset: number } | null = null
  const walk = (node: Node) => {
    if (res) return
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node as Text).data.length
      if (chars + len >= vis) {
        res = { node, offset: vis - chars }
        return
      }
      chars += len
      last = { node, offset: len }
      return
    }
    const kids = node.childNodes
    for (let i = 0; i < kids.length; i++) {
      walk(kids[i])
      if (res) return
    }
  }
  walk(root)
  return res ?? last ?? { node: root, offset: 0 }
}

/** Converte offset visível → cru dentro de um trecho SEM parágrafos. */
function visToRawInline(text: string, vis: number, endSide: boolean): number {
  const map = buildEditorMap(text, false)
  const v = Math.min(vis, map.visLen)
  if (endSide || v >= map.visLen) {
    return v === 0 ? 0 : map.toRaw[v - 1] + 1
  }
  return map.toRaw[v]
}

/**
 * Texto do slide que vira campo de edição ao clicar: mesma fonte, mesmo
 * lugar, mesma cara — formatação aplicada sem marcador aparecer.
 * Esc ou clicar fora conclui.
 */
function EditableText({
  value,
  onChange,
  className,
  style,
  paragraphs = false,
  placeholder,
}: {
  value: string
  onChange?: (v: string) => void
  className: string
  style?: CSSProperties
  paragraphs?: boolean
  placeholder: string
}) {
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const clickPoint = useRef<{ x: number; y: number } | null>(null)
  // Acentos (´ + a = á) chegam como composição: mexer no DOM no meio disso
  // quebra a letra acentuada.
  const composing = useRef(false)

  // Reconstrói o conteúdo e recoloca o cursor. As posições são no texto
  // CRU: é o que distingue "fim do parágrafo 1" de "início do parágrafo 2"
  // (visualmente coincidem, já que o \n\n separador não aparece).
  const renderEditor = (
    el: HTMLElement,
    val: string,
    rawStart: number,
    rawEnd: number,
  ) => {
    // <br> sentinela em cada bloco: linha vazia final aparece e dá pra
    // clicar nela (o serializador ignora o último <br> de cada bloco)
    let place: (raw: number) => { node: Node; offset: number }
    if (!paragraphs) {
      el.replaceChildren(buildEditingFragment(val))
      el.appendChild(document.createElement('br'))
      const map = buildEditorMap(val, false)
      place = (raw) => {
        const r = Math.max(0, Math.min(raw, val.length))
        return locateIn(el, map.toVis[r] ?? map.visLen)
      }
    } else {
      el.replaceChildren()
      const parts = val.split(PARA_RE)
      const blocks: { text: string; rawStart: number; dom: HTMLElement }[] = []
      let pos = 0
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i] ?? ''
        if (i % 2 === 0) {
          const p = document.createElement('p')
          p.className = 'sl-edit-p'
          p.appendChild(buildEditingFragment(part))
          p.appendChild(document.createElement('br'))
          el.appendChild(p)
          blocks.push({ text: part, rawStart: pos, dom: p })
        }
        pos += part.length
      }
      place = (raw) => {
        const r = Math.max(0, Math.min(raw, val.length))
        let b = blocks[blocks.length - 1]
        for (const blk of blocks) {
          if (r <= blk.rawStart + blk.text.length) {
            b = blk
            break
          }
        }
        const map = buildEditorMap(b.text, false)
        const inBlock = Math.max(0, Math.min(r - b.rawStart, b.text.length))
        return locateIn(b.dom, map.toVis[inBlock] ?? map.visLen)
      }
    }
    const s = place(rawStart)
    const e = place(rawEnd)
    const range = document.createRange()
    range.setStart(s.node, s.offset)
    range.setEnd(e.node, e.offset)
    const sel = window.getSelection()
    if (sel) {
      sel.removeAllRanges()
      sel.addRange(range)
    }
  }

  useEffect(() => {
    if (!editing) return
    const el = ref.current
    if (!el) return
    el.focus()
    renderEditor(el, value, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
    // Cursor cai onde a pessoa clicou — dá certo porque a edição desenha
    // o texto exatamente no mesmo lugar do modo parado.
    const pt = clickPoint.current
    clickPoint.current = null
    if (pt && typeof document.caretRangeFromPoint === 'function') {
      const r = document.caretRangeFromPoint(pt.x, pt.y)
      if (r && el.contains(r.startContainer)) {
        const sel = window.getSelection()
        if (sel) {
          sel.removeAllRanges()
          sel.addRange(r)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  /** Seleção atual convertida pra posições no texto cru (com marcadores). */
  const selRaw = (el: HTMLElement, val: string) => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 }
    const range = sel.getRangeAt(0)

    const rawPoint = (container: Node, offset: number, endSide: boolean): number => {
      if (!paragraphs) {
        return visToRawInline(val, visOffsetIn(el, container, offset), endSide)
      }
      const doms = Array.from(el.childNodes).filter(
        (n) => n.nodeName === 'P' || n.nodeName === 'DIV',
      ) as HTMLElement[]
      const parts = val.split(PARA_RE)
      const blocks: { text: string; rawStart: number }[] = []
      let pos = 0
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i] ?? ''
        if (i % 2 === 0) blocks.push({ text: part, rawStart: pos })
        pos += part.length
      }
      if (container === el) {
        // Cursor entre blocos: offset conta filhos do root
        let count = 0
        for (let i = 0; i < Math.min(offset, el.childNodes.length); i++) {
          const k = el.childNodes[i]
          if (k.nodeName === 'P' || k.nodeName === 'DIV') count++
        }
        const idx = Math.min(count, blocks.length - 1)
        if (idx < 0) return 0
        const b = blocks[idx]
        return count >= doms.length ? b.rawStart + b.text.length : b.rawStart
      }
      // Sobe até o bloco (filho direto do root) que contém o ponto
      let owner: Node | null = container
      while (owner && owner !== el && owner.parentNode !== el) {
        owner = owner.parentNode
      }
      const idx = owner ? doms.indexOf(owner as HTMLElement) : -1
      if (idx < 0 || idx >= blocks.length) {
        // Estrutura inesperada (mexida pelo navegador): melhor esforço
        const map = buildEditorMap(val, true)
        const vis = Math.min(visOffsetIn(el, container, offset), map.visLen)
        return vis === 0 ? 0 : map.toRaw[vis - 1] + 1
      }
      const b = blocks[idx]
      const vis = visOffsetIn(doms[idx], container, offset)
      return b.rawStart + visToRawInline(b.text, vis, endSide)
    }

    if (range.collapsed) {
      const p = rawPoint(range.startContainer, range.startOffset, true)
      return { start: p, end: p }
    }
    return {
      start: rawPoint(range.startContainer, range.startOffset, false),
      end: rawPoint(range.endContainer, range.endOffset, true),
    }
  }

  /**
   * O navegador faz cirurgia própria no conteúdo: digitar por cima de um
   * trecho formatado gera <b>, <i> e até <span style="font-size:48.6px">
   * com tamanho fixo em pixel — que não acompanha o tamanho do slide e
   * suja o texto salvo. Quando aparece algo que não saiu do nosso
   * renderizador, o conteúdo é redesenhado a partir do texto.
   */
  const temLixo = (el: HTMLElement) =>
    el.querySelector('[style], b, i, font, span:not(.sl-big)') !== null

  const handleInput = (el: HTMLElement) => {
    const val = editorValueOf(el, paragraphs)
    if (!composing.current && temLixo(el)) {
      const caret = selRaw(el, val)
      renderEditor(el, val, caret.start, caret.end)
    }
    onChange?.(val)
  }

  const insertRaw = (el: HTMLElement, inserted: string) => {
    const val = editorValueOf(el, paragraphs)
    const { start, end } = selRaw(el, val)
    const nv = val.slice(0, start) + inserted + val.slice(end)
    const caret = start + inserted.length
    renderEditor(el, nv, caret, caret)
    onChange?.(nv)
  }

  const apply = (marker: string) => {
    const el = ref.current
    if (!el) return
    const val = editorValueOf(el, paragraphs)
    const { start, end } = selRaw(el, val)
    const r = applyMarker(val, start, end, marker)
    renderEditor(el, r.value, r.start, r.end)
    onChange?.(r.value)
  }

  const rendered = paragraphs ? renderParagraphs(value) : renderInline(value)

  if (!onChange) {
    return (
      <div className={className} style={style}>
        {rendered}
      </div>
    )
  }

  if (!editing) {
    return (
      <div
        className={`${className} sl-editable`}
        style={style}
        title="Clique pra editar"
        onClick={(e) => {
          clickPoint.current = { x: e.clientX, y: e.clientY }
          setEditing(true)
        }}
      >
        {value.trim() === '' ? (
          <span className="sl-edit-placeholder">{placeholder}</span>
        ) : (
          rendered
        )}
      </div>
    )
  }

  return (
    <div className={className} style={style}>
      <div className="sl-edit-wrap">
        {/* mousedown prevenido: clicar nos botões não pode tirar o foco da
            caixa, senão a edição fecharia antes do clique valer */}
        <div className="sl-toolbar" onMouseDown={(e) => e.preventDefault()}>
          <button
            type="button"
            className="sl-tb sl-tb--b"
            title="Negrito (Ctrl+B)"
            onClick={() => apply('**')}
          >
            N
          </button>
          <button
            type="button"
            className="sl-tb sl-tb--i"
            title="Itálico (Ctrl+I)"
            onClick={() => apply('*')}
          >
            I
          </button>
          <button
            type="button"
            className="sl-tb sl-tb--u"
            title="Sublinhado (Ctrl+U)"
            onClick={() => apply('_')}
          >
            S
          </button>
          <button
            type="button"
            className="sl-tb"
            title="Frase maior (Cmd+M ou Ctrl+E)"
            onClick={() => apply('==')}
          >
            Frase maior
          </button>
        </div>
        <div
          ref={ref}
          className="sl-edit"
          contentEditable
          role="textbox"
          aria-multiline="true"
          onInput={(e) => handleInput(e.currentTarget)}
          onBeforeInput={(e) => {
            // Digitar por cima de uma seleção é onde o navegador herda
            // formatação e inventa tags: nesse caso a troca é feita no
            // texto, e o conteúdo redesenhado do nosso jeito.
            const sel = window.getSelection()
            const ev = e.nativeEvent as InputEvent
            if (
              ev.inputType === 'insertText' &&
              typeof ev.data === 'string' &&
              sel &&
              !sel.isCollapsed
            ) {
              e.preventDefault()
              insertRaw(e.currentTarget, ev.data)
            }
          }}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={(e) => {
            composing.current = false
            handleInput(e.currentTarget)
          }}
          onBlur={() => setEditing(false)}
          onPaste={(e) => {
            e.preventDefault()
            insertRaw(e.currentTarget, e.clipboardData.getData('text/plain'))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              e.currentTarget.blur()
              return
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              insertRaw(e.currentTarget, '\n')
              return
            }
            if ((e.ctrlKey || e.metaKey) && !e.altKey) {
              const markers: Record<string, string> = {
                b: '**',
                i: '*',
                u: '_',
                e: '==',
                m: '==', // Cmd+M no Mac (Cmd+E abre extensões em alguns navegadores)
              }
              const marker = markers[e.key.toLowerCase()]
              if (marker) {
                e.preventDefault()
                apply(marker)
              }
            }
          }}
        />
      </div>
    </div>
  )
}

/**
 * Enquadramento sem nunca deixar fundo aparecer: a caixa da mídia é
 * `zoom`x o contêiner e desliza no máximo até as bordas coincidirem.
 * A exportação de vídeo usa exatamente a mesma conta no canvas.
 */
export function mediaFrameStyle(media: SlideMedia): CSSProperties {
  const px = media.posX ?? 50
  const py = media.posY ?? 50
  const z = media.zoom ?? 1
  return {
    position: 'absolute',
    width: `${z * 100}%`,
    height: `${z * 100}%`,
    left: `${-(z - 1) * px}%`,
    top: `${-(z - 1) * py}%`,
    objectFit: 'cover',
    objectPosition: `${px}% ${py}%`,
  }
}

function MediaEl({
  media,
  className,
  still = false,
}: {
  media: SlideMedia
  className: string
  /** Miniaturas não tocam o vídeo (só mostram o primeiro frame). */
  still?: boolean
}) {
  const style = mediaFrameStyle(media)
  if (media.kind === 'video') {
    return (
      <video
        className={className}
        style={style}
        src={media.src}
        muted
        loop
        autoPlay={!still}
        preload="auto"
        playsInline
        crossOrigin="anonymous"
      />
    )
  }
  return <img className={className} style={style} src={media.src} alt="" />
}

function Captions({ project }: { project: Project }) {
  return (
    <>
      {project.captionLeft.trim() !== '' && (
        <div className="sl-cap sl-cap--left">{project.captionLeft}</div>
      )}
      {project.captionRight.trim() !== '' && (
        <div className="sl-cap sl-cap--right">{project.captionRight}</div>
      )}
    </>
  )
}

function Chrome({ project }: { project: Project }) {
  return <Captions project={project} />
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="sl-placeholder">
      <span>{label}</span>
    </div>
  )
}

function SplitHalfLayers({
  half,
  region,
  vertical,
  textStyle,
  mode,
  still,
  onEdit,
}: {
  half: SplitHalf
  region: 'top' | 'bottom'
  vertical: boolean
  textStyle: CSSProperties
  mode: RenderMode
  still: boolean
  onEdit?: (v: string) => void
}) {
  // Na vertical as mesmas metades viram esquerda e direita.
  const lado = vertical ? (region === 'top' ? 'left' : 'right') : region
  return (
    <div
      className={`sl-split-half sl-split-half--${lado}${vertical ? ' sl-split-half--v' : ''}`}
    >
      {half.media && mode !== 'overlay' && (
        <MediaEl media={half.media} className="sl-media-abs" still={still} />
      )}
      {!half.media && mode === 'full' && (
        <div className="sl-split-placeholder">
          <span>
            {vertical
              ? region === 'top'
                ? 'Foto da esquerda'
                : 'Foto da direita'
              : region === 'top'
                ? 'Foto da metade de cima'
                : 'Foto da metade de baixo'}
          </span>
        </div>
      )}
      {half.text.trim() !== '' && <div className="sl-split-grad" />}
      <EditableText
        value={half.text}
        onChange={onEdit}
        className="sl-split-text"
        style={textStyle}
        placeholder={
          vertical
            ? region === 'top'
              ? 'Clique e escreva o texto da esquerda…'
              : 'Clique e escreva o texto da direita…'
            : region === 'top'
              ? 'Clique e escreva o texto de cima…'
              : 'Clique e escreva o texto de baixo…'
        }
      />
    </div>
  )
}

function SplitLayers({
  slide,
  mode,
  still,
  onTextEdit,
}: {
  slide: SplitSlide
  mode: RenderMode
  still: boolean
  onTextEdit?: (field: EditField, value: string) => void
}) {
  const textStyle = slideTextStyle(slide)
  const vertical = slide.orientation === 'vertical'
  return (
    <>
      <SplitHalfLayers
        half={slide.top}
        region="top"
        vertical={vertical}
        textStyle={textStyle}
        mode={mode}
        still={still}
        onEdit={onTextEdit && ((v) => onTextEdit('top', v))}
      />
      <SplitHalfLayers
        half={slide.bottom}
        region="bottom"
        vertical={vertical}
        textStyle={textStyle}
        mode={mode}
        still={still}
        onEdit={onTextEdit && ((v) => onTextEdit('bottom', v))}
      />
    </>
  )
}

function ComparisonLayers({
  slide,
  media,
  mode,
  still,
  onEdit,
}: {
  slide: ComparisonSlide
  media: SlideMedia | null
  mode: RenderMode
  still: boolean
  onEdit?: (v: string) => void
}) {
  const posClass =
    slide.textPosition === 'top' ? 'sl-comp-text--top' : 'sl-comp-text--bottom'
  const gradClass =
    slide.textPosition === 'top' ? 'sl-grad--top' : 'sl-grad--bottom'
  return (
    <>
      {media && mode !== 'overlay' && (
        <MediaEl media={media} className="sl-media-full" still={still} />
      )}
      {!media && mode === 'full' && (
        <Placeholder label={'Sem foto ainda.\nUse “Enviar arquivo” ou “Colar imagem”.'} />
      )}
      {slide.text.trim() !== '' && <div className={gradClass} />}
      <EditableText
        value={slide.text}
        onChange={onEdit}
        className={`sl-comp-text ${posClass}`}
        style={slideTextStyle(slide)}
        placeholder="Clique e escreva a frase…"
      />
    </>
  )
}

function DevelopmentLayers({
  slide,
  media,
  mode,
  still,
  onEdit,
}: {
  slide: DevelopmentSlide
  media: SlideMedia | null
  mode: RenderMode
  still: boolean
  onEdit?: (v: string) => void
}) {
  return (
    <>
      {media && mode !== 'overlay' && (
        <MediaEl media={media} className="sl-media-full" still={still} />
      )}
      {/* sombra forte por cima da foto pra garantir a leitura do texto;
          entra na arte transparente também, pra escurecer o vídeo composto */}
      {media && <div className="sl-dev-scrim" />}
      <EditableText
        value={slide.body}
        onChange={onEdit}
        className="sl-dev"
        style={slideTextStyle(slide)}
        paragraphs
        placeholder="Clique e escreva o desenvolvimento…"
      />
    </>
  )
}

function BookLayers({
  slide,
  media,
  mode,
  onEdit,
}: {
  slide: BookSlide
  media: SlideMedia | null
  mode: RenderMode
  onEdit?: (v: string) => void
}) {
  return (
    <div className="sl-book" style={slideTextStyle(slide)}>
      {media ? (
        // Na arte transparente a imagem fica invisível mas segura o lugar,
        // senão o texto sobe e desalinha em relação ao slide completo.
        <img
          className={
            mode === 'overlay' ? 'sl-book-img sl-book-img--ghost' : 'sl-book-img'
          }
          src={media.src}
          alt=""
        />
      ) : mode === 'full' ? (
        <div className="sl-book-img sl-book-img--empty">
          <span>Capa do livro / imagem do produto</span>
        </div>
      ) : (
        // Exportar sem imagem: um espaçador invisível do mesmo tamanho do
        // placeholder mantém o texto na mesma posição que o preview mostrou.
        <div className="sl-book-img sl-book-img--empty sl-book-img--ghost" />
      )}
      <EditableText
        value={slide.body}
        onChange={onEdit}
        className="sl-book-body"
        paragraphs
        placeholder="Clique e escreva o texto…"
      />
    </div>
  )
}

function FinalLayers({
  slide,
  media,
  mode,
  still,
  onEdit,
}: {
  slide: FinalSlide
  media: SlideMedia | null
  mode: RenderMode
  still: boolean
  onEdit?: (v: string) => void
}) {
  return (
    <>
      {media && mode !== 'overlay' && (
        <div className="sl-final-media">
          <MediaEl media={media} className="sl-media-fill" still={still} />
        </div>
      )}
      {!media && mode === 'full' && (
        <div className="sl-final-media sl-final-media--empty">
          <span>{'Foto do slide final'}</span>
        </div>
      )}
      <EditableText
        value={slide.text}
        onChange={onEdit}
        className="sl-final-text"
        style={slideTextStyle(slide)}
        paragraphs
        placeholder="Clique e escreva o convite…"
      />
    </>
  )
}

/** Foto deitada em cima, bloco preto embaixo: título forte + parágrafos. */
function PhotoTopLayers({
  slide,
  media,
  mode,
  still,
  onTextEdit,
}: {
  slide: PhotoTopSlide
  media: SlideMedia | null
  mode: RenderMode
  still: boolean
  onTextEdit?: (field: EditField, value: string) => void
}) {
  const textStyle = slideTextStyle(slide)
  return (
    <>
      <div className="sl-pt-media">
        {media && mode !== 'overlay' && (
          <MediaEl media={media} className="sl-media-fill" still={still} />
        )}
        {!media && mode === 'full' && (
          <div className="sl-pt-media-empty">
            <span>Foto deitada aqui em cima</span>
          </div>
        )}
      </div>
      <EditableText
        value={slide.body}
        onChange={onTextEdit && ((v) => onTextEdit('body', v))}
        className="sl-pt-text"
        style={textStyle}
        paragraphs
        placeholder="Clique e escreva o texto…"
      />
    </>
  )
}

export function SlideRenderer({
  slide,
  project,
  width,
  mode = 'full',
  thumbnail = false,
  onTextEdit,
}: RendererProps) {
  const scale = width / SLIDE_W
  const outerStyle: CSSProperties = {
    width,
    height: Math.round(width * (SLIDE_H / SLIDE_W)),
  }
  const media = 'media' in slide ? slide.media : null

  let layers: JSX.Element
  switch (slide.type) {
    case 'split':
      layers = (
        <SplitLayers slide={slide} mode={mode} still={thumbnail} onTextEdit={onTextEdit} />
      )
      break
    case 'comparison':
      layers = (
        <ComparisonLayers
          slide={slide}
          media={media}
          mode={mode}
          still={thumbnail}
          onEdit={onTextEdit && ((v) => onTextEdit('text', v))}
        />
      )
      break
    case 'development':
      layers = (
        <DevelopmentLayers
          slide={slide}
          media={media}
          mode={mode}
          still={thumbnail}
          onEdit={onTextEdit && ((v) => onTextEdit('body', v))}
        />
      )
      break
    case 'book':
      layers = (
        <BookLayers
          slide={slide}
          media={media}
          mode={mode}
          onEdit={onTextEdit && ((v) => onTextEdit('body', v))}
        />
      )
      break
    case 'photoTop':
      layers = (
        <PhotoTopLayers
          slide={slide}
          media={media}
          mode={mode}
          still={thumbnail}
          onTextEdit={onTextEdit}
        />
      )
      break
    case 'final':
      layers = (
        <FinalLayers
          slide={slide}
          media={media}
          mode={mode}
          still={thumbnail}
          onEdit={onTextEdit && ((v) => onTextEdit('text', v))}
        />
      )
      break
  }

  const rootClass = [
    'sl-root',
    `sl-font--${project.font}`,
    mode === 'overlay' ? 'sl-root--overlay' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="sl-scale-outer" style={outerStyle}>
      <div className={rootClass} style={{ transform: `scale(${scale})` }}>
        {layers}
        <Chrome project={project} />
      </div>
    </div>
  )
}
