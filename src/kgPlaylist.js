// 酷狗公开歌单解析（免登录，抓 HTML 正则提取 global.data）
const { request, formatPlayTime, cacheGet, cacheSet } = require('./http')

const extractId = raw => {
  let id = String(raw).trim()
  const m1 = id.match(/(?:special|plist)\/(?:single\/)?(\d+)/)
  if (m1) return m1[1]
  const m2 = id.match(/[?&]id=(\d+)/)
  if (m2) return m2[1]
  return id
}

// 封面 URL：把 {size} 换成 150
const cover = unionCover => {
  if (!unionCover) return ''
  return unionCover.replace('{size}', '150').replace(/^http:\/\//, 'https://')
}

async function getPlaylist(rawId) {
  const id = extractId(rawId)
  const cached = cacheGet('playlist', `kg_${id}`)
  if (cached) return cached

  const url = `http://www2.kugou.kugou.com/yueku/v9/special/single/${id}-5-9999.html`
  const res = await request(url, {
    headers: { Referer: 'https://www.kugou.com/' },
    timeout: 10000,
  })
  const html = typeof res.body === 'string' ? res.body : ''
  const dataMatch = html.match(/global\.data = (\[.+\]);/)
  if (!dataMatch) throw new Error('酷狗歌单解析失败')

  const list = JSON.parse(dataMatch[1])
  const nameMatch = html.match(/global = {[\s\S]+?name: "(.+)"[\s\S]+?pic: "(.+)"[\s\S]+?};/)
  const songs = (Array.isArray(list) ? list : []).map(item => ({
    source: 'kg',
    songmid: item.hash || item.songid || '',
    name: item.songname || '',
    singer: item.singername || '',
    albumName: item.album_name || '',
    albumId: String(item.album_id || ''),
    img: cover(item.trans_param?.union_cover || ''),
    interval: formatPlayTime(item.duration || 0),
  }))

  const result = {
    source: 'kg',
    name: nameMatch ? nameMatch[1] : '酷狗歌单',
    img: nameMatch ? nameMatch[2] : '',
    author: '',
    total: songs.length,
    songs,
  }
  cacheSet('playlist', `kg_${id}`, result)
  return result
}

module.exports = { getPlaylist }
