/**
 * 工具结果 → 模型可见的图片内容块。
 * Web Client 的对话预览另由 client/index.js 中 agnes_image 的 toolview 负责；
 * 仅返回 image 块不代表客户端一定会自动展示图片。
 * 已配置目录时仍保留落盘与失败提示。
 */

/**
 * @param {{ images: Array<object>, model?: string, savedTo?: string[] }} value  工具 execute 的返回值
 * @returns {Array<object>} 摘要 + 每图一个 image 块 + 可选的落盘提示
 */
export function imageContentBlocks(value) {
  const images = Array.isArray(value?.images) ? value.images : []
  const blocks = [
    {
      type: 'text',
      text: `Agnes 出了 ${images.length} 张图（${value?.model ?? 'agnes'}）：`,
    },
  ]
  for (const image of images) {
    blocks.push({ type: 'image', attachment: image })
  }

  const savedTo = Array.isArray(value?.savedTo) ? value.savedTo.filter((path) => typeof path === 'string') : []
  if (savedTo.length > 0) {
    blocks.push({ type: 'text', text: `已保存到：\n${savedTo.join('\n')}` })
  }

  if (typeof value?.notice === 'string' && value.notice.length > 0) {
    blocks.push({ type: 'text', text: `注意：${value.notice}` })
  }
  return blocks
}
