import { domToBlob, domToDataUrl } from 'modern-screenshot'
import JSZip from 'jszip'
import type { Project, Slide, SlideMedia } from './types'
import { withRenderedSlide } from './exportRender'
import { videoPosterFrame } from './media'
import { FINAL_MEDIA_FRAC, SLIDE_H, SLIDE_W } from './components/SlideRenderer'

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

function slideMedia(slide: Slide): SlideMedia | null {
  return 'media' in slide ? slide.media : null
}

/** Vídeo vira frame estático quando o destino é PNG. */
async function pngMediaOverride(slide: Slide): Promise<SlideMedia | null | undefined> {
  const media = slideMedia(slide)
  if (media && media.kind === 'video') {
    const poster = await videoPosterFrame(media.src)
    return { kind: 'image', src: poster, name: media.name }
  }
  return undefined
}

const CAPTURE_OPTS = { width: SLIDE_W, height: SLIDE_H, scale: 1 }

export async function exportSlidePng(slide: Slide, project: Project): Promise<Blob> {
  const override = await pngMediaOverride(slide)
  return withRenderedSlide(slide, project, 'full', override, (node) =>
    domToBlob(node, { ...CAPTURE_OPTS, type: 'image/png' }),
  )
}

/** PNG transparente só com a arte (sem a mídia), pra compor sobre vídeo. */
export async function exportOverlayPng(slide: Slide, project: Project): Promise<Blob> {
  return withRenderedSlide(slide, project, 'overlay', null, (node) =>
    domToBlob(node, { ...CAPTURE_OPTS, type: 'image/png' }),
  )
}

async function overlayDataUrl(slide: Slide, project: Project): Promise<string> {
  return withRenderedSlide(slide, project, 'overlay', null, (node) =>
    domToDataUrl(node, { ...CAPTURE_OPTS, type: 'image/png' }),
  )
}

export async function exportAllPngZip(
  project: Project,
  onProgress: (done: number, total: number) => void,
): Promise<Blob> {
  const zip = new JSZip()
  const total = project.slides.length
  for (let i = 0; i < total; i++) {
    const slide = project.slides[i]
    const blob = await exportSlidePng(slide, project)
    const n = String(i + 1).padStart(2, '0')
    zip.file(`slide-${n}.png`, blob)
    onProgress(i + 1, total)
  }
  return zip.generateAsync({ type: 'blob' })
}

/** Região que a mídia ocupa no slide, em px do slide (1080x1350). */
function mediaRect(slide: Slide): { x: number; y: number; w: number; h: number } {
  if (slide.type === 'final') {
    const w = Math.round(SLIDE_W * FINAL_MEDIA_FRAC)
    return { x: SLIDE_W - w, y: 0, w, h: SLIDE_H }
  }
  return { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H }
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  rect: { x: number; y: number; w: number; h: number },
): void {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return
  const scale = Math.max(rect.w / vw, rect.h / vh)
  const dw = vw * scale
  const dh = vh * scale
  const dx = rect.x + (rect.w - dw) / 2
  const dy = rect.y + (rect.h - dh) / 2
  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.w, rect.h)
  ctx.clip()
  ctx.drawImage(video, dx, dy, dw, dh)
  ctx.restore()
}

function pickVideoMime(): string | null {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm',
  ]
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) {
      return c
    }
  }
  return null
}

export interface VideoExportResult {
  blob: Blob
  extension: 'mp4' | 'webm'
}

/**
 * Exporta o slide como vídeo: o vídeo de fundo é tocado em tempo real num
 * canvas 1080x1350 com a arte (textos, borda, granulado) composta por cima.
 */
export async function exportSlideVideo(
  slide: Slide,
  project: Project,
  onProgress: (fraction: number) => void,
): Promise<VideoExportResult> {
  const media = slideMedia(slide)
  if (!media || media.kind !== 'video') {
    throw new Error('Este slide não tem vídeo.')
  }
  const mime = pickVideoMime()
  if (!mime) {
    throw new Error('Este navegador não suporta gravação de vídeo. Use o Chrome.')
  }

  const overlayUrl = await overlayDataUrl(slide, project)
  const overlay = new Image()
  overlay.src = overlayUrl
  await overlay.decode()

  const video = document.createElement('video')
  video.src = media.src
  video.muted = true
  video.playsInline = true
  await new Promise<void>((resolve, reject) => {
    video.addEventListener('loadedmetadata', () => resolve(), { once: true })
    video.addEventListener('error', () => reject(new Error('Falha ao ler o vídeo')), {
      once: true,
    })
    video.load()
  })

  const canvas = document.createElement('canvas')
  canvas.width = SLIDE_W
  canvas.height = SLIDE_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D indisponível')

  const rect = mediaRect(slide)
  const drawFrame = () => {
    ctx.fillStyle = '#0b0b0b'
    ctx.fillRect(0, 0, SLIDE_W, SLIDE_H)
    drawCover(ctx, video, rect)
    ctx.drawImage(overlay, 0, 0, SLIDE_W, SLIDE_H)
  }
  drawFrame()

  const stream = canvas.captureStream(30)
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 12_000_000,
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })

  recorder.start(250)
  await video.play()

  await new Promise<void>((resolve) => {
    let rafId = 0
    const tick = () => {
      drawFrame()
      if (video.duration > 0) onProgress(Math.min(1, video.currentTime / video.duration))
      if (video.ended) {
        cancelAnimationFrame(rafId)
        resolve()
        return
      }
      rafId = requestAnimationFrame(tick)
    }
    video.addEventListener(
      'ended',
      () => {
        cancelAnimationFrame(rafId)
        resolve()
      },
      { once: true },
    )
    rafId = requestAnimationFrame(tick)
  })

  drawFrame()
  recorder.stop()
  await stopped
  stream.getTracks().forEach((t) => t.stop())

  return {
    blob: new Blob(chunks, { type: mime }),
    extension: mime.includes('mp4') ? 'mp4' : 'webm',
  }
}
