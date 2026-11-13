# 发布流程

仓库：<https://github.com/0v0-ovo/dsh-agnes-craft>。

## 检查版本与内容

发布前核对 `package.json` 的版本和仓库地址，更新 `CHANGELOG.md`，运行：

```sh
npm test
npm run check
```

浏览器检查见 README，真实宿主验收与自动测试应分别记录。

## 构建安装包

在仓库根目录运行 `npm pack --ignore-scripts --pack-destination <输出目录>`。检查生成的 `.tgz` 中包含 `LICENSE`、`THIRD-PARTY-NOTICES.md`、`README.md`、宿主及客户端代码。

源码或安装包中不要包含 API Key、DSH 凭据、会话导出、`node_modules` 或测试生成文件。

## 发布 GitHub Release

为通过检查的提交创建与包版本一致的标签（例如 `v0.4.4`），创建 GitHub Release，附上 `.tgz` 安装包和源码包。0.x 版本按测试版标识，发布说明写明验证范围。

GitHub 开源与 npm 发布是两个独立步骤。只有确定 npm 账号、包名和发布授权后，才执行 `npm publish`；不要为了发布 GitHub 自动发布到 npm。

## 来源说明

保留 README 的参考来源、`LICENSE` 和 `THIRD-PARTY-NOTICES.md`。引入新来源或依赖时，核对实际版本的许可与适用声明，不用文本重合率代替来源审查。
