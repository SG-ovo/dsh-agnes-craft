/** Agnes 设置页：清楚区分配置、连接检测与图片保存。 */
window.__ModuleLoader__.load({
  id: 'dsh-agnes-craft',
  factory(require) {
    const React = require('react')
    const el = React.createElement
    const NS = 'dsh-agnes-craft'
    const API = Object.fromEntries(['status', 'key', 'probe', 'settings', 'pick'].map((key) => [key, `/agnes-craft/api/${key}`]))
    const WORDS = {
      zh: {
        nav: 'Agnes 出图', title: 'Agnes 出图', summary: '在对话中生成和编辑图片',
        subtitle: '连接 Agnes 后，回到对话描述你想要的图片。',
        loading: '正在读取设置…', loadFailed: '暂时无法读取设置', retry: '重新加载',
        missing: '未配置', untested: '已保存 · 待检测', connected: '连接检测通过', failed: '连接检测失败', testing: '正在检测连接…',
        keyTitle: '连接 Agnes', keyLabel: 'API Key', keyHint: '从 Agnes 控制台复制 Key。密钥保存在 DSH 凭据中，不会在此回显。',
        placeholder: '粘贴 API Key', replacement: '已保存 Key，输入新 Key 可替换', show: '显示', hide: '隐藏',
        saveTest: '保存并检测', saveOnly: '仅保存', saving: '正在保存…', test: '检测连接', testHint: '只检测连接，不生成图片。',
        keyDraft: '新 Key 尚未保存，请先保存再检测。', keySaved: 'Key 已保存，可检测连接或直接回到对话使用。',
        savedTestFailed: 'Key 已保存，但连接检测未通过：', probeOk: '连接检测通过，可以回到对话开始创作。',
        clear: '移除 Key', clearQuestion: '移除后将无法继续出图，重新填写 Key 即可恢复。', confirmClear: '确认移除', cancel: '取消', cleared: 'Key 已移除。',
        dirTitle: '图片保存', dirLabel: '额外保存目录（可选）', dirHint: '图片始终会显示在对话中。填写目录后，另外在电脑上保留一份。',
        dirPlaceholder: '例如 D:\\Pictures\\Agnes 或 ~/Pictures/Agnes', choose: '选择文件夹', choosing: '等待选择…',
        saveDir: '保存目录', dirSaved: '保存目录已更新。', dirOff: '已关闭额外保存，图片仍会显示在对话中。',
        dirty: '有未保存的更改', unchanged: '目录已保存', chatOnly: '当前仅保存在对话中', reset: '撤销更改', stopSaving: '关闭额外保存',
        pickFailed: '没有选择目录，可直接输入路径。', detail: '当前连接信息', site: 'API 地址', model: '默认模型',
        timeout: '请求超时，请检查 DSH 是否运行后重试。', network: '无法连接设置服务，请检查 DSH 是否运行。', badResponse: '设置服务返回了无法识别的内容，请重试。',
      },
      en: {
        nav: 'Agnes images', title: 'Agnes images', summary: 'Generate and edit images in chat',
        subtitle: 'Connect Agnes, then describe your image in the conversation.',
        loading: 'Loading settings…', loadFailed: 'Could not load settings', retry: 'Reload',
        missing: 'Not configured', untested: 'Saved · not tested', connected: 'Connection verified', failed: 'Connection test failed', testing: 'Testing connection…',
        keyTitle: 'Connect Agnes', keyLabel: 'API Key', keyHint: 'Copy a key from the Agnes console. Saved keys stay in DSH credentials and are never displayed here.',
        placeholder: 'Paste API key', replacement: 'Key saved. Enter a new key to replace it.', show: 'Show', hide: 'Hide',
        saveTest: 'Save and test', saveOnly: 'Save only', saving: 'Saving…', test: 'Test connection', testHint: 'Tests the connection without generating an image.',
        keyDraft: 'Save your new key before testing it.', keySaved: 'Key saved. Test the connection or return to chat.',
        savedTestFailed: 'Key saved, but the connection test failed: ', probeOk: 'Connection verified. Return to chat to start creating.',
        clear: 'Remove key', clearQuestion: 'Image generation will stop until you add a key again.', confirmClear: 'Confirm removal', cancel: 'Cancel', cleared: 'Key removed.',
        dirTitle: 'Image storage', dirLabel: 'Additional save folder (optional)', dirHint: 'Images always appear in chat. Add a folder to keep an extra copy on your computer.',
        dirPlaceholder: 'For example D:\\Pictures\\Agnes or ~/Pictures/Agnes', choose: 'Choose folder', choosing: 'Choosing…',
        saveDir: 'Save folder', dirSaved: 'Folder updated.', dirOff: 'Extra copies disabled. Images will still appear in chat.',
        dirty: 'Unsaved changes', unchanged: 'Folder saved', chatOnly: 'Currently saved in chat only', reset: 'Undo changes', stopSaving: 'Disable extra copies',
        pickFailed: 'No folder chosen. You can enter a path instead.', detail: 'Connection details', site: 'API address', model: 'Default model',
        timeout: 'Request timed out. Check that DSH is running and try again.', network: 'Cannot reach the settings service. Check that DSH is running.', badResponse: 'The settings service returned an unreadable response. Try again.',
      },
    }
    const CSS = `
.ag{--ag-text:var(--dsw-alias-label-primary,#20232b);--ag-muted:var(--dsw-alias-label-secondary,#656b77);--ag-border:var(--dsw-alias-border-l2,#d9dde5);--ag-bg:var(--dsw-alias-bg-layer-1,#fff);--ag-brand:var(--dsw-alias-brand-primary,#315ce7);--ag-good:var(--dsw-alias-state-success-primary,#19804a);--ag-bad:var(--dsw-alias-state-error-primary,#c13d45);max-width:640px;min-width:0;padding:8px 0 24px;color:var(--ag-text);font-size:13px;line-height:1.65}
.ag *{box-sizing:border-box}.ag h2,.ag h3,.ag p{margin:0}.ag-head{display:flex;align-items:center;flex-wrap:wrap;gap:8px 16px}.ag h2{font-size:20px;font-weight:650;letter-spacing:-.02em}.ag-state{display:inline-flex;align-items:center;gap:7px;color:var(--ag-muted);font-size:12px}.ag-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}.ag-sub{color:var(--ag-muted);margin-top:6px!important}.ag-section{margin-top:26px;padding-top:24px;border-top:1px solid var(--ag-border)}.ag h3{font-size:14px;font-weight:650;margin-bottom:16px}.ag-label{display:block;font-size:13px;font-weight:600;margin-bottom:7px}.ag-hint{color:var(--ag-muted);font-size:12px;margin-top:8px!important;overflow-wrap:anywhere}.ag-row{display:flex;align-items:center;gap:8px;min-width:0}.ag-key-wrap{display:flex;flex:1;align-items:center;min-width:0;border:1px solid var(--ag-border);border-radius:9px;background:var(--ag-bg)}.ag-input{width:100%;min-width:0;height:40px;padding:0 12px;font:inherit;color:var(--ag-text);border:1px solid var(--ag-border);border-radius:9px;background:var(--ag-bg)}.ag-key-wrap .ag-input{border:0;background:transparent;flex:1}.ag-input::placeholder{color:var(--ag-muted);opacity:.85}.ag-key-wrap:focus-within{outline:2px solid var(--ag-brand);outline-offset:2px}.ag-key-wrap .ag-input:focus{outline:none}.ag button{font:inherit;cursor:pointer}.ag-input:focus-visible,.ag button:focus-visible,.ag summary:focus-visible{outline:2px solid var(--ag-brand);outline-offset:3px}.ag-btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:7px 14px;white-space:nowrap;border:1px solid var(--ag-border);border-radius:8px;background:var(--ag-bg);color:var(--ag-text)}.ag-primary{background:var(--ag-brand);border-color:var(--ag-brand);color:#fff}.ag button:disabled{opacity:.5;cursor:not-allowed}.ag-toggle{align-self:stretch;min-width:52px;border:0;border-radius:0 8px 8px 0;background:transparent;color:var(--ag-muted);padding:0 12px}.ag-actions{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;margin-top:12px}.ag-link{border:0;background:transparent;color:var(--ag-muted);padding:6px 0;text-decoration:underline;text-underline-offset:3px}.ag-danger{color:var(--ag-bad)}.ag-note{margin-top:10px!important;overflow-wrap:anywhere;font-size:12px}.ag-ok{color:var(--ag-good)}.ag-bad{color:var(--ag-bad)}.ag-confirm{padding:12px 14px;margin-top:12px;border:1px solid var(--ag-border);border-radius:9px}.ag-confirm p{font-size:12px}.ag-draft{color:var(--ag-muted);font-size:12px}.ag details{margin-top:20px;color:var(--ag-muted);font-size:12px}.ag summary{cursor:pointer;width:fit-content}.ag dl{margin:10px 0 0;display:grid;grid-template-columns:auto 1fr;gap:5px 16px}.ag dt{font-weight:500}.ag dd{margin:0;overflow-wrap:anywhere}.ag-loading{padding:24px 0;color:var(--ag-muted)}
@media(max-width:480px){.ag{padding-top:4px}.ag-folder-row{flex-wrap:wrap}.ag-folder-row .ag-input{flex-basis:100%}.ag-folder-row .ag-btn{width:100%}.ag-actions{gap:8px 12px}.ag-primary{flex-grow:1}.ag h2{font-size:18px}}
@media(prefers-color-scheme:dark){.ag{--ag-text:var(--dsw-alias-label-primary,#edf0f5);--ag-muted:var(--dsw-alias-label-secondary,#a3aab8);--ag-border:var(--dsw-alias-border-l2,#3b414c);--ag-bg:var(--dsw-alias-bg-layer-1,#20242c);--ag-brand:var(--dsw-alias-brand-primary,#557bf3);--ag-good:var(--dsw-alias-state-success-primary,#66cb98);--ag-bad:var(--dsw-alias-state-error-primary,#ff969c)}}`
    const has = (value) => typeof value === 'string' && value.trim().length > 0
    const message = (reason) => reason instanceof Error ? reason.message : String(reason)
    function useWords(ctx) {
      const [, repaint] = React.useReducer((tick) => tick + 1, 0)
      React.useEffect(() => { const off = ctx.locale.subscribe(repaint); return typeof off === 'function' ? off : undefined }, [ctx])
      return ctx.locale.bind(NS)
    }
    async function callJson(url, init, w, signal) {
      const controller = new AbortController()
      const abort = () => controller.abort()
      if (signal?.aborted) controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(abort, 50_000)
      try {
        const response = await fetch(url, { ...init, signal: controller.signal })
        let payload
        try { payload = await response.json() } catch { throw new Error(w('badResponse')) }
        if (payload === null || typeof payload !== 'object') throw new Error(w('badResponse'))
        if (!response.ok || payload.ok === false) throw new Error(has(payload.message) ? payload.message : `HTTP ${response.status}`)
        return payload
      } catch (error) {
        if (controller.signal.aborted) throw new Error(w('timeout'))
        if (error instanceof TypeError) throw new Error(w('network'))
        throw error
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
    }
    function Page({ ctx }) {
      const w = useWords(ctx)
      const uid = React.useId()
      const [state, setState] = React.useState(null)
      const [loadError, setLoadError] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const [key, setKey] = React.useState('')
      const [visible, setVisible] = React.useState(false)
      const [dir, setDir] = React.useState('')
      const [busy, setBusy] = React.useState(null)
      const [keyNote, setKeyNote] = React.useState(null)
      const [dirNote, setDirNote] = React.useState(null)
      const [probe, setProbe] = React.useState('idle')
      const [confirm, setConfirm] = React.useState(false)
      const lock = React.useRef(false)
      const lifetime = React.useRef(null)
      const keyInput = React.useRef(null)
      const clearButton = React.useRef(null)
      const cancelButton = React.useRef(null)
      const focusAfter = React.useRef(null)
      const request = (url, body) => callJson(url, body === undefined ? undefined : {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}, w, lifetime.current?.signal)
      const load = async (signal = lifetime.current?.signal) => {
        setLoading(true)
        setLoadError(null)
        try {
          const payload = await callJson(API.status, undefined, w, signal)
          if (signal?.aborted) return
          setState(payload)
          setDir(typeof payload.outputDir === 'string' ? payload.outputDir : '')
        } catch (error) { if (!signal?.aborted) setLoadError(message(error)) }
        finally { if (!signal?.aborted) setLoading(false) }
      }
      React.useEffect(() => {
        const controller = new AbortController()
        lifetime.current = controller
        load()
        return () => controller.abort()
      }, [])
      React.useEffect(() => {
        if (confirm) cancelButton.current?.focus()
        else if (busy === null && focusAfter.current) {
          focusAfter.current.current?.focus()
          focusAfter.current = null
        }
      }, [confirm, busy])
      const configured = state?.configured === true
      const running = busy !== null
      const dirty = dir.trim() !== (state?.outputDir ?? '')
      const run = async (kind, action) => {
        if (lock.current || loading) return
        lock.current = true
        setBusy(kind)
        try { await action() } finally { lock.current = false; setBusy(null) }
      }
      const testConnection = async () => {
        setProbe('testing')
        try {
          const result = await request(API.probe, {})
          setProbe('success')
          setState((current) => ({ ...current, baseURL: result.baseURL ?? current.baseURL }))
          return result
        } catch (error) { setProbe('failed'); throw error }
      }
      const saveKey = (test) => run('key', async () => {
        if (!has(key)) return
        setKeyNote(null)
        setConfirm(false)
        let saved = false
        try {
          await request(API.key, {key})
          saved = true
          setKey('')
          setVisible(false)
          setState((current) => ({...current, configured:true}))
          setProbe('idle')
          if (test) { setBusy('test'); await testConnection() }
          setKeyNote({good:true, text:w(test ? 'probeOk' : 'keySaved')})
        } catch (error) { setKeyNote({good:false, text:(saved && test ? w('savedTestFailed') : '') + message(error)}) }
      })
      const testSaved = () => run('test', async () => {
        setKeyNote(null)
        try { await testConnection(); setKeyNote({good:true,text:w('probeOk')}) }
        catch (error) { setKeyNote({good:false,text:message(error)}) }
      })
      const closeConfirm = () => { focusAfter.current = clearButton; setConfirm(false) }
      const removeKey = () => run('clear', async () => {
        setKeyNote(null)
        try {
          await request(API.key,{clear:true})
          setState((current)=>({...current,configured:false}))
          setKey(''); setVisible(false); setConfirm(false); setProbe('idle')
          setKeyNote({good:true,text:w('cleared')})
          focusAfter.current = keyInput
        } catch (error) { setKeyNote({good:false,text:message(error)}) }
      })
      const persistDir = async (value) => {
        const result = await request(API.settings,{outputDir:value})
        setDir(result.outputDir)
        setState((current)=>({...current,outputDir:result.outputDir}))
        setDirNote({good:true,text:w(has(result.outputDir)?'dirSaved':'dirOff')})
      }
      const saveDir = (value) => run('dir', async () => {
        setDirNote(null)
        try { await persistDir(value) } catch(error) { setDirNote({good:false,text:message(error)}) }
      })
      const pickDir = () => run('pick', async () => {
        setDirNote(null)
        try {
          const result = await request(API.pick,{})
          if (!has(result.path)) throw new Error(w('pickFailed'))
          // 选择仅填入输入框；用户点击保存后才应用。
          setDir(result.path)
        } catch(error) { setDirNote({good:false,text:message(error)}) }
      })
      const note = (value, id) => value && el('p',{id,className:`ag-note ${value.good?'ag-ok':'ag-bad'}`,role:value.good?'status':'alert'},value.text)
      const button = (label, action, props = {}) => el('button',{type:'button',className:'ag-btn',disabled:running,onClick:action,...props},w(label))
      const style = el('style',null,CSS)
      if (loading) return el('div',{className:'ag','aria-busy':true},style,el('p',{className:'ag-loading',role:'status'},w('loading')))
      if (loadError) return el('div',{className:'ag'},style,el('h2',null,w('loadFailed')),el('p',{className:'ag-note ag-bad',role:'alert'},loadError),el('div',{className:'ag-actions'},button('retry',()=>load())))
      const statusKey = !configured?'missing':probe==='success'?'connected':probe==='failed'?'failed':probe==='testing'?'testing':'untested'
      const statusClass = configured && probe==='success'?'ag-ok':probe==='failed'?'ag-bad':''
      return el('div',{className:'ag','aria-busy':running},style,
        el('div',{className:'ag-head'},el('h2',null,w('title')),el('span',{className:`ag-state ${statusClass}`,role:'status'},el('i',{className:'ag-dot','aria-hidden':true}),w(statusKey))),
        el('p',{className:'ag-sub'},w('subtitle')),
        el('section',{className:'ag-section','aria-labelledby':`${uid}-connect`},
          el('h3',{id:`${uid}-connect`},w('keyTitle')),
          el('label',{className:'ag-label',htmlFor:`${uid}-key`},w('keyLabel')),
          el('form',{onSubmit:(event)=>{event.preventDefault();if(!event.nativeEvent?.isComposing)saveKey(true)}},
            el('div',{className:'ag-key-wrap'},
              el('input',{id:`${uid}-key`,ref:keyInput,className:'ag-input',type:visible?'text':'password',value:key,placeholder:w(configured?'replacement':'placeholder'),autoComplete:'new-password',spellCheck:false,disabled:running,'aria-describedby':`${uid}-key-hint`,onChange:(event)=>{setKey(event.target.value);setKeyNote(null)}}),
              button(visible?'hide':'show',()=>setVisible((value)=>!value),{className:'ag-toggle','aria-pressed':visible,'aria-controls':`${uid}-key`}),
            ),
            el('p',{id:`${uid}-key-hint`,className:'ag-hint'},w('keyHint')),
            el('div',{className:'ag-actions'},
              el('button',{type:'submit',className:'ag-btn ag-primary',disabled:running||!has(key)},w(busy==='key'?'saving':busy==='test'?'testing':'saveTest')),
              button('saveOnly',()=>saveKey(false),{disabled:running||!has(key)}),
              configured && button('test',testSaved,{className:'ag-link',disabled:running||has(key)}),
              configured && !confirm && button('clear',()=>setConfirm(true),{className:'ag-link ag-danger',ref:clearButton}),
            ),
          ),
          el('p',{className:'ag-hint'},w(has(key)?'keyDraft':'testHint')),
          confirm && el('div',{className:'ag-confirm',onKeyDown:(event)=>{if(event.key==='Escape'&&!running)closeConfirm()}},el('p',null,w('clearQuestion')),el('div',{className:'ag-actions'},button('cancel',closeConfirm,{ref:cancelButton}),button('confirmClear',removeKey,{className:'ag-btn ag-danger'}))),
          note(keyNote,`${uid}-key-note`),
          el('details',null,el('summary',null,w('detail')),el('dl',null,el('dt',null,w('site')),el('dd',null,state?.baseURL??'—'),el('dt',null,w('model')),el('dd',null,state?.imageModel??'—'))),
        ),
        el('section',{className:'ag-section','aria-labelledby':`${uid}-storage`},
          el('h3',{id:`${uid}-storage`},w('dirTitle')),
          el('label',{className:'ag-label',htmlFor:`${uid}-dir`},w('dirLabel')),
          el('form',{onSubmit:(event)=>{event.preventDefault();if(dirty)saveDir(dir)}},
            el('div',{className:'ag-row ag-folder-row'},el('input',{id:`${uid}-dir`,className:'ag-input',value:dir,type:'text',placeholder:w('dirPlaceholder'),spellCheck:false,disabled:running,'aria-describedby':`${uid}-dir-hint`,onChange:(event)=>{setDir(event.target.value);setDirNote(null)}}),button(busy==='pick'?'choosing':'choose',pickDir)),
            el('p',{id:`${uid}-dir-hint`,className:'ag-hint'},w('dirHint')),
            el('div',{className:'ag-actions'},el('button',{type:'submit',className:'ag-btn',disabled:running||!dirty},w(busy==='dir'?'saving':'saveDir')),
              dirty && button('reset',()=>{setDir(state.outputDir??'');setDirNote(null)},{className:'ag-link'}),
              has(state?.outputDir) && button('stopSaving',()=>saveDir(''),{className:'ag-link'}),
              el('span',{className:'ag-draft'},w(dirty?'dirty':has(state?.outputDir)?'unchanged':'chatOnly')),
            ),
          ),note(dirNote,`${uid}-dir-note`),
        ),
      )
    }
    function RowEntry({ctx,view}) { const w=useWords(ctx); return view==='summary'?el('span',null,w('summary')):el(Page,{ctx}) }
    return {
      inject:['slots','locale'],
      apply(ctx) {
        ctx.effect(()=>ctx.locale.register(NS,WORDS))
        ctx.effect(()=>ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'agnes-craft',order:46,label:()=>ctx.locale.bind(NS)('nav'),locale:NS},()=>el(Page,{ctx}))))
        ctx.effect(()=>ctx.slots.inject('plugins.row.config',()=>ctx.slots.register({name:'plugins.row.config',key:'dsh-agnes-craft#dsh-agnes-craft',locale:NS},(props)=>el(RowEntry,{ctx,view:props.view}))))
      },
    }
  },
})
