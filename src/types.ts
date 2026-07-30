export type MediaKind = 'image' | 'video'

export interface SlideMedia {
  kind: MediaKind
  /** Imagens: dataURL (persiste). Vídeos: objectURL (só vale na sessão atual). */
  src: string
  name?: string
}

export type SlideType = 'comparison' | 'development' | 'book' | 'final'

interface BaseSlide {
  id: string
  type: SlideType
  /** Passo do tamanho do texto: 0 (menor) a 4 (maior). */
  sizeStep: number
}

/** Slide de comparação: foto/vídeo de fundo + frase curta. */
export interface ComparisonSlide extends BaseSlide {
  type: 'comparison'
  media: SlideMedia | null
  text: string
  textPosition: 'top' | 'bottom'
}

/** Slide de desenvolvimento: fundo preto + parágrafos de texto. */
export interface DevelopmentSlide extends BaseSlide {
  type: 'development'
  body: string
  /** Frase final em negrito, centralizada (opcional). */
  emphasis: string
}

/** Slide do livro/oferta: imagem centralizada + parágrafos. */
export interface BookSlide extends BaseSlide {
  type: 'book'
  media: SlideMedia | null
  body: string
}

/** Slide final: texto "Me segue se..." à esquerda + foto à direita. */
export interface FinalSlide extends BaseSlide {
  type: 'final'
  media: SlideMedia | null
  text: string
}

export type Slide = ComparisonSlide | DevelopmentSlide | BookSlide | FinalSlide

export interface Project {
  /** Assinatura pequena no topo esquerdo de todos os slides. */
  captionLeft: string
  /** Assinatura pequena no topo direito de todos os slides. */
  captionRight: string
  slides: Slide[]
}
