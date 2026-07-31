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

/** O slide tem algum vídeo (em qualquer espaço de mídia)? */
export function slideHasVideo(slide: Slide): boolean {
  if (slide.type === 'split') {
    return (
      slide.top.media?.kind === 'video' || slide.bottom.media?.kind === 'video'
    )
  }
  return 'media' in slide && slide.media?.kind === 'video'
}

/** Vídeos viram frame estático quando o destino é PNG. */
async function posterizeSlide(slide: Slide): Promise<Slide> {
  const fix = async (m: SlideMedia | null): Promise<SlideMedia | null> =>
    m && m.kind === 'video'
      ? { ...m, kind: 'image', src: await videoPosterFrame(m.src) }
      : m
  if (slide.type === 'split') {
    return {
      ...slide,
      top: { ...slide.top, media: await fix(slide.top.media) },
      bottom: { ...slide.bottom, media: await fix(slide.bottom.media) },
    }
  }
  if ('media' in slide) {
    return { ...slide, media: await fix(slide.media) }
  }
  return slide
}

const CAPTURE_OPTS = { width: SLIDE_W, height: SLIDE_H, scale: 1 }

export async function exportSlidePng(slide: Slide, project: Project): Promise<Blob> {
  const posterized = await posterizeSlide(slide)
  return withRenderedSlide(posterized, project, 'export', (node) =>
    domToBlob(node, { ...CAPTURE_OPTS, type: 'image/png' }),
  )
}

/** PNG transparente só com a arte (sem as mídias), pra compor sobre vídeo. */
export async function exportOverlayPng(slide: Slide, project: Project): Promise<Blob> {
  return withRenderedSlide(slide, project, 'overlay', (node) =>
    domToBlob(node, { ...CAPTURE_OPTS, type: 'image/png' }),
  )
}

async function overlayDataUrl(slide: Slide, project: Project): Promise<string> {
  return withRenderedSlide(slide, project, 'overlay', (node) =>
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

// ---------------------------------------------------------------------------
// Exportação de vídeo
// ---------------------------------------------------------------------------

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface MediaLayer {
  media: SlideMedia
  rect: Rect
}

/** Onde cada mídia fica no slide, em px do slide (1080x1350). */
function mediaLayers(slide: Slide): MediaLayer[] {
  if (slide.type === 'split') {
    const half = SLIDE_H / 2
    const layers: MediaLayer[] = []
    if (slide.top.media) {
      layers.push({ media: slide.top.media, rect: { x: 0, y: 0, w: SLIDE_W, h: half } })
    }
    if (slide.bottom.media) {
      layers.push({
        media: slide.bottom.media,
        rect: { x: 0, y: half, w: SLIDE_W, h: half },
      })
    }
    return layers
  }
  if (slide.type === 'final') {
    if (!slide.media) return []
    const w = Math.round(SLIDE_W * FINAL_MEDIA_FRAC)
    return [{ media: slide.media, rect: { x: SLIDE_W - w, y: 0, w, h: SLIDE_H } }]
  }
  if ('media' in slide && slide.media) {
    return [{ media: slide.media, rect: { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H } }]
  }
  return []
}

interface Drawable {
  el: HTMLVideoElement | HTMLImageElement
  rect: Rect
  media: SlideMedia
}

/** Mesma conta do mediaFrameStyle do renderer — o vídeo composto no canvas
 *  sai com o MESMO enquadramento (posição + zoom) do preview. */
function drawCover(ctx: CanvasRenderingContext2D, d: Drawable): void {
  const el = d.el
  const sw = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth
  const sh = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight
  if (!sw || !sh) return
  const px = (d.media.posX ?? 50) / 100
  const py = (d.media.posY ?? 50) / 100
  const z = d.media.zoom ?? 1
  const bx = d.rect.x - (z - 1) * d.rect.w * px
  const by = d.rect.y - (z - 1) * d.rect.h * py
  const bw = d.rect.w * z
  const bh = d.rect.h * z
  const scale = Math.max(bw / sw, bh / sh)
  const dw = sw * scale
  const dh = sh * scale
  const dx = bx + (bw - dw) * px
  const dy = by + (bh - dh) * py
  ctx.save()
  ctx.beginPath()
  ctx.rect(d.rect.x, d.rect.y, d.rect.w, d.rect.h)
  ctx.clip()
  ctx.drawImage(el, dx, dy, dw, dh)
  ctx.restore()
}

function pickVideoMimes(): string[] {
  if (typeof MediaRecorder === 'undefined') return []
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp9',
    'video/webm',
  ]
  const supported = candidates.filter((c) => MediaRecorder.isTypeSupported(c))
  // No máximo um formato de cada família: o segundo da mesma família só
  // repetiria o resultado do primeiro.
  const mp4 = supported.find((c) => c.startsWith('video/mp4'))
  const webm = supported.find((c) => c.startsWith('video/webm'))
  return [mp4, webm].filter((c): c is string => Boolean(c))
}

async function loadVideoEl(src: string): Promise<HTMLVideoElement> {
  const video = document.createElement('video')
  video.src = src
  video.muted = true
  video.playsInline = true
  // 'loadeddata' (e não só 'loadedmetadata') garante que o primeiro frame já
  // pode ser desenhado — senão a gravação começa com quadros pretos.
  await new Promise<void>((resolve, reject) => {
    video.addEventListener('loadeddata', () => resolve(), { once: true })
    video.addEventListener('error', () => reject(new Error('Falha ao ler o vídeo')), {
      once: true,
    })
    video.load()
  })
  return video
}

export interface VideoExportResult {
  blob: Blob
  extension: 'mp4' | 'webm'
}

/**
 * Exporta o slide como vídeo: as mídias tocam em tempo real num canvas
 * 1080x1350 com a arte (textos, molduras, granulado) composta por cima.
 * Funciona também na tela partida com dois vídeos ao mesmo tempo.
 */
export async function exportSlideVideo(
  slide: Slide,
  project: Project,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<VideoExportResult> {
  const layers = mediaLayers(slide)
  if (!layers.some((l) => l.media.kind === 'video')) {
    throw new Error('Este slide não tem vídeo.')
  }
  const mimes = pickVideoMimes()
  if (mimes.length === 0) {
    throw new Error('Este navegador não suporta gravação de vídeo. Use o Chrome.')
  }

  const overlayUrl = await overlayDataUrl(slide, project)
  const overlay = new Image()
  overlay.src = overlayUrl
  await overlay.decode()

  const drawables: Drawable[] = []
  const videos: HTMLVideoElement[] = []
  for (const layer of layers) {
    if (layer.media.kind === 'video') {
      const el = await loadVideoEl(layer.media.src)
      videos.push(el)
      drawables.push({ el, rect: layer.rect, media: layer.media })
    } else {
      const el = new Image()
      el.src = layer.media.src
      await el.decode()
      drawables.push({ el, rect: layer.rect, media: layer.media })
    }
  }

  // O vídeo "principal" dita a duração; os outros ficam em loop.
  const finite = videos.filter((v) => Number.isFinite(v.duration))
  const main =
    finite.length > 0
      ? finite.reduce((a, b) => (b.duration > a.duration ? b : a))
      : videos[0]
  for (const v of videos) {
    if (v !== main) v.loop = true
  }

  const canvas = document.createElement('canvas')
  canvas.width = SLIDE_W
  canvas.height = SLIDE_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D indisponível')

  const drawFrame = () => {
    ctx.fillStyle = '#0b0b0b'
    ctx.fillRect(0, 0, SLIDE_W, SLIDE_H)
    for (const d of drawables) drawCover(ctx, d)
    ctx.drawImage(overlay, 0, 0, SLIDE_W, SLIDE_H)
  }

  // Áudio original dos vídeos entra na gravação via AudioContext. Conectar
  // as fontes só ao destino de gravação (e não aos alto-falantes) mantém a
  // exportação silenciosa pra quem está usando o app.
  let audioCtx: AudioContext | null = null
  let audioTracks: MediaStreamTrack[] = []
  try {
    const ctx = new AudioContext()
    const dest = ctx.createMediaStreamDestination()
    for (const v of videos) {
      v.muted = false
      v.volume = 1
      ctx.createMediaElementSource(v).connect(dest)
    }
    await ctx.resume()
    audioCtx = ctx
    audioTracks = dest.stream.getAudioTracks()
  } catch {
    // Sem áudio o vídeo ainda sai — só não carrega a trilha original.
    // (re-muta tudo pra nada tocar em voz alta durante a gravação)
    for (const v of videos) v.muted = true
    audioCtx = null
    audioTracks = []
  }

  // Alguns navegadores dizem suportar MP4 mas gravam um arquivo vazio ou de
  // um frame só (sem encoder H.264 de verdade). Por isso: grava, valida a
  // duração do resultado e cai pro próximo formato se sair quebrado.
  try {
    for (const mime of mimes) {
      if (signal?.aborted) break
      const blob = await recordPass(
        mime,
        videos,
        main,
        canvas,
        drawFrame,
        audioTracks,
        onProgress,
        signal,
      )
      if (signal?.aborted) break
      if (blob && blob.size > 0 && (await recordingLooksComplete(blob, main.duration))) {
        return { blob, extension: mime.includes('mp4') ? 'mp4' : 'webm' }
      }
    }
  } finally {
    void audioCtx?.close().catch(() => {})
    for (const v of videos) {
      v.pause()
      v.removeAttribute('src')
      v.load()
    }
  }
  if (signal?.aborted) throw new Error('Exportação cancelada.')
  throw new Error('Não foi possível gravar o vídeo neste navegador. Tente o Chrome.')
}

/** Confere se a gravação cobre o vídeo original (pega MP4 de 1 frame só). */
async function recordingLooksComplete(
  blob: Blob,
  sourceDuration: number,
): Promise<boolean> {
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) return true
  const url = URL.createObjectURL(blob)
  try {
    const probe = document.createElement('video')
    probe.preload = 'metadata'
    probe.src = url
    const duration = await new Promise<number>((resolve) => {
      probe.addEventListener('loadedmetadata', () => resolve(probe.duration), {
        once: true,
      })
      probe.addEventListener('error', () => resolve(0), { once: true })
      probe.load()
    })
    // WebM gravado em stream costuma reportar Infinity: isso é normal.
    if (!Number.isFinite(duration)) return true
    return duration >= sourceDuration * 0.7
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Uma passada de gravação: toca os vídeos do início ao fim compondo no canvas. */
async function recordPass(
  mime: string,
  videos: HTMLVideoElement[],
  main: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  drawFrame: () => void,
  audioTracks: MediaStreamTrack[],
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<Blob | null> {
  // Volta todos pro início (importante quando o formato anterior falhou)
  for (const v of videos) {
    v.pause()
    if (v.currentTime !== 0) {
      await new Promise<void>((resolve) => {
        v.addEventListener('seeked', () => resolve(), { once: true })
        v.currentTime = 0
      })
    }
  }
  drawFrame()

  const stream = canvas.captureStream(30)
  // As trilhas de áudio são compartilhadas entre as tentativas de formato:
  // entram no stream aqui e NÃO podem ser paradas no fim desta passada.
  for (const t of audioTracks) stream.addTrack(t)
  const stopOwnTracks = () => stream.getVideoTracks().forEach((t) => t.stop())

  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 12_000_000,
      audioBitsPerSecond: 128_000,
    })
  } catch {
    stopOwnTracks()
    return null
  }

  const chunks: Blob[] = []
  let failed = false
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })

  const finished = new Promise<void>((resolve) => {
    let rafId = 0
    let timeoutId = 0
    // Vídeo travado não pode deixar a exportação pendurada pra sempre.
    const safetyMs = Number.isFinite(main.duration)
      ? main.duration * 1000 * 2.5 + 15_000
      : 180_000
    const armSafety = () => {
      clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => {
        failed = true
        done()
      }, safetyMs)
    }
    // Aba em segundo plano congela o rAF que desenha os quadros. Em vez de
    // gravar um vídeo travado, a exportação pausa e retoma quando a pessoa
    // volta pra aba.
    const onVisibility = () => {
      if (document.hidden) {
        if (recorder.state === 'recording') recorder.pause()
        for (const v of videos) v.pause()
        clearTimeout(timeoutId)
      } else {
        if (recorder.state === 'paused') recorder.resume()
        armSafety()
        void Promise.all(videos.map((v) => v.play())).catch(() => {
          failed = true
          done()
        })
      }
    }
    const onAbort = () => {
      failed = true
      done()
    }
    function done() {
      cancelAnimationFrame(rafId)
      clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', onVisibility)
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }
    signal?.addEventListener('abort', onAbort)
    if (signal?.aborted) onAbort()
    recorder.onerror = () => {
      failed = true
      done()
    }
    // Arquivo corrompido pode falhar no meio da reprodução sem nunca
    // disparar 'ended' — trata como falha em vez de pendurar a exportação.
    main.addEventListener(
      'error',
      () => {
        failed = true
        done()
      },
      { once: true },
    )
    const tick = () => {
      drawFrame()
      if (Number.isFinite(main.duration) && main.duration > 0) {
        onProgress(Math.min(1, main.currentTime / main.duration))
      }
      if (main.ended) {
        done()
        return
      }
      rafId = requestAnimationFrame(tick)
    }
    main.addEventListener('ended', done, { once: true })
    document.addEventListener('visibilitychange', onVisibility)
    armSafety()
    rafId = requestAnimationFrame(tick)
  })

  recorder.start(250)
  try {
    await Promise.all(videos.map((v) => v.play()))
  } catch {
    recorder.stop()
    stopOwnTracks()
    return null
  }
  await finished

  for (const v of videos) v.pause()
  drawFrame()
  if (recorder.state !== 'inactive') recorder.stop()
  await stopped
  stopOwnTracks()

  if (failed) return null
  return new Blob(chunks, { type: mime })
}
