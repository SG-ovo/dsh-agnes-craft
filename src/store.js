/**
 * 插件自己的小设置（目前只有保存目录）。
 *
 * 为什么不写进 profile 的 cordis.patch.yml：那是用户的文件，里层还有别人的 insert 行、
 * 注释和 !!js 表达式。官方给的写配置入口是 configEditor，但本 profile 不一定挂载它，
 * 挂载时改一个字段还会重启插件。所以这里用一个独立的 JSON 侧车文件：
 *
 *   $DSH_HOME/agnes-craft/settings.json     （默认 ~/.dsh/agnes-craft/settings.json）
 *
 * 只存非敏感值 —— 密钥永远只在 DSH Credentials 里。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const FILE_NAME = 'settings.json'

/** DSH 主目录：优先 DSH_HOME，其次 ~/.dsh。 */
export function dshHome(env = process.env, home = homedir()) {
  const configured = env.DSH_HOME
  return typeof configured === 'string' && configured.trim().length > 0 ? configured.trim() : join(home, '.dsh')
}

export function settingsPath(env = process.env, home = homedir()) {
  return join(dshHome(env, home), 'agnes-craft', FILE_NAME)
}

/** 把 `~` / `~/x` 展开成绝对路径；已经是绝对路径就原样返回。 */
export function expandHome(input, home = homedir()) {
  if (typeof input !== 'string') return ''
  const value = input.trim()
  if (value.length === 0) return ''
  if (value === '~') return home
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(home, value.slice(2))
  return value
}

/**
 * 读设置。文件不存在、损坏、字段类型不对都退回默认值 ——
 * 设置读不出来不该让插件挂掉。
 */
export async function readSettings(path, defaults = {}) {
  let raw
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return { ...defaults }
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...defaults }
  }
  return typeof parsed?.outputDir === 'string'
    ? { ...defaults, outputDir: parsed.outputDir.trim() }
    : { ...defaults }
}

/** 原子写：先写临时文件再改名，避免半截文件。 */
export async function writeSettings(path, value) {
  const payload = JSON.stringify(
    { outputDir: typeof value?.outputDir === 'string' ? value.outputDir.trim() : '' },
    null,
    2,
  )
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temp, `${payload}\n`, 'utf8')
  const { rename } = await import('node:fs/promises')
  await rename(temp, path)
}
