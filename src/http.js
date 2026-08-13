// 统一的 fetch 封装：带 UA/Referer、超时、JSON 解析
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'

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

module.exports = { request, DEFAULT_UA, formatPlayTime, sizeFormate }
