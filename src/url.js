// 播放地址：转发用户的 c.wwwweb.top 音源（lx-music 协议），带质量降级链
const { request } = require('./http')

const API = 'https://c.wwwweb.top/music/url'
const KEY = process.env.MUSIC_SOURCE_KEY || '[REMOVED]'

// 实测支持的档位（降级链，从高到低）
const QUALITY_CHAIN = ['master', 'flac24bit', 'hires', 'flac', '320k', '128k']

// kg 酷狗 CDN 证书损坏 → 降 http；其他平台 http → 升 https
const normalizeUrl = (source, url) => {
  if (source === 'kg') return url.replace(/^https:\/\//, 'http://')
  return url.replace(/^http:\/\//, 'https://')
}

async function getUrl(source, musicId, quality = 'master') {
  // 从用户请求的档位开始，沿降级链逐个试
  const startIdx = QUALITY_CHAIN.indexOf(quality)
  const chain = startIdx >= 0 ? QUALITY_CHAIN.slice(startIdx) : QUALITY_CHAIN

  for (const q of chain) {
    try {
      const res = await request(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': KEY,
          'User-Agent': 'lx-music-request/1.0',
        },
        body: { source, musicId, quality: q },
        timeout: 8000,
      })
      const d = res.body
      if (d && d.code === 200 && d.url) {
        return { quality: q, url: normalizeUrl(source, d.url) }
      }
    } catch {}
  }
  return null
}

module.exports = { getUrl, QUALITY_CHAIN }
