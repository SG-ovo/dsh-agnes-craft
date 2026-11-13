/**
 * 工具结果 → 会话内容块。
 *
 * 这是「用户能不能在 DSH 里直接看见图」的唯一实现点，所以单独成文件、单独测：
 * 只要这里返回的是 `{ type: 'image', attachment }`，DSH 就会把它渲染成图；
 * 一旦有人把它改成返回路径字符串，用户就只看到一行字 —— 那种回归必须被测试挡住。
 *
 * 若用户配了保存目录，额外补一条文字块告知落盘位置；图本身仍是 image 块，
 * 顺序永远是「摘要 → 图 → 落盘提示」，保证图在第一屏。
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
