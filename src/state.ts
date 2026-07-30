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

// Rascunho automático fica no IndexedDB: fotos de 10-13 slides estouram os
// ~5MB do localStorage, e perder o rascunho no reload é inaceitável.
const LEGACY_STORAGE_KEY = 'criador-carrosseis-v1'
const DB_NAME = 'criador-carrosseis'
const DB_STORE = 'projetos'
const DB_KEY = 'atual'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

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
          'Escreva aqui o desenvolvimento do argumento, em parágrafos curtos de duas ou três linhas. Linha em branco separa parágrafos.\n\nO formato pede texto de verdade: traga o contexto que as fotos não contam — de onde saíram os números, o que aconteceu antes, quem decidiu o quê.\n\nUse **negrito** para dar peso, *itálico* para citações e _sublinhado_ para destacar.',
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
          'Apresente aqui o seu livro ou produto, sempre puxando pelo argumento que você acabou de construir nos slides anteriores — sem quebrar o tom da conversa.\n\nSe você já quer o convite, comenta **EU QUERO** aqui embaixo que eu te mando no direct.',
      }
      return s
    }
    case 'final': {
      const s: FinalSlide = {
        ...base,
        type,
        media: null,
        text: 'Me segue se você acha que *este assunto* merece mais atenção do que vem recebendo. Toda semana tem uma conversa dessas aberta aqui.',
      }
      return s
    }
  }
}

export function defaultProject(): Project {
  const split = (topText: string, bottomText: string): SplitSlide => {
    const s = makeSlide('split') as SplitSlide
    s.top.text = topText
    s.bottom.text = bottomText
    return s
  }

  const splits = [
    split(
      'Lado A: comece com o dado mais forte que você tem. Público, verificável e impossível de ignorar.',
      'Lado B: o contraste vem logo abaixo, na mesma tela. É o par que faz a percepção virar.',
    ),
    split(
      'Mais um dado do Lado A, no mesmo padrão do primeiro. A estrutura se repete de propósito.',
      'E o contraste de novo. Quem desliza sente o acúmulo, par depois de par.',
    ),
    split(
      'No terceiro par o leitor já sabe a regra do jogo e começa a completar sozinho.',
      '*Citação ou ironia em itálico também funciona bem neste espaço.*',
    ),
    split(
      'Feche a sequência com o dado mais duro que você guardou até agora.',
      'E o contraste que ninguém esquece. É ele que vai pros comentários.',
    ),
  ]

  const dev = makeSlide('development') as DevelopmentSlide
  dev.body =
    'Aqui entra o desenvolvimento: você conecta os dados que acabou de mostrar e explica o que eles significam juntos. É a parte mais densa do carrossel — e é por isso que ela funciona.\n\nEscreva em parágrafos curtos, de duas ou três linhas. A pessoa está lendo no celular, com o dedo pronto pra deslizar: cada parágrafo precisa pagar a atenção que pede.\n\nTraga o contexto que as fotos não contam: de onde saíram os números, o que aconteceu antes, quem decidiu o quê. Use **negrito** pra dar peso, *itálico* pra citações e _sublinhado_ pra destacar.'
  dev.emphasis = 'A conclusão forte fecha em negrito.'

  const book = makeSlide('book') as BookSlide

  const photo1 = makeSlide('comparison') as ComparisonSlide
  photo1.text =
    'Depois do desenvolvimento, respiro: uma foto inteira e uma frase de impacto. Duas ou três linhas seguram bem.'

  const split5 = split(
    'No meio do carrossel dá pra voltar pra comparação, no mesmo padrão dos primeiros pares.',
    'Alternando com as fotos inteiras, o ritmo da leitura não cansa.',
  )

  const photo2 = makeSlide('comparison') as ComparisonSlide
  photo2.text =
    'Mais uma foto de fundo segurando uma frase forte antes do convite final.'

  const fin = makeSlide('final') as FinalSlide

  return {
    captionLeft: 'ESCREVA AQUI SUA\nASSINATURA DA SÉRIE',
    captionRight: 'REPITA OU VARIE\nDO OUTRO LADO',
    align: 'center',
    slides: [...splits, dev, book, photo1, split5, photo2, fin],
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

/** Retorna false quando o rascunho não pôde ser salvo no navegador. */
export async function saveProjectToStorage(project: Project): Promise<boolean> {
  try {
    // structuredClone via JSON garante objeto puro pro IndexedDB
    const data = JSON.parse(JSON.stringify(stripVolatileMedia(project)))
    const db = await openDb()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite')
        tx.objectStore(DB_STORE).put(data, DB_KEY)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
    return true
  } catch {
    // O projeto continua em memória; o app avisa e o usuário pode usar
    // "Baixar projeto" (.json).
    return false
  }
}

export async function loadProjectFromStorage(): Promise<Project | null> {
  try {
    const db = await openDb()
    let data: unknown
    try {
      data = await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly')
        const req = tx.objectStore(DB_STORE).get(DB_KEY)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    } finally {
      db.close()
    }
    if (data) return normalizeProject(data)
    // Migração: rascunho antigo salvo no localStorage
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy) {
      const project = normalizeProject(JSON.parse(legacy))
      if (project) {
        void saveProjectToStorage(project)
        localStorage.removeItem(LEGACY_STORAGE_KEY)
        return project
      }
    }
    return null
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
  const str = (v: unknown, fallback: string): string =>
    typeof v === 'string' ? v : fallback
  const slides: Slide[] = []
  const seenIds = new Set<string>()
  for (const s of p.slides) {
    if (typeof s !== 'object' || s === null) continue
    const sl = s as Slide
    if (!['split', 'comparison', 'development', 'book', 'final'].includes(sl.type)) {
      continue
    }
    const fresh = makeSlide(sl.type)
    const merged = { ...fresh, ...sl } as Slide
    merged.id =
      typeof sl.id === 'string' && sl.id !== '' && !seenIds.has(sl.id) ? sl.id : newId()
    seenIds.add(merged.id)
    if (typeof merged.sizeStep !== 'number' || Number.isNaN(merged.sizeStep)) {
      merged.sizeStep = DEFAULT_STEP
    }
    // Campos de texto precisam ser string de verdade: um .json editado na mão
    // (ou corrompido) não pode derrubar o app na hora de renderizar.
    switch (merged.type) {
      case 'split': {
        const freshSplit = fresh as SplitSlide
        merged.top = sanitizeHalf(merged.top, freshSplit.top)
        merged.bottom = sanitizeHalf(merged.bottom, freshSplit.bottom)
        break
      }
      case 'comparison':
        merged.media = sanitizeMedia(merged.media)
        merged.text = str(merged.text, '')
        merged.textPosition = merged.textPosition === 'top' ? 'top' : 'bottom'
        break
      case 'development':
        merged.body = str(merged.body, '')
        merged.emphasis = str(merged.emphasis, '')
        break
      case 'book':
        merged.media = sanitizeMedia(merged.media)
        merged.body = str(merged.body, '')
        break
      case 'final':
        merged.media = sanitizeMedia(merged.media)
        merged.text = str(merged.text, '')
        break
    }
    slides.push(merged)
  }
  if (slides.length === 0) return null
  return {
    captionLeft: typeof p.captionLeft === 'string' ? p.captionLeft : '',
    captionRight: typeof p.captionRight === 'string' ? p.captionRight : '',
    align: p.align === 'left' ? 'left' : 'center',
    slides,
  }
}
