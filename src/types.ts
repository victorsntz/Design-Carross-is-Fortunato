export type MediaKind = 'image' | 'video'

export interface SlideMedia {
  kind: MediaKind
  /** Imagens: dataURL (persiste). Vídeos: objectURL (só vale na sessão atual). */
  src: string
  name?: string
}

export type SlideType = 'split' | 'comparison' | 'development' | 'book' | 'final'

interface BaseSlide {
  id: string
  type: SlideType
  /** Passo do tamanho do texto: 0 (menor) a 4 (maior). */
  sizeStep: number
}

/** Metade de uma tela partida: foto/vídeo + frase curta. */
export interface SplitHalf {
  media: SlideMedia | null
  text: string
}

/** Tela partida: duas fotos e dois textos no mesmo slide (cima/baixo). */
export interface SplitSlide extends BaseSlide {
  type: 'split'
  top: SplitHalf
  bottom: SplitHalf
}

/** Foto de fundo inteira + frase curta com sombra de contraste. */
export interface ComparisonSlide extends BaseSlide {
  type: 'comparison'
  media: SlideMedia | null
  text: string
  textPosition: 'top' | 'bottom'
}

/** Desenvolvimento: foto/vídeo de fundo + sombra + parágrafos à esquerda. */
export interface DevelopmentSlide extends BaseSlide {
  type: 'development'
  media: SlideMedia | null
  body: string
  /** Frase final em negrito (opcional). */
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

export type Slide =
  | SplitSlide
  | ComparisonSlide
  | DevelopmentSlide
  | BookSlide
  | FinalSlide

export interface Project {
  /** Nome do carrossel, mostrado na lista "Meus carrosséis". */
  title: string
  /** Assinatura pequena no topo esquerdo de todos os slides. */
  captionLeft: string
  /** Assinatura pequena no topo direito de todos os slides. */
  captionRight: string
  slides: Slide[]
}
