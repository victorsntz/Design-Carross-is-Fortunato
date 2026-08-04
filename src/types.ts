export type MediaKind = 'image' | 'video'

export interface SlideMedia {
  kind: MediaKind
  /** Imagens: dataURL (persiste). Vídeos: objectURL (só vale na sessão atual). */
  src: string
  name?: string
  /** Enquadramento: posição do recorte em % (0-100, padrão 50 = centro). */
  posX?: number
  posY?: number
  /** Zoom do recorte (1 = cobre exato; máx 2.5). Nunca descola das margens. */
  zoom?: number
}

export type SlideType =
  | 'split'
  | 'comparison'
  | 'development'
  | 'book'
  | 'final'
  | 'photoTop'

interface BaseSlide {
  id: string
  type: SlideType
  /** Passo do tamanho do texto: 0 (menor) a 4 (maior). */
  sizeStep: number
  /** Altura da linha (1.15–1.6). Sem valor = padrão do tipo. */
  lineHeight?: number
  /** Espaço entre letras em em (-0.03–0.06). Sem valor = 0. */
  letterSpacing?: number
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

/** Foto deitada em cima + bloco preto embaixo com título e parágrafos. */
export interface PhotoTopSlide extends BaseSlide {
  type: 'photoTop'
  media: SlideMedia | null
  /** Frase de abertura, em negrito e maior que o corpo. */
  title: string
  body: string
}

export type Slide =
  | SplitSlide
  | ComparisonSlide
  | DevelopmentSlide
  | BookSlide
  | FinalSlide
  | PhotoTopSlide

/** Fonte dos slides: serifada (STIX), sem serifa (Helvetica) ou a da pessoa. */
export type FontStyle = 'serif' | 'sans' | 'custom'

/** Arquivo de fonte enviado pela pessoa (TTF/OTF/WOFF), guardado no projeto. */
export interface CustomFont {
  name: string
  dataUrl: string
}

export interface Project {
  /** Nome do carrossel, mostrado na lista "Meus carrosséis". */
  title: string
  /** Vale pra todos os textos de todos os slides. */
  font: FontStyle
  customFont: CustomFont | null
  /** Assinatura pequena no topo esquerdo de todos os slides. */
  captionLeft: string
  /** Assinatura pequena no topo direito de todos os slides. */
  captionRight: string
  slides: Slide[]
}
