// QQ音乐公开歌单解析（免登录，fcg_ucc_getcdinfo_byids_cp.fcg）
const { request, formatPlayTime, cacheGet, cacheSet } = require('./http')

const extractId = raw => {
  let id = String(raw).trim()
  const m1 = id.match(/(?:playlist|playsquare|taoge)\/(\d+)/)
  if (m1) return m1[1]
  const m2 = id.match(/[?&]id=(\d+)/)
  if (m2) return m2[1]
  return id
}

async function getPlaylist(rawId) {
  const id = extractId(rawId)
  const cached = cacheGet('playlist', `tx_${id}`)
  if (cached) return cached

  const url = `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&new_format=1&disstid=${id}&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`
  const res = await request(url, {
    headers: {
      Origin: 'https://y.qq.com',
      Referer: `https://y.qq.com/n/yqq/playsquare/${id}.html`,
    },
    timeout: 10000,
  })
  const data = res.body
  if (!data || data.code !== 0 || !data.cdlist || !data.cdlist[0]) throw new Error('QQ歌单解析失败')

  const cd = data.cdlist[0]
  const songs = (cd.songlist || []).map(item => ({
    source: 'tx',
    songmid: String(item.mid),
    name: item.title || '',
    singer: (item.singer || []).map(s => s.name).join('、'),
    albumName: item.album?.name || '',
    albumId: String(item.album?.mid || ''),
    img: item.album?.mid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${item.album.mid}.jpg` : '',
    interval: formatPlayTime(item.interval),
  }))

  const result = {
    source: 'tx',
    name: cd.dissname || 'QQ歌单',
    img: cd.logo || '',
    author: cd.nickname || '',
    total: songs.length,
    songs,
  }
  cacheSet('playlist', `tx_${id}`, result)
  return result
}

module.exports = { getPlaylist }
