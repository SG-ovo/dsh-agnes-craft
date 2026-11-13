/**
 * 错误翻译层。
 *
 * 上游返回的英文 detail 对用户不友好，而每个状态码该做什么是确定的 ——
 * 这张表照 Agnes 官方「常见错误码」逐条整理，只保留「用户能自己动手的部分」。
 * 网关那一类（502/504/520/522/524）本质都是网络或负载，文案合并处理。
 */

const GUIDANCE = new Map([
  [400, { title: '请求参数不合法', fix: '检查必填项与类型；出图尺寸要是 16 的倍数，视频尺寸要是 64 的倍数。' }],
  [401, { title: '鉴权失败', fix: 'Key 复制完整了吗？是否过期或被吊销？国内站与国际站的 Key 不通用。' }],
  [402, { title: '余额或配额不足', fix: '到控制台看余额 / 订阅状态；也可降低单次规格（小尺寸、短时长）。' }],
  [403, { title: '没有访问权限', fix: '这把 Key 可能没有该模型的权限，或账号订阅 / 企业认证未生效，或网络所在地被限制。' }],
  [404, { title: '地址或资源不存在', fix: '检查 Base URL（国际站是 apihub.agnes-ai.com/v1）与模型名，注意别把 /v1 写重复。' }],
  [405, { title: '请求方法不对', fix: '这条路由只接受特定方法，例如创建视频任务必须是 POST。' }],
  [408, { title: '请求超时', fix: '网络不稳或任务太重；重试，或降低规格、延长客户端超时。' }],
  [409, { title: '任务冲突', fix: '短时间内重复提交了同一任务；等当前任务结束后再试。' }],
  [413, { title: '请求体过大', fix: '参考图太大；改用公开 URL，或压缩后再发 base64。' }],
  [415, { title: '媒体类型不支持', fix: '参考图用 PNG / JPG / WEBP 这类常见格式。' }],
  [422, { title: '参数值越界', fix: '看服务端给出的具体字段提示：seed、分辨率、画幅、时长都有范围。' }],
  [429, { title: '触发限流', fix: '免费账号约 20 RPM；等一分钟再试，或降低并发。' }],
  [431, { title: '请求头过大', fix: 'Authorization 或自定义头异常；清掉多余 Header 再试。' }],
  [499, { title: '客户端提前断开', fix: '本地超时或页面关闭打断了请求；加长超时后重试。' }],
  [500, { title: '服务端异常', fix: '多半是参数触发了服务异常；检查尺寸约束后重试，持续失败就报给官方。' }],
  [502, { title: '网关拿不到上游响应', fix: '网络、DNS 或代理问题；换个网络或稍后重试。' }],
  [503, { title: '服务暂不可用', fix: '常见原因：模型名写错、路由未开启，或服务队列已满。核对模型名后稍等几秒重试。' }],
  [504, { title: '网关等待上游超时', fix: '任务太重或排队；删减内容、降低规格、稍后重试。' }],
  [520, { title: '未知网关错误', fix: '通常与网络 / 代理 / 上游抖动有关；重试。' }],
  [522, { title: '连接上游超时', fix: '网络层超时；检查代理与 DNS，稍后重试。' }],
  [524, { title: '上游处理超时', fix: '长任务超时；改用异步任务 + 轮询，而不是一直挂着等。' }],
])

/** 这些状态码值得原样重试（幂等或服务端临时抖动）。 */
export const RETRYABLE_STATUS = new Set([408, 429, 499, 500, 502, 503, 504, 520, 522, 524])

export class AgnesError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'AgnesError'
    this.status = options.status
    this.hint = options.hint
    this.detail = options.detail
    this.requestId = options.requestId
    this.retryAfterMs = options.retryAfterMs
  }

  /** 给模型 / 用户看的一句话：错误本身 + 该怎么修。 */
  describe() {
    const parts = [this.message]
    if (this.hint) parts.push(`👉 ${this.hint}`)
    if (this.requestId) parts.push(`(request id: ${this.requestId})`)
    return parts.join(' ')
  }
}

export function guidanceFor(status) {
  return GUIDANCE.get(status)
}

/**
 * 把一次失败的 HTTP 响应变成 AgnesError。
 * 上游的 detail / error.message 优先，其次退回原文片段。
 */
export function errorFromResponse({ status, data, text, headers }) {
  const detail =
    pickString(data?.detail) ??
    pickString(data?.error?.message) ??
    pickString(data?.message) ??
    pickString(text)?.slice(0, 300)

  const guide = guidanceFor(status)
  const title = guide?.title ?? `HTTP ${status}`
  const requestId =
    headers?.get?.('x-request-id') ?? data?.request_id ?? data?.requestId ?? extractRequestId(text)

  return new AgnesError(`${title}（HTTP ${status}）${detail === undefined ? '' : `：${detail}`}`, {
    status,
    detail,
    hint: guide?.fix,
    requestId,
    retryAfterMs: parseRetryAfter(headers),
  })
}

function pickString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

/** 有的网关把 request id 只写在人类可读的错误串里。 */
function extractRequestId(text) {
  if (typeof text !== 'string') return undefined
  const match = /request id:\s*([A-Za-z0-9]+)/i.exec(text)
  return match?.[1]
}

function parseRetryAfter(headers) {
  const raw = headers?.get?.('retry-after')
  if (typeof raw !== 'string') return undefined
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000)
  const date = Date.parse(raw)
  if (Number.isFinite(date)) return Math.max(0, Math.min(date - Date.now(), 30_000))
  return undefined
}
