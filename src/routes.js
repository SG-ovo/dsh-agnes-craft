/**
 * 宿主侧的 HTTP 接口 —— 设置页靠它工作。
 *
 * 客户端半不碰 ctx.remote，只打同源的这几个 JSON 路由；另有一张不依赖任何客户端
 * 代码的 HTML 表单页作兜底（客户端模块没加载时仍能填 Key）。
 *
 * 安全边界说明：这些路由不走 GUI 的鉴权，本机任意进程都能访问。
 * 它们只能读写「本 profile 的 Agnes 凭据」，不暴露 Key 明文，也不代理任意请求。
 */

import { isAbsolute } from 'node:path'

import { AgnesError } from './errors.js'
import { probeSites } from './access.js'
import { expandHome } from './store.js'

const PREFIX = '/agnes-craft'
const MAX_BODY_BYTES = 64 * 1024

export const ROUTES = {
  setup: PREFIX,
  status: `${PREFIX}/api/status`,
  key: `${PREFIX}/api/key`,
  probe: `${PREFIX}/api/probe`,
  settings: `${PREFIX}/api/settings`,
  pick: `${PREFIX}/api/pick`,
}

/** 从请求流里读 JSON，带体积上限。 */
async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new AgnesError('请求体过大')
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (raw.length === 0) return {}
  try {
    const payload = JSON.parse(raw)
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new AgnesError('请求体必须是 JSON 对象')
    }
    return payload
  } catch {
    throw new AgnesError('请求体不是合法 JSON')
  }
}

/** 从请求流里读表单。 */
async function readForm(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new AgnesError('请求体过大')
    chunks.push(chunk)
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}

/**
 * 用户粘贴的 Key 经常带脏东西：引号、`Bearer `、换行、看不见的空白。
 * 一次清干净，比让服务端回 401 再排查划算。
 */
export function tidyKey(raw) {
  if (typeof raw !== 'string') return ''
  return raw
    .trim()
    .replace(/^["'`]+/, '')
    .replace(/["'`]+$/, '')
    .trim()
    .replace(/^bearer\s+/i, '')
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, '')
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  res.end(html)
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])

/** 兜底页：一个表单，没有 JS，任何浏览器都能用。 */
export function setupPage({ ref, configured, notice, error }) {
  const badge = configured ? '<b class="ok">已配置</b>' : '<b class="warn">未配置</b>'
  const line = error
    ? `<p class="msg bad">${escapeHtml(error)}</p>`
    : notice
      ? `<p class="msg good">${escapeHtml(notice)}</p>`
      : ''
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agnes 创作 · 填 Key</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;padding:56px 20px;font:15px/1.65 system-ui,"Segoe UI","Microsoft YaHei",sans-serif;background:#f4f5f7;color:#17181c}
  @media(prefers-color-scheme:dark){body{background:#15161a;color:#e9e9ec}}
  main{max-width:600px;margin:0 auto;padding:28px;border-radius:14px;background:#fff;box-shadow:0 8px 32px rgba(0,0,0,.07)}
  @media(prefers-color-scheme:dark){main{background:#1e1f24;box-shadow:none;border:1px solid #2d2f35}}
  h1{margin:0 0 4px;font-size:18px}
  .sub{margin:0 0 20px;font-size:13px;color:#6a6b72}
  .ok{color:#1a7f37}.warn{color:#8a6100}
  label{display:block;margin:0 0 6px;font-size:13px;font-weight:600}
  input{box-sizing:border-box;width:100%;height:40px;padding:0 12px;font:inherit;border:1px solid #d4d5da;border-radius:9px;background:#fff;color:inherit}
  @media(prefers-color-scheme:dark){input{background:#17181c;border-color:#32343a}}
  input:focus{outline:2px solid #3f6fff;outline-offset:1px}
  .hint{margin:8px 0 18px;font-size:12.5px;color:#6a6b72}
  .row{display:flex;gap:10px}
  button{height:40px;padding:0 18px;font:inherit;border-radius:9px;cursor:pointer;border:1px solid #d4d5da;background:#fff;color:inherit}
  @media(prefers-color-scheme:dark){button{background:#26282e;border-color:#3a3c43}}
  button.primary{border-color:transparent;background:#3f6fff;color:#fff}
  button.danger{color:#c0392b}
  .msg{margin:14px 0 0;font-size:13px}
  .good{color:#1a7f37}.bad{color:#c0392b}
</style></head>
<body><main>
  <h1>Agnes 创作 · 填 Key</h1>
  <p class="sub">Key 存进 DSH Credentials（引用名 <code>${escapeHtml(ref)}</code>），不写进任何配置文件。</p>
  <p>当前状态：${badge}</p>
  <form method="post" action="${ROUTES.setup}">
    <label for="key">API Key</label>
    <input id="key" name="key" type="password" placeholder="sk-…" autocomplete="new-password" spellcheck="false">
    <p class="hint">从对应站点的控制台复制。国内站与国际站的 Key 不通用；粘贴时不用带 “Bearer ”。</p>
    <div class="row">
      <button class="primary" type="submit">保存</button>
      <button class="danger" type="submit" name="action" value="clear" formnovalidate>清除</button>
    </div>
  </form>
  ${line}
</main></body></html>`
}

/**
 * 注册全部路由。
 * @returns {Array<() => void>} 释放函数
 */
export function registerRoutes({ ctx, state, webServer }) {
  const disposers = []

  const status = async (req, res) => {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, message: '只接受 GET' })
    const cfg = state.cfg()
    let configured = false
    try {
      const record = await ctx.credentials.resolve(cfg.credentialRef)
      configured = typeof record?.value === 'string' && record.value.trim().length > 0
    } catch {
      configured = false
    }
    return sendJson(res, 200, {
      ok: true,
      configured,
      ref: cfg.credentialRef,
      baseURL: state.effectiveSite(),
      imageModel: cfg.imageModel,
      size: cfg.size,
      aspectRatio: cfg.aspectRatio,
      outputDir: await state.outputDir(),
    })
  }

  const key = async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: '只接受 POST' })
    const cfg = state.cfg()
    let payload
    try {
      payload = await readJson(req)
    } catch (error) {
      return sendJson(res, 400, { ok: false, message: error.message })
    }
    try {
      if (payload.clear === true) {
        await ctx.credentials.unset(cfg.credentialRef)
        return sendJson(res, 200, { ok: true, configured: false })
      }
      const value = tidyKey(payload.key)
      if (value.length === 0) return sendJson(res, 400, { ok: false, message: 'Key 不能为空' })
      await ctx.credentials.set(cfg.credentialRef, value)
      return sendJson(res, 200, { ok: true, configured: true })
    } catch (error) {
      return sendJson(res, 500, { ok: false, message: `保存失败：${error.message}` })
    }
  }

  /** 连通性 + Key 有效性：打一次 /models，不消耗生成额度。 */
  const probe = async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: '只接受 POST' })
    const cfg = state.cfg()
    try {
      const result = await probeSites(ctx, cfg)
      if (result.ok) {
        return sendJson(res, 200, {
          ok: true,
          baseURL: result.baseURL,
          models: result.models.slice(0, 40),
          attempts: result.attempts,
        })
      }
      return sendJson(res, 200, { ok: false, message: '两个站点都拒绝了这个 Key', attempts: result.attempts })
    } catch (error) {
      const hint = error instanceof AgnesError ? error.describe() : String(error?.message ?? error)
      return sendJson(res, 200, { ok: false, message: hint })
    }
  }

  /** 保存目录：写侧车文件，立刻生效（不用重启插件）。 */
  const settings = async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: '只接受 POST' })
    let payload
    try {
      payload = await readJson(req)
    } catch (error) {
      return sendJson(res, 400, { ok: false, message: error.message })
    }
    if (typeof payload.outputDir !== 'string') {
      return sendJson(res, 400, { ok: false, message: 'outputDir 必须是字符串（空串表示不存盘）' })
    }
    const value = payload.outputDir.trim()
    if (value.length > 0) {
      const expanded = expandHome(value)
      if (!isAbsolute(expanded)) {
        return sendJson(res, 400, { ok: false, message: '请填绝对路径，例如 D:\\Pictures\\Agnes 或 ~/Pictures/Agnes' })
      }
    }
    try {
      const applied = await state.saveOutputDir(value)
      return sendJson(res, 200, { ok: true, outputDir: applied })
    } catch (error) {
      return sendJson(res, 500, { ok: false, message: `保存设置失败：${error?.message ?? error}` })
    }
  }

  /** 拉起宿主的原生目录选择器。 */
  const pick = async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: '只接受 POST' })
    try {
      return sendJson(res, 200, await state.pickDirectory())
    } catch (error) {
      return sendJson(res, 200, { ok: false, message: `选择目录失败：${error?.message ?? error}` })
    }
  }

  const setup = async (req, res) => {
    const cfg = state.cfg()
    const configured = async () => {
      try {
        const record = await ctx.credentials.resolve(cfg.credentialRef)
        return typeof record?.value === 'string' && record.value.trim().length > 0
      } catch {
        return false
      }
    }
    try {
      if (req.method === 'GET') {
        return sendHtml(res, 200, setupPage({ ref: cfg.credentialRef, configured: await configured() }))
      }
      if (req.method !== 'POST') return sendHtml(res, 405, setupPage({ ref: cfg.credentialRef, configured: await configured(), error: '只接受 GET / POST' }))
      const form = await readForm(req)
      if (form.get('action') === 'clear') {
        await ctx.credentials.unset(cfg.credentialRef)
        res.writeHead(303, { location: `${ROUTES.setup}?done=1` })
        return res.end()
      }
      const value = tidyKey(form.get('key'))
      if (value.length === 0) {
        return sendHtml(res, 400, setupPage({ ref: cfg.credentialRef, configured: await configured(), error: 'Key 不能为空' }))
      }
      await ctx.credentials.set(cfg.credentialRef, value)
      res.writeHead(303, { location: `${ROUTES.setup}?done=1` })
      return res.end()
    } catch (error) {
      return sendHtml(res, 500, setupPage({ ref: cfg.credentialRef, configured: false, error: `出错了：${error.message}` }))
    }
  }

  for (const [path, handler] of [
    [ROUTES.status, status],
    [ROUTES.key, key],
    [ROUTES.probe, probe],
    [ROUTES.settings, settings],
    [ROUTES.pick, pick],
    [ROUTES.setup, setup],
  ]) {
    disposers.push(webServer.register({ kind: 'exact', path, handler }))
  }

  return disposers
}
