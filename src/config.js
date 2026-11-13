/**
 * 配置 schema。
 *
 * 纯数据与默认值在 defaults.js；这里只负责用 schemastery 声明「界面与校验看得到的形状」。
 * 密钥不进配置 —— 这里只有引用名，真实值由 DSH Credentials 保管。
 */

import z from '@deepseek-ai/schemastery'

import { ASPECT_RATIOS, DEFAULTS, MAX_TIMEOUT_MS, SIZE_TIERS, SITES } from './defaults.js'

const oneOf = (values) => z.union(values.map((value) => z.const(value)))

export const Config = z.object({
  baseURL: z
    .string()
    .default(SITES.intl)
    .description(`Agnes API 根地址。国际站 ${SITES.intl}，国内站 ${SITES.cn}；被 401 拒时会自动试另一个。`),
  credentialRef: z
    .string()
    .default(DEFAULTS.credentialRef)
    .description('DSH Credentials 里的引用名。密钥本身不存在配置里。'),
  imageModel: z.string().default(DEFAULTS.imageModel).description('默认出图模型。'),
  size: oneOf(SIZE_TIERS).default(DEFAULTS.size).description('默认分辨率档位。'),
  aspectRatio: oneOf(ASPECT_RATIOS).default(DEFAULTS.aspectRatio).description('默认画幅。'),
  timeoutMs: z
    .natural()
    .min(1000)
    .max(MAX_TIMEOUT_MS)
    .default(DEFAULTS.timeoutMs)
    .description('单次出图请求超时（毫秒）。出图通常十几秒。'),
  maxImageBytes: z
    .natural()
    .min(1024)
    .default(DEFAULTS.maxImageBytes)
    .description('单张图片上限（字节）。'),
  outputDir: z
    .string()
    .default(DEFAULTS.outputDir)
    .description('生成图片额外保存到的文件夹（绝对路径或 ~/…）。留空表示只把图放回对话、不落盘。'),
})
