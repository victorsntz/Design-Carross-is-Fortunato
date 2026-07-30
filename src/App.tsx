import { useEffect, useRef, useState } from 'react'
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
  defaultProject,
  loadProjectFromStorage,
  makeSlide,
  newId,
  normalizeProject,
  saveProjectToStorage,
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
  development: 'Desenvolvimento',
  book: 'Livro / Oferta',
  final: 'Final (CTA)',
}

/** Onde uma mídia entra num slide: no espaço único ou numa das metades. */
type MediaSlot = 'media' | 'top' | 'bottom'

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

function usePreviewWidth(ref: React.RefObject<HTMLElement>): number {
  const [w, setW] = useState(320)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      const byHeight = (rect.height - 96) * (1080 / 1350)
      setW(Math.max(220, Math.min(rect.width - 48, byHeight)))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

export default function App() {
  const [project, setProject] = useState<Project>(
    () => loadProjectFromStorage() ?? defaultProject(),
  )
  const [selectedId, setSelectedId] = useState<string>(() => project.slides[0]?.id ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [draftTooBig, setDraftTooBig] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const previewWidth = usePreviewWidth(previewRef)

  const projectRef = useRef(project)
  projectRef.current = project

  useEffect(() => {
    const t = setTimeout(() => setDraftTooBig(!saveProjectToStorage(project)), 500)
    return () => clearTimeout(t)
  }, [project])

  // Fechou a aba antes do rascunho automático rodar? Salva na saída.
  useEffect(() => {
    const flush = () => {
      saveProjectToStorage(projectRef.current)
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])

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
      const slides = [...p.slides]
      // Slide final costuma fechar o carrossel: novos slides entram antes dele.
      const last = slides[slides.length - 1]
      if (last && last.type === 'final' && type !== 'final') {
        slides.splice(slides.length - 1, 0, slide)
      } else {
        slides.push(slide)
      }
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
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith('image/'),
      )
      if (!item) return
      const file = item.getAsFile()
      if (!file) return
      const current = project.slides.find((s) => s.id === selectedId) ?? project.slides[0]
      if (!current) return
      let slot: MediaSlot | null = null
      if (current.type === 'split') {
        slot = !current.top.media ? 'top' : !current.bottom.media ? 'bottom' : 'top'
      } else if ('media' in current) {
        slot = 'media'
      }
      if (!slot) return
      e.preventDefault()
      void setSlideMediaFromFile(current.id, slot, file)
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

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label)
    try {
      await fn()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Algo deu errado na exportação.')
    } finally {
      setBusy(null)
    }
  }

  const slideFileName = (i: number) => `slide-${String(i + 1).padStart(2, '0')}`

  /** Evita exportar com as assinaturas de exemplo ainda no topo dos slides. */
  function confirmExampleCaptions(): boolean {
    const isExample =
      project.captionLeft.includes('ESCREVA AQUI') ||
      project.captionRight.includes('REPITA OU VARIE')
    return (
      !isExample ||
      window.confirm(
        'As assinaturas do topo ainda são o texto de exemplo (veja "Identidade" no painel). Exportar mesmo assim?',
      )
    )
  }

  function exportPng() {
    if (!selected || !confirmExampleCaptions()) return
    void run('Gerando PNG…', async () => {
      const blob = await exportSlidePng(selected, project)
      downloadBlob(blob, `${slideFileName(selectedIndex)}.png`)
    })
  }

  function exportOverlay() {
    if (!selected) return
    void run('Gerando arte transparente…', async () => {
      const blob = await exportOverlayPng(selected, project)
      downloadBlob(blob, `${slideFileName(selectedIndex)}-arte-transparente.png`)
    })
  }

  function exportVideo() {
    if (!selected || !confirmExampleCaptions()) return
    void run('Exportando vídeo…', async () => {
      const result = await exportSlideVideo(selected, project, (f) =>
        setBusy(
          `Exportando vídeo… ${Math.round(f * 100)}% (tempo real — se trocar de aba, a exportação pausa e continua quando você voltar)`,
        ),
      )
      downloadBlob(result.blob, `${slideFileName(selectedIndex)}.${result.extension}`)
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
      downloadBlob(blob, 'carrossel.zip')
    })
  }

  function saveJson() {
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: 'application/json',
    })
    downloadBlob(blob, 'projeto-carrossel.json')
  }

  async function openJson(file: File) {
    try {
      const parsed = normalizeProject(JSON.parse(await file.text()))
      if (!parsed) throw new Error('Este arquivo não parece ser um projeto válido.')
      setProject(parsed)
      setSelectedId(parsed.slides[0].id)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Falha ao abrir o projeto.')
    }
  }

  function resetProject() {
    if (!window.confirm('Recomeçar do zero? O projeto atual será substituído.')) return
    const fresh = defaultProject()
    setProject(fresh)
    setSelectedId(fresh.slides[0].id)
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
      root.querySelectorAll('.sl-dev, .sl-book').forEach((el) => {
        if (el.scrollHeight > el.clientHeight + 2) bad = true
      })
      const within = (el: Element, container: Element) => {
        const r = el.getBoundingClientRect()
        const c = container.getBoundingClientRect()
        const tol = Math.max(2, c.height * 0.006)
        return r.top >= c.top - tol && r.bottom <= c.bottom + tol
      }
      root.querySelectorAll('.sl-comp-text, .sl-final-text').forEach((el) => {
        if (!within(el, root)) bad = true
      })
      root.querySelectorAll('.sl-split-text').forEach((el) => {
        if (el.parentElement && !within(el, el.parentElement)) bad = true
      })
      setTextOverflow(bad)
    }, 150)
    return () => clearTimeout(t)
  }, [project, selectedId, previewWidth])

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-title">
          <h1>Criador de Carrosséis</h1>
          <span className="topbar-sub">comparação → desenvolvimento → final</span>
          {draftTooBig && (
            <span className="warn-badge">
              As fotos não couberam no rascunho automático do navegador — use
              “Baixar projeto” pra não perder nada.
            </span>
          )}
        </div>
        <div className="topbar-actions">
          <button type="button" className="btn" onClick={saveJson}>
            Baixar projeto
          </button>
          <FileButton label="Abrir projeto" accept="application/json,.json" onFile={openJson} />
          <button type="button" className="btn" onClick={resetProject}>
            Recomeçar
          </button>
          <button type="button" className="btn btn--primary" onClick={exportZip}>
            Baixar todos (ZIP)
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="filmstrip">
          <div className="filmstrip-list">
            {project.slides.map((slide, i) => (
              <button
                type="button"
                key={slide.id}
                className={
                  slide.id === selected?.id ? 'thumb thumb--active' : 'thumb'
                }
                onClick={() => setSelectedId(slide.id)}
              >
                <span className="thumb-canvas">
                  <SlideRenderer slide={slide} project={project} width={104} thumbnail />
                </span>
                <span className="thumb-label">
                  {i + 1}. {TYPE_LABEL[slide.type]}
                </span>
              </button>
            ))}
          </div>
          <div className="filmstrip-add">
            <span className="panel-heading">Adicionar slide</span>
            <button type="button" className="btn btn--small" onClick={() => addSlide('split')}>
              + Tela partida
            </button>
            <button type="button" className="btn btn--small" onClick={() => addSlide('comparison')}>
              + Foto de fundo
            </button>
            <button type="button" className="btn btn--small" onClick={() => addSlide('development')}>
              + Desenvolvimento
            </button>
            <button type="button" className="btn btn--small" onClick={() => addSlide('book')}>
              + Livro / Oferta
            </button>
            <button type="button" className="btn btn--small" onClick={() => addSlide('final')}>
              + Final (CTA)
            </button>
          </div>
        </aside>

        <main className="preview" ref={previewRef}>
          {selected ? (
            <>
              <div className="preview-canvas">
                <SlideRenderer slide={selected} project={project} width={previewWidth} />
              </div>
              {textOverflow && (
                <p className="overflow-warning">
                  O texto está passando do limite do slide. Toque em A− ou encurte o
                  texto.
                </p>
              )}
              <div className="preview-actions">
                <button type="button" className="btn" onClick={exportPng}>
                  Baixar PNG
                </button>
                <button type="button" className="btn" onClick={exportOverlay}>
                  Arte transparente (PNG)
                </button>
                {selectedHasVideo && (
                  <button type="button" className="btn btn--primary" onClick={exportVideo}>
                    Exportar vídeo
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="preview-empty">Adicione um slide para começar.</p>
          )}
        </main>

        <aside className="panel">
          {selected && (
            <section className="panel-section">
              <span className="panel-heading">
                Slide {selectedIndex + 1} — {TYPE_LABEL[selected.type]}
              </span>

              {'media' in selected && (
                <div className="control-row control-row--wrap">
                  <FileButton
                    label={
                      selected.type === 'book'
                        ? selected.media
                          ? 'Trocar imagem'
                          : 'Adicionar imagem'
                        : selected.media
                          ? 'Trocar foto ou vídeo'
                          : 'Adicionar foto ou vídeo'
                    }
                    accept={
                      selected.type === 'book' ? 'image/*' : 'image/*,video/*'
                    }
                    onFile={(f) => void setSlideMediaFromFile(selected.id, 'media', f)}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void pasteFromClipboard(selected.id, 'media')}
                  >
                    Colar imagem
                  </button>
                  {selected.media && (
                    <button
                      type="button"
                      className="btn btn--small"
                      onClick={() => applyMedia(selected.id, 'media', null)}
                    >
                      Remover
                    </button>
                  )}
                </div>
              )}
              {selectedHasVideo && (
                <p className="hint">
                  Vídeos valem só nesta sessão do navegador (não ficam salvos no
                  projeto). Exporte o vídeo pronto pelo botão abaixo do slide — ele
                  sai com o áudio original do arquivo.
                </p>
              )}

              {selected.type === 'split' &&
                (['top', 'bottom'] as const).map((slot) => {
                  const half = (selected as SplitSlide)[slot]
                  return (
                    <div key={slot} className="half-group">
                      <span className="panel-subheading">
                        {slot === 'top' ? 'Metade de cima' : 'Metade de baixo'}
                      </span>
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
                          onClick={() => void pasteFromClipboard(selected.id, slot)}
                        >
                          Colar imagem
                        </button>
                        {half.media && (
                          <button
                            type="button"
                            className="btn btn--small"
                            onClick={() => applyMedia(selected.id, slot, null)}
                          >
                            Remover
                          </button>
                        )}
                      </div>
                      <label className="field">
                        <span>Texto</span>
                        <textarea
                          rows={2}
                          value={half.text}
                          onChange={(e) =>
                            updateSlide(selected.id, (s) =>
                              s.type === 'split'
                                ? ({
                                    ...s,
                                    [slot]: { ...s[slot], text: e.target.value },
                                  } as Slide)
                                : s,
                            )
                          }
                        />
                      </label>
                    </div>
                  )
                })}

              {selected.type === 'comparison' && (
                <>
                  <label className="field">
                    <span>Texto do slide</span>
                    <textarea
                      rows={3}
                      value={(selected as ComparisonSlide).text}
                      onChange={(e) =>
                        updateSlide(selected.id, (s) => ({ ...s, text: e.target.value }))
                      }
                    />
                  </label>
                  <div className="control-row">
                    <span className="control-label">Posição do texto</span>
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
                </>
              )}

              {selected.type === 'development' && (
                <>
                  <label className="field">
                    <span>Texto (linha em branco separa parágrafos)</span>
                    <textarea
                      rows={9}
                      value={(selected as DevelopmentSlide).body}
                      onChange={(e) =>
                        updateSlide(selected.id, (s) => ({ ...s, body: e.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Frase de fechamento (negrito, centralizada)</span>
                    <textarea
                      rows={2}
                      value={(selected as DevelopmentSlide).emphasis}
                      onChange={(e) =>
                        updateSlide(selected.id, (s) => ({
                          ...s,
                          emphasis: e.target.value,
                        }))
                      }
                    />
                  </label>
                </>
              )}

              {selected.type === 'book' && (
                <label className="field">
                  <span>Texto (linha em branco separa parágrafos)</span>
                  <textarea
                    rows={8}
                    value={(selected as BookSlide).body}
                    onChange={(e) =>
                      updateSlide(selected.id, (s) => ({ ...s, body: e.target.value }))
                    }
                  />
                </label>
              )}

              {selected.type === 'final' && (
                <label className="field">
                  <span>Texto do convite (“Me segue se…”)</span>
                  <textarea
                    rows={4}
                    value={(selected as FinalSlide).text}
                    onChange={(e) =>
                      updateSlide(selected.id, (s) => ({ ...s, text: e.target.value }))
                    }
                  />
                </label>
              )}

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

              <div className="control-row control-row--wrap">
                <button
                  type="button"
                  className="btn btn--small"
                  disabled={selectedIndex <= 0}
                  onClick={() => moveSlide(selected.id, -1)}
                >
                  Mover pra trás
                </button>
                <button
                  type="button"
                  className="btn btn--small"
                  disabled={selectedIndex >= project.slides.length - 1}
                  onClick={() => moveSlide(selected.id, 1)}
                >
                  Mover pra frente
                </button>
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => duplicateSlide(selected.id)}
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  className="btn btn--small btn--danger"
                  onClick={() => removeSlide(selected.id)}
                >
                  Excluir
                </button>
              </div>

              <p className="hint">
                Formatação nos textos: **negrito**, *itálico*, _sublinhado_.
              </p>
            </section>
          )}

          <section className="panel-section">
            <span className="panel-heading">Identidade (todos os slides)</span>
            <label className="field">
              <span>Assinatura do topo — esquerda</span>
              <textarea
                rows={2}
                value={project.captionLeft}
                onChange={(e) =>
                  setProject((p) => ({ ...p, captionLeft: e.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Assinatura do topo — direita</span>
              <textarea
                rows={2}
                value={project.captionRight}
                onChange={(e) =>
                  setProject((p) => ({ ...p, captionRight: e.target.value }))
                }
              />
            </label>
          </section>
        </aside>
      </div>

      {busy && (
        <div className="busy-overlay">
          <div className="busy-card">{busy}</div>
        </div>
      )}
    </div>
  )
}
