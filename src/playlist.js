// 网易云歌单解析（公开 v6 接口，同博客 musicApi.ts；限 500 首防 Vercel 超时）
const { request, DEFAULT_UA, formatPlayTime } = require('./http')

const extractId = raw => {
  let id = String(raw).trim()
  const m1 = id.match(/[?&]id=(\d+)/)
  if (m1) return m1[1]
  const m2 = id.match(/playlist\/(\d+)/)
  if (m2) return m2[1]
  return id
}

async function getPlaylist(rawId) {
  const id = extractId(rawId)
  // 1. v6 接口拿歌单名 + 全部歌曲 ID
  const res = await request(`https://music.163.com/api/v6/playlist/detail?id=${id}&n=100000`, {
    headers: { Referer: 'https://music.163.com/' },
    timeout: 10000,
  })
  const data = res.body
  if (!data || data.code !== 200 || !data.playlist) throw new Error('歌单解析失败')

  const playlist = data.playlist
  const trackIds = (playlist.trackIds || []).slice(0, 500).map(t => String(t.id))

  // 2. 分批 song/detail 补详情（每批 30，容错）
  const detailMap = new Map()
  for (let i = 0; i < trackIds.length; i += 30) {
    const batch = trackIds.slice(i, i + 30)
    try {
      const r = await request(`https://music.163.com/api/song/detail/?id=${batch[0]}&ids=[${batch.join(',')}]`, {
        headers: { Referer: 'https://music.163.com/' },
        timeout: 8000,
      })
      ;(r.body?.songs || []).forEach(s => {
        detailMap.set(String(s.id), {
          source: 'wy',
          songmid: String(s.id),
          name: s.name || '',
          singer: (s.artists || []).map(a => a.name).join('、'),
          albumName: s.album?.name || '',
          albumId: String(s.album?.id || ''),
          img: s.album?.picUrl || '',
          interval: formatPlayTime((s.duration || 0) / 1000),
        })
      })
    } catch {}
    // 避免触发限流
    if (i + 30 < trackIds.length) await new Promise(r => setTimeout(r, 150))
  }

  // 3. 缺失的用 ID 兜底
  const songs = trackIds.map(id2 => detailMap.get(id2) || {
    source: 'wy', songmid: id2, name: '', singer: '', albumName: '', img: '',
  })

  return {
    source: 'wy',
    name: playlist.name || '导入歌单',
    img: playlist.coverImgUrl || '',
    author: playlist.creator?.nickname || '',
    total: playlist.trackIds.length,
    songs,
  }
}

module.exports = { getPlaylist }
