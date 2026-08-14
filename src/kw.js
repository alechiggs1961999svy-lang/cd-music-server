// 酷我搜索 + 歌词（公开接口，移植自 lx-music 的 kw 源）
const zlib = require('zlib')
const { request, requestBuffer, formatPlayTime, cacheGet, cacheSet } = require('./http')

const decodeName = (str = '') =>
  String(str)
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, c) => String.fromCharCode(parseInt(c, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")

// N_MINFO 段：level:xxx,bitrate:xxxx,format:xxx,size:x.xx
const mInfoExp = /level:(\w+),bitrate:(\d+),format:(\w+),size:([\w.]+)/

const qualityOf = bitrate => {
  switch (bitrate) {
    case '20900': return 'master'
    case '4000': return 'hires'
    case '2000': return 'flac'
    case '320': return '320k'
    case '128': return '128k'
    default: return null
  }
}

// 搜索（search.kuwo.cn 公开接口）
async function search(keyword, page = 1, limit = 30) {
  const cacheKey = `kw_${keyword}_${page}_${limit}`
  const cached = cacheGet('search', cacheKey)
  if (cached) return cached

  const res = await request(
    `http://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(keyword)}&pn=${page - 1}&rn=${limit}&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1&show_copyright_off=1&newver=1&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1`,
    { headers: { Referer: 'http://www.kuwo.cn/', 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 },
  )
  const data = res.body
  if (!data || !Array.isArray(data.abslist)) return []

  const result = []
  for (const info of data.abslist) {
    const songId = String(info.MUSICRID || '').replace('MUSIC_', '')
    if (!songId) continue
    const types = []
    if (info.N_MINFO) {
      for (const seg of String(info.N_MINFO).split(';')) {
        const m = seg.match(mInfoExp)
        if (!m) continue
        const q = qualityOf(m[2])
        if (q) types.push({ type: q, size: m[4] ? m[4].toUpperCase() : null })
      }
    }
    if (!types.length) {
      // 无音质信息时给默认降级链
      for (const q of ['master', 'flac24bit', 'flac', '320k', '128k']) types.push({ type: q, size: null })
    }
    result.push({
      source: 'kw',
      songmid: songId,
      name: decodeName(info.SONGNAME || ''),
      singer: decodeName((info.ARTIST || '').replace(/&/g, '、')),
      albumName: decodeName(info.ALBUM || ''),
      albumId: decodeName(String(info.ALBUMID || '')),
      img: '',
      interval: formatPlayTime(parseInt(info.DURATION) || 0),
      types,
    })
  }
  cacheSet('search', cacheKey, result)
  return result
}

// 歌词：主接口 m.kuwo.cn（可能限流），回退加密接口 newlyric.kuwo.cn（移植 lx-music 协议）
const bufKey = Buffer.from('yeelion')

// 加密请求参数：XOR('yeelion') + base64
const buildParams = (id, isGetLyricx) => {
  let params = `user=12345,web,web,web&requester=localhost&req=1&rid=MUSIC_${id}`
  if (isGetLyricx) params += '&lrcx=1'
  const buf = Buffer.from(params)
  const out = Buffer.alloc(buf.length)
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ bufKey[i % bufKey.length]
  return out.toString('base64')
}

const decodeGbk = buf => {
  try {
    return new TextDecoder('gb18030').decode(buf)
  } catch {
    return ''
  }
}

// 解析 newlyric 响应：tp=content 头 + zlib 压缩体
const parseNewlyric = (buf, isGetLyricx) => {
  try {
    if (!buf || buf.toString('utf8', 0, 10) !== 'tp=content') return ''
    const idx = buf.indexOf('\r\n\r\n')
    if (idx < 0) return ''
    const inflated = zlib.inflateSync(buf.slice(idx + 4))
    if (!isGetLyricx) return decodeGbk(inflated) // 直接是 GBK LRC 文本
    // lrcx=1：base64 → XOR → GBK 文本（含逐字时间标签，去掉）
    const data = Buffer.from(inflated.toString(), 'base64')
    const out = Buffer.alloc(data.length)
    for (let i = 0; i < data.length; i++) out[i] = data[i] ^ bufKey[i % bufKey.length]
    return decodeGbk(out).replace(/<-?\d+,-?\d+(?:,-?\d+)?>/g, '')
  } catch {
    return ''
  }
}

async function lyric(songId) {
  const cacheKey = `kw_${songId}`
  const cached = cacheGet('lyric', cacheKey)
  if (cached !== undefined) return cached

  const fmt = t => {
    const m = Math.floor(t / 60)
    const s = (t % 60).toFixed(2)
    return `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`
  }

  // 1. m.kuwo.cn（结构化 lrclist，简单优先）
  try {
    const res = await request(`http://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${songId}`, {
      headers: { Referer: 'http://m.kuwo.cn/', 'User-Agent': 'Mozilla/5.0' },
      timeout: 6000,
    })
    const list = res.body?.data?.lrclist
    if (Array.isArray(list) && list.length) {
      const lrc = list.map(l => `[${fmt(l.time)}]${l.lineLyric || ''}`).join('\n')
      cacheSet('lyric', cacheKey, lrc)
      return lrc
    }
  } catch {}

  // 2. 加密接口 newlyric.kuwo.cn（先不带 lrcx，失败再带 lrcx）
  for (const withLyricx of [false, true]) {
    try {
      const res = await requestBuffer(`http://newlyric.kuwo.cn/newlyric.lrc?${buildParams(songId, withLyricx)}`, {
        headers: { Referer: 'http://www.kuwo.cn/', 'User-Agent': 'Mozilla/5.0' },
        timeout: 6000,
      })
      const lrc = parseNewlyric(res.buffer, withLyricx)
      if (lrc && /\[\d{1,2}:/.test(lrc)) {
        cacheSet('lyric', cacheKey, lrc)
        return lrc
      }
    } catch {}
  }

  return '' // 失败不缓存，允许下次重试
}

module.exports = { search, lyric }
