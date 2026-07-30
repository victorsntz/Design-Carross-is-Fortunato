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

/**
 * Lê uma imagem copiada (ex.: "copiar imagem" no Google) direto da área de
 * transferência, sem precisar baixar o arquivo.
 */
export async function clipboardToMedia(): Promise<SlideMedia> {
  if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
    throw new Error(
      'Este navegador não deixa colar por botão. Toque no slide e use Ctrl+V, ou envie o arquivo.',
    )
  }
  let items: ClipboardItems
  try {
    items = await navigator.clipboard.read()
  } catch {
    throw new Error(
      'Não consegui acessar a área de transferência. Permita o acesso quando o navegador pedir, ou use Ctrl+V.',
    )
  }
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'))
    if (type) {
      const blob = await item.getType(type)
      const dataUrl = await resizeImageToDataUrl(blob)
      return { kind: 'image', src: dataUrl, name: 'imagem-colada' }
    }
  }
  throw new Error(
    'Não achei nenhuma imagem copiada. Copie uma imagem primeiro (no celular: toque e segure a imagem → "Copiar imagem").',
  )
}

async function resizeImageToDataUrl(file: Blob): Promise<string> {
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
    // Formatos com transparência viram PNG (útil pra capa de livro recortada);
    // fotos comuns vão de JPEG pra não estourar o armazenamento local.
    const keepAlpha = ['image/png', 'image/webp', 'image/gif'].includes(file.type)
    return keepAlpha
      ? canvas.toDataURL('image/png')
      : canvas.toDataURL('image/jpeg', 0.88)
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
