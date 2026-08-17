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
  /** Espaço entre letras em em (-0.06–0.06). Sem valor = 0. */
  letterSpacing?: number
  /** Alinhamento do texto. Sem valor = o padrão do tipo. */
  align?: 'left' | 'center'
  /**
   * Onde o texto se apoia dentro da caixa dele: 0 encosta no topo, 100 no
   * rodapé, 50 centraliza. Sem valor = o lugar que o desenho do tipo dá.
   * Vale nos três Desenvolvimentos, que são os que têm caixa com folga.
   */
  textY?: number
}

/** Metade de uma tela partida: foto/vídeo + frase curta. */
export interface SplitHalf {
  media: SlideMedia | null
  text: string
}

/** Como as duas metades se dividem: deitada (cima/baixo) ou em pé (lados). */
export type SplitOrientation = 'horizontal' | 'vertical'

/**
 * Tela partida: duas fotos e dois textos no mesmo slide. Na horizontal as
 * metades ficam em cima e embaixo; na vertical, à esquerda e à direita —
 * e aí "top" é a da esquerda e "bottom" a da direita.
 */
export interface SplitSlide extends BaseSlide {
  type: 'split'
  /** Sem valor = horizontal (como eram todas antes). */
  orientation?: SplitOrientation
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

/** Foto deitada em cima + bloco preto embaixo com o texto. */
export interface PhotoTopSlide extends BaseSlide {
  type: 'photoTop'
  media: SlideMedia | null
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
  /** O arquivo do peso normal. */
  dataUrl: string
  /**
   * O arquivo do negrito, quando a pessoa tem os dois. Sem isso o navegador
   * engrossa o normal por conta própria, e o desenho da letra sai errado.
   */
  boldDataUrl?: string
}

/** Cores do carrossel — o que muda de cliente pra cliente na mesma arte. */
export interface Palette {
  /** Fundo do slide. */
  bg: string
  /** Cor dos textos. */
  text: string
  /** Cor das assinaturas do topo. */
  caption: string
}

export const PALETA_PADRAO: Palette = {
  bg: '#0b0b0b',
  text: '#ffffff',
  caption: '#f2f2f2',
}

/** Peso do texto dos slides. */
export type FontWeight = 'normal' | 'bold'

/** Filete que separa as metades da tela partida (0 = sem filete). */
export interface Divider {
  color: string
  size: number
}

export const FILETE_PADRAO: Divider = { color: '#eae422', size: 0 }

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
  /** Sem valor = a paleta padrão (fundo quase preto, texto branco). */
  palette?: Palette
  /** Peso dos textos. Sem valor = normal. */
  weight?: FontWeight
  /** Filete entre as metades da tela partida. Sem valor = nenhum. */
  divider?: Divider
  slides: Slide[]
}
