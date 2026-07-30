import type { CSSProperties } from 'react'
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
import { renderInline, renderParagraphs } from '../markdown'

export const SLIDE_W = 1080
export const SLIDE_H = 1350

/** Fração da largura ocupada pela foto no slide final. */
export const FINAL_MEDIA_FRAC = 0.44

export const SIZE_STEPS = 5
export const DEFAULT_STEP = 2

const FONT_SIZES: Record<Slide['type'], number[]> = {
  split: [30, 34, 38, 43, 48],
  comparison: [38, 44, 50, 57, 64],
  development: [30, 34, 38, 43, 48],
  book: [28, 32, 36, 40, 45],
  final: [44, 50, 56, 63, 70],
}

export function fontSizeFor(slide: Slide): number {
  const sizes = FONT_SIZES[slide.type]
  const step = Math.min(Math.max(slide.sizeStep, 0), sizes.length - 1)
  return sizes[step]
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
  if (media.kind === 'video') {
    return (
      <video
        className={className}
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
  return <img className={className} src={media.src} alt="" />
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

function Chrome({
  project,
  frame = true,
}: {
  project: Project
  /** Tela partida desenha uma moldura por metade, então dispensa a geral. */
  frame?: boolean
}) {
  return (
    <>
      {frame && <div className="sl-frame" />}
      <Captions project={project} />
    </>
  )
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
  fontSize,
  mode,
  still,
}: {
  half: SplitHalf
  region: 'top' | 'bottom'
  fontSize: number
  mode: RenderMode
  still: boolean
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
      <div className="sl-split-grad" />
      <div className="sl-split-text" style={{ fontSize }}>
        {renderInline(half.text)}
      </div>
      <div className={`sl-split-frame sl-split-frame--${region}`} />
    </div>
  )
}

function SplitLayers({
  slide,
  mode,
  still,
}: {
  slide: SplitSlide
  mode: RenderMode
  still: boolean
}) {
  const fontSize = fontSizeFor(slide)
  return (
    <>
      <SplitHalfLayers
        half={slide.top}
        region="top"
        fontSize={fontSize}
        mode={mode}
        still={still}
      />
      <SplitHalfLayers
        half={slide.bottom}
        region="bottom"
        fontSize={fontSize}
        mode={mode}
        still={still}
      />
    </>
  )
}

function ComparisonLayers({
  slide,
  media,
  mode,
  still,
}: {
  slide: ComparisonSlide
  media: SlideMedia | null
  mode: RenderMode
  still: boolean
}) {
  const fontSize = fontSizeFor(slide)
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
        <Placeholder label={'Sem foto ainda.\nUse “Adicionar foto ou vídeo”.'} />
      )}
      {slide.text.trim() !== '' && <div className={gradClass} />}
      <div className={`sl-comp-text ${posClass}`} style={{ fontSize }}>
        {renderInline(slide.text)}
      </div>
    </>
  )
}

function DevelopmentLayers({ slide }: { slide: DevelopmentSlide }) {
  const fontSize = fontSizeFor(slide)
  return (
    <div className="sl-dev" style={{ fontSize }}>
      {renderParagraphs(slide.body)}
      {slide.emphasis.trim() !== '' && (
        <p className="sl-emphasis">{renderInline(slide.emphasis)}</p>
      )}
    </div>
  )
}

function BookLayers({
  slide,
  media,
  mode,
}: {
  slide: BookSlide
  media: SlideMedia | null
  mode: RenderMode
}) {
  const fontSize = fontSizeFor(slide)
  return (
    <div className="sl-book" style={{ fontSize }}>
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
      ) : (
        mode === 'full' && (
          <div className="sl-book-img sl-book-img--empty">
            <span>Capa do livro / imagem do produto</span>
          </div>
        )
      )}
      <div className="sl-book-body">{renderParagraphs(slide.body)}</div>
    </div>
  )
}

function FinalLayers({
  slide,
  media,
  mode,
  still,
}: {
  slide: FinalSlide
  media: SlideMedia | null
  mode: RenderMode
  still: boolean
}) {
  const fontSize = fontSizeFor(slide)
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
      <div className="sl-final-text" style={{ fontSize }}>
        {renderParagraphs(slide.text)}
      </div>
    </>
  )
}

export function SlideRenderer({
  slide,
  project,
  width,
  mode = 'full',
  thumbnail = false,
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
      layers = <SplitLayers slide={slide} mode={mode} still={thumbnail} />
      break
    case 'comparison':
      layers = (
        <ComparisonLayers slide={slide} media={media} mode={mode} still={thumbnail} />
      )
      break
    case 'development':
      layers = <DevelopmentLayers slide={slide} />
      break
    case 'book':
      layers = <BookLayers slide={slide} media={media} mode={mode} />
      break
    case 'final':
      layers = <FinalLayers slide={slide} media={media} mode={mode} still={thumbnail} />
      break
  }

  const rootClass = [
    'sl-root',
    `sl-align--${project.align}`,
    mode === 'overlay' ? 'sl-root--overlay' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="sl-scale-outer" style={outerStyle}>
      <div className={rootClass} style={{ transform: `scale(${scale})` }}>
        {layers}
        <Chrome project={project} frame={slide.type !== 'split'} />
      </div>
    </div>
  )
}
