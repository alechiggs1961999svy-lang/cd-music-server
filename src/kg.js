// 酷狗搜索 + 歌词（公开接口，移植自 lx-music 的 kg 源）
// 注意：kg 的 songmid 使用 FileHash（取播放 URL 用 hash，与 kgPlaylist 一致）
const { request, formatPlayTime, cacheGet, cacheSet } = require('./http')

const decodeName = (str = '') =>
  String(str)
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, c) => String.fromCharCode(parseInt(c, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")

const formatSinger = list => (list || []).map(s => s.name || s).join('、')

const KG_HEADERS = {
  'KG-RC': '1',
  'KG-THash': 'expand_search_manager.cpp:852736169:451',
  'User-Agent': 'KuGou2012-9020-ExpandSearchManager',
  Referer: 'https://www.kugou.com/',
}

// 搜索（songsearch_v2 公开接口）
async function search(keyword, page = 1, limit = 30) {
  const cacheKey = `kg_${keyword}_${page}_${limit}`
  const cached = cacheGet('search', cacheKey)
  if (cached) return cached

  const res = await request(
    `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=${limit}&userid=0&clientver=&platform=WebFilter&filter=2&iscorrection=1&privilege_filter=0&area_code=1`,
    { headers: { Referer: 'https://www.kugou.com/' }, timeout: 8000 },
  )
  const data = res.body
  if (!data || data.error_code !== 0 || !data.data?.lists) return []

  // 公开接口没有音质详情，用默认降级链（url 接口会自己降级）
  const qs = ['master', 'flac24bit', 'flac', '320k', '128k']
  const types = qs.map(q => ({ type: q, size: null }))
  const result = []
  const seen = new Set()
  for (const item of data.data.lists) {
    const key = item.Audioid + item.FileHash
    if (seen.has(key)) continue
    seen.add(key)
    result.push({
      source: 'kg',
      songmid: item.FileHash || String(item.Audioid || ''),
      name: decodeName(item.SongName || ''),
      singer: decodeName(formatSinger(item.Singers)),
      albumName: decodeName(item.AlbumName || ''),
      albumId: String(item.AlbumID || ''),
      img: '',
      interval: formatPlayTime(item.Duration || 0),
      types,
    })
  }
  cacheSet('search', cacheKey, result)
  return result
}

// 把 "4:29" 转成秒（歌词搜索需要）
const intervalToSec = str => {
  if (!str) return 0
  const parts = String(str).split(':').map(Number)
  return parts.reduce((acc, v) => acc * 60 + v, 0)
}

// 歌词（lyrics.kugou.com 两步：search → download）
async function lyric(name, hash, interval) {
  const cacheKey = `kg_${hash}_${name}`
  const cached = cacheGet('lyric', cacheKey)
  if (cached !== undefined) return cached
  try {
    const sRes = await request(
      `https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(name)}&hash=${hash}&timelength=${intervalToSec(interval)}&lrctxt=1`,
      { headers: KG_HEADERS, timeout: 8000 },
    )
    const cands = sRes.body?.candidates
    if (!cands || !cands.length) return ''
    const info = cands[0]
    // 实测强制 fmt=lrc 可直接拿到明文 LRC（即使候选是 krc 格式）
    const dRes = await request(
      `https://lyrics.kugou.com/download?ver=1&client=pc&id=${info.id}&accesskey=${info.accesskey}&fmt=lrc&charset=utf8`,
      { headers: KG_HEADERS, timeout: 8000 },
    )
    const body = dRes.body
    if (!body || !body.content || body.fmt === 'krc') return '' // 失败不缓存，允许下次重试
    const lrc = Buffer.from(body.content, 'base64').toString('utf-8')
    cacheSet('lyric', cacheKey, lrc)
    return lrc
  } catch {
    return ''
  }
}

module.exports = { search, lyric }
