// 网易云平台：搜索 + 歌词（用公开接口，稳定简单）
// 封面保持 http 原样（与坤音一致：客户端已开 usesCleartextTraffic，
// 手机上 http 图床可达，https 反而可能证书异常）
const { request, DEFAULT_UA, formatPlayTime, sizeFormate, cacheGet, cacheSet } = require('./http')

// 搜索（单曲，公开接口）
async function search(keyword, page = 1, limit = 30) {
  const cacheKey = `wy_${keyword}_${page}_${limit}` // 带平台前缀，防止与 QQ 等平台缓存串台
  const cached = cacheGet('search', cacheKey)
  if (cached) return cached

  const res = await request(
    `https://music.163.com/api/search/get?s=${encodeURIComponent(keyword)}&type=1&limit=${limit}&offset=${limit * (page - 1)}`,
    { headers: { Referer: 'https://music.163.com/' }, timeout: 8000 },
  )
  const data = res.body
  if (!data || data.code !== 200 || !data.result?.songs) return []

  const result = data.result.songs.map(item => {
    const _types = {}
    const types = []
    // 公开接口没有音质详情，用默认降级链（url 接口会自己降级）
    const qs = ['master', 'flac24bit', 'flac', '320k', '128k']
    qs.forEach(q => { _types[q] = { size: null }; types.push({ type: q, size: null }) })
    return {
      source: 'wy',
      songmid: String(item.id),
      name: item.name || '',
      singer: (item.artists || []).map(a => a.name).join('、'),
      albumName: item.album?.name || '',
      albumId: String(item.album?.id || ''),
      img: item.album?.picUrl || item.album?.artist?.img1v1Url || '',
      interval: formatPlayTime((item.duration || 0) / 1000),
      types,
      _types,
    }
  })
  cacheSet('search', cacheKey, result)
  return result
}

// 歌词
async function lyric(songId) {
  const cached = cacheGet('lyric', `wy_${songId}`)
  if (cached !== undefined) return cached

  const res = await request(`https://music.163.com/api/song/lyric?id=${songId}&lv=-1&kv=-1&tv=-1`, {
    headers: { Referer: 'https://music.163.com/' },
    timeout: 6000,
  })
  const data = res.body
  if (!data || !data.lrc) return ''
  const lrc = data.lrc.lyric || ''
  cacheSet('lyric', `wy_${songId}`, lrc)
  return lrc
}

module.exports = { search, lyric }
