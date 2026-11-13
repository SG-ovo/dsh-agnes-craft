/**
 * 取密钥 + 站点回退。
 *
 * 两件事刻意放在一起：它们都只在「发请求之前」发生一次。
 *   - 密钥只从 DSH Credentials 取，配置里没有明文可退。
 *   - 国内站与国际站的令牌不通用，401 时自动换另一个站；成功过的站点记在内存里。
 */

import { SITES } from './defaults.js'
import { AgnesError } from './errors.js'
import { requestJson } from './http.js'

/** 进程内记住上次成功的站点；重启后第一张图会先试配置里的那个。 */
let lastGoodSite

export function rememberSite(baseURL) {
  lastGoodSite = baseURL
}

export function currentSite() {
  return lastGoodSite
}

/** 没配过就走默认；取不到就抛一条能照着做的错误。 */
export async function requireKey(ctx, cfg) {
  let record
  try {
    record = await ctx.credentials.resolve(cfg.credentialRef)
  } catch (error) {
    throw new AgnesError(`读取凭据失败：${error?.message ?? error}`, {
      hint: `确认 DSH Credentials 里有名为 ${cfg.credentialRef} 的记录。`,
    })
  }
  const value = typeof record?.value === 'string' ? record.value.trim() : ''
  if (value.length === 0) {
    throw new AgnesError(`没有 ${cfg.credentialRef} 这个凭据`, {
      hint: '打开「设置 → Agnes 创作」填一次 API Key，或访问 <DSH 地址>/agnes-craft。',
    })
  }
  return value
}

/**
 * 按候选站点执行，401/403 时换下一个；其它错误直接抛。
 * @param {object} cfg   规范化后的配置
 * @param {(baseURL: string) => Promise<any>} run
 */
export async function withSiteFallback(cfg, run) {
  const candidates = siteCandidates(cfg.baseURL)
  let lastAuthError
  for (const baseURL of candidates) {
    try {
      const value = await run(baseURL)
      rememberSite(baseURL)
      return value
    } catch (error) {
      const status = error?.status
      if (status === 401 || status === 403) {
        lastAuthError = error
        continue
      }
      throw error
    }
  }
  throw new AgnesError(
    `令牌被两个站点都拒绝了：${candidates.map((site) => new URL(site).host).join(' 与 ')}`,
    {
      status: lastAuthError?.status,
      hint: 'Key 可能复制不完整、已过期或被吊销。另外确认这把 Key 是在哪个站注册的 —— 两站不通用。',
      detail: lastAuthError?.detail,
      requestId: lastAuthError?.requestId,
    },
  )
}

/** 已知 Agnes 站点才补另一个；自定义地址（代理 / 自建）不瞎试。 */
export function siteCandidates(configured) {
  const base = configured.replace(/\/+$/, '')
  const allowed = base === SITES.cn || base === SITES.intl ? [base, base === SITES.cn ? SITES.intl : SITES.cn] : [base]
  const ordered = [allowed.includes(lastGoodSite) ? lastGoodSite : undefined, ...allowed]

  const seen = new Set()
  const result = []
  for (const value of ordered) {
    if (typeof value !== 'string' || value.length === 0 || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

/**
 * 便宜的连通性探测：OpenAI 兼容的模型列表。
 * 不生成任何东西，只验证 Key 与地址 —— 比「真出一张图试试」更适合做测试按钮。
 */
export async function probeSites(ctx, cfg) {
  const key = await requireKey(ctx, cfg)
  const attempts = []
  for (const baseURL of siteCandidates(cfg.baseURL)) {
    try {
      const { data } = await requestJson({ url: `${baseURL}/models`, method: 'GET', apiKey: key, timeoutMs: 20_000, attempts: 1 })
      rememberSite(baseURL)
      const models = Array.isArray(data?.data) ? data.data.map((entry) => entry?.id).filter(Boolean) : []
      attempts.push({ baseURL, ok: true })
      return { ok: true, baseURL, models, attempts }
    } catch (error) {
      attempts.push({ baseURL, ok: false, status: error?.status, message: error?.message })
      if (error?.status !== 401 && error?.status !== 403) throw error
    }
  }
  return { ok: false, attempts }
}
