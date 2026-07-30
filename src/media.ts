import type { SlideMedia } from './types'

/** Lado máximo das fotos ao importar (2x a largura do slide já é sobra). */
const MAX_IMAGE_SIDE = 2160

export async function fileToMedia(file: File): Promise<SlideMedia> {
  if (file.type.startsWith('video/')) {
    return { kind: 'video', src: URL.createObjectURL(file), name: file.name }
  }
  if (!file.type.startsWith('image/')) {
    throw new Error(`Tipo de arquivo não suportado: ${file.type || file.name}`)
  }
  const dataUrl = await resizeImageToDataUrl(file)
  return { kind: 'image', src: dataUrl, name: file.name }
}

async function resizeImageToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height))
    const w = Math.round(img.width * scale)
    const h = Math.round(img.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D indisponível')
    ctx.drawImage(img, 0, 0, w, h)
    // PNG preserva transparência (útil pra capa de livro recortada);
    // fotos comuns vão de JPEG pra não estourar o armazenamento local.
    const isPng = file.type === 'image/png'
    return isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.88)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Captura um frame do vídeo como imagem (pra PNG e miniaturas). */
export async function videoPosterFrame(src: string): Promise<string> {
  const video = document.createElement('video')
  video.src = src
  video.muted = true
  video.playsInline = true
  video.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    video.addEventListener('loadeddata', () => resolve(), { once: true })
    video.addEventListener('error', () => reject(new Error('Falha ao ler o vídeo')), {
      once: true,
    })
    video.load()
  })
  // Alguns navegadores só pintam o frame depois de um seek explícito.
  if (video.currentTime === 0) {
    await new Promise<void>((resolve) => {
      video.addEventListener('seeked', () => resolve(), { once: true })
      video.currentTime = Math.min(0.05, video.duration || 0.05)
    })
  }
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D indisponível')
  ctx.drawImage(video, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.9)
}
