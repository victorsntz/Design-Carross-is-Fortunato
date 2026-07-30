import type { CSSProperties } from 'react'
import type {
  BookSlide,
  ComparisonSlide,
  DevelopmentSlide,
  FinalSlide,
  Project,
  Slide,
  SlideMedia,
} from '../types'
import { renderInline, renderParagraphs } from '../markdown'

export const SLIDE_W = 1080
export const SLIDE_H = 1350

/** Fração da largura ocupada pela foto no slide final. */
export const FINAL_MEDIA_FRAC = 0.44

export const SIZE_STEPS = 5
export const DEFAULT_STEP = 2

const FONT_SIZES: Record<Slide['type'], number[]> = {
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

export type RenderMode = 'full' | 'overlay'

interface RendererProps {
  slide: Slide
  project: Project
  /** Largura de exibição em px; o slide é desenhado em 1080x1350 e escalado. */
  width: number
  mode?: RenderMode
  /** Substitui a mídia do slide (ex.: frame de um vídeo virando imagem). */
  mediaOverride?: SlideMedia | null
}

function MediaEl({ media, className }: { media: SlideMedia; className: string }) {
  if (media.kind === 'video') {
    return (
      <video
        className={className}
        src={media.src}
        muted
        loop
        autoPlay
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

function Chrome({ project, mode }: { project: Project; mode: RenderMode }) {
  return (
    <>
      <div className={mode === 'overlay' ? 'sl-grain sl-grain--flat' : 'sl-grain'} />
      <div className="sl-frame" />
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

function ComparisonLayers({
  slide,
  media,
  mode,
}: {
  slide: ComparisonSlide
  media: SlideMedia | null
  mode: RenderMode
}) {
  const fontSize = fontSizeFor(slide)
  const posClass =
    slide.textPosition === 'top' ? 'sl-comp-text--top' : 'sl-comp-text--bottom'
  const gradClass =
    slide.textPosition === 'top' ? 'sl-grad--top' : 'sl-grad--bottom'
  return (
    <>
      {media && mode !== 'overlay' && (
        <MediaEl media={media} className="sl-media-full" />
      )}
      {!media && mode === 'full' && (
        <Placeholder label={'Sem mídia ainda.\nUse “Adicionar foto ou vídeo”.'} />
      )}
      <div className={gradClass} />
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
      {media && mode !== 'overlay' ? (
        <img className="sl-book-img" src={media.src} alt="" />
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
}: {
  slide: FinalSlide
  media: SlideMedia | null
  mode: RenderMode
}) {
  const fontSize = fontSizeFor(slide)
  return (
    <>
      {media && mode !== 'overlay' && (
        <div className="sl-final-media">
          <MediaEl media={media} className="sl-media-fill" />
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
  mediaOverride,
}: RendererProps) {
  const scale = width / SLIDE_W
  const outerStyle: CSSProperties = {
    width,
    height: Math.round(width * (SLIDE_H / SLIDE_W)),
  }
  const media =
    mediaOverride !== undefined
      ? mediaOverride
      : 'media' in slide
        ? slide.media
        : null

  let layers: JSX.Element
  switch (slide.type) {
    case 'comparison':
      layers = <ComparisonLayers slide={slide} media={media} mode={mode} />
      break
    case 'development':
      layers = <DevelopmentLayers slide={slide} />
      break
    case 'book':
      layers = <BookLayers slide={slide} media={media} mode={mode} />
      break
    case 'final':
      layers = <FinalLayers slide={slide} media={media} mode={mode} />
      break
  }

  return (
    <div className="sl-scale-outer" style={outerStyle}>
      <div
        className={mode === 'overlay' ? 'sl-root sl-root--overlay' : 'sl-root'}
        style={{ transform: `scale(${scale})` }}
      >
        {layers}
        <Chrome project={project} mode={mode} />
      </div>
    </div>
  )
}
