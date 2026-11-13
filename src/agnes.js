/**
 * Agnes 出图接口：只认官方文档写的路径与字段，不管 DSH 那边怎么用。
 *
 *   POST {base}/images/generations
 *
 * 两条提交路径（文档明确区分，别混）：
 *   - 文生图：顶层 return_base64 = true
 *   - 图生图 / 多图合成：extra_body.image + extra_body.response_format = 'b64_json'
 * response_format 绝不能放请求体顶层，这是文档反复强调的一点。
 */

import { requestJson, readLimitedBody } from './http.js'
import { AgnesError } from './errors.js'
import { detectImageType } from './media.js'

/**
 * 出图，返回本地字节。
 * @returns {Promise<{ bytes: Buffer, mediaType: string, revisedPrompt?: string }>}
 */
export async function generateImage({ cfg, apiKey, baseURL, prompt, size, ratio, model, references, signal }) {
  const body = { model, prompt, size }
  if (ratio !== undefined) body.ratio = ratio

  const refs = normalizeList(references)
  if (refs.length === 0) {
    body.return_base64 = true
  } else {
    body.extra_body = { image: refs, response_format: 'b64_json' }
  }

  const { data } = await requestJson({
    url: `${baseURL}/images/generations`,
    method: 'POST',
    apiKey,
    body,
    timeoutMs: cfg.timeoutMs,
    signal,
    // 生成不是幂等操作，服务端失败时不盲目再次提交。
    attempts: 1,
    maxResponseBytes: Math.ceil(cfg.maxImageBytes / 3) * 4 + 1024 * 1024,
  })

  const item = Array.isArray(data?.data) ? data.data[0] : undefined
  if (item === undefined || item === null) {
    throw new AgnesError('出图响应里没有 data[0]', { detail: String(JSON.stringify(data)).slice(0, 300) })
  }

  let bytes
  if (typeof item.b64_json === 'string' && item.b64_json.length > 0) {
    if (item.b64_json.length > Math.ceil(cfg.maxImageBytes / 3) * 4) {
      throw new AgnesError(`图片超过大小上限 ${cfg.maxImageBytes} 字节`)
    }
    bytes = Buffer.from(item.b64_json, 'base64')
  } else if (typeof item.url === 'string' && item.url.length > 0) {
    bytes = await downloadBinary(item.url, signal, cfg.timeoutMs, cfg.maxImageBytes)
  } else {
    throw new AgnesError('出图响应里既没有 b64_json 也没有 url')
  }

  if (bytes.length === 0) throw new AgnesError('Agnes 返回了 0 字节图片')
  if (bytes.length > cfg.maxImageBytes) throw new AgnesError(`图片超过大小上限 ${cfg.maxImageBytes} 字节`)
  const mediaType = detectImageType(bytes)
  if (mediaType === undefined) throw new AgnesError('返回的数据不是 PNG / JPEG / WebP / GIF')

  return { bytes, mediaType, revisedPrompt: typeof item.revised_prompt === 'string' ? item.revised_prompt : undefined }
}

/** 上游只给 url 时兜底下载。URL 是公开的，不带鉴权头。 */
export async function downloadBinary(url, signal, timeoutMs = 180_000, maxBytes = 32 * 1024 * 1024) {
  let parsed
  try { parsed = new URL(url) } catch { throw new AgnesError('图片下载地址不合法') }
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new AgnesError('图片下载地址必须是 HTTP(S)')
  const timeout = AbortSignal.timeout(timeoutMs)
  const composed = typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout].filter(Boolean)) : timeout
  try {
    const response = await fetch(url, { signal: composed })
    if (!response.ok) {
      await response.body?.cancel()
      throw new AgnesError(`下载图片失败：HTTP ${response.status}`)
    }
    return await readLimitedBody(response, maxBytes)
  } catch (error) {
    if (signal?.aborted) throw new AgnesError('调用已被取消')
    if (composed.aborted) throw new AgnesError(`下载图片超时（${Math.round(timeoutMs / 1000)}s）`)
    if (error instanceof AgnesError) throw error
    throw new AgnesError(`下载图片失败：${error?.message ?? error}`)
  }
}

function normalizeList(values) {
  if (!Array.isArray(values)) return []
  return values.filter((value) => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim())
}
