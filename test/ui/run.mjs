import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const output = process.env.UI_OUTPUT_DIR || join(here, 'artifacts')
await mkdir(output, { recursive: true })
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agnes 设置页预览</title>
<style>body{margin:0;padding:32px;font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif;background:#fafbfc;color:#20232b}main{max-width:660px;margin:auto}@media(prefers-color-scheme:dark){body{background:#15191f;color:#edf0f5}}@media(max-width:480px){body{padding:20px}}</style><main id="root"></main>
<script src="/react.js"></script><script src="/react-dom.js"></script><script>
const locale=new URLSearchParams(location.search).get('lang')||'zh';let words={};
const ctx={
  locale:{register(ns,value){words=value;return ()=>{}},subscribe(){return ()=>{}},bind(){return key=>words[locale][key]}},
  effect(fn){return fn()},
  slots:{inject(name,fn){return fn()},register(meta,render){if(meta.name==='settings.section')ReactDOM.createRoot(document.getElementById('root')).render(new URLSearchParams(location.search).has('strict')?React.createElement(React.StrictMode,null,render()):render());return ()=>{}}}
};
window.__ModuleLoader__={load(mod){mod.factory(name=>{if(name==='react')return React;throw Error(name)}).apply(ctx)}};
</script><script src="/client.js"></script></html>`
const files = {
  '/react.js': join(here, 'node_modules/react/umd/react.development.js'),
  '/react-dom.js': join(here, 'node_modules/react-dom/umd/react-dom.development.js'),
  '/client.js': join(root, 'client/index.js'),
}
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname
    res.setHeader('content-type', files[path] ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8')
    res.end(files[path] ? await readFile(files[path]) : html)
  } catch { res.writeHead(500); res.end('Could not load preview') }
})
await new Promise((resolve, reject) => {server.once('error', reject);server.listen(0, '127.0.0.1', resolve)})
const baseURL = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({channel:'chrome',headless:true})
let passed = 0
const errors = []
async function fixture(options={}) {
  const page = await browser.newPage({viewport:{width:900,height:850}})
  page.on('pageerror', error=>errors.push(error.message))
  const state = {ok:true,configured:true,outputDir:'D:\\Pictures\\Agnes',baseURL:'https://apihub.agnes-ai.com/v1',imageModel:'agnes-image-2.5-flash',...options.state}
  const calls = []
  let failProbe = options.failProbe
  let failStatus = options.failStatus
  await page.route('**/agnes-craft/api/*',async route=>{
    const request = route.request()
    const kind = new URL(request.url()).pathname.split('/').pop()
    const body = request.postDataJSON()
    calls.push({kind,body})
    let result = {ok:true}
    if(kind==='status') {
      if(failStatus){failStatus=false;await route.fulfill({status:503,json:{ok:false,message:'服务暂不可用'}});return}
      result={...state}
    }
    if(kind==='key') {if(options.delayKey)await new Promise(resolve=>setTimeout(resolve,100));state.configured=!body.clear;result={ok:true,configured:state.configured}}
    if(kind==='probe') {result=failProbe?{ok:false,message:'模拟：Key 已过期'}:{ok:true,baseURL:'https://api.agnes-ai.cn/v1',models:['test']};failProbe=false}
    if(kind==='pick') result={ok:true,path:'D:\\New folder'}
    if(kind==='settings') {state.outputDir=body.outputDir.trim();result={ok:true,outputDir:state.outputDir}}
    await route.fulfill({json:result})
  })
  await page.goto(`${baseURL}/?lang=${options.lang||'zh'}${options.strict?'&strict=1':''}`)
  return {page,calls,state}
}
async function check(name, fn) {await fn();passed++;console.log(`PASS ${name}`)}
try {
  await check('已配置状态不冒充检测通过，输入框有标签', async()=>{
    const {page}=await fixture()
    await expect(page.getByText('已保存 · 待检测',{exact:true})).toBeVisible()
    await expect(page.getByLabel('API Key',{exact:true})).toHaveAttribute('type','password')
    await expect(page.getByLabel('额外保存目录（可选）')).toHaveValue('D:\\Pictures\\Agnes')
    await page.screenshot({path:join(output,'settings-light.png'),fullPage:true})
    await page.close()
  })
  await check('显示隐藏、保存并检测保留目录草稿且更新实际站点',async()=>{
    const {page,calls}=await fixture()
    const input=page.getByLabel('API Key',{exact:true})
    await page.getByLabel('额外保存目录（可选）').fill('D:\\Unsaved')
    await input.fill('sk-test')
    await page.getByRole('button',{name:'显示',exact:true}).click()
    await expect(input).toHaveAttribute('type','text')
    await page.getByRole('button',{name:'保存并检测',exact:true}).click()
    await expect(page.getByText('连接检测通过，可以回到对话开始创作。')).toBeVisible()
    await expect(input).toHaveValue('')
    await expect(input).toHaveAttribute('type','password')
    await expect(page.getByLabel('额外保存目录（可选）')).toHaveValue('D:\\Unsaved')
    assert.equal(calls.filter(call=>call.kind==='key').length,1)
    assert.equal(calls.filter(call=>call.kind==='probe').length,1)
    await page.getByText('当前连接信息',{exact:true}).click()
    await expect(page.getByText('https://api.agnes-ai.cn/v1',{exact:true})).toBeVisible()
    await page.close()
  })
  await check('检测失败保留已保存状态并允许直接重试',async()=>{
    const {page,calls}=await fixture({failProbe:true})
    await page.getByLabel('API Key',{exact:true}).fill('sk-test')
    await page.getByRole('button',{name:'保存并检测',exact:true}).click()
    await expect(page.getByRole('alert')).toHaveText('Key 已保存，但连接检测未通过：模拟：Key 已过期')
    await expect(page.getByText('连接检测失败',{exact:true})).toBeVisible()
    await page.screenshot({path:join(output,'settings-error.png'),fullPage:true})
    await page.getByRole('button',{name:'检测连接',exact:true}).click()
    await expect(page.getByText('连接检测通过，可以回到对话开始创作。')).toBeVisible()
    assert.equal(calls.filter(call=>call.kind==='key').length,1)
    await page.close()
  })
  await check('选择目录先填入，保存后状态同步，可撤销和关闭额外保存',async()=>{
    const {page,calls}=await fixture()
    await page.getByRole('button',{name:'选择文件夹',exact:true}).click()
    await expect(page.getByLabel('额外保存目录（可选）')).toHaveValue('D:\\New folder')
    assert.equal(calls.filter(call=>call.kind==='settings').length,0)
    await page.getByRole('button',{name:'撤销更改',exact:true}).click()
    await expect(page.getByLabel('额外保存目录（可选）')).toHaveValue('D:\\Pictures\\Agnes')
    await page.getByRole('button',{name:'选择文件夹',exact:true}).click()
    await page.getByRole('button',{name:'保存目录',exact:true}).click()
    await expect(page.getByText('保存目录已更新。',{exact:true})).toBeVisible()
    await expect(page.getByRole('button',{name:'保存目录',exact:true})).toBeDisabled()
    await page.getByRole('button',{name:'关闭额外保存',exact:true}).click()
    await expect(page.getByText('已关闭额外保存，图片仍会显示在对话中。')).toBeVisible()
    await expect(page.getByLabel('额外保存目录（可选）')).toHaveValue('')
    await page.close()
  })
  await check('清除需明确确认，支持取消并恢复焦点',async()=>{
    const {page,calls}=await fixture()
    await page.getByRole('button',{name:'移除 Key',exact:true}).click()
    await expect(page.getByRole('button',{name:'取消',exact:true})).toBeFocused()
    await page.getByRole('button',{name:'取消',exact:true}).press('Escape')
    await expect(page.getByRole('button',{name:'移除 Key',exact:true})).toBeFocused()
    assert.equal(calls.filter(call=>call.kind==='key').length,0)
    await page.getByRole('button',{name:'移除 Key',exact:true}).click()
    await page.getByRole('button',{name:'确认移除',exact:true}).click()
    await expect(page.getByText('未配置',{exact:true})).toBeVisible()
    await expect(page.getByLabel('API Key',{exact:true})).toBeFocused()
    assert.equal(calls.filter(call=>call.kind==='key').length,1)
    await page.close()
  })
  await check('加载失败可重试恢复',async()=>{
    const {page}=await fixture({failStatus:true})
    await expect(page.getByRole('alert')).toHaveText('服务暂不可用')
    await page.getByRole('button',{name:'重新加载',exact:true}).click()
    await expect(page.getByLabel('API Key',{exact:true})).toBeVisible()
    await page.close()
  })
  await check('连续提交只保存一次，保存操作与检测分离',async()=>{
    const {page,calls}=await fixture({delayKey:true})
    await page.getByLabel('API Key',{exact:true}).fill('sk-test')
    await page.getByRole('button',{name:'仅保存',exact:true}).dblclick()
    await expect(page.getByText('Key 已保存，可检测连接或直接回到对话使用。')).toBeVisible()
    assert.equal(calls.filter(call=>call.kind==='key').length,1)
    assert.equal(calls.filter(call=>call.kind==='probe').length,0)
    await page.close()
  })
  await check('窄屏和深色主题无水平溢出，英文内容齐全',async()=>{
    const {page}=await fixture({lang:'en',state:{configured:false,outputDir:''}})
    await page.setViewportSize({width:375,height:950})
    await expect(page.getByLabel('API Key',{exact:true})).toBeVisible()
    await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    await page.screenshot({path:join(output,'settings-dark-mobile.png'),fullPage:true})
    await page.close()
  })
  await check('React 严格模式重复挂载后正常读取设置',async()=>{
    const {page}=await fixture({strict:true})
    await expect(page.getByLabel('API Key',{exact:true})).toBeVisible()
    await expect(page.getByText('已保存 · 待检测',{exact:true})).toBeVisible()
    await page.close()
  })
  assert.deepEqual(errors,[],'浏览器不应出现未捕获异常')
  console.log(`${passed} browser checks passed; screenshots: ${output}`)
} catch (error) {
  console.error('Browser errors:',errors)
  throw error
} finally {
  await browser.close()
  await new Promise(resolve=>server.close(resolve))
}
