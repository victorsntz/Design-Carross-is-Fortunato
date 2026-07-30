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
// Resumos ficam num store separado: listar carrosséis não pode pagar o preço
// de desserializar todas as fotos de todos os projetos.
const DB_META = 'resumos'
const DB_VERSION = 2

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE)
      if (!db.objectStoreNames.contains(DB_META)) db.createObjectStore(DB_META)
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
    'Aqui entra o desenvolvimento: você conecta os dados que mostrou e explica o que eles significam juntos. Parágrafos curtos, de duas ou três linhas — a pessoa lê no celular, com o dedo pronto pra deslizar.\n\nTraga o contexto que as fotos não contam: de onde saíram os números, quem decidiu o quê. Use **negrito**, *itálico* e _sublinhado_.'
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
    title: 'Meu primeiro carrossel',
    captionLeft: 'ESCREVA AQUI SUA\nASSINATURA DA SÉRIE',
    captionRight: 'REPITA OU VARIE\nDO OUTRO LADO',
    slides: [...splits, dev, book, photo1, split5, photo2, fin],
  }
}

/**
 * Estrutura do método com os textos em branco: é o que "+ Novo carrossel"
 * cria. O baralho-tutorial (defaultProject) aparece só na primeira visita.
 */
export function blankProject(captions?: {
  captionLeft: string
  captionRight: string
}): Project {
  const structure: SlideType[] = [
    'split',
    'split',
    'split',
    'split',
    'development',
    'book',
    'comparison',
    'split',
    'comparison',
    'final',
  ]
  const slides = structure.map((t) => {
    const s = makeSlide(t)
    switch (s.type) {
      case 'split':
        s.top.text = ''
        s.bottom.text = ''
        break
      case 'comparison':
        s.text = ''
        break
      case 'development':
        s.body = ''
        s.emphasis = ''
        break
      case 'book':
        s.body = ''
        break
      case 'final':
        s.text = ''
        break
    }
    return s
  })
  return {
    title: 'Novo carrossel',
    captionLeft: captions?.captionLeft ?? '',
    captionRight: captions?.captionRight ?? '',
    slides,
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

// ---------------------------------------------------------------------------
// Vários carrosséis, tudo no navegador da pessoa (IndexedDB) — sem servidor.
// Cada registro é { id, updatedAt, data: Project }, chaveado pelo id.
// A chave especial CURRENT_KEY guarda o id do carrossel aberto.
// ---------------------------------------------------------------------------

export interface ProjectSummary {
  id: string
  title: string
  updatedAt: number
  slideCount: number
}

interface StoredRecord {
  id: string
  updatedAt: number
  data: unknown
}

const CURRENT_KEY = '__carrossel-atual'
const LEGACY_DB_KEY = 'atual'

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function reqResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Retorna false quando o carrossel não pôde ser salvo no navegador. */
export async function saveProjectToStorage(
  id: string,
  project: Project,
): Promise<boolean> {
  try {
    // structuredClone via JSON garante objeto puro pro IndexedDB
    const record: StoredRecord = {
      id,
      updatedAt: Date.now(),
      data: JSON.parse(JSON.stringify(stripVolatileMedia(project))),
    }
    const summary: ProjectSummary = {
      id,
      title: project.title.trim() || 'Carrossel sem título',
      updatedAt: record.updatedAt,
      slideCount: project.slides.length,
    }
    const db = await openDb()
    try {
      const tx = db.transaction([DB_STORE, DB_META], 'readwrite')
      tx.objectStore(DB_STORE).put(record, id)
      tx.objectStore(DB_STORE).put(id, CURRENT_KEY)
      tx.objectStore(DB_META).put(summary, id)
      await txDone(tx)
    } finally {
      db.close()
    }
    return true
  } catch {
    // O projeto continua em memória; o app avisa e a pessoa pode usar
    // "Baixar backup" (.json).
    return false
  }
}

export async function loadProject(id: string): Promise<Project | null> {
  try {
    const db = await openDb()
    try {
      const tx = db.transaction(DB_STORE, 'readonly')
      const record = await reqResult(tx.objectStore(DB_STORE).get(id))
      if (typeof record === 'object' && record !== null && 'data' in record) {
        return normalizeProject((record as StoredRecord).data)
      }
      return null
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

export async function deleteProjectFromStorage(id: string): Promise<void> {
  try {
    const db = await openDb()
    try {
      const tx = db.transaction([DB_STORE, DB_META], 'readwrite')
      tx.objectStore(DB_STORE).delete(id)
      tx.objectStore(DB_META).delete(id)
      await txDone(tx)
    } finally {
      db.close()
    }
  } catch {
    // sem drama: a lista simplesmente continua mostrando o item
  }
}

function sanitizeSummary(v: unknown): ProjectSummary | null {
  if (typeof v !== 'object' || v === null) return null
  const s = v as ProjectSummary
  if (typeof s.id !== 'string' || s.id === '') return null
  return {
    id: s.id,
    title: typeof s.title === 'string' && s.title.trim() !== '' ? s.title : 'Carrossel sem título',
    updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : 0,
    slideCount: typeof s.slideCount === 'number' ? s.slideCount : 0,
  }
}

export async function listProjects(): Promise<ProjectSummary[]> {
  try {
    const db = await openDb()
    try {
      const metaTx = db.transaction(DB_META, 'readonly')
      const metas = await reqResult(metaTx.objectStore(DB_META).getAll())
      const summaries = metas
        .map(sanitizeSummary)
        .filter((s): s is ProjectSummary => s !== null)
      if (summaries.length > 0) {
        summaries.sort((a, b) => b.updatedAt - a.updatedAt)
        return summaries
      }
      // Dados de versões anteriores (sem o store de resumos): reconstrói uma
      // vez a partir dos projetos completos e preenche os resumos.
      const tx = db.transaction(DB_STORE, 'readonly')
      const values = await reqResult(tx.objectStore(DB_STORE).getAll())
      const rebuilt: ProjectSummary[] = []
      for (const v of values) {
        if (typeof v !== 'object' || v === null || !('data' in v)) continue
        const rec = v as StoredRecord
        const data = rec.data as Partial<Project> | null
        if (!data || !Array.isArray(data.slides)) continue
        rebuilt.push({
          id: rec.id,
          title:
            typeof data.title === 'string' && data.title.trim() !== ''
              ? data.title
              : 'Carrossel sem título',
          updatedAt: typeof rec.updatedAt === 'number' ? rec.updatedAt : 0,
          slideCount: data.slides.length,
        })
      }
      if (rebuilt.length > 0) {
        const backfill = db.transaction(DB_META, 'readwrite')
        for (const s of rebuilt) backfill.objectStore(DB_META).put(s, s.id)
        await txDone(backfill).catch(() => {})
      }
      rebuilt.sort((a, b) => b.updatedAt - a.updatedAt)
      return rebuilt
    } finally {
      db.close()
    }
  } catch {
    return []
  }
}

/** Carrega o carrossel aberto por último, migrando rascunhos antigos. */
export async function loadCurrentProject(): Promise<{
  id: string
  project: Project
} | null> {
  try {
    const db = await openDb()
    let currentId: unknown
    let record: unknown
    let legacyRecord: unknown
    try {
      const tx = db.transaction(DB_STORE, 'readonly')
      const store = tx.objectStore(DB_STORE)
      currentId = await reqResult(store.get(CURRENT_KEY))
      if (typeof currentId === 'string') {
        record = await reqResult(store.get(currentId))
      }
      legacyRecord = await reqResult(store.get(LEGACY_DB_KEY))
    } finally {
      db.close()
    }

    if (
      typeof currentId === 'string' &&
      typeof record === 'object' &&
      record !== null &&
      'data' in record
    ) {
      const project = normalizeProject((record as StoredRecord).data)
      if (project) return { id: currentId, project }
    }

    // Migração: rascunho único das versões anteriores (IndexedDB ou localStorage)
    const legacyData =
      legacyRecord ??
      (() => {
        const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
        return raw ? (JSON.parse(raw) as unknown) : null
      })()
    if (legacyData) {
      const project = normalizeProject(legacyData)
      if (project) {
        const id = newId()
        // Só apaga o rascunho antigo depois de confirmar que o novo gravou.
        const saved = await saveProjectToStorage(id, project)
        if (saved) {
          localStorage.removeItem(LEGACY_STORAGE_KEY)
          await deleteProjectFromStorage(LEGACY_DB_KEY)
        }
        return { id, project }
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
  // Carrossel sem nenhum slide é válido (a pessoa pode ter excluído todos):
  // só recusa quando o arquivo nem tinha uma lista de slides utilizável.
  return {
    title:
      typeof p.title === 'string' && p.title.trim() !== ''
        ? p.title
        : 'Carrossel sem título',
    captionLeft: typeof p.captionLeft === 'string' ? p.captionLeft : '',
    captionRight: typeof p.captionRight === 'string' ? p.captionRight : '',
    slides,
  }
}
