# dsh-agnes-craft

**在 DeepSeek Harness（DSH）对话里免费生成图片。**

填好自己的 Agnes API Key，直接描述想画什么，图片就会显示在对话中。支持参考图编辑、多图合成和可选的本地保存。

## 免费条件

截至 **2026-11-13**，Agnes 国际站的 `agnes-image-2.5-flash`（本插件默认）、`2.1-flash`、`2.0-flash` 对 **`default` 用户**的体验价为 **$0**，覆盖 1K–4K 输出及输入参考图。

这是阶段性优惠，Agent Plan 不适用。账户适用情况与实际计费以 [Agnes 官方定价](https://www.agnes-ai.com/zh-Hans/docs/pricing)和账单为准；DSH 对话模型的费用另看自己的配置。

## 安装与使用

1. 从 [Releases](https://github.com/0v0-ovo/dsh-agnes-craft/releases/tag/v0.4.4) 下载 `.tgz` 安装包，在 DSH 对话中提供文件路径并请它安装。
2. 重载客户端，打开 **设置 → Agnes 出图**，填写 Key，点击 **保存并检测**。
3. 回到对话，写清画面、分辨率和画幅，例如：

```text
画一张雨夜书店的插画，暖色灯光，2K，画幅 16:9。
```

参考图参数支持公开 HTTP(S) 地址或图片 Base64，不直接接受本地路径。需要额外保存图片时，在设置页选择目录并保存。

![Agnes 出图设置页](docs/images/settings.png)

## 说明

当前为 **0.4.4 公开测试版**，要求 DSH `>=0.2.2-rc.1 <0.3.0`。42 条基础测试和 9 项模拟宿主的浏览器检查通过，真实 DSH 完整流程仍待验收。

非官方社区插件，与 DeepSeek、Agnes AI 无隶属关系。项目由 AI 辅助开发，早期参考来源与许可见 [第三方声明](THIRD-PARTY-NOTICES.md)；本项目采用 [MIT 许可](LICENSE)。

[更新记录](CHANGELOG.md) · [开发说明](CONTRIBUTING.md)
