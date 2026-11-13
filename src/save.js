/**
 * 把出图结果另存到用户指定的文件夹。
 *
 * 附件那条路已经保证「用户能在 DSH 里看见图」；这里只是额外落一份到磁盘，
 * 方便用户拿去做别的（发朋友圈、贴进设计稿）。落盘失败不该让整次出图算失败 ——
 * 图已经在会话里了，所以这里只回一个可读的错误，由上层决定要不要提示。
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

import { extensionFor } from './media.js'
import { expandHome } from './store.js'

/** 文件名：agnes-<时间戳>-<随机后缀>.<ext>，避免同一秒内互相覆盖。 */
export function buildFileName(mediaType, now = Date.now(), suffix = Math.random().toString(36).slice(2, 8)) {
  return `agnes-${now.toString(36)}-${suffix}.${extensionFor(mediaType)}`
}

/** 目标目录是否可用：空串表示「不落盘」。 */
export function hasOutputDir(outputDir) {
  return typeof outputDir === 'string' && outputDir.trim().length > 0
}

/**
 * @returns {Promise<{ path: string } | { error: string }>}
 */
export async function saveImageToDisk({ bytes, mediaType, outputDir, home, now, suffix }) {
  if (!hasOutputDir(outputDir)) return { error: '没有设置保存目录' }

  const target = expandHome(outputDir, home)
  if (target.length === 0) return { error: '没有设置保存目录' }
  if (!isAbsolute(target)) return { error: `保存目录必须是绝对路径：${outputDir}` }

  const name = buildFileName(mediaType, now, suffix)
  const file = join(target, name)
  try {
    await mkdir(target, { recursive: true })
    await writeFile(file, bytes)
    return { path: file }
  } catch (error) {
    return { error: `保存到 ${target} 失败：${error?.message ?? error}` }
  }
}
