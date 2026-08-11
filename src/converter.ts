import type {
  BookSlide,
  ComparisonSlide,
  DevelopmentSlide,
  FinalSlide,
  PhotoTopSlide,
  Slide,
  SlideMedia,
  SlideType,
  SplitOrientation,
  SplitSlide,
} from './types'
import { DEFAULT_STEPS } from './components/SlideRenderer'

/**
 * Trocar o tipo de um slide sem perder o trabalho.
 *
 * Antes era preciso criar o slide novo, copiar o texto do antigo, colar,
 * arrastar pra posição e apagar o velho. Aqui o texto e as fotos atravessam
 * a troca: o slide continua sendo o mesmo, só muda de forma.
 */

/** O que sobrevive à troca: os blocos de texto e as mídias, em ordem. */
interface Conteudo {
  blocos: string[]
  midias: SlideMedia[]
}

function conteudoDe(s: Slide): Conteudo {
  const limpo = (t: string) => t.trim()
  const blocos: string[] = []
  const midias: (SlideMedia | null)[] = []
  switch (s.type) {
    case 'split':
      blocos.push(limpo(s.top.text), limpo(s.bottom.text))
      midias.push(s.top.media, s.bottom.media)
      break
    case 'comparison':
    case 'final':
      blocos.push(limpo(s.text))
      midias.push(s.media)
      break
    case 'development':
      // A frase final em negrito é um bloco à parte: vira parágrafo próprio.
      blocos.push(limpo(s.body), limpo(s.emphasis))
      midias.push(s.media)
      break
    case 'book':
    case 'photoTop':
      blocos.push(limpo(s.body))
      midias.push(s.media)
      break
  }
  return {
    blocos: blocos.filter((b) => b !== ''),
    midias: midias.filter((m): m is SlideMedia => m !== null),
  }
}

/** Vários blocos viram um texto só, separados por linha em branco. */
const juntar = (blocos: string[]) => blocos.join('\n\n')

export function converterSlide(
  slide: Slide,
  para: SlideType,
  orientation?: SplitOrientation,
): Slide {
  // Mesmo tipo: a única coisa que pode mudar é a divisão da tela partida.
  if (slide.type === para) {
    return slide.type === 'split'
      ? { ...slide, orientation: orientation ?? 'horizontal' }
      : slide
  }

  const { blocos, midias } = conteudoDe(slide)
  const texto = juntar(blocos)
  const foto = midias[0] ?? null
  // O tamanho do texto volta ao padrão do tipo novo: as escalas são
  // diferentes de um tipo pro outro, e o passo 4 de um não é o do outro.
  // Os ajustes finos saem de cena pra que o padrão do cliente possa entrar.
  const base = { id: slide.id, sizeStep: DEFAULT_STEPS[para] }

  switch (para) {
    case 'split': {
      // Vindo de um bloco só de texto, o primeiro parágrafo fica em cima e
      // o resto embaixo — ninguém perde palavra na troca. Como os outros
      // tipos guardam tudo num campo só, a divisão sai dos parágrafos.
      const paragrafos = texto
        .split(/\n{2,}/)
        .map((t) => t.trim())
        .filter((t) => t !== '')
      const s: SplitSlide = {
        ...base,
        type: 'split',
        orientation: orientation ?? 'horizontal',
        top: { media: foto, text: paragrafos[0] ?? '' },
        bottom: { media: midias[1] ?? null, text: juntar(paragrafos.slice(1)) },
      }
      return s
    }
    case 'comparison': {
      const s: ComparisonSlide = {
        ...base,
        type: 'comparison',
        media: foto,
        text: texto,
        textPosition: 'bottom',
      }
      return s
    }
    case 'development': {
      const s: DevelopmentSlide = {
        ...base,
        type: 'development',
        media: foto,
        body: texto,
        emphasis: '',
      }
      return s
    }
    case 'book': {
      const s: BookSlide = { ...base, type: 'book', media: foto, body: texto }
      return s
    }
    case 'final': {
      const s: FinalSlide = { ...base, type: 'final', media: foto, text: texto }
      return s
    }
    case 'photoTop': {
      const s: PhotoTopSlide = { ...base, type: 'photoTop', media: foto, body: texto }
      return s
    }
  }
}
