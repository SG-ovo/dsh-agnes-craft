/**
 * 一个很小的 JSON 请求器。
 *
 * 只做四件事：拼头、超时、把失败翻译成 AgnesError、对值得重试的状态码退避重试。
 * 不引入任何依赖 —— 宿主侧有原生 fetch。
 */

import { AgnesError, RETRYABLE_STATUS, errorFromResponse } from './errors.js'
import { setTimeout as delay } from 'node:timers/promises'

const DEFAULT_TIMEOUT_MS = 180_000
const MAX_ATTEMPTS = 3

/**
 * @param {object} options
 * @param {string} options.url            完整地址
 * @param {'GET'|'POST'|'DELETE'} [options.method]
 * @param {string} options.apiKey         已解析的密钥
 * @param {object} [options.body]         JSON 请求体
 * @param {number} [options.timeoutMs]
 * @param {AbortSignal} [options.signal]  调用方取消
 * @param {number} [options.attempts]
 */
export async function requestJson(options) {
  const { url, method = 'GET', apiKey, body, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options
  const attempts = Math.max(1, options.attempts ?? MAX_ATTEMPTS)

  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (signal?.aborted) throw new AgnesError('调用已被取消')
    try {
      return await once({ url, method, apiKey, body, timeoutMs, signal, maxResponseBytes: options.maxResponseBytes })
    } catch (error) {
      lastError = error
      const retryable = error instanceof AgnesError && RETRYABLE_STATUS.has(error.status)
      if (!retryable || attempt === attempts) break
      if (signal?.aborted) throw new AgnesError('调用已被取消')
      try {
        await delay(backoff(error, attempt), undefined, { signal })
      } catch (error) {
        if (signal?.aborted) throw new AgnesError('调用已被取消')
        throw error
      }
    }
  }
  throw lastError
}

async function once({ url, method, apiKey, body, timeoutMs, signal, maxResponseBytes = 1024 * 1024 }) {
  const timeout = AbortSignal.timeout(timeoutMs)
  const composed = typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout].filter(Boolean)) : timeout

  let response
  try {
    response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: composed,
    })
  } catch (error) {
    if (signal?.aborted) throw new AgnesError('调用已被取消')
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new AgnesError(`请求超时（${Math.round(timeoutMs / 1000)}s）：${url}`, {
        hint: '出图通常十几秒，视频任务建议用异步 + 轮询而不是一直等。',
      })
    }
    throw new AgnesError(`连不上 Agnes：${error?.message ?? error}`, {
      hint: '检查网络 / 代理 / DNS；国内站与国际站是两个不同的域名。',
    })
  }

  let text
  try {
    text = (await readLimitedBody(response, maxResponseBytes)).toString('utf8')
  } catch (error) {
    if (signal?.aborted) throw new AgnesError('调用已被取消')
    if (composed.aborted) throw new AgnesError(`读取响应超时（${Math.round(timeoutMs / 1000)}s）`)
    if (error instanceof AgnesError) throw error
    throw new AgnesError(`读取 Agnes 响应失败：${error?.message ?? error}`)
  }
  let data
  if (text.trim().length > 0) {
    try {
      data = JSON.parse(text)
    } catch {
      if (!response.ok) throw errorFromResponse({ status: response.status, text, headers: response.headers })
      throw new AgnesError('Agnes 返回了非 JSON 内容', { status: response.status, detail: text.slice(0, 300) })
    }
  }

  if (!response.ok) throw errorFromResponse({ status: response.status, data, text, headers: response.headers })
  return { data, headers: response.headers, status: response.status }
}

/** 指数退避 + 抖动；有 Retry-After 就听它的。 */
function backoff(error, attempt) {
  if (Number.isFinite(error?.retryAfterMs)) return error.retryAfterMs
  const base = Math.min(500 * 2 ** (attempt - 1), 8_000)
  return Math.round(base * (0.7 + Math.random() * 0.6))
}

/** 同时限制声明长度和实际流量，避免先把整个响应读进内存。 */
export async function readLimitedBody(response, maxBytes) {
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel()
    throw new AgnesError(`响应超过大小上限 ${maxBytes} 字节`)
  }
  if (!response.body) return Buffer.alloc(0)
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new AgnesError(`响应超过大小上限 ${maxBytes} 字节`)
      chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks, size)
  } catch (error) {
    try { await reader.cancel() } catch {}
    throw error
  } finally {
    reader.releaseLock()
  }
}
