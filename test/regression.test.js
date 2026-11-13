import assert from 'node:assert/strict'
import test from 'node:test'
import { rememberSite, siteCandidates } from '../src/access.js'
import { tidyKey, registerRoutes, ROUTES } from '../src/routes.js'
import { readSettings } from '../src/store.js'
import { requestJson } from '../src/http.js'
import { downloadBinary, generateImage } from '../src/agnes.js'

test('缓存站点不能覆盖自定义 API 地址', () => {
  rememberSite('https://apihub.agnes-ai.com/v1')
  assert.deepEqual(siteCandidates('https://proxy.example/v1'), ['https://proxy.example/v1'])
})

test('清洗带引号、Bearer 和零宽空白的 Key', () => {
  assert.equal(tidyKey(' "Bearer sk-\u200bexample" '), 'sk-example')
})

test('缺失设置与明确清空的目录必须区分', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = await mkdtemp(join(tmpdir(), 'agnes-regression-'))
  try {
    const path = join(dir, 'settings.json')
    assert.deepEqual(await readSettings(path, {outputDir:'original'}), {outputDir:'original'})
    await writeFile(path, '{}')
    assert.deepEqual(await readSettings(path, {outputDir:'original'}), {outputDir:'original'})
    await writeFile(path, '{"outputDir":""}')
    assert.deepEqual(await readSettings(path, {outputDir:'original'}), {outputDir:''})
  } finally { await rm(dir, {recursive:true, force:true}) }
})

test('设置接口拒绝 null、数组和非对象 JSON', async () => {
  const handlers = new Map()
  registerRoutes({ctx:{},state:{cfg:()=>({})},webServer:{register:({path,handler})=>{handlers.set(path,handler);return ()=>{}}}})
  for (const path of [ROUTES.settings, ROUTES.key]) {
    for (const raw of ['null', '[]', '42']) {
      let status
      const req = {method:'POST',async *[Symbol.asyncIterator](){yield Buffer.from(raw)}}
      const res = {writeHead(code){status=code},end(){}}
      await handlers.get(path)(req,res)
      assert.equal(status,400)
    }
  }
})

test('重试等待中取消应立即结束', async () => {
  const previous = globalThis.fetch
  const controller = new AbortController()
  let calls = 0
  globalThis.fetch = async () => { calls++; return new Response('{}',{status:429,headers:{'retry-after':'2'}}) }
  const timer = setTimeout(()=>controller.abort(),30)
  const started = Date.now()
  try {
    await assert.rejects(requestJson({url:'https://example.invalid',apiKey:'test',signal:controller.signal}), /取消/)
    assert.ok(Date.now()-started < 1000)
    assert.equal(calls,1)
  } finally { clearTimeout(timer); globalThis.fetch=previous }
})

test('图片下载在读取过程中限制大小并释放流', async () => {
  const previous = globalThis.fetch
  let cancelled = false
  let chunks = 0
  globalThis.fetch = async () => new Response(new ReadableStream({pull(c){if(chunks++ < 3)c.enqueue(new Uint8Array(10));else c.close()},cancel(){cancelled=true}}))
  try {
    await assert.rejects(downloadBinary('https://example.invalid',undefined,1000,16), /上限/)
    assert.equal(cancelled,true)
  } finally { globalThis.fetch=previous }
})

test('空出图响应应返回可理解的错误', async () => {
  const previous = globalThis.fetch
  globalThis.fetch = async () => new Response(null,{status:200})
  try {
    await assert.rejects(generateImage({cfg:{timeoutMs:1000,maxImageBytes:1024},apiKey:'test',baseURL:'https://example.invalid',prompt:'test',size:'1K'}), /data\[0\]/)
  } finally { globalThis.fetch=previous }
})

test('生成请求失败不自动重复提交', async () => {
  const previous = globalThis.fetch
  let calls=0
  globalThis.fetch = async () => {calls++;return new Response('{}',{status:503,headers:{'retry-after':'0'}})}
  try {
    await assert.rejects(generateImage({cfg:{timeoutMs:1000,maxImageBytes:1024},apiKey:'test',baseURL:'https://example.invalid',prompt:'test',size:'1K'}))
    assert.equal(calls,1)
  } finally {globalThis.fetch=previous}
})

test('已取消的调用不发送请求', async () => {
  const previous = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {calls++; return new Response('{}')}
  try {
    await assert.rejects(requestJson({url:'https://example.invalid',apiKey:'test',signal:AbortSignal.abort()}), /取消/)
    assert.equal(calls,0)
  } finally {globalThis.fetch=previous}
})

test('JSON 响应也应限制体积', async () => {
  const previous = globalThis.fetch
  globalThis.fetch = async () => new Response('x'.repeat(32))
  try {
    await assert.rejects(requestJson({url:'https://example.invalid',apiKey:'test',maxResponseBytes:16}), /上限/)
  } finally {globalThis.fetch=previous}
})

test('本地 HTTP 验证文生图、图生图和 URL 下载链路', async () => {
  const { createServer } = await import('node:http')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
  const bodies = []
  let imageAuth
  let baseURL
  const server = createServer(async (req,res) => {
    if (req.url === '/image.png') {
      imageAuth = req.headers.authorization
      res.end(png)
      return
    }
    const chunks=[]
    for await (const chunk of req) chunks.push(chunk)
    bodies.push(JSON.parse(Buffer.concat(chunks)))
    res.setHeader('content-type','application/json')
    res.end(JSON.stringify({data:[bodies.length === 1 ? {b64_json:png.toString('base64')} : {url:`${baseURL}/image.png`}]}))
  })
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  baseURL = `http://127.0.0.1:${server.address().port}`
  try {
    const options={cfg:{timeoutMs:1000,maxImageBytes:1024},apiKey:'test',baseURL,prompt:'test',size:'1K',ratio:'1:1',model:'test'}
    const generated=await generateImage(options)
    const edited=await generateImage({...options,references:['https://example.invalid/ref.png']})
    assert.deepEqual(generated.bytes,png)
    assert.deepEqual(edited.bytes,png)
    assert.equal(generated.mediaType,'image/png')
    assert.equal(bodies[0].return_base64,true)
    assert.deepEqual(bodies[1].extra_body,{image:['https://example.invalid/ref.png'],response_format:'b64_json'})
    assert.equal(imageAuth,undefined)
  } finally { await new Promise(resolve=>server.close(resolve)) }
})
