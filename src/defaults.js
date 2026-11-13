/**
 * 纯数据：模型清单、枚举、默认值、以及「把配置拍平」的纯函数。
 *
 * 故意不引入任何依赖（也不引入 schemastery），这样单测可以直接跑，
 * 不需要先装好运行时依赖。
 */

export const IMAGE_MODELS = ['agnes-image-2.5-flash', 'agnes-image-2.1-flash', 'agnes-image-2.0-flash']

export const SIZE_TIERS = ['1K', '2K', '3K', '4K']
export const ASPECT_RATIOS = ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9']

/** 两个站点，令牌不通用。 */
export const SITES = {
  cn: 'https://api.agnes-ai.cn/v1',
  intl: 'https://apihub.agnes-ai.com/v1',
}

export const MAX_TIMEOUT_MS = 2_147_483_647

export const DEFAULTS = {
  baseURL: SITES.intl,
  credentialRef: 'AGNES_API_KEY',
  imageModel: 'agnes-image-2.5-flash',
  size: '1K',
  aspectRatio: '1:1',
  timeoutMs: 180_000,
  maxImageBytes: 32 * 1024 * 1024,
  /** 空串 = 只把图放回对话，不额外落盘。用户可在设置页改成任意绝对路径。 */
  outputDir: '',
}

const unwrap = (value) =>
  value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value

/**
 * 出图前必须由用户定下的两项，返回缺失项的中文标签。
 *
 * 分辨率与画幅故意不提供默认值：用户没说就问，不要替他挑一个 —— 这是产品决定，
 * 不是偷懒。工具层据此拒绝调用，逼模型回去问人。
 */
export function missingImageOptions(args) {
  const missing = []
  if (!SIZE_TIERS.includes(args?.size)) missing.push('分辨率（1K / 2K / 3K / 4K）')
  if (!ASPECT_RATIOS.includes(args?.ratio)) missing.push('画幅（1:1 / 3:4 / 4:3 / 16:9 / 9:16 / 2:3 / 3:2 / 21:9）')
  return missing
}

/**
 * 把可能带 Box 的原始配置拍平成普通对象，并做一次宽松兜底。
 * 非法值退回默认，而不是抛错 —— 配置写坏不该让插件整个挂掉。
 */
export function normalizeConfig(raw) {
  const peek = (key) => unwrap(raw?.[key])

  const text = (key) => {
    const value = peek(key)
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : DEFAULTS[key]
  }
  /** 空串是合法值（表示关掉），不能用 text 的「空就退回默认」。 */
  const optionalText = (key) => {
    const value = peek(key)
    return typeof value === 'string' ? value.trim() : DEFAULTS[key]
  }
  const whole = (key, min) => {
    const value = peek(key)
    return Number.isInteger(value) && value >= min && value <= MAX_TIMEOUT_MS ? value : DEFAULTS[key]
  }
  const member = (key, allowed) => {
    const value = peek(key)
    return allowed.includes(value) ? value : DEFAULTS[key]
  }

  return {
    baseURL: text('baseURL').replace(/\/+$/, ''),
    credentialRef: text('credentialRef'),
    imageModel: text('imageModel'),
    size: member('size', SIZE_TIERS),
    aspectRatio: member('aspectRatio', ASPECT_RATIOS),
    timeoutMs: whole('timeoutMs', 1000),
    maxImageBytes: whole('maxImageBytes', 1024),
    outputDir: optionalText('outputDir'),
  }
}
