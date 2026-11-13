import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { AgnesError, RETRYABLE_STATUS, errorFromResponse, guidanceFor } from '../src/errors.js'
import { detectImageType, extensionFor } from '../src/media.js'
import { SITES, missingImageOptions, normalizeConfig } from '../src/defaults.js'
import { imageContentBlocks } from '../src/present.js'
import { buildFileName, hasOutputDir, saveImageToDisk } from '../src/save.js'
import { expandHome, readSettings, settingsPath, writeSettings } from '../src/store.js'

/* ------------------------------------------------------------------ errors */

test('错误表覆盖了文档里会遇到的客户端错误码', () => {
  const codes = [400, 401, 402, 403, 404, 405, 408, 409, 413, 415, 422, 429, 431, 499, 500, 502, 503, 504, 520, 522, 524]
  for (const code of codes) {
    const guide = guidanceFor(code)
    assert.ok(guide !== undefined, `缺少 ${code} 的指引`)
    assert.ok(typeof guide.fix === 'string' && guide.fix.length > 0, `${code} 的指引要有内容`)
  }
})

test('重试集合只包含临时性错误', () => {
  assert.ok(RETRYABLE_STATUS.has(429))
  assert.ok(RETRYABLE_STATUS.has(503))
  assert.ok(!RETRYABLE_STATUS.has(401), '鉴权失败重试没有意义')
  assert.ok(!RETRYABLE_STATUS.has(400), '参数错误重试没有意义')
})

test('错误响应被翻译成带修法的中文错误', () => {
  const error = errorFromResponse({ status: 401, data: { detail: 'Invalid token' }, text: '', headers: new Headers() })
  assert.equal(error.status, 401)
  assert.match(error.message, /鉴权失败/)
  assert.match(error.message, /Invalid token/)
  assert.match(error.describe(), /国内站与国际站/)
})

test('从人类可读的错误串里也能捞出 request id', () => {
  const error = errorFromResponse({
    status: 401,
    data: undefined,
    text: '无效的令牌 (request id: 20261112175406276021130nP7Lc09w)',
    headers: new Headers(),
  })
  assert.equal(error.requestId, '20261112175406276021130nP7Lc09w')
})

test('Retry-After 被换算成毫秒', () => {
  const error = errorFromResponse({ status: 429, data: {}, text: '', headers: new Headers({ 'retry-after': '3' }) })
  assert.equal(error.retryAfterMs, 3000)
})

test('AgnesError.describe 会把修法和 request id 拼进去', () => {
  const error = new AgnesError('出错了', { hint: '重试一次', requestId: 'abc' })
  assert.match(error.describe(), /出错了/)
  assert.match(error.describe(), /重试一次/)
  assert.match(error.describe(), /abc/)
})

/* ------------------------------------------------------------------- media */

const header = (...bytes) => Uint8Array.from(bytes)

test('认出 PNG / JPEG / GIF / WebP', () => {
  assert.equal(detectImageType(header(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'image/png')
  assert.equal(detectImageType(header(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg')
  assert.equal(detectImageType(header(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)), 'image/gif')
  assert.equal(detectImageType(header(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)), 'image/webp')
})

test('认不出来就返回 undefined，而不是瞎猜', () => {
  assert.equal(detectImageType(header(0x3c, 0x21, 0x44, 0x4f)), undefined, 'HTML 错误页不该被当成图片')
  assert.equal(detectImageType(header()), undefined)
})

test('媒体类型到扩展名', () => {
  assert.equal(extensionFor('image/jpeg'), 'jpg')
  assert.equal(extensionFor('image/webp'), 'webp')
  assert.equal(extensionFor('image/png'), 'png')
  assert.equal(extensionFor('application/octet-stream'), 'png', '未知类型退回 png')
})

/* ------------------------------------------------------------------ config */

test('规范化会把非法值退回默认，而不是抛错', () => {
  const cfg = normalizeConfig({ size: '9K', aspectRatio: '5:5', timeoutMs: -1 })
  assert.equal(cfg.size, '1K')
  assert.equal(cfg.aspectRatio, '1:1')
  assert.equal(cfg.timeoutMs, 180_000)
})

test('规范化兼容裸值，也兼容带 get() 的 Box', () => {
  const cfg = normalizeConfig({ size: { get: () => '2K' }, baseURL: `${SITES.cn}/` })
  assert.equal(cfg.size, '2K')
  assert.equal(cfg.baseURL, SITES.cn, '尾部斜杠应被去掉')
})

test('空配置拿到全套默认值', () => {
  const cfg = normalizeConfig({})
  assert.equal(cfg.baseURL, SITES.intl)
  assert.equal(cfg.imageModel, 'agnes-image-2.5-flash')
  assert.equal(cfg.credentialRef, 'AGNES_API_KEY')
})

/* ------------------------------------------------- 分辨率 / 画幅必须由用户定 */

test('两个参数都缺时，两条都要报出来', () => {
  const missing = missingImageOptions({ prompt: '一只柴犬' })
  assert.equal(missing.length, 2)
  assert.match(missing[0], /分辨率/)
  assert.match(missing[1], /画幅/)
})

test('只缺一个就只报一个', () => {
  assert.deepEqual(missingImageOptions({ size: '2K' }).length, 1)
  assert.match(missingImageOptions({ size: '2K' })[0], /画幅/)
  assert.match(missingImageOptions({ ratio: '16:9' })[0], /分辨率/)
})

test('两个都给了就不拦', () => {
  assert.deepEqual(missingImageOptions({ size: '1K', ratio: '1:1' }), [])
})

test('非法值等同于没给 —— 不许蒙混', () => {
  assert.equal(missingImageOptions({ size: '8K', ratio: '2:1' }).length, 2)
  assert.equal(missingImageOptions({ size: '', ratio: '' }).length, 2)
})

/* ------------------------------------- 出图结果必须能在 DSH 里直接显示（回归防线） */

const sampleRef = {
  attachmentId: 'att_123',
  mediaType: 'image/png',
  bytes: 1024,
  width: 1152,
  height: 864,
}

test('每张图都返回一个 image 内容块', () => {
  const blocks = imageContentBlocks({ images: [sampleRef], model: 'agnes-image-2.5-flash' })
  assert.equal(blocks.length, 2, '一句摘要 + 一张图')
  assert.equal(blocks[0].type, 'text')
  assert.equal(blocks[1].type, 'image')
})

test('image 块带的是附件引用，不是文件路径', () => {
  const [, block] = imageContentBlocks({ images: [sampleRef] })
  assert.equal(block.attachment.attachmentId, 'att_123')
  assert.equal(block.attachment.mediaType, 'image/png')
  assert.equal(block.attachment.width, 1152)
  assert.equal(block.attachment.height, 864)
  assert.equal(typeof block.attachment.width, 'number', '宽高缺失会让客户端算不出比例')
})

test('摘要文字里不出现文件路径 —— 那是这个工具最初犯过的错', () => {
  const [text] = imageContentBlocks({ images: [sampleRef], model: 'agnes-image-2.5-flash' })
  assert.equal(text.type, 'text')
  assert.doesNotMatch(text.text, /\.(png|jpe?g|webp|gif)\b/i)
  assert.doesNotMatch(text.text, /[A-Za-z]:\\/, '不该把 Windows 绝对路径塞进正文')
})

test('多张图就多个 image 块，顺序与入参一致', () => {
  const second = { ...sampleRef, attachmentId: 'att_456' }
  const blocks = imageContentBlocks({ images: [sampleRef, second] })
  assert.equal(blocks.length, 3)
  assert.deepEqual(
    blocks.slice(1).map((block) => block.attachment.attachmentId),
    ['att_123', 'att_456'],
  )
})

test('配了保存目录时，图之后补一条落盘提示，图仍在前面', () => {
  const blocks = imageContentBlocks({ images: [sampleRef], savedTo: ['D:\\pics\\a.png'] })
  assert.equal(blocks.length, 3)
  assert.equal(blocks[1].type, 'image', '图不能因为多了提示就被挤掉')
  assert.match(blocks[2].text, /D:\\pics\\a\.png/)
})

test('落盘失败只追加提示，不影响图片块', () => {
  const blocks = imageContentBlocks({ images: [sampleRef], notice: '目录不可写' })
  assert.equal(blocks[1].type, 'image')
  assert.match(blocks[2].text, /目录不可写/)
})

/* ------------------------------------------------- 保存目录：路径与设置存储 */

test('~ 会被展开，绝对路径原样保留', () => {
  // 用 join 拼期望值：Windows 上 join 会把 / 归一成 \
  assert.equal(expandHome('~/Pictures/Agnes', '/home/me'), join('/home/me', 'Pictures/Agnes'))
  assert.equal(expandHome('~', '/home/me'), '/home/me')
  assert.equal(expandHome('D:\\pics', '/home/me'), 'D:\\pics')
  assert.equal(expandHome('   ', '/home/me'), '')
})

test('空串表示不落盘', () => {
  assert.equal(hasOutputDir(''), false)
  assert.equal(hasOutputDir('   '), false)
  assert.equal(hasOutputDir('D:\\pics'), true)
})

test('文件名带上扩展名且不重复', () => {
  const a = buildFileName('image/png', 1700000000000, 'aaaaaa')
  const b = buildFileName('image/png', 1700000000000, 'bbbbbb')
  assert.match(a, /^agnes-[a-z0-9]+-aaaaaa\.png$/)
  assert.notEqual(a, b)
  assert.match(buildFileName('image/jpeg', 1, 'x'), /\.jpg$/)
})

test('设置文件不存在 / 损坏时退回默认，不抛错', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'craft-store-'))
  try {
    const missing = await readSettings(join(dir, 'nope.json'), { outputDir: '' })
    assert.deepEqual(missing, { outputDir: '' })

    const broken = join(dir, 'broken.json')
    await writeFile(broken, '{ not json', 'utf8')
    assert.deepEqual(await readSettings(broken, { outputDir: '' }), { outputDir: '' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('设置写进去能原样读回来', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'craft-store-'))
  try {
    const file = join(dir, 'nested', 'settings.json')
    await writeSettings(file, { outputDir: 'D:\\pics\\agnes' })
    assert.deepEqual(await readSettings(file, {}), { outputDir: 'D:\\pics\\agnes' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('settingsPath 跟随 DSH_HOME', () => {
  const path = settingsPath({ DSH_HOME: 'D:\\dsh-home' }, 'C:\\Users\\x')
  assert.match(path, /dsh-home/)
  assert.match(path, /agnes-craft/)
  assert.match(path, /settings\.json$/)
})

test('saveImageToDisk 真的写文件，并自己建好缺的层级', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'craft-save-'))
  try {
    const target = join(dir, 'a', 'b')
    const result = await saveImageToDisk({
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      mediaType: 'image/png',
      outputDir: target,
      now: 1700000000000,
      suffix: 'abc123',
    })
    assert.ok('path' in result, '应当返回落盘路径')
    assert.equal((await readFile(result.path)).length, 4)
    assert.match(result.path, /agnes-[a-z0-9]+-abc123\.png$/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('相对路径被拒绝，且不会去建目录', async () => {
  const result = await saveImageToDisk({ bytes: Buffer.from([1]), mediaType: 'image/png', outputDir: 'relative/x' })
  assert.ok('error' in result)
  assert.match(result.error, /绝对路径/)
})

test('没配目录就不写文件', async () => {
  const result = await saveImageToDisk({ bytes: Buffer.from([1]), mediaType: 'image/png', outputDir: '' })
  assert.ok('error' in result)
})
