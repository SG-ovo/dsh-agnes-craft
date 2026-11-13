/**
 * 字节层面的判断：到底是什么格式的图片。
 *
 * 不信上游给的扩展名或 media type —— 直接看文件头。这样即使 CDN 把 webp 当 png 返回，
 * 落进附件库的类型也是对的。
 */

const JPEG = [0xff, 0xd8, 0xff]
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const GIF = [0x47, 0x49, 0x46, 0x38]

const EXTENSION = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export const IMAGE_MEDIA_TYPES = Object.keys(EXTENSION)

function startsWith(bytes, signature) {
  if (bytes.length < signature.length) return false
  return signature.every((byte, index) => bytes[index] === byte)
}

/**
 * @param {Uint8Array} bytes
 * @returns {string | undefined} image/png | image/jpeg | image/webp | image/gif
 */
export function detectImageType(bytes) {
  if (startsWith(bytes, PNG)) return 'image/png'
  if (startsWith(bytes, JPEG)) return 'image/jpeg'
  if (startsWith(bytes, GIF)) return 'image/gif'
  // WebP: "RIFF" + 4 字节长度 + "WEBP"
  if (
    bytes.length >= 12 &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return undefined
}

export function extensionFor(mediaType) {
  return EXTENSION[mediaType] ?? 'png'
}
