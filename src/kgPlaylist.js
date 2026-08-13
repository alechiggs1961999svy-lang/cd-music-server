// 酷狗公开歌单解析（免登录）
// 1. 普通歌单（specialid 数字）→ www2.kugou HTML 正则提取
// 2. 合集（collection）→ 需签名接口（签名算法可能已失效，失败给友好提示）
// 3. 短链接 t1.kugou.com → 重定向拿真实歌单
const crypto = require('crypto')
const { request, formatPlayTime, cacheGet, cacheSet } = require('./http')

const toMD5 = str => crypto.createHash('md5').update(str).digest('hex')

// 酷狗 web 签名（LX 算法，可能已随酷狗更新失效）
const signatureParams = (params, platform = 'android') => {
  const keyparam = platform === 'web' ? 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt' : 'OIlwieks28dk2k092lksi2UIkp'
  const sorted = params.split('&').sort().join('')
  return toMD5(keyparam + sorted + keyparam)
}

const cover = unionCover => {
  if (!unionCover) return ''
  return unionCover.replace('{size}', '150').replace(/^http:\/\//, 'https://')
}

// 从链接/重定向提取歌单标识
const extractId = raw => {
  const id = String(raw).trim()
  // 合集 global_specialid / global_collection_id
  const g1 = id.match(/global_specialid=([\w_-]+)/)
  if (g1) return { type: 'collection', id: g1[1] }
  const g2 = id.match(/global_collection_id=([\w_-]+)/)
  if (g2) return { type: 'collection', id: g2[1] }
  // 普通歌单
  const m1 = id.match(/(?:special|plist)\/(?:single\/)?(\d+)/)
  if (m1) return { type: 'special', id: m1[1] }
  const m2 = id.match(/[?&]id=(\d+)/)
  if (m2) return { type: 'special', id: m2[1] }
  return { type: 'special', id }
}

// 短链接重定向（t1.kugou.com 等）
async function resolveShortLink(rawId) {
  if (!/t1\.kugou\.com|t\.kugou\.com|\.kugou\.com\/\w{8,}/.test(rawId)) return rawId
  try {
    const res = await request(rawId, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 })
    // request 已跟随重定向，body 可能是重定向后的内容；用原始 fetch 拿 Location 更可靠
    return rawId
  } catch {
    return rawId
  }
}

// 普通歌单（www2.kugou HTML）
async function getSpecialPlaylist(id) {
  const url = `http://www2.kugou.kugou.com/yueku/v9/special/single/${id}-5-9999.html`
  const res = await request(url, { headers: { Referer: 'https://www.kugou.com/' }, timeout: 10000 })
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
  return {
    source: 'kg',
    name: nameMatch ? nameMatch[1] : '酷狗歌单',
    img: nameMatch ? nameMatch[2] : '',
    author: '',
    total: songs.length,
    songs,
  }
}

// 合集（collection，签名接口）
async function getCollectionPlaylist(globalSpecialId) {
  const now = Date.now()
  // 1. 歌单信息
  const params1 = `appid=1058&specialid=0&global_specialid=${globalSpecialId}&format=jsonp&srcappid=2919&clientver=20000&clienttime=${now}&mid=${now}&uuid=${now}&dfid=-`
  const infoRes = await request(
    `https://mobiles.kugou.com/api/v5/special/info_v2?${params1}&signature=${signatureParams(params1, 'web')}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X)',
        Referer: 'https://m3ws.kugou.com/share/index.php',
        mid: String(now),
        dfid: '-',
        clienttime: String(now),
      },
      timeout: 8000,
    },
  )
  const infoData = infoRes.body?.data
  if (!infoData || infoData.songcount == null) {
    throw new Error('酷狗合集签名接口已失效，暂不支持合集导入，请改用普通歌单链接')
  }

  // 2. 歌曲列表（分页）
  const limit = 300
  const pages = Math.ceil(infoData.songcount / limit)
  let songList = []
  for (let page = 1; page <= pages; page++) {
    const params2 = `appid=1058&global_specialid=${globalSpecialId}&specialid=0&plat=0&version=8000&page=${page}&pagesize=${limit}&srcappid=2919&clientver=20000&clienttime=${now}&mid=${now}&uuid=${now}&dfid=-`
    const songRes = await request(
      `https://mobiles.kugou.com/api/v5/special/song_v2?${params2}&signature=${signatureParams(params2, 'web')}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X)',
          Referer: 'https://m3ws.kugou.com/share/index.php',
          mid: String(now),
          dfid: '-',
          clienttime: String(now),
        },
        timeout: 8000,
      },
    )
    const list = songRes.body?.data?.info || []
    songList = songList.concat(list)
  }

  const songs = songList.map(item => {
    // song_v2 返回 filename 格式 "歌手 - 歌名"
    const parts = String(item.filename || '').split(' - ')
    const name = parts.length > 1 ? parts.slice(1).join(' - ') : (item.filename || item.songname || '')
    const singer = parts.length > 1 ? parts[0] : ''
    return {
      source: 'kg',
      songmid: item.hash || '',
      name,
      singer,
      albumName: item.album_name || '',
      albumId: String(item.album_id || ''),
      img: cover(item.trans_param?.union_cover || ''),
      interval: formatPlayTime(item.duration || 0),
    }
  })

  return {
    source: 'kg',
    name: infoData.specialname || '酷狗合集',
    img: cover(infoData.imgurl || ''),
    author: infoData.nickname || '',
    total: songs.length,
    songs,
  }
}

async function getPlaylist(rawId) {
  const cacheKey = `kg_${rawId}`
  const cached = cacheGet('playlist', cacheKey)
  if (cached) return cached

  // 短链接：先重定向拿真实 URL（取 Location）
  let resolved = rawId
  if (/t1\.kugou\.com/.test(rawId)) {
    try {
      const resp = await fetch(rawId, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' } })
      const loc = resp.headers.get('location')
      if (loc) resolved = loc
    } catch {}
  }

  const { type, id } = extractId(resolved)

  let result
  if (type === 'collection') {
    result = await getCollectionPlaylist(id)
  } else {
    result = await getSpecialPlaylist(id)
  }

  cacheSet('playlist', cacheKey, result)
  return result
}

module.exports = { getPlaylist }
