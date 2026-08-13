// QQ音乐：搜索 + 歌词（用博客验证过的公开接口，稳定）
// 参考博客: musicApi.ts 的 searchQQMusic / getQQMusicLyric
const { request, DEFAULT_UA, formatPlayTime, sizeFormate, cacheGet, cacheSet } = require('./http')

const QH = {
  'User-Agent': DEFAULT_UA,
  Referer: 'https://y.qq.com/',
}

// 搜索（单曲，公开接口 client_search_cp）
async function search(keyword, page = 1, limit = 30) {
  const cacheKey = `${keyword}_${page}_${limit}`
  const cached = cacheGet('search', cacheKey)
  if (cached) return cached

  const res = await request(
    `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${encodeURIComponent(keyword)}&format=json&n=${limit}&p=${page}&t=0`,
    { headers: QH, timeout: 8000 },
  )
  const d = res.body
  if (!d || d.code !== 0 || !d.data?.song?.list) return []
  const result = d.data.song.list.map(item => {
    const _types = {}
    const types = []
    if (item.file?.size_flac) { _types.flac = { size: sizeFormate(item.file.size_flac) }; types.push({ type: 'flac', size: _types.flac.size }) }
    if (item.file?.size_320mp3) { _types['320k'] = { size: sizeFormate(item.file.size_320mp3) }; types.push({ type: '320k', size: _types['320k'].size }) }
    if (item.file?.size_128mp3) { _types['128k'] = { size: sizeFormate(item.file.size_128mp3) }; types.push({ type: '128k', size: _types['128k'].size }) }
    types.reverse()
    return {
      source: 'tx',
      songmid: String(item.songmid),
      name: item.songname || '',
      singer: (item.singer || []).map(s => s.name).join('、'),
      albumName: item.albumname || '',
      albumId: String(item.albumid || ''),
      img: item.albummid ? `https://y.qq.com/music/photo_new/T002R300x300M000${item.albummid}.jpg` : '',
      interval: formatPlayTime(item.interval),
      types,
      _types,
    }
  })
  cacheSet('search', cacheKey, result)
  return result
}

// 歌词（用博客验证过的 fcg_query_lyric_new 接口）
async function lyric(songmid) {
  const cached = cacheGet('lyric', songmid)
  if (cached !== undefined) return cached

  const res = await request(
    `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${songmid}&format=json&nobase64=1`,
    { headers: { Referer: 'https://y.qq.com/' }, timeout: 6000 },
  )
  const data = res.body
  if (!data || data.retcode !== 0 || !data.lyric) return ''
  cacheSet('lyric', songmid, data.lyric)
  return data.lyric
}

module.exports = { search, lyric }
