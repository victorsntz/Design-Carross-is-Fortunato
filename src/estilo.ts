import type {
  CustomFont,
  Divider,
  FontStyle,
  FontWeight,
  Palette,
  Project,
  Slide,
  SlideType,
} from './types'
import { FILETE_PADRAO, PALETA_PADRAO } from './types'
import { openDb, reqResult, STORE_ESTILOS, txDone } from './state'
import { DEFAULT_STEPS, sizeStepsFor } from './components/SlideRenderer'

/**
 * Padrão estético de cada pessoa.
 *
 * O modelo base é feito à mão uma vez: fonte, assinaturas do topo e os
 * ajustes de texto de cada tipo de slide. Depois disso, todo carrossel
 * novo — inclusive os que entram por importação de .md — já nasce com
 * essa cara, sem ninguém precisar reajustar nada.
 *
 * Fica guardado por usuário no navegador. Pra distribuir um padrão pronto
 * pra um cliente, o arquivo .json baixado aqui pode ser publicado em
 * estilos/<usuario>.json junto do site: ele vira o padrão inicial de quem
 * entrar com aquele login, mesmo em outro computador.
 */

export interface AjustesDeTexto {
  sizeStep?: number
  lineHeight?: number
  letterSpacing?: number
  align?: 'left' | 'center'
}

export interface EstiloUsuario {
  font: FontStyle
  customFont: CustomFont | null
  captionLeft: string
  captionRight: string
  /** Cores do carrossel (fundo, texto e assinaturas). */
  palette: Palette
  /** Peso dos textos. */
  weight: FontWeight
  /** Filete entre as metades da tela partida. */
  divider: Divider
  /**
   * Ritmo de tipos do carrossel: usado quando o roteiro não diz qual é
   * cada slide. Vazio = o leitor deduz pelo formato do conteúdo.
   */
  sequencia?: SlideType[]
  /** Ajustes de texto por tipo de slide. */
  tipos: Partial<Record<SlideType, AjustesDeTexto>>
  /** Quando foi salvo, só pra informar na tela. */
  salvoEm?: number
}

const TIPOS: SlideType[] = [
  'split',
  'comparison',
  'development',
  'book',
  'final',
  'photoTop',
]

/** O valor que mais aparece — o carrossel base costuma repetir o ajuste. */
function maisComum(valores: number[]): number | undefined {
  if (valores.length === 0) return undefined
  const contagem = new Map<number, number>()
  for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1)
  let melhor = valores[0]
  let max = 0
  for (const [v, n] of contagem) {
    if (n > max) {
      max = n
      melhor = v
    }
  }
  return melhor
}

/** Lê o padrão a partir de um carrossel montado à mão. */
export function estiloDoProjeto(p: Project): EstiloUsuario {
  const tipos: Partial<Record<SlideType, AjustesDeTexto>> = {}
  for (const tipo of TIPOS) {
    const doTipo = p.slides.filter((s) => s.type === tipo)
    if (doTipo.length === 0) continue
    const ajuste: AjustesDeTexto = {}
    const passos = maisComum(doTipo.map((s) => s.sizeStep))
    if (passos !== undefined) ajuste.sizeStep = passos
    const alturas = doTipo
      .map((s) => s.lineHeight)
      .filter((v): v is number => typeof v === 'number')
    const altura = maisComum(alturas)
    if (altura !== undefined) ajuste.lineHeight = altura
    const espacos = doTipo
      .map((s) => s.letterSpacing)
      .filter((v): v is number => typeof v === 'number')
    const espaco = maisComum(espacos)
    if (espaco !== undefined) ajuste.letterSpacing = espaco
    const alinhado = doTipo.filter((s) => s.align).length
    if (alinhado > doTipo.length / 2) {
      ajuste.align = doTipo.find((s) => s.align)?.align
    }
    tipos[tipo] = ajuste
  }
  return {
    font: p.font,
    customFont: p.customFont,
    captionLeft: p.captionLeft,
    captionRight: p.captionRight,
    palette: p.palette ?? PALETA_PADRAO,
    weight: p.weight ?? 'normal',
    divider: p.divider ?? FILETE_PADRAO,
    // O ritmo sai do próprio carrossel modelo, na ordem em que ele está
    sequencia: p.slides.map((s) => s.type),
    tipos,
    salvoEm: Date.now(),
  }
}

/** Veste um carrossel com o padrão. Não encosta no conteúdo dos textos. */
export function aplicarEstilo(p: Project, e: EstiloUsuario): Project {
  return {
    ...p,
    font: e.font,
    customFont: e.customFont,
    captionLeft: e.captionLeft,
    captionRight: e.captionRight,
    palette: e.palette ?? PALETA_PADRAO,
    weight: e.weight ?? 'normal',
    divider: e.divider ?? FILETE_PADRAO,
    slides: p.slides.map((s) => {
      const ajuste = e.tipos[s.type]
      if (!ajuste) return s
      const novo = { ...s } as Slide
      if (typeof ajuste.sizeStep === 'number') {
        novo.sizeStep = Math.min(
          Math.max(0, Math.round(ajuste.sizeStep)),
          sizeStepsFor(s.type) - 1,
        )
      }
      if (typeof ajuste.lineHeight === 'number') novo.lineHeight = ajuste.lineHeight
      if (typeof ajuste.letterSpacing === 'number') {
        novo.letterSpacing = ajuste.letterSpacing
      }
      if (ajuste.align) novo.align = ajuste.align
      return novo
    }),
  }
}

/** Confere um padrão vindo de arquivo antes de deixar entrar. */
export function normalizarEstilo(bruto: unknown): EstiloUsuario | null {
  if (typeof bruto !== 'object' || bruto === null) return null
  const b = bruto as Record<string, unknown>
  const texto = (v: unknown) => (typeof v === 'string' ? v : '')
  const fonte = b.customFont as CustomFont | undefined
  const customFont: CustomFont | null =
    typeof fonte === 'object' &&
    fonte !== null &&
    typeof fonte.dataUrl === 'string' &&
    fonte.dataUrl.startsWith('data:')
      ? { name: texto(fonte.name) || 'Minha fonte', dataUrl: fonte.dataUrl }
      : null
  const tipos: Partial<Record<SlideType, AjustesDeTexto>> = {}
  const brutoTipos = (b.tipos ?? {}) as Record<string, unknown>
  for (const tipo of TIPOS) {
    const a = brutoTipos[tipo]
    if (typeof a !== 'object' || a === null) continue
    const src = a as Record<string, unknown>
    const ajuste: AjustesDeTexto = {}
    if (typeof src.sizeStep === 'number' && Number.isFinite(src.sizeStep)) {
      ajuste.sizeStep = Math.min(
        Math.max(0, Math.round(src.sizeStep)),
        sizeStepsFor(tipo) - 1,
      )
    }
    if (typeof src.lineHeight === 'number' && Number.isFinite(src.lineHeight)) {
      ajuste.lineHeight = Math.min(1.6, Math.max(1.0, src.lineHeight))
    }
    if (typeof src.letterSpacing === 'number' && Number.isFinite(src.letterSpacing)) {
      ajuste.letterSpacing = Math.min(0.06, Math.max(-0.06, src.letterSpacing))
    }
    if (src.align === 'left' || src.align === 'center') ajuste.align = src.align
    tipos[tipo] = ajuste
  }
  const cor = (v: unknown, padrao: string) =>
    typeof v === 'string' && /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(v.trim())
      ? v.trim()
      : padrao
  const bp = (b.palette ?? {}) as Record<string, unknown>
  return {
    font: b.font === 'sans' ? 'sans' : b.font === 'custom' && customFont ? 'custom' : 'serif',
    customFont,
    captionLeft: texto(b.captionLeft),
    captionRight: texto(b.captionRight),
    palette: {
      bg: cor(bp.bg, PALETA_PADRAO.bg),
      text: cor(bp.text, PALETA_PADRAO.text),
      caption: cor(bp.caption, PALETA_PADRAO.caption),
    },
    weight: b.weight === 'bold' ? 'bold' : 'normal',
    sequencia: Array.isArray(b.sequencia)
      ? (b.sequencia.filter((t) => TIPOS.includes(t as SlideType)) as SlideType[])
      : undefined,
    divider: {
      color: cor((b.divider as Record<string, unknown>)?.color, FILETE_PADRAO.color),
      size: Math.min(
        60,
        Math.max(
          0,
          typeof (b.divider as Record<string, unknown>)?.size === 'number'
            ? ((b.divider as Record<string, number>).size as number)
            : 0,
        ),
      ),
    },
    tipos,
    salvoEm: typeof b.salvoEm === 'number' ? b.salvoEm : undefined,
  }
}

/** Padrão padrão-de-fábrica, pra quando ninguém salvou nada ainda. */
export function estiloPadrao(): EstiloUsuario {
  const tipos: Partial<Record<SlideType, AjustesDeTexto>> = {}
  for (const tipo of TIPOS) tipos[tipo] = { sizeStep: DEFAULT_STEPS[tipo] }
  return {
    font: 'serif',
    customFont: null,
    captionLeft: 'ESCREVA AQUI SUA\nASSINATURA DA SÉRIE',
    captionRight: 'REPITA OU VARIE\nDO OUTRO LADO',
    palette: PALETA_PADRAO,
    weight: 'normal',
    divider: FILETE_PADRAO,
    tipos,
  }
}

// ---------------------------------------------------------------------------
// Guardado por usuário no navegador

export async function salvarEstilo(
  usuario: string,
  estilo: EstiloUsuario,
): Promise<boolean> {
  try {
    const db = await openDb()
    try {
      const tx = db.transaction(STORE_ESTILOS, 'readwrite')
      tx.objectStore(STORE_ESTILOS).put(JSON.parse(JSON.stringify(estilo)), usuario)
      await txDone(tx)
    } finally {
      db.close()
    }
    return true
  } catch {
    return false
  }
}

export async function lerEstiloSalvo(usuario: string): Promise<EstiloUsuario | null> {
  try {
    const db = await openDb()
    try {
      const tx = db.transaction(STORE_ESTILOS, 'readonly')
      const bruto = await reqResult(tx.objectStore(STORE_ESTILOS).get(usuario))
      return normalizarEstilo(bruto)
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

export async function apagarEstilo(usuario: string): Promise<void> {
  try {
    const db = await openDb()
    try {
      const tx = db.transaction(STORE_ESTILOS, 'readwrite')
      tx.objectStore(STORE_ESTILOS).delete(usuario)
      await txDone(tx)
    } finally {
      db.close()
    }
  } catch {
    // sem padrão salvo é o estado normal de quem nunca salvou
  }
}

export interface ClienteDoEstudio {
  id: string
  nome: string
  /** Cores do padrão dele, pra amostra no menu. */
  palette?: Palette
  /** true quando existe um padrão publicado pra ele. */
  temPadrao?: boolean
}

/**
 * Lista de clientes do estúdio, publicada em estilos/index.json. É o que
 * alimenta o menu de quem entra com a conta do estúdio.
 */
export async function listarClientes(): Promise<ClienteDoEstudio[]> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}estilos/index.json`, {
      cache: 'no-store',
    })
    if (!r.ok) return []
    const bruto: unknown = await r.json()
    if (!Array.isArray(bruto)) return []
    const lista = bruto.filter(
      (c): c is ClienteDoEstudio =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as ClienteDoEstudio).id === 'string' &&
        typeof (c as ClienteDoEstudio).nome === 'string',
    )
    // Busca o padrão de cada um só pra mostrar as cores na amostra
    return Promise.all(
      lista.map(async (c) => {
        const e = await buscarEstiloPublicado(c.id)
        return { ...c, palette: e?.palette, temPadrao: e !== null }
      }),
    )
  } catch {
    return []
  }
}

/**
 * Padrão publicado junto do site em estilos/<usuario>.json. É o que
 * permite montar o modelo base aqui e entregar pronto pro cliente, já
 * valendo no computador dele.
 */
export async function buscarEstiloPublicado(
  usuario: string,
): Promise<EstiloUsuario | null> {
  try {
    const r = await fetch(
      `${import.meta.env.BASE_URL}estilos/${encodeURIComponent(usuario)}.json`,
      { cache: 'no-store' },
    )
    if (!r.ok) return null
    return normalizarEstilo(await r.json())
  } catch {
    return null
  }
}

/** O padrão que vale agora: o que a pessoa salvou vence o publicado. */
export async function estiloAtual(usuario: string): Promise<EstiloUsuario | null> {
  return (await lerEstiloSalvo(usuario)) ?? (await buscarEstiloPublicado(usuario))
}
