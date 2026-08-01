import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type {
  BookSlide,
  ComparisonSlide,
  DevelopmentSlide,
  FinalSlide,
  Project,
  Slide,
  SlideMedia,
  SplitHalf,
  SplitSlide,
} from '../types'
import {
  applyMarker,
  buildEditingFragment,
  renderInline,
  renderParagraphs,
} from '../markdown'

/** Campo de texto de um slide, pra edição direto na arte. */
export type EditField = 'text' | 'body' | 'top' | 'bottom'

export const SLIDE_W = 1080
export const SLIDE_H = 1350

/** Fração da largura ocupada pela foto no slide final. */
export const FINAL_MEDIA_FRAC = 0.44

// Calibrado pra densidade real do formato: os slides carregam bastante
// texto, então os padrões assumem parágrafos cheios. Cada tipo tem sua
// escala (o Desenvolvimento 2 desce até 28px pra textos bem longos).
const FONT_SIZES: Record<Slide['type'], number[]> = {
  split: [28, 32, 36, 40, 45],
  comparison: [32, 36, 40, 45, 50],
  development: [26, 30, 34, 38, 43],
  book: [26, 30, 34, 38, 42],
  final: [28, 33, 38, 43, 48, 54, 60],
}

/** Passo padrão de cada tipo (mantém o tamanho visual de sempre). */
export const DEFAULT_STEPS: Record<Slide['type'], number> = {
  split: 2,
  comparison: 2,
  development: 2,
  book: 2,
  final: 4,
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
// O conteúdo mostrado durante a edição é reconstruído a cada tecla a partir
// do texto cru, então negrito/itálico/sublinhado/frase maior aparecem na
// hora. O cursor é guardado como "quantos caracteres desde o início" antes
// de reconstruir e recolocado depois — os marcadores contam como texto,
// então as posições sempre batem.

/** Texto cru do editor: nós de texto + <br> viram \n; um \n sentinela no
 *  fim (posto pelo renderEditor pra linha vazia final aparecer) é removido. */
function editorTextOf(root: Node): string {
  let out = ''
  root.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) out += (n as Text).data
    else if (n.nodeName === 'BR') out += '\n'
    else out += editorTextOf(n)
  })
  return out
}

function editorText(root: HTMLElement): string {
  const raw = editorTextOf(root)
  return raw.endsWith('\n') ? raw.slice(0, -1) : raw
}

/** Posição da seleção em nº de caracteres desde o início do editor. */
function editorSelection(el: HTMLElement): { start: number; end: number } {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 }
  const range = sel.getRangeAt(0)
  const offsetOf = (container: Node, offset: number): number => {
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
        chars += 1
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
    walk(el)
    return chars
  }
  return {
    start: offsetOf(range.startContainer, range.startOffset),
    end: offsetOf(range.endContainer, range.endOffset),
  }
}

/** Recoloca o cursor/seleção na posição em caracteres dada. */
function editorSetSelection(el: HTMLElement, start: number, end: number) {
  const locate = (target: number): { node: Node; offset: number } => {
    let chars = 0
    let res: { node: Node; offset: number } | null = null
    let last: { node: Node; offset: number } = { node: el, offset: 0 }
    const walk = (node: Node) => {
      if (res) return
      if (node.nodeType === Node.TEXT_NODE) {
        const len = (node as Text).data.length
        if (chars + len >= target) {
          res = { node, offset: target - chars }
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
    walk(el)
    return res ?? last
  }
  const s = locate(start)
  const e = locate(end)
  const range = document.createRange()
  range.setStart(s.node, s.offset)
  range.setEnd(e.node, e.offset)
  const sel = window.getSelection()
  if (!sel) return
  sel.removeAllRanges()
  sel.addRange(range)
}

/**
 * Texto do slide que vira campo de edição ao clicar: mesma fonte, mesmo
 * lugar, formatação visível na hora. Esc ou clicar fora conclui.
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
  const composing = useRef(false)

  const renderEditor = (
    el: HTMLElement,
    val: string,
    selStart: number,
    selEnd: number,
  ) => {
    el.replaceChildren(buildEditingFragment(val))
    // \n sentinela: sem ele, um Enter no fim do texto não mostra a linha nova
    el.appendChild(document.createTextNode('\n'))
    const max = val.length
    editorSetSelection(el, Math.min(selStart, max), Math.min(selEnd, max))
  }

  useEffect(() => {
    if (!editing) return
    const el = ref.current
    if (!el) return
    el.focus()
    renderEditor(el, value, value.length, value.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  const handleInput = (el: HTMLElement) => {
    const text = editorText(el)
    const sel = editorSelection(el)
    renderEditor(el, text, sel.start, sel.end)
    onChange?.(text)
  }

  const insertText = (el: HTMLElement, inserted: string) => {
    const sel = editorSelection(el)
    const v = editorText(el)
    const nv = v.slice(0, sel.start) + inserted + v.slice(sel.end)
    renderEditor(el, nv, sel.start + inserted.length, sel.start + inserted.length)
    onChange?.(nv)
  }

  const apply = (marker: string) => {
    const el = ref.current
    if (!el) return
    const sel = editorSelection(el)
    const r = applyMarker(editorText(el), sel.start, sel.end, marker)
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
        onClick={() => setEditing(true)}
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
          onInput={(e) => {
            if (!composing.current) handleInput(e.currentTarget)
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
            insertText(e.currentTarget, e.clipboardData.getData('text/plain'))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              e.currentTarget.blur()
              return
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              insertText(e.currentTarget, '\n')
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
  textStyle,
  mode,
  still,
  onEdit,
}: {
  half: SplitHalf
  region: 'top' | 'bottom'
  textStyle: CSSProperties
  mode: RenderMode
  still: boolean
  onEdit?: (v: string) => void
}) {
  return (
    <div className={`sl-split-half sl-split-half--${region}`}>
      {half.media && mode !== 'overlay' && (
        <MediaEl media={half.media} className="sl-media-abs" still={still} />
      )}
      {!half.media && mode === 'full' && (
        <div className="sl-split-placeholder">
          <span>
            {region === 'top' ? 'Foto da metade de cima' : 'Foto da metade de baixo'}
          </span>
        </div>
      )}
      {half.text.trim() !== '' && <div className="sl-split-grad" />}
      <EditableText
        value={half.text}
        onChange={onEdit}
        className="sl-split-text"
        style={textStyle}
        placeholder={region === 'top' ? 'Clique e escreva o texto de cima…' : 'Clique e escreva o texto de baixo…'}
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
  return (
    <>
      <SplitHalfLayers
        half={slide.top}
        region="top"
        textStyle={textStyle}
        mode={mode}
        still={still}
        onEdit={onTextEdit && ((v) => onTextEdit('top', v))}
      />
      <SplitHalfLayers
        half={slide.bottom}
        region="bottom"
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
