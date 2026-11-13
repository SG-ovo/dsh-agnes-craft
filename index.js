/**
 * dsh-agnes-craft —— 装配层。
 *
 * 这里只做「接线」，不写业务：把配置、凭据、工具、路由、提示词装到一起。
 * 具体逻辑分在 src/ 下：defaults 配置数据、config schema、access 鉴权与站点回退、
 * http 请求与重试、errors 错误文案、agnes 出图接口、media 字节判定、routes 宿主接口。
 *
 * 只做一件事：agnes_image —— 用户说「画一只猫」，agent 自己调，图片以图片块回到会话。
 */

import { Config } from './src/config.js'
import { ASPECT_RATIOS, SIZE_TIERS, missingImageOptions, normalizeConfig } from './src/defaults.js'
import { AgnesError } from './src/errors.js'
import { siteCandidates, requireKey, withSiteFallback } from './src/access.js'
import { generateImage } from './src/agnes.js'
import { extensionFor } from './src/media.js'
import { imageContentBlocks } from './src/present.js'
import { hasOutputDir, saveImageToDisk } from './src/save.js'
import { readSettings, settingsPath, writeSettings } from './src/store.js'
import { registerRoutes } from './src/routes.js'

export const name = 'dsh-agnes-craft'

/** 没有工具就没意义；没有附件就没法把图片变成会话内容块。 */
export const inject = ['tools', 'attachments', 'credentials']

export { Config }

/* ------------------------------------------------------------------ 提示词 */

const HOUSE_RULES = [
  '## 出图能力',
  '本会话挂了 agnes_image 工具，直接在对话里出图。',
  '用户表达出「想要一张图」时，不要先用文字描述代替，也不要问「要不要我画」：',
  '- 明确的：画一张雨夜霓虹的街景、出张海报、做个封面、给我个头像、来张壁纸、表情包、配图；',
  '- 隐含的：帮我做张能贴的图、这段文案配张图、把这个想法可视化；',
  '- 改图：把这张图换成水彩 / 换成白天 / 去掉背景 —— 把已有图片作为 images 传进去。',
  '写提示词时把要素补全：主体 + 场景 + 动作 + 光线 + 风格 + 构图；语言跟用户一致。',
  '**分辨率和画幅必须由用户明确决定**：用户没说（例如只说「画一张雨夜街景」）就先问一句',
  '「要 1K / 2K / 3K / 4K，画幅 1:1 / 16:9 / 9:16…？」，拿到答复再调用。',
  '工具会拒绝缺这两个参数的调用 —— 这时就去问用户，不要自己挑一个填上。',
  '只有两种情况完全不调用：用户明确说只是在讨论怎么做图，或者根本不要成品。',
  '出图后一两句话说明即可，不要把文件路径当结果反复罗列。',
].join('\n')

/* ------------------------------------------------------------ 工具的输出形状 */

const IMAGE_VALUE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    attachmentId: { type: 'string' },
    mediaType: { type: 'string' },
    bytes: { type: 'integer' },
    width: { type: 'integer' },
    height: { type: 'integer' },
    name: { type: 'string' },
  },
  required: ['attachmentId', 'mediaType', 'bytes', 'width', 'height'],
}

const IMAGE_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    images: { type: 'array', items: IMAGE_VALUE },
    model: { type: 'string' },
    size: { type: 'string' },
    aspectRatio: { type: 'string' },
    prompt: { type: 'string' },
    savedTo: { type: 'array', items: { type: 'string' } },
    notice: { type: 'string' },
  },
  required: ['images'],
}

/* -------------------------------------------------------------------- 应用 */

export function apply(ctx, config) {
  const cfg = () => normalizeConfig(config)

  /**
   * 保存目录：设置页写的侧车文件优先，其次是 profile 配置里的初始值。
   * 每次出图现读 —— 用户在设置页改完不必重启插件。
   */
  const settingsFile = settingsPath()
  async function currentOutputDir() {
    const stored = await readSettings(settingsFile, { outputDir: cfg().outputDir })
    return stored.outputDir
  }

  /**
   * 原生目录选择器是可选服务：用 ctx.inject 单独取，不写进插件必需的 inject ——
   * 否则在没有选择器的宿主上整个插件都会不激活。
   */
  let pickerService
  if (typeof ctx.inject === 'function') {
    ctx.inject(['directoryPickerController'], (scoped) => {
      pickerService = scoped?.directoryPickerController
      return () => {
        pickerService = undefined
      }
    })
  }

  /** 触发宿主的原生目录选择器；宿主没这个能力就报一句人话。 */
  async function pickDirectory() {
    const controller = pickerService
    if (controller === undefined || typeof controller.pick !== 'function') {
      return { ok: false, message: '当前宿主没有原生目录选择器，请直接输入路径' }
    }
    try {
      const chosen = await controller.pick(new AbortController().signal)
      if (typeof chosen !== 'string' || chosen.trim().length === 0) return { ok: false, message: '没有选择目录' }
      return { ok: true, path: chosen }
    } catch (error) {
      return { ok: false, message: `选择目录失败：${error?.message ?? error}` }
    }
  }

  async function storeImage(bytes, mediaType) {
    const name = `agnes-${Date.now().toString(36)}.${extensionFor(mediaType)}`
    const [ref] = await ctx.attachments.saveImages([{ data: bytes, mediaType, name }])
    if (ref === undefined) throw new AgnesError('附件存储没有返回引用')
    return ref
  }

  ctx.tools.register({
    name: 'agnes_image',
    description:
      '用 Agnes 图像模型出图，结果以图片形式回到会话。文生图、图生图、多图合成都能走。' +
      '用户说画/出图/海报/封面/头像/壁纸/表情包/配图，或者要把已有图片改风格、改内容时直接调用；' +
      '不要用文字描述代替出图，也不要先问「要不要我画」。' +
      '但 size 与 ratio 必须来自用户的明确选择：用户没说就先问一句，不要自己填 —— ' +
      '缺这两个参数时工具会直接拒绝。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        prompt: { type: 'string', description: '画面描述：主体、场景、动作、光线、风格、构图。' },
        size: {
          type: 'string',
          enum: SIZE_TIERS,
          description: '分辨率档位。必须来自用户的明确选择，缺了会被拒绝。',
        },
        ratio: {
          type: 'string',
          enum: ASPECT_RATIOS,
          description: '画幅比例。必须来自用户的明确选择，缺了会被拒绝。',
        },
        model: { type: 'string', description: '覆盖默认出图模型。' },
        images: {
          type: 'array',
          items: { type: 'string' },
          description: '参考图，最多 8 张，公开 http(s) 地址或 data:image/…;base64。给了就是图生图。',
        },
      },
      required: ['prompt'],
    },
    output: {
      schema: IMAGE_OUTPUT,
      // 用 image 块回会话 —— 用户就是靠这里在 DSH 里直接看到图，而不是一行路径。
      render: (_args, value) => imageContentBlocks(value),
    },
    timeoutMs: 600_000,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const prompt = typeof args?.prompt === 'string' ? args.prompt.trim() : ''
      if (prompt.length === 0) throw new AgnesError('prompt 不能为空')

      const references = Array.isArray(args?.images) ? args.images : undefined
      if (references !== undefined && references.length > 8) {
        throw new AgnesError(`参考图最多 8 张，收到 ${references.length} 张`)
      }

      const settings = cfg()

      // 分辨率和画幅必须由用户定：缺了就拒绝，把问题退回给模型去问人。
      const missing = missingImageOptions(args)
      if (missing.length > 0) {
        // 工具错误只把 message 交给模型，hint 会被丢掉，所以指引直接写进 message。
        throw new AgnesError(
          `还没确定${missing.join('，')}。先问用户要哪一个，拿到答复再调用，不要替他默认；` +
            `用户没主意时可以提议 ${settings.size} / ${settings.aspectRatio}。`,
        )
      }

      const key = await requireKey(ctx, settings)
      const size = args.size
      const ratio = args.ratio
      const model = typeof args?.model === 'string' && args.model.trim().length > 0 ? args.model.trim() : settings.imageModel

      const result = await withSiteFallback(settings, (baseURL) =>
        generateImage({
          cfg: settings,
          apiKey: key,
          baseURL,
          prompt,
          size,
          ratio,
          model,
          references,
          signal: exec?.signal,
        }),
      )

      if (result.bytes.length > settings.maxImageBytes) {
        throw new AgnesError(`图片 ${result.bytes.length} 字节，超过上限 ${settings.maxImageBytes}`)
      }

      const ref = await storeImage(result.bytes, result.mediaType)

      // 用户配了保存目录就再落一份到磁盘；失败只提示，不算出图失败（图已在会话里）。
      const savedTo = []
      const noteParts = []
      const outputDir = await currentOutputDir()
      if (hasOutputDir(outputDir)) {
        const saved = await saveImageToDisk({ bytes: result.bytes, mediaType: result.mediaType, outputDir })
        if ('path' in saved) savedTo.push(saved.path)
        else noteParts.push(saved.error)
      }

      return {
        images: [
          {
            attachmentId: ref.attachmentId,
            mediaType: ref.mediaType,
            bytes: ref.bytes,
            width: ref.width,
            height: ref.height,
            ...(typeof ref.name === 'string' ? { name: ref.name } : {}),
          },
        ],
        model,
        size,
        aspectRatio: ratio,
        prompt,
        ...(savedTo.length > 0 ? { savedTo } : {}),
        ...(noteParts.length > 0 ? { notice: noteParts.join('；') } : {}),
      }
    },
  })

  /* ---------------- HTTP 接口（设置页用） ---------------- */

  const state = {
    cfg,
    effectiveSite: () => siteCandidates(cfg().baseURL)[0],
    outputDir: () => currentOutputDir(),
    saveOutputDir: async (value) => {
      await writeSettings(settingsFile, { outputDir: value })
      return currentOutputDir()
    },
    pickDirectory,
  }

  let disposers = []
  const mountRoutes = (webServer) => {
    if (disposers.length > 0) return
    if (typeof webServer?.register !== 'function') return
    disposers = registerRoutes({ ctx, state, webServer })
  }

  const guessWebServer = () => {
    if (typeof ctx.reflect?.get !== 'function') return undefined
    try {
      return ctx.reflect.get('webServer', false)
    } catch {
      return undefined
    }
  }

  mountRoutes(guessWebServer())

  ctx.on('internal/service', (serviceName, service) => {
    if (serviceName === 'webServer') mountRoutes(service)
  })

  ctx.effect(
    () => () => {
      for (const dispose of disposers.splice(0)) {
        try {
          dispose()
        } catch {
          // 路由可能已经随服务一起没了
        }
      }
    },
    'dsh-agnes-craft: http routes',
  )

  /* ---------------- 系统提示词 ---------------- */

  const withPrompt = (scoped) => {
    const service = scoped?.systemPrompt
    if (typeof service?.section !== 'function') return
    service.section({ name: 'plugin:agnes-craft:house-rules', order: 15200, text: HOUSE_RULES })
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['systemPrompt'], withPrompt)
  }
}
