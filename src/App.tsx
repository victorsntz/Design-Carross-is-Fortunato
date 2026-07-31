import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BookSlide,
  ComparisonSlide,
  DevelopmentSlide,
  FinalSlide,
  Project,
  Slide,
  SlideMedia,
  SlideType,
  SplitSlide,
} from './types'
import { SlideRenderer, SIZE_STEPS } from './components/SlideRenderer'
import {
  blankProject,
  defaultProject,
  deleteProjectFromStorage,
  listProjects,
  loadCurrentProject,
  loadProject,
  makeSlide,
  newId,
  normalizeProject,
  saveProjectToStorage,
  type ProjectSummary,
} from './state'
import { clipboardToMedia, fileToMedia } from './media'
import {
  downloadBlob,
  exportAllPngZip,
  exportOverlayPng,
  exportSlidePng,
  exportSlideVideo,
  slideHasVideo,
} from './export'

const TYPE_LABEL: Record<SlideType, string> = {
  split: 'Tela partida',
  comparison: 'Foto de fundo',
  development: 'Desenvolvimento 1',
  book: 'Livro / Oferta',
  final: 'Desenvolvimento 2',
}

/** Cor de identificação de cada tipo, usada no menu, no selo e nas miniaturas. */
const TYPE_COLOR: Record<SlideType, string> = {
  split: '#e8c46a',
  comparison: '#c9b491',
  development: '#7fb5e0',
  book: '#c79ad2',
  final: '#8fd49a',
}

// Os três tipos do formato. Os antigos (foto de fundo, livro) continuam
// renderizando em carrosséis já salvos, mas saíram do menu.
const ADD_OPTIONS: { type: SlideType; label: string; hint: string }[] = [
  { type: 'split', label: 'Tela partida', hint: 'o par de comparação' },
  { type: 'development', label: 'Desenvolvimento 1', hint: 'foto de fundo + texto' },
  { type: 'final', label: 'Desenvolvimento 2', hint: 'texto à esquerda, foto à direita' },
]

/** Cores das metades da tela partida no painel de ajustes. */
const HALF_COLOR = { top: '#e0a86e', bottom: '#7fb5e0' } as const

/** Desenho do layout de cada tipo, pro botão de adicionar ser visual. */
function TypeIcon({ type }: { type: SlideType }) {
  const c = TYPE_COLOR[type]
  if (type === 'split') {
    return (
      <svg className="type-icon" viewBox="0 0 26 32" aria-hidden>
        <rect x="1" y="1" width="24" height="14" rx="2" fill="none" stroke={c} strokeWidth="1.5" />
        <rect x="1" y="17" width="24" height="14" rx="2" fill="none" stroke={c} strokeWidth="1.5" />
        <line x1="6" y1="11.5" x2="20" y2="11.5" stroke={c} strokeWidth="1.5" />
        <line x1="6" y1="27.5" x2="20" y2="27.5" stroke={c} strokeWidth="1.5" />
      </svg>
    )
  }
  if (type === 'development') {
    return (
      <svg className="type-icon" viewBox="0 0 26 32" aria-hidden>
        <rect x="1" y="1" width="24" height="30" rx="2" fill={c} opacity="0.22" />
        <rect x="1" y="1" width="24" height="30" rx="2" fill="none" stroke={c} strokeWidth="1.5" />
        <line x1="11" y1="19" x2="22" y2="19" stroke={c} strokeWidth="1.5" />
        <line x1="11" y1="23" x2="22" y2="23" stroke={c} strokeWidth="1.5" />
        <line x1="11" y1="27" x2="18" y2="27" stroke={c} strokeWidth="1.5" />
      </svg>
    )
  }
  return (
    <svg className="type-icon" viewBox="0 0 26 32" aria-hidden>
      <rect x="1" y="1" width="24" height="30" rx="2" fill="none" stroke={c} strokeWidth="1.5" />
      <rect x="14" y="2.5" width="10" height="27" fill={c} opacity="0.45" />
      <line x1="4" y1="13" x2="11" y2="13" stroke={c} strokeWidth="1.5" />
      <line x1="4" y1="17" x2="11" y2="17" stroke={c} strokeWidth="1.5" />
      <line x1="4" y1="21" x2="9" y2="21" stroke={c} strokeWidth="1.5" />
    </svg>
  )
}

/** Onde uma mídia entra num slide: no espaço único ou numa das metades. */
type MediaSlot = 'media' | 'top' | 'bottom'

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'carrossel'
  )
}

function formatWhen(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })
}

/**
 * Textarea que cresce com o conteúdo (nada de rolagem em caixinha) e aceita
 * Ctrl/Cmd+B, +I e +U pra formatar a seleção com **negrito**, *itálico* e
 * _sublinhado_.
 */
function AutoTextarea({
  value,
  onValueChange,
  minRows = 2,
  ...rest
}: {
  value: string
  onValueChange: (v: string) => void
  minRows?: number
} & Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange' | 'rows'
>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const pendingSel = useRef<{ start: number; end: number } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
    if (pendingSel.current) {
      el.setSelectionRange(pendingSel.current.start, pendingSel.current.end)
      pendingSel.current = null
    }
  }, [value])

  const applyFormat = (marker: string) => {
    const el = ref.current
    if (!el) return
    const s = el.selectionStart
    const e = el.selectionEnd
    const sel = value.slice(s, e)
    const before = value.slice(0, s)
    const after = value.slice(e)
    const m = marker.length
    if (before.endsWith(marker) && after.startsWith(marker)) {
      // já formatado por fora: desfaz
      onValueChange(before.slice(0, -m) + sel + after.slice(m))
      pendingSel.current = { start: s - m, end: e - m }
    } else if (
      sel.length >= 2 * m &&
      sel.startsWith(marker) &&
      sel.endsWith(marker)
    ) {
      // seleção inclui os marcadores: desfaz
      onValueChange(before + sel.slice(m, -m) + after)
      pendingSel.current = { start: s, end: e - 2 * m }
    } else {
      onValueChange(before + marker + sel + marker + after)
      pendingSel.current = { start: s + m, end: e + m }
    }
  }

  return (
    <textarea
      {...rest}
      ref={ref}
      rows={minRows}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && !e.altKey) {
          const k = e.key.toLowerCase()
          if (k === 'b' || k === 'i' || k === 'u') {
            e.preventDefault()
            applyFormat(k === 'b' ? '**' : k === 'i' ? '*' : '_')
          }
        }
      }}
    />
  )
}

function FileButton({
  label,
  accept,
  onFile,
  className,
}: {
  label: string
  accept: string
  onFile: (file: File) => void
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" className={className ?? 'btn'} onClick={() => ref.current?.click()}>
        {label}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </>
  )
}

/**
 * Ref de callback: re-observa sempre que o contêiner do slide monta/desmonta
 * (ele some atrás da tela de carregamento e quando não há slide).
 */
function usePreviewWidth(): [number, (el: HTMLDivElement | null) => void] {
  const [w, setW] = useState(320)
  const roRef = useRef<ResizeObserver | null>(null)
  const attach = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    roRef.current = null
    if (!el) return
    const update = () => {
      // O contêiner observado é só a área do slide, então a imagem pode
      // ocupar praticamente tudo — quanto maior, melhor de trabalhar.
      const rect = el.getBoundingClientRect()
      const byHeight = (rect.height - 8) * (1080 / 1350)
      setW(Math.max(220, Math.min(rect.width - 16, byHeight)))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    roRef.current = ro
  }, [])
  return [w, attach]
}

export default function App() {
  const [project, setProject] = useState<Project>(defaultProject)
  const [projectId, setProjectId] = useState<string>(() => newId())
  const [saved, setSaved] = useState<ProjectSummary[]>([])
  const [selectedId, setSelectedId] = useState<string>(() => project.slides[0]?.id ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [draftFailed, setDraftFailed] = useState(false)
  // Só grava depois de tentar restaurar o carrossel anterior, senão o estado
  // inicial padrão atropela o que estava salvo.
  const [hydrated, setHydrated] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const [previewWidth, attachPreviewBox] = usePreviewWidth()
  const filmstripRef = useRef<HTMLElement>(null)

  // Mantém o slide selecionado visível no filme de miniaturas — inclusive
  // quando ele muda de posição pelas setas de reordenar.
  const selectedIndexForScroll = project.slides.findIndex((s) => s.id === selectedId)
  useEffect(() => {
    filmstripRef.current
      ?.querySelector('.thumb--active')
      ?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
  }, [selectedId, selectedIndexForScroll])

  const projectRef = useRef(project)
  projectRef.current = project
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId
  // Ids excluídos nunca mais podem ser salvos: um rascunho pendente que
  // disparasse depois do "Excluir" ressuscitaria o carrossel apagado.
  const deletedIdsRef = useRef<Set<string>>(new Set())
  // Última versão gravada com sucesso: o flush de saída só escreve quando algo
  // mudou — uma aba parada não pode atropelar o trabalho feito em outra aba.
  const lastSavedRef = useRef<Project | null>(null)

  function refreshList() {
    void listProjects().then(setSaved)
  }

  // Pede ao navegador pra não descartar o armazenamento em limpezas de disco.
  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadCurrentProject().then((current) => {
      if (cancelled) return
      if (current) {
        setProjectId(current.id)
        setProject(current.project)
        setSelectedId(current.project.slides[0]?.id ?? '')
        lastSavedRef.current = current.project
      }
      setHydrated(true)
      refreshList()
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const t = setTimeout(() => {
      if (deletedIdsRef.current.has(projectId)) return
      void saveProjectToStorage(projectId, project).then((ok) => {
        setDraftFailed(!ok)
        if (ok) {
          lastSavedRef.current = project
          setSaved((list) => {
            const entry: ProjectSummary = {
              id: projectId,
              title: project.title.trim() || 'Carrossel sem título',
              updatedAt: Date.now(),
              slideCount: project.slides.length,
            }
            const rest = list.filter((s) => s.id !== projectId)
            return [entry, ...rest]
          })
        }
      })
    }, 500)
    return () => clearTimeout(t)
  }, [project, projectId, hydrated])

  // Saiu da aba (ou fechou) antes do salvamento automático rodar? Salva já.
  useEffect(() => {
    if (!hydrated) return
    const flush = () => {
      if (deletedIdsRef.current.has(projectIdRef.current)) return
      // Nada mudou desde a última gravação? Não escreve nada — senão uma aba
      // esquecida sobrescreveria o trabalho recente de outra aba.
      if (projectRef.current === lastSavedRef.current) return
      void saveProjectToStorage(projectIdRef.current, projectRef.current)
    }
    const onVisibility = () => {
      if (document.hidden) flush()
    }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [hydrated])

  const selected =
    project.slides.find((s) => s.id === selectedId) ?? project.slides[0] ?? null
  const selectedIndex = selected
    ? project.slides.findIndex((s) => s.id === selected.id)
    : -1

  function updateSlide(id: string, update: (s: Slide) => Slide) {
    setProject((p) => ({
      ...p,
      slides: p.slides.map((s) => (s.id === id ? update(s) : s)),
    }))
  }

  function addSlide(type: SlideType) {
    const slide = makeSlide(type)
    setProject((p) => {
      // O novo slide entra logo depois do que está sendo editado:
      // editando o 3, o novo vira o 4.
      const slides = [...p.slides]
      const at = slides.findIndex((s) => s.id === selectedId)
      slides.splice(at >= 0 ? at + 1 : slides.length, 0, slide)
      return { ...p, slides }
    })
    setSelectedId(slide.id)
  }

  function removeSlide(id: string) {
    if (!window.confirm('Excluir este slide?')) return
    const idx = project.slides.findIndex((s) => s.id === id)
    const slides = project.slides.filter((s) => s.id !== id)
    setProject((p) => ({ ...p, slides: p.slides.filter((s) => s.id !== id) }))
    if (slides.length > 0) {
      setSelectedId(slides[Math.min(Math.max(idx, 0), slides.length - 1)].id)
    }
  }

  function duplicateSlide(id: string) {
    const idx = project.slides.findIndex((s) => s.id === id)
    if (idx < 0) return
    const copy = { ...project.slides[idx], id: newId() } as Slide
    setProject((p) => {
      const at = p.slides.findIndex((s) => s.id === id)
      if (at < 0) return p
      const slides = [...p.slides]
      slides.splice(at + 1, 0, copy)
      return { ...p, slides }
    })
    setSelectedId(copy.id)
  }

  function moveSlide(id: string, delta: -1 | 1) {
    setProject((p) => {
      const idx = p.slides.findIndex((s) => s.id === id)
      const to = idx + delta
      if (idx < 0 || to < 0 || to >= p.slides.length) return p
      const slides = [...p.slides]
      const [s] = slides.splice(idx, 1)
      slides.splice(to, 0, s)
      return { ...p, slides }
    })
  }

  function mediaInSlot(s: Slide, slot: MediaSlot): SlideMedia | null {
    if (s.type === 'split' && (slot === 'top' || slot === 'bottom')) {
      return s[slot].media
    }
    if (slot === 'media' && 'media' in s) return s.media
    return null
  }

  function applyMedia(id: string, slot: MediaSlot, media: SlideMedia | null) {
    const slide = project.slides.find((s) => s.id === id)
    const old = slide ? mediaInSlot(slide, slot) : null
    updateSlide(id, (s) => {
      if (s.type === 'split' && (slot === 'top' || slot === 'bottom')) {
        return { ...s, [slot]: { ...s[slot], media } } as Slide
      }
      if (slot === 'media' && 'media' in s) {
        return { ...s, media } as Slide
      }
      return s
    })
    // Libera o objectURL do vídeo substituído, se nenhum outro slide o usa
    // (um slide duplicado compartilha o mesmo URL).
    if (
      old &&
      old.kind === 'video' &&
      old.src.startsWith('blob:') &&
      old.src !== media?.src
    ) {
      let refs = 0
      for (const s of project.slides) {
        if (s.type === 'split') {
          if (s.top.media?.src === old.src) refs++
          if (s.bottom.media?.src === old.src) refs++
        } else if ('media' in s && s.media?.src === old.src) {
          refs++
        }
      }
      if (refs <= 1) URL.revokeObjectURL(old.src)
    }
  }

  async function setSlideMediaFromFile(id: string, slot: MediaSlot, file: File) {
    try {
      applyMedia(id, slot, await fileToMedia(file))
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Falha ao carregar o arquivo.')
    }
  }

  async function pasteFromClipboard(id: string, slot: MediaSlot) {
    try {
      applyMedia(id, slot, await clipboardToMedia())
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Falha ao colar a imagem.')
    }
  }

  // Ctrl+V / Cmd+V em qualquer lugar (fora dos campos de texto) cola a
  // imagem copiada no primeiro espaço livre do slide selecionado.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
        return
      }
      const current = project.slides.find((s) => s.id === selectedId) ?? project.slides[0]
      if (!current) return

      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith('image/'),
      )
      if (item) {
        const file = item.getAsFile()
        if (!file) return
        let slot: MediaSlot | null = null
        let occupied = false
        if (current.type === 'split') {
          // primeiro V preenche a metade de cima, o segundo a de baixo
          if (!current.top.media) slot = 'top'
          else if (!current.bottom.media) slot = 'bottom'
          else {
            slot = 'top'
            occupied = true
          }
        } else if ('media' in current) {
          slot = 'media'
          occupied = current.media !== null
        }
        if (!slot) return
        e.preventDefault()
        if (
          occupied &&
          !window.confirm('Este slide já tem foto. Substituir pela imagem colada?')
        ) {
          return
        }
        void setSlideMediaFromFile(current.id, slot, file)
        return
      }

      // Sem imagem no clipboard: texto colado vai direto pro bloco de texto
      const text = e.clipboardData?.getData('text/plain')?.trim()
      if (!text) return
      e.preventDefault()
      if (current.type === 'split') {
        const target =
          current.top.text.trim() === ''
            ? 'top'
            : current.bottom.text.trim() === ''
              ? 'bottom'
              : null
        const slot2 =
          target ??
          (window.confirm('As duas metades já têm texto. Substituir o da metade de cima?')
            ? 'top'
            : null)
        if (!slot2) return
        updateSlide(current.id, (s) =>
          s.type === 'split' ? ({ ...s, [slot2]: { ...s[slot2], text } } as Slide) : s,
        )
        return
      }
      const currentText =
        current.type === 'development' || current.type === 'book'
          ? current.body
          : 'text' in current
            ? current.text
            : ''
      if (
        currentText.trim() !== '' &&
        !window.confirm('Este slide já tem texto. Substituir pelo colado?')
      ) {
        return
      }
      updateSlide(current.id, (s) => {
        if (s.type === 'development' || s.type === 'book') return { ...s, body: text }
        if ('text' in s) return { ...s, text } as Slide
        return s
      })
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  })

  function stepSize(id: string, delta: -1 | 1) {
    updateSlide(id, (s) => ({
      ...s,
      sizeStep: Math.min(SIZE_STEPS - 1, Math.max(0, s.sizeStep + delta)),
    }))
  }

  const cancelRef = useRef<AbortController | null>(null)

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label)
    try {
      await fn()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Algo deu errado na exportação.'
      // Cancelamento pedido pela própria pessoa não é erro
      if (msg !== 'Exportação cancelada.') window.alert(msg)
    } finally {
      setBusy(null)
    }
  }

  const selectedHasVideo = selected ? slideHasVideo(selected) : false

  // Avisa quando o texto do slide selecionado estoura os limites do design.
  const [textOverflow, setTextOverflow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => {
      const root = previewRef.current?.querySelector('.preview-canvas .sl-root')
      if (!root) {
        setTextOverflow(false)
        return
      }
      let bad = false
      // scrollHeight não enxerga estouro pra CIMA (bloco ancorado embaixo):
      // compara os limites dos filhos com os do contêiner.
      root.querySelectorAll('.sl-dev, .sl-book').forEach((el) => {
        const c = el.getBoundingClientRect()
        for (const child of Array.from(el.children)) {
          const r = child.getBoundingClientRect()
          if (r.top < c.top - 2 || r.bottom > c.bottom + 2) bad = true
        }
      })
      const within = (el: Element, container: Element) => {
        const r = el.getBoundingClientRect()
        const c = container.getBoundingClientRect()
        const tol = Math.max(2, c.height * 0.006)
        return r.top >= c.top - tol && r.bottom <= c.bottom + tol
      }
      // Sobre foto, o texto precisa deixar a imagem aparecer: mais da metade
      // da altura coberta já é demais.
      const coversTooMuch = (el: Element, container: Element) =>
        el.getBoundingClientRect().height >
        container.getBoundingClientRect().height * 0.5
      root.querySelectorAll('.sl-comp-text').forEach((el) => {
        if (!within(el, root) || coversTooMuch(el, root)) bad = true
      })
      root.querySelectorAll('.sl-final-text').forEach((el) => {
        if (!within(el, root)) bad = true
      })
      root.querySelectorAll('.sl-split-text').forEach((el) => {
        const half = el.parentElement
        if (half && (!within(el, half) || coversTooMuch(el, half))) bad = true
      })
      setTextOverflow(bad)
    }, 150)
    return () => clearTimeout(t)
  }, [project, selectedId, previewWidth])

  const slideFileName = (i: number) =>
    `${slugify(project.title)}-slide-${String(i + 1).padStart(2, '0')}`

  /** Evita exportar com assinaturas ou textos de exemplo ainda nos slides. */
  function confirmExampleCaptions(): boolean {
    const exampleCaptions =
      project.captionLeft.includes('ESCREVA AQUI') ||
      project.captionRight.includes('REPITA OU VARIE')
    if (
      exampleCaptions &&
      !window.confirm(
        'As assinaturas do topo ainda são o texto de exemplo (troque na seção "Assinaturas do topo"). Exportar mesmo assim?',
      )
    ) {
      return false
    }
    const tutorialMarks = [
      'Lado A: comece com o dado mais forte',
      'Aqui entra o desenvolvimento: você conecta os dados',
      'Depois do desenvolvimento, respiro',
    ]
    const hasTutorialText = project.slides.some((s) => {
      const texts =
        s.type === 'split'
          ? [s.top.text, s.bottom.text]
          : s.type === 'development'
            ? [s.body]
            : 'text' in s
              ? [s.text]
              : [s.body]
      return texts.some((t) => tutorialMarks.some((m) => t.includes(m)))
    })
    if (
      hasTutorialText &&
      !window.confirm(
        'Alguns slides ainda têm o texto de exemplo do tutorial. Exportar mesmo assim?',
      )
    ) {
      return false
    }
    return true
  }

  function exportPng() {
    if (!selected || !confirmExampleCaptions()) return
    void run('Gerando PNG…', async () => {
      const blob = await exportSlidePng(selected, project)
      downloadBlob(blob, `${slideFileName(selectedIndex)}.png`)
    })
  }

  function exportOverlay() {
    if (!selected || !confirmExampleCaptions()) return
    void run('Gerando arte transparente…', async () => {
      const blob = await exportOverlayPng(selected, project)
      downloadBlob(blob, `${slideFileName(selectedIndex)}-arte.png`)
    })
  }

  function exportVideo() {
    if (!selected || !confirmExampleCaptions()) return
    const controller = new AbortController()
    cancelRef.current = controller
    void run('Exportando vídeo…', async () => {
      try {
        const result = await exportSlideVideo(
          selected,
          project,
          (f) =>
            setBusy(
              `Exportando vídeo… ${Math.round(f * 100)}% (tempo real — se trocar de aba, a exportação pausa e continua quando você voltar)`,
            ),
          controller.signal,
        )
        downloadBlob(result.blob, `${slideFileName(selectedIndex)}.${result.extension}`)
      } finally {
        cancelRef.current = null
      }
    })
  }

  function exportZip() {
    if (!confirmExampleCaptions()) return
    if (
      project.slides.some(slideHasVideo) &&
      !window.confirm(
        'Slides com vídeo entram no ZIP como imagem parada (um frame). O vídeo pronto você baixa slide a slide, no botão "Exportar vídeo". Continuar?',
      )
    ) {
      return
    }
    void run('Gerando todos os PNGs…', async () => {
      const blob = await exportAllPngZip(project, (done, total) =>
        setBusy(`Gerando PNGs… ${done}/${total}`),
      )
      downloadBlob(blob, `${slugify(project.title)}.zip`)
    })
  }

  function saveJson() {
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: 'application/json',
    })
    downloadBlob(blob, `${slugify(project.title)}.json`)
  }

  /** Salva o carrossel aberto antes de sair dele; false = usuário desistiu. */
  async function saveBeforeLeaving(): Promise<boolean> {
    if (deletedIdsRef.current.has(projectIdRef.current)) return true
    const ok = await saveProjectToStorage(projectIdRef.current, projectRef.current)
    if (ok) {
      lastSavedRef.current = projectRef.current
      return true
    }
    return window.confirm(
      'Não consegui salvar o carrossel atual neste navegador. Continuar mesmo assim e perder as alterações dele?',
    )
  }

  async function openJson(file: File) {
    try {
      const parsed = normalizeProject(JSON.parse(await file.text()))
      if (!parsed) throw new Error('Este arquivo não parece ser um projeto válido.')
      // Entra como um carrossel novo na lista, sem sobrescrever o atual
      if (!(await saveBeforeLeaving())) return
      setProjectId(newId())
      setProject(parsed)
      setSelectedId(parsed.slides[0]?.id ?? '')
      refreshList()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Falha ao abrir o projeto.')
    }
  }

  async function newCarousel() {
    if (!(await saveBeforeLeaving())) return
    // Estrutura do método com textos em branco, herdando as assinaturas que
    // a pessoa já configurou — o baralho-tutorial só aparece na primeira vez.
    const fresh = blankProject({
      captionLeft: projectRef.current.captionLeft,
      captionRight: projectRef.current.captionRight,
      font: projectRef.current.font,
    })
    setProjectId(newId())
    setProject(fresh)
    setSelectedId(fresh.slides[0].id)
    refreshList()
  }

  async function openCarousel(id: string) {
    if (id === projectId) return
    if (!(await saveBeforeLeaving())) return
    const loaded = await loadProject(id)
    if (!loaded) {
      window.alert('Não consegui abrir este carrossel.')
      return
    }
    setProjectId(id)
    setProject(loaded)
    setSelectedId(loaded.slides[0]?.id ?? '')
    refreshList()
  }

  async function deleteCarousel(id: string) {
    const entry = saved.find((s) => s.id === id)
    if (!window.confirm(`Excluir "${entry?.title ?? 'este carrossel'}"? Não dá pra desfazer.`)) {
      return
    }
    // O tombstone entra ANTES do delete: um rascunho pendente que dispare
    // durante a exclusão não pode regravar o registro.
    deletedIdsRef.current.add(id)
    await deleteProjectFromStorage(id)
    if (id === projectId) {
      const fresh = blankProject({
        captionLeft: projectRef.current.captionLeft,
        captionRight: projectRef.current.captionRight,
        font: projectRef.current.font,
      })
      setProjectId(newId())
      setProject(fresh)
      setSelectedId(fresh.slides[0].id)
    }
    refreshList()
  }

  // Nada de editar antes de restaurar o que estava salvo: uma digitação nesse
  // intervalo seria atropelada quando o carrossel anterior chegasse.
  if (!hydrated) {
    return (
      <div className="app app--loading">
        <p>Carregando seus carrosséis…</p>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-title">
          <h1>Criador de Carrosséis</h1>
          <span className="topbar-sub">comparação → desenvolvimento → final</span>
        </div>
        {draftFailed ? (
          <span className="save-status save-status--error">
            Não consegui salvar neste navegador — use “Baixar backup” pra não perder
            nada.
          </span>
        ) : (
          <span className="save-status">Salvo automaticamente neste navegador</span>
        )}
      </header>

      <div className="workspace">
        {/* ============ ESQUERDA: o projeto como um todo ============ */}
        <aside className="panel panel--project">
          <section className="card">
            <h2 className="card-title">Título</h2>
            <label className="field">
              <input
                type="text"
                value={project.title}
                onChange={(e) => setProject((p) => ({ ...p, title: e.target.value }))}
                aria-label="Título do carrossel"
              />
            </label>
            <button type="button" className="btn btn--primary btn--full" onClick={exportZip}>
              Baixar todos os slides (ZIP)
            </button>
            <p className="hint">PNGs de 1080×1350, prontos pro Instagram.</p>
          </section>

          <section className="card">
            <h2 className="card-title">Fonte do texto</h2>
            <div className="segmented segmented--full">
              <button
                type="button"
                className={project.font === 'serif' ? 'seg seg--active' : 'seg'}
                onClick={() => setProject((p) => ({ ...p, font: 'serif' }))}
              >
                Serifada
              </button>
              <button
                type="button"
                className={project.font === 'sans' ? 'seg seg--active' : 'seg'}
                onClick={() => setProject((p) => ({ ...p, font: 'sans' }))}
              >
                Sem serifa
              </button>
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">Adicionar slide</h2>
            {ADD_OPTIONS.map((opt) => (
              <button
                key={opt.type}
                type="button"
                className="btn btn--full btn--add"
                style={{ borderLeft: `3px solid ${TYPE_COLOR[opt.type]}` }}
                onClick={() => addSlide(opt.type)}
              >
                <TypeIcon type={opt.type} />
                <span className="btn-add-label">
                  <span>+ {opt.label}</span>
                  <small>{opt.hint}</small>
                </span>
              </button>
            ))}
          </section>

          <section className="card">
            <h2 className="card-title">Assinaturas do topo</h2>
            <p className="hint">Aparecem em todos os slides.</p>
            <label className="field">
              <span>Esquerda</span>
              <AutoTextarea
                value={project.captionLeft}
                onValueChange={(v) => setProject((p) => ({ ...p, captionLeft: v }))}
              />
            </label>
            <label className="field">
              <span>Direita</span>
              <AutoTextarea
                value={project.captionRight}
                onValueChange={(v) => setProject((p) => ({ ...p, captionRight: v }))}
              />
            </label>
          </section>

          <section className="card">
            <h2 className="card-title">Meus carrosséis</h2>
            <button type="button" className="btn btn--full" onClick={() => void newCarousel()}>
              + Novo carrossel
            </button>
            {saved.length > 0 && (
              <ul className="project-list">
                {saved.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={
                        s.id === projectId
                          ? 'project-item project-item--active'
                          : 'project-item'
                      }
                      onClick={() => void openCarousel(s.id)}
                    >
                      <span className="project-item-title">{s.title}</span>
                      <span className="project-item-meta">
                        {s.slideCount} slides · {formatWhen(s.updatedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn-icon"
                      title="Excluir este carrossel"
                      aria-label={`Excluir ${s.title}`}
                      onClick={() => void deleteCarousel(s.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="hint">
              Ficam salvos neste navegador. Pra levar pra outro aparelho, use o
              backup abaixo.
            </p>
            <div className="control-row control-row--wrap">
              <button type="button" className="btn btn--small" onClick={saveJson}>
                Baixar backup
              </button>
              <FileButton
                label="Abrir backup"
                accept="application/json,.json"
                onFile={(f) => void openJson(f)}
                className="btn btn--small"
              />
            </div>
          </section>
        </aside>

        {/* ============ CENTRO: o slide em tamanho grande ============ */}
        <main className="stage" ref={previewRef}>
          {selected ? (
            <>
              <div className="stage-canvas" ref={attachPreviewBox}>
                <div className="preview-canvas">
                  <SlideRenderer
                    slide={selected}
                    project={project}
                    width={previewWidth}
                  />
                </div>
              </div>
              {textOverflow && (
                <p className="overflow-warning">
                  O texto está passando do limite do slide ou cobrindo foto demais.
                  Toque em A− ou encurte o texto.
                </p>
              )}
            </>
          ) : (
            <p className="preview-empty">
              Este carrossel está vazio. Use os botões de “Adicionar slide” para
              começar.
            </p>
          )}
        </main>

        {/* ============ DIREITA: o design do slide selecionado ============ */}
        <aside className="panel panel--slide">
          {selected && (
            <>
              <div className="slide-panel-header">
                <h2>
                  Slide {selectedIndex + 1} de {project.slides.length}
                </h2>
                <span
                  className="slide-type-badge"
                  style={{ background: TYPE_COLOR[selected.type] }}
                >
                  {TYPE_LABEL[selected.type]}
                </span>
              </div>

              {'media' in selected && (
                <section className="card">
                  <h2 className="card-title">
                    {selected.type === 'book'
                      ? 'Imagem'
                      : selected.type === 'development'
                        ? 'Foto ou vídeo de fundo'
                        : 'Foto ou vídeo'}
                  </h2>
                  <div className="control-row control-row--wrap">
                    <FileButton
                      label={selected.media ? 'Trocar' : 'Enviar arquivo'}
                      accept={selected.type === 'book' ? 'image/*' : 'image/*,video/*'}
                      onFile={(f) => void setSlideMediaFromFile(selected.id, 'media', f)}
                      className="btn btn--small"
                    />
                    <button
                      type="button"
                      className="btn btn--small"
                      title="Copiou uma imagem no Google? Cola direto aqui, sem baixar."
                      onClick={() => void pasteFromClipboard(selected.id, 'media')}
                    >
                      Colar imagem
                    </button>
                    {selected.media && (
                      <button
                        type="button"
                        className="btn btn--small btn--danger"
                        onClick={() => applyMedia(selected.id, 'media', null)}
                      >
                        Remover
                      </button>
                    )}
                  </div>
                  {selectedHasVideo && (
                    <p className="hint">
                      Vídeos valem só nesta sessão (não ficam no projeto salvo).
                      Exporte o vídeo pronto no botão abaixo do slide — sai com o
                      áudio original.
                    </p>
                  )}
                </section>
              )}

              {selected.type === 'split' &&
                (['top', 'bottom'] as const).map((slot) => {
                  const half = (selected as SplitSlide)[slot]
                  return (
                    <section
                      key={slot}
                      className="card"
                      style={{ borderLeft: `3px solid ${HALF_COLOR[slot]}` }}
                    >
                      <h2 className="card-title" style={{ color: HALF_COLOR[slot] }}>
                        {slot === 'top' ? 'Metade de cima' : 'Metade de baixo'}
                      </h2>
                      <div className="control-row control-row--wrap">
                        <FileButton
                          label={half.media ? 'Trocar' : 'Foto ou vídeo'}
                          accept="image/*,video/*"
                          onFile={(f) => void setSlideMediaFromFile(selected.id, slot, f)}
                          className="btn btn--small"
                        />
                        <button
                          type="button"
                          className="btn btn--small"
                          title="Copiou uma imagem no Google? Cola direto aqui, sem baixar."
                          onClick={() => void pasteFromClipboard(selected.id, slot)}
                        >
                          Colar imagem
                        </button>
                        {half.media && (
                          <button
                            type="button"
                            className="btn btn--small btn--danger"
                            onClick={() => applyMedia(selected.id, slot, null)}
                          >
                            Remover
                          </button>
                        )}
                      </div>
                      <label className="field">
                        <span>Texto</span>
                        <AutoTextarea
                          value={half.text}
                          onValueChange={(v) =>
                            updateSlide(selected.id, (s) =>
                              s.type === 'split'
                                ? ({ ...s, [slot]: { ...s[slot], text: v } } as Slide)
                                : s,
                            )
                          }
                        />
                      </label>
                    </section>
                  )
                })}

              {(selected.type === 'comparison' ||
                selected.type === 'development' ||
                selected.type === 'book' ||
                selected.type === 'final') && (
                <section className="card">
                  <h2 className="card-title">Texto</h2>
                  {selected.type === 'comparison' && (
                    <label className="field">
                      <span>Frase do slide</span>
                      <AutoTextarea
                        value={(selected as ComparisonSlide).text}
                        onValueChange={(v) =>
                          updateSlide(selected.id, (s) => ({ ...s, text: v }))
                        }
                      />
                    </label>
                  )}
                  {selected.type === 'development' && (
                    <label className="field">
                      <span>Parágrafos (linha em branco separa)</span>
                      <AutoTextarea
                        minRows={6}
                        value={(selected as DevelopmentSlide).body}
                        onValueChange={(v) =>
                          updateSlide(selected.id, (s) => ({ ...s, body: v }))
                        }
                      />
                    </label>
                  )}
                  {selected.type === 'book' && (
                    <label className="field">
                      <span>Parágrafos (linha em branco separa)</span>
                      <AutoTextarea
                        minRows={5}
                        value={(selected as BookSlide).body}
                        onValueChange={(v) =>
                          updateSlide(selected.id, (s) => ({ ...s, body: v }))
                        }
                      />
                    </label>
                  )}
                  {selected.type === 'final' && (
                    <label className="field">
                      <span>Convite (“Me segue se…”)</span>
                      <AutoTextarea
                        minRows={3}
                        value={(selected as FinalSlide).text}
                        onValueChange={(v) =>
                          updateSlide(selected.id, (s) => ({ ...s, text: v }))
                        }
                      />
                    </label>
                  )}
                  <p className="hint">
                    Selecione uma palavra e use Ctrl+B (negrito), Ctrl+I (itálico) ou
                    Ctrl+U (sublinhado) — ou escreva **negrito**, *itálico*,
                    _sublinhado_.
                  </p>
                </section>
              )}

              <section className="card">
                <h2 className="card-title">Ajustes</h2>
                <div className="control-row">
                  <span className="control-label">Tamanho do texto</span>
                  <div className="stepper">
                    <button
                      type="button"
                      className="btn btn--small"
                      disabled={selected.sizeStep <= 0}
                      onClick={() => stepSize(selected.id, -1)}
                    >
                      A−
                    </button>
                    <span className="stepper-dots">
                      {Array.from({ length: SIZE_STEPS }, (_, i) => (
                        <span
                          key={i}
                          className={i <= selected.sizeStep ? 'dot dot--on' : 'dot'}
                        />
                      ))}
                    </span>
                    <button
                      type="button"
                      className="btn btn--small"
                      disabled={selected.sizeStep >= SIZE_STEPS - 1}
                      onClick={() => stepSize(selected.id, 1)}
                    >
                      A+
                    </button>
                  </div>
                </div>
                {selected.type === 'comparison' && (
                  <div className="control-row">
                    <span className="control-label">Posição da frase</span>
                    <div className="segmented">
                      <button
                        type="button"
                        className={
                          (selected as ComparisonSlide).textPosition === 'top'
                            ? 'seg seg--active'
                            : 'seg'
                        }
                        onClick={() =>
                          updateSlide(selected.id, (s) => ({
                            ...s,
                            textPosition: 'top' as const,
                          }))
                        }
                      >
                        Em cima
                      </button>
                      <button
                        type="button"
                        className={
                          (selected as ComparisonSlide).textPosition === 'bottom'
                            ? 'seg seg--active'
                            : 'seg'
                        }
                        onClick={() =>
                          updateSlide(selected.id, (s) => ({
                            ...s,
                            textPosition: 'bottom' as const,
                          }))
                        }
                      >
                        Embaixo
                      </button>
                    </div>
                  </div>
                )}
                <div className="control-row control-row--wrap">
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={() => duplicateSlide(selected.id)}
                  >
                    Duplicar slide
                  </button>
                  <button
                    type="button"
                    className="btn btn--small btn--danger"
                    onClick={() => removeSlide(selected.id)}
                  >
                    Excluir slide
                  </button>
                </div>
              </section>

              <section className="card">
                <h2 className="card-title">Baixar este slide</h2>
                <div className="control-row control-row--wrap">
                  <button type="button" className="btn btn--small" onClick={exportPng}>
                    PNG
                  </button>
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={exportOverlay}
                  >
                    Arte transparente
                  </button>
                  {selectedHasVideo && (
                    <button
                      type="button"
                      className="btn btn--small btn--primary"
                      onClick={exportVideo}
                    >
                      Exportar vídeo
                    </button>
                  )}
                </div>
                <p className="hint">
                  Arte transparente = PNG sem as fotos, pra compor por cima de um
                  vídeo em outro editor.
                </p>
              </section>
            </>
          )}
        </aside>
      </div>

      {/* ============ EMBAIXO: todos os slides do carrossel ============ */}
      <footer className="filmstrip" ref={filmstripRef}>
        {project.slides.map((slide, i) => {
          const active = slide.id === selected?.id
          return (
            <div key={slide.id} className={active ? 'thumb thumb--active' : 'thumb'}>
              <button
                type="button"
                className="thumb-hit"
                onClick={() => setSelectedId(slide.id)}
                aria-label={`Slide ${i + 1}: ${TYPE_LABEL[slide.type]}`}
              >
                <span className="thumb-canvas">
                  <SlideRenderer slide={slide} project={project} width={92} thumbnail />
                </span>
                <span className="thumb-label">
                  <span
                    className="thumb-dot"
                    style={{ background: TYPE_COLOR[slide.type] }}
                  />
                  Slide {i + 1}
                </span>
              </button>
              {active && (
                <span className="thumb-move">
                  <button
                    type="button"
                    className="btn-icon"
                    title="Mover pra trás"
                    disabled={i === 0}
                    onClick={() => moveSlide(slide.id, -1)}
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    title="Mover pra frente"
                    disabled={i === project.slides.length - 1}
                    onClick={() => moveSlide(slide.id, 1)}
                  >
                    ▶
                  </button>
                </span>
              )}
            </div>
          )
        })}
      </footer>

      {busy && (
        <div className="busy-overlay">
          <div className="busy-card">
            <p className="busy-text">{busy}</p>
            {cancelRef.current && (
              <button
                type="button"
                className="btn btn--small"
                onClick={() => cancelRef.current?.abort()}
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
