import { useEffect, useState, type ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Portão de acesso: uma paginazinha de login antes do Criador.
// A lista de acessos vive em usuarios.json (na raiz do site publicado) e o
// Victor edita ela direto no GitHub pra liberar/revogar clientes — sem
// rebuild. Cada entrada é { "usuario": "...", "hash": "..." }, onde o hash é
// SHA-256 de "usuario:senha" (gerador embutido em #gerar-acesso).
// Site estático: isso é um portão de acesso, não um cofre.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'criador-acesso'

interface AccessUser {
  usuario: string
  hash: string
  /** Conta do estúdio: entra em qualquer cliente sem senha. */
  admin?: boolean
}

/** Chave do cliente em que o estúdio está trabalhando agora. */
const CLIENTE_KEY = 'criador-cliente'

/**
 * Quem está logado agora. O padrão estético é guardado por pessoa, então
 * o resto do app precisa saber o nome — sem lista de acessos publicada,
 * todo mundo divide o mesmo padrão ("convidado").
 */
export function usuarioLogado(): string {
  try {
    const bruto = localStorage.getItem(STORAGE_KEY)
    if (!bruto) return 'convidado'
    const { usuario } = JSON.parse(bruto) as { usuario?: unknown }
    return typeof usuario === 'string' && usuario.trim() !== ''
      ? usuario.trim()
      : 'convidado'
  } catch {
    return 'convidado'
  }
}

/** A conta logada é do estúdio? Só ela vê o menu de clientes. */
export function ehEstudio(): boolean {
  try {
    const bruto = localStorage.getItem(STORAGE_KEY)
    if (!bruto) return false
    return (JSON.parse(bruto) as { admin?: unknown }).admin === true
  } catch {
    return false
  }
}

/** Cliente escolhido no menu do estúdio (vazio = nenhum ainda). */
export function clienteAtivo(): string {
  try {
    return localStorage.getItem(CLIENTE_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function definirClienteAtivo(id: string): void {
  try {
    if (id) localStorage.setItem(CLIENTE_KEY, id)
    else localStorage.removeItem(CLIENTE_KEY)
  } catch {
    // navegador sem localStorage: o estúdio escolhe de novo a cada sessão
  }
}

/**
 * De quem é a estética que vale agora: o cliente escolhido pelo estúdio,
 * ou a própria pessoa logada.
 */
export function identidadeAtiva(): string {
  return (ehEstudio() && clienteAtivo()) || usuarioLogado()
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function fetchUsers(): Promise<AccessUser[] | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}usuarios.json`, {
      cache: 'no-store',
    })
    if (!r.ok) return null
    const data: unknown = await r.json()
    if (!Array.isArray(data)) return null
    return data.filter(
      (u): u is AccessUser =>
        typeof u === 'object' &&
        u !== null &&
        typeof (u as AccessUser).usuario === 'string' &&
        typeof (u as AccessUser).hash === 'string',
    )
  } catch {
    return null
  }
}

function Logo() {
  return (
    <svg className="gate-logo" viewBox="0 0 32 32" aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#0b0b0b" />
      <rect
        x="5"
        y="5"
        width="22"
        height="22"
        rx="5"
        fill="none"
        stroke="#e4dccb"
        strokeWidth="1.6"
        strokeDasharray="3 2.4"
      />
      <text
        x="16"
        y="21.5"
        fontFamily="Georgia, serif"
        fontSize="13"
        fill="#e4dccb"
        textAnchor="middle"
      >
        C
      </text>
    </svg>
  )
}

/** Ferramenta do Victor: gera a linha do usuarios.json (em #gerar-acesso). */
function HashGenerator() {
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [linha, setLinha] = useState('')
  return (
    <div className="gate">
      <div className="gate-card">
        <Logo />
        <h1>Gerar acesso</h1>
        <p className="hint">
          Preencha usuário e senha; copie a linha gerada pra dentro do arquivo
          usuarios.json do site. A senha em si não é guardada em lugar nenhum.
        </p>
        <label className="field">
          <span>Usuário</span>
          <input type="text" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
        </label>
        <label className="field">
          <span>Senha</span>
          <input type="text" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </label>
        <button
          type="button"
          className="btn btn--primary btn--full"
          disabled={usuario.trim() === '' || senha === ''}
          onClick={() => {
            void sha256Hex(`${usuario.trim()}:${senha}`).then((h) =>
              setLinha(JSON.stringify({ usuario: usuario.trim(), hash: h })),
            )
          }}
        >
          Gerar
        </button>
        {linha !== '' && (
          <>
            <textarea className="gate-output" readOnly rows={3} value={linha} />
            <button
              type="button"
              className="btn btn--small"
              onClick={() => void navigator.clipboard.writeText(linha)}
            >
              Copiar
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function Gate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'login' | 'ok'>('checking')
  const [users, setUsers] = useState<AccessUser[]>([])
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [isGenerator, setIsGenerator] = useState(
    window.location.hash === '#gerar-acesso',
  )

  useEffect(() => {
    const onHash = () => setIsGenerator(window.location.hash === '#gerar-acesso')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const list = await fetchUsers()
      if (cancelled) return
      // Sem lista (dev local ou arquivo ausente): não tranca ninguém fora.
      if (!list || list.length === 0) {
        setState('ok')
        return
      }
      setUsers(list)
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        try {
          const { usuario: u, hash } = JSON.parse(saved) as AccessUser
          if (list.some((x) => x.usuario === u && x.hash === hash)) {
            setState('ok')
            return
          }
        } catch {
          // registro inválido: cai pro login
        }
        localStorage.removeItem(STORAGE_KEY)
      }
      setState('login')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (isGenerator) return <HashGenerator />
  if (state === 'ok') return <>{children}</>
  if (state === 'checking') {
    return (
      <div className="gate">
        <div className="gate-loading">
          <Logo />
          <p className="hint">Carregando…</p>
        </div>
      </div>
    )
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setEntrando(true)
    setErro('')
    const u = usuario.trim()
    const hash = await sha256Hex(`${u}:${senha}`)
    if (users.some((x) => x.usuario === u && x.hash === hash)) {
      const conta = users.find((x) => x.usuario === u && x.hash === hash)
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ usuario: u, hash, admin: conta?.admin === true }),
      )
      // Trocar de conta zera o cliente em que se estava trabalhando
      definirClienteAtivo('')
      setState('ok')
    } else {
      setErro('Usuário ou senha inválidos. Confere com quem te passou o acesso.')
    }
    setEntrando(false)
  }

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={(e) => void entrar(e)}>
        <Logo />
        <h1>Criador Fortunato</h1>
        <p className="gate-sub">Acesso exclusivo pra quem faz parte.</p>
        <label className="field">
          <span>Usuário</span>
          <input
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Senha</span>
          <input
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </label>
        {erro !== '' && <p className="gate-error">{erro}</p>}
        <button
          type="submit"
          className="btn btn--primary btn--full"
          disabled={entrando || usuario.trim() === '' || senha === ''}
        >
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
