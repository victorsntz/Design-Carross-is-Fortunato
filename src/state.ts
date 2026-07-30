import type {
  BookSlide,
  ComparisonSlide,
  DevelopmentSlide,
  FinalSlide,
  Project,
  Slide,
  SlideMedia,
  SlideType,
  SplitHalf,
  SplitSlide,
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
    case 'split': {
      const s: SplitSlide = {
        ...base,
        type,
        top: { media: null, text: 'Lado A: o primeiro dado da comparação.' },
        bottom: { media: null, text: 'Lado B: o contraste que muda a leitura.' },
      }
      return s
    }
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
  const splits = [
    ['Lado A: comece com o dado mais forte.', 'Lado B: o contraste vem logo abaixo.'],
    ['Mais um dado do Lado A.', 'E o contraste de novo, sempre em par.'],
    ['O padrão se repete no terceiro par.', '*A repetição constrói o argumento.*'],
    ['Feche a sequência com o dado mais duro.', 'E o contraste que ninguém esquece.'],
  ].map(([topText, bottomText]) => {
    const s = makeSlide('split') as SplitSlide
    s.top.text = topText
    s.bottom.text = bottomText
    return s
  })

  const dev = makeSlide('development') as DevelopmentSlide
  dev.body =
    'Aqui entra o desenvolvimento: você conecta os dados que acabou de mostrar e explica o que eles significam.\n\nEscreva em parágrafos curtos. Linha em branco separa parágrafos. Use **negrito**, *itálico* e _sublinhado_ quando precisar.'
  dev.emphasis = 'A conclusão forte fecha em negrito, centralizada.'

  const photo = makeSlide('comparison') as ComparisonSlide
  photo.text = 'Depois do desenvolvimento, uma foto inteira com uma frase de impacto.'

  const fin = makeSlide('final') as FinalSlide

  return {
    captionLeft: 'ESCREVA AQUI SUA\nASSINATURA DA SÉRIE',
    captionRight: 'REPITA OU VARIE\nDO OUTRO LADO',
    slides: [...splits, dev, photo, fin],
  }
}

/** Remove mídias que não sobrevivem ao reload (vídeos usam objectURL). */
function stripVolatileMedia(project: Project): Project {
  const keep = (m: SlideMedia | null): SlideMedia | null =>
    m && m.kind === 'video' ? null : m
  return {
    ...project,
    slides: project.slides.map((s) => {
      if (s.type === 'split') {
        return {
          ...s,
          top: { ...s.top, media: keep(s.top.media) },
          bottom: { ...s.bottom, media: keep(s.bottom.media) },
        }
      }
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

function sanitizeMedia(m: unknown): SlideMedia | null {
  if (typeof m !== 'object' || m === null) return null
  const mm = m as SlideMedia
  if (mm.kind !== 'image' && mm.kind !== 'video') return null
  if (typeof mm.src !== 'string' || mm.src === '') return null
  // objectURL de outra sessão não funciona mais
  if (mm.src.startsWith('blob:')) return null
  return {
    kind: mm.kind,
    src: mm.src,
    name: typeof mm.name === 'string' ? mm.name : undefined,
  }
}

function sanitizeHalf(h: unknown, fallback: SplitHalf): SplitHalf {
  if (typeof h !== 'object' || h === null) return { ...fallback }
  const hh = h as Partial<SplitHalf>
  return {
    media: sanitizeMedia(hh.media),
    text: typeof hh.text === 'string' ? hh.text : fallback.text,
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
    if (!['split', 'comparison', 'development', 'book', 'final'].includes(sl.type)) {
      continue
    }
    const fresh = makeSlide(sl.type)
    const merged = { ...fresh, ...sl, id: sl.id || newId() } as Slide
    if (typeof merged.sizeStep !== 'number' || Number.isNaN(merged.sizeStep)) {
      merged.sizeStep = DEFAULT_STEP
    }
    if (merged.type === 'split') {
      const freshSplit = fresh as SplitSlide
      merged.top = sanitizeHalf(merged.top, freshSplit.top)
      merged.bottom = sanitizeHalf(merged.bottom, freshSplit.bottom)
    } else if ('media' in merged) {
      merged.media = sanitizeMedia(merged.media)
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
