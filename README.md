# Agnes 出图 · DeepSeek Harness 插件

在 DeepSeek Harness 对话里描述画面，生成的图片直接显示在对话中，点击即可放大预览。

做这个插件的初衷很简单：把 Agnes 当前的免费图片体验接进日常对话，少切一个工具。

[下载安装包](https://github.com/SG-ovo/dsh-agnes-craft/releases/latest) · [Agnes 官网](https://www.agnes-ai.com) · [问题反馈](https://github.com/SG-ovo/dsh-agnes-craft/issues)

> 插件免费开源，当前版本 **0.4.5（公开测试版）**。Agnes 图片服务目前提供有条件的免费体验，具体说明见下方。

## 能做什么

- **对话出图**：用自然语言描述画面，结果直接展示在对话里。
- **参考图编辑**：支持最多 8 张参考图，修改风格或进行多图合成。
- **选择尺寸**：支持 1K–4K 和多种画幅。
- **可选本地保存**：图片留在对话中，也可以额外保存到指定文件夹。

## 安装与配置

需要 DeepSeek Harness `>=0.2.2-rc.1 <0.3.0`，宿主 Node.js `>=22.14.0`。

1. 到 [Releases](https://github.com/SG-ovo/dsh-agnes-craft/releases/latest) 下载 `dsh-agnes-craft-0.4.5.tgz`。
2. 把下载后的本地路径发给 DeepSeek Harness，请它安装，例如：

   ```text
   请安装本地插件包 D:\Downloads\dsh-agnes-craft-0.4.5.tgz
   ```

3. 安装完成后重启客户端，打开 **设置 → Agnes 出图**。
4. 去 [Agnes 官网](https://www.agnes-ai.com) 获取自己的 API Key，粘贴后点击 **保存并检测**。

检测只检查连接，不生成图片。Key 通过 DeepSeek Harness 的凭据服务保存，不写入插件配置明文。

![Agnes 出图设置页：API Key 配置、连接检测和可选图片保存目录](docs/images/settings.png)

## 开始出图

回到对话，告诉它画什么、分辨率和画幅：

```text
生成一只坐在窗边的小猫，暖色阳光，2K，画幅 3:4。
```

编辑图片时提供参考图，再描述修改要求：

```text
把这张图改成水彩风格，保留主体和构图，2K，画幅 3:4。
```

未指定分辨率或画幅时，会先询问你。参考图需要由调用方转换为图片 URL 或 Base64；本地路径、对话附件引用不能直接作为工具的参考图参数。

## 现在免费吗？

**插件本身免费。图片生成是否免费，取决于 Agnes 的账户和模型规则。**

截至 **2026-11-14**，[Agnes 官网定价页](https://www.agnes-ai.com/zh-Hans/docs/pricing)显示：默认账户（`default`）使用 `agnes-image-2.5-flash`（插件默认）、`agnes-image-2.1-flash` 或 `agnes-image-2.0-flash`，当前 1K–4K 输出及输入参考图的体验价均为 **$0**。

**Agent Plan 不参与该免费体验。** 优惠可能调整，实际费用以平台公告和账户账单为准，不代表永久或无限免费。上述条件对应插件默认接口 `https://apihub.agnes-ai.com/v1`；更换接口或模型后需重新确认计费。对话模型的费用取决于你在 DeepSeek Harness 中的配置。

<details>
<summary>工具参数与高级配置</summary>

### 工具参数

工具名：`agnes_image`。

| 参数 | 说明 |
| --- | --- |
| `prompt` | 必填，画面描述 |
| `size` | 必填：`1K`、`2K`、`3K`、`4K` |
| `ratio` | 必填：`1:1`、`3:4`、`4:3`、`16:9`、`9:16`、`2:3`、`3:2`、`21:9` |
| `model` | 可选，默认 `agnes-image-2.5-flash` |
| `images` | 可选，最多 8 张；接受公开 HTTP(S) 地址或 `data:image/...;base64` |

配置中的 `size` 和 `aspectRatio` 仅作建议，不能代替调用时明确传入参数。

### 保存与连接

在设置页选择目录后，点击 **保存目录** 才会生效；可以撤销草稿或关闭额外保存。关闭后图片仍保留在对话中，额外写盘失败也不影响已保存到附件服务的图片。

目录设置位于 `$DSH_HOME/agnes-craft/settings.json`；未设置 `DSH_HOME` 时使用 `~/.dsh/agnes-craft/settings.json`。设置页保存值优先于初始 `outputDir`。

| 配置项 | 默认值 |
| --- | --- |
| `baseURL` | `https://apihub.agnes-ai.com/v1` |
| `credentialRef` | `AGNES_API_KEY` |
| `imageModel` | `agnes-image-2.5-flash` |
| `timeoutMs` | `180000`（毫秒） |
| `maxImageBytes` | `33554432`（32 MiB） |
| `outputDir` | 空，不额外写盘 |

连接失败时已保存的 Key 会保留，可处理后重试。设置入口未加载时，可访问 `<DSH 地址>/agnes-craft` 使用简化配置页。

国内接口为 `https://api.agnes-ai.cn/v1`，计费需单独确认。仅已知官方地址会在 401/403 时尝试站点回退；自定义地址不会自动切换。生成请求遇到临时服务错误时不自动重复提交。

</details>

<details>
<summary>开发与验证范围</summary>

源码目录先执行 `npm install`，再让 DeepSeek Harness 安装该目录。普通用户建议使用 Releases 安装包。开发说明见 [CONTRIBUTING.md](CONTRIBUTING.md)，版本变化见 [CHANGELOG.md](CHANGELOG.md)。

```sh
npm test
npm run check
```

已有 42 条基础与回归测试，以及 17 项基于模拟宿主的 Chrome 操作检查；这些自动检查不调用真实 Agnes 生成接口。本机已确认真实生成图片可在对话中直接显示、折叠执行过程后仍可见并可放大，其他宿主版本和全部场景仍需继续验证。

浏览器检查需本机 Chrome，并在 `test/ui` 中执行 `npm ci`，随后回到项目根目录运行 `npm run test:ui`。

</details>

## 开源与致谢

本项目由 AI 辅助开发，采用 [MIT License](LICENSE)。早期实现参考了 [dsh-openai-image-tools](https://github.com/AYui124/dsh-openai-image-tools)、[dsh-agnes-create](https://github.com/zxygithub/dsh-agnes-create) 和 [dshmarket](https://github.com/dsh-market/dsh-market)，具体版本、版权及许可见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。分发时请保留这两份许可文件。

这是社区插件，与 DeepSeek、Agnes AI 无隶属关系或官方背书。
