// QQ音乐：搜索 + 歌词（musicu.fcg 协议，移植自洛雪 musicSdk/tx）
const { request, DEFAULT_UA, formatPlayTime, sizeFormate } = require('./http')

const MUSICU = 'https://u.y.qq.com/cgi-bin/musicu.fcg'

async function musicu(req) {
  const res = await request(MUSICU, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)',
      'Content-Type': 'application/json',
      Referer: 'https://y.qq.com/',
    },
    body: {
      comm: {
        ct: 11,
        cv: '1003006',
        v: '1003006',
        os_ver: '12',
        phonetype: '0',
        devicelevel: '31',
        tmeAppID: 'qqmusiclight',
        nettype: 'NETWORK_WIFI',
      },
      req,
    },
    timeout: 8000,
  })
  return res.body
}

// 搜索（单曲）
async function search(keyword, page = 1, limit = 30) {
  const body = await musicu({
    module: 'music.search.SearchCgiService',
    method: 'DoSearchForQQMusicLite',
    param: {
      query: keyword,
      search_type: 0,
      num_per_page: limit,
      page_num: page,
      nqc_flag: 0,
      grp: 1,
    },
  })
  // 新版接口：req.data.body.item_song；旧版是 song.list（兼容两者）
  const body2 = body?.req?.data?.body
  const list = body2?.item_song || body2?.song?.list
  if (!list) return []
  return list.map(item => {
    const _types = {}
    const types = []
    if (item.file?.size_flac) { _types.flac = { size: sizeFormate(item.file.size_flac) }; types.push({ type: 'flac', size: _types.flac.size }) }
    if (item.file?.size_320mp3) { _types['320k'] = { size: sizeFormate(item.file.size_320mp3) }; types.push({ type: '320k', size: _types['320k'].size }) }
    if (item.file?.size_128mp3) { _types['128k'] = { size: sizeFormate(item.file.size_128mp3) }; types.push({ type: '128k', size: _types['128k'].size }) }
    types.reverse()
    return {
      source: 'tx',
      songmid: String(item.mid),
      name: item.title || '',
      singer: (item.singer || []).map(s => s.name).join('、'),
      albumName: item.album?.name || '',
      albumId: item.album?.mid || '',
      img: item.album?.mid ? `https://y.qq.com/music/photo_new/T002R300x300M000${item.album.mid}.jpg` : '',
      interval: formatPlayTime(item.interval),
      types,
      _types,
    }
  })
}

// 歌词（用博客验证过的 fcg_query_lyric_new 接口）
async function lyric(songmid) {
  const res = await request(
    `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${songmid}&format=json&nobase64=1`,
    { headers: { Referer: 'https://y.qq.com/' }, timeout: 6000 },
  )
  const data = res.body
  if (!data || data.retcode !== 0 || !data.lyric) return ''
  return data.lyric
}

module.exports = { search, lyric }
