import type {
  BookSlide,
  ComparisonSlide,
  DevelopmentSlide,
  FinalSlide,
  Project,
  Slide,
  SlideType,
} from './types'
import { DEFAULT_STEP } from './components/SlideRenderer'

const STORAGE_KEY = 'criador-carrosseis-v1'

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

export function makeSlide(type: SlideType): Slide {
  const base = { id: newId(), sizeStep: DEFAULT_STEP }
  switch (type) {
    case 'comparison': {
      const s: ComparisonSlide = {
        ...base,
        type,
        media: null,
        text: 'Escreva aqui a frase curta deste slide.',
        textPosition: 'bottom',
      }
      return s
    }
    case 'development': {
      const s: DevelopmentSlide = {
        ...base,
        type,
        body:
          'Escreva aqui o desenvolvimento do argumento. Linha em branco separa parágrafos.\n\nUse **negrito** para dar peso, *itálico* para citações e _sublinhado_ para destacar.',
        emphasis: '',
      }
      return s
    }
    case 'book': {
      const s: BookSlide = {
        ...base,
        type,
        media: null,
        body:
          'Apresente aqui o seu produto ou livro, conectando com o tema do carrossel.\n\nSe você já quer o convite, comenta **EU QUERO** aqui embaixo que eu te mando no direct.',
      }
      return s
    }
    case 'final': {
      const s: FinalSlide = {
        ...base,
        type,
        media: null,
        text: 'Me segue se você acha que *este assunto* merece mais atenção.',
      }
      return s
    }
  }
}

export function defaultProject(): Project {
  const c1 = makeSlide('comparison') as ComparisonSlide
  c1.text = 'Lado A: comece com o dado mais forte da comparação.'
  const c2 = makeSlide('comparison') as ComparisonSlide
  c2.text = 'Lado B: mostre o contraste. É aqui que a percepção vira.'
  const c3 = makeSlide('comparison') as ComparisonSlide
  c3.text = 'Repita o movimento: mais um dado do Lado A.'
  const c4 = makeSlide('comparison') as ComparisonSlide
  c4.text = 'E o contraste de novo. *A repetição constrói o argumento.*'
  const dev = makeSlide('development') as DevelopmentSlide
  dev.body =
    'Aqui entra o desenvolvimento: você conecta os dados que acabou de mostrar e explica o que eles significam.\n\nEscreva em parágrafos curtos. Linha em branco separa parágrafos. Use **negrito**, *itálico* e _sublinhado_ quando precisar.'
  dev.emphasis = 'A conclusão forte fecha em negrito, centralizada.'
  const fin = makeSlide('final') as FinalSlide

  return {
    captionLeft: 'ESCREVA AQUI SUA\nASSINATURA DA SÉRIE',
    captionRight: 'REPITA OU VARIE\nDO OUTRO LADO',
    slides: [c1, c2, c3, c4, dev, fin],
  }
}

/** Remove mídias que não sobrevivem ao reload (vídeos usam objectURL). */
function stripVolatileMedia(project: Project): Project {
  return {
    ...project,
    slides: project.slides.map((s) => {
      if ('media' in s && s.media && s.media.kind === 'video') {
        return { ...s, media: null }
      }
      return s
    }),
  }
}

export function saveProjectToStorage(project: Project): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stripVolatileMedia(project)))
  } catch {
    // Quota cheia (fotos grandes demais): o projeto continua em memória;
    // o usuário ainda pode usar "Salvar projeto" para gerar o arquivo .json.
  }
}

export function loadProjectFromStorage(): Project | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return normalizeProject(JSON.parse(raw))
  } catch {
    return null
  }
}

/** Valida/normaliza um projeto vindo de storage ou de arquivo .json. */
export function normalizeProject(data: unknown): Project | null {
  if (typeof data !== 'object' || data === null) return null
  const p = data as Partial<Project>
  if (!Array.isArray(p.slides)) return null
  const slides: Slide[] = []
  for (const s of p.slides) {
    if (typeof s !== 'object' || s === null) continue
    const sl = s as Slide
    if (!['comparison', 'development', 'book', 'final'].includes(sl.type)) continue
    const fresh = makeSlide(sl.type)
    const merged = { ...fresh, ...sl, id: sl.id || newId() } as Slide
    if ('media' in merged && merged.media) {
      const m = merged.media
      if (
        typeof m.src !== 'string' ||
        m.src === '' ||
        (m.kind === 'video' && !m.src.startsWith('blob:') && !m.src.startsWith('data:'))
      ) {
        merged.media = null
      } else if (m.kind === 'video' && m.src.startsWith('blob:')) {
        // objectURL de outra sessão não funciona mais
        merged.media = null
      }
    }
    slides.push(merged)
  }
  if (slides.length === 0) return null
  return {
    captionLeft: typeof p.captionLeft === 'string' ? p.captionLeft : '',
    captionRight: typeof p.captionRight === 'string' ? p.captionRight : '',
    slides,
  }
}
