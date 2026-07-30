import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { Project, Slide, SlideMedia } from './types'
import { SlideRenderer, SLIDE_W, type RenderMode } from './components/SlideRenderer'

async function waitForAssets(host: HTMLElement): Promise<void> {
  await document.fonts.ready
  const imgs = Array.from(host.querySelectorAll('img'))
  await Promise.all(
    imgs.map((img) =>
      img.decode().catch(() => {
        /* imagem quebrada não deve travar a exportação */
      }),
    ),
  )
}

/**
 * Renderiza um slide em tamanho real (1080x1350) fora da tela e entrega o nó
 * para a função de captura. Sempre desmonta e limpa no final.
 */
export async function withRenderedSlide<T>(
  slide: Slide,
  project: Project,
  mode: RenderMode,
  mediaOverride: SlideMedia | null | undefined,
  fn: (node: HTMLElement) => Promise<T>,
): Promise<T> {
  const host = document.createElement('div')
  host.style.cssText =
    'position:fixed;left:-20000px;top:0;width:1080px;height:1350px;overflow:hidden;z-index:-1;'
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    flushSync(() => {
      root.render(
        <SlideRenderer
          slide={slide}
          project={project}
          width={SLIDE_W}
          mode={mode}
          mediaOverride={mediaOverride}
        />,
      )
    })
    await waitForAssets(host)
    const node = host.querySelector<HTMLElement>('.sl-scale-outer')
    if (!node) throw new Error('Falha ao montar o slide para exportação')
    return await fn(node)
  } finally {
    root.unmount()
    host.remove()
  }
}
