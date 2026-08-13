// 统一的 fetch 封装：带 UA/Referer、超时、JSON 解析、内存缓存
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'

// 简单的内存缓存（Vercel serverless 实例内有效，够用）
const cache = new Map()
const cacheTTL = {
  search: 60 * 1000,      // 搜索结果缓存 1 分钟
  lyric: 30 * 60 * 1000,  // 歌词缓存 30 分钟
  playlist: 5 * 60 * 1000, // 歌单缓存 5 分钟
  url: 10 * 60 * 1000,    // 播放 URL 缓存 10 分钟（付费链接有时效）
}
function cacheGet(type, key) {
  const item = cache.get(`${type}:${key}`)
  if (item && Date.now() - item.t < cacheTTL[type]) return item.v
  cache.delete(`${type}:${key}`)
  return undefined
}
function cacheSet(type, key, value) {
  cache.set(`${type}:${key}`, { t: Date.now(), v: value })
}

async function request(url, { method = 'GET', headers = {}, body = null, timeout = 8000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, {
      method,
      headers: { 'User-Agent': DEFAULT_UA, ...headers },
      body: body != null ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      signal: controller.signal,
    })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return { status: res.status, body: json || text }
  } finally {
    clearTimeout(timer)
  }
}

const formatPlayTime = seconds => {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const sizeFormate = size => {
  if (size == null) return null
  const mb = size / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(1)}MB` : `${(size / 1024).toFixed(0)}KB`
}

module.exports = { request, DEFAULT_UA, formatPlayTime, sizeFormate, cacheGet, cacheSet }
