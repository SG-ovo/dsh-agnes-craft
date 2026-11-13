# 参与开发

## 环境

- Node **≥ 22.14**（`node --version`）
- 一个可用的 DeepSeek Harness（DSH）安装，用来真机验证

单测只依赖 Node 内置模块，**不装任何依赖也能跑**：

```bash
node test/unit.test.js
```

## 装到本机 DSH 里试

参考 [README 的安装一节](README.md#安装)。要点：

- 用 `plugin_manager install_bundle` 装，不要手改 profile 的 `package.json` / `cordis.patch.yml`。
- **改完代码必须重装并重启客户端**：运行中的 DSH 不会重新 import 已加载的插件。
- 装目录形式（`file:` / `link:`）时，pnpm 用 junction 链进 profile，Node 解析 realpath 后会
  跳出项目的 `node_modules`，导致 `@deepseek-ai/schemastery` 找不到。两个办法：
  - 用 **`npm install`**（扁平布局，能正常解析）；
  - 或者把 `node_modules/.pnpm` 里的包展开成普通目录。

> 仓库里的 `pnpm-lock.yaml` 是 pnpm 生成的（DSH 自己用 pnpm）；用 `npm install` 时它会被忽略，
> 不影响结果。想用 pnpm 就记得上面那个 junction 的坑。

## 改代码时的约定

- **图片必须回到会话**：`output.render` 只能返回 `{ type: 'image', attachment }` 内容块，
  不许退化成返回路径字符串。`test/unit.test.js` 里有 4 条断言守着这条，别改测试来绕过。
- **`size` / `ratio` 不设默认值**：缺了就让模型回去问用户。逻辑在
  `missingImageOptions()`，同样有测试。
- **密钥不进配置**：只存引用名，值一律走 `ctx.credentials`。
- 新增错误分支时，把文案写进官方错误码表对应的 `errors.js` 条目里，而不是散落在调用点。

## 提交

- 一个 PR 一件事；改动涉及行为时，同时更新 README 里对应的说明。
- 新增纯函数请补单测（`test/unit.test.js`），保持「不联网、不花钱、秒级跑完」。

## 不要提交

- `node_modules/`、`*.tgz`、任何 `.env` 或密钥；CI 不做凭证相关的事。
- 生成出来的图片。`.gitignore` 已覆盖常见后缀。
