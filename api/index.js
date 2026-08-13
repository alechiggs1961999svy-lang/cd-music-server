// CD Music 聚合服务入口
// - Vercel 部署：每个 /api/*.js 是一个 serverless function
// - 本地调试：node api/index.js（自建 http 服务路由到相同逻辑）
const netease = require('../src/netEase')
const qq = require('../src/qq')
const playlist = require('../src/playlist')
const url = require('../src/url')

const SUPPORTED_SOURCES = ['wy', 'tx'] // 聚合层先支持网易云 + QQ（酷狗/酷我后补）

// 统一响应
const ok = data => ({ code: 0, data })
const fail = (msg, code = 1) => ({ code, message: msg })

async function handle(action, body) {
  switch (action) {
    case 'search': {
      const { source, keyword, page = 1, limit = 30 } = body || {}
      if (!keyword) return fail('缺少 keyword')
      if (source === 'wy') return ok({ list: await netease.search(keyword, page, limit) })
      if (source === 'tx') return ok({ list: await qq.search(keyword, page, limit) })
      return fail(`不支持的源: ${source}`)
    }
    case 'lyric': {
      const { source, musicId } = body || {}
      if (!musicId) return fail('缺少 musicId')
      if (source === 'wy') return ok({ lyric: await netease.lyric(musicId) })
      if (source === 'tx') return ok({ lyric: await qq.lyric(musicId) })
      return fail(`不支持的源: ${source}`)
    }
    case 'playlist': {
      const { id } = body || {}
      if (!id) return fail('缺少歌单 id')
      return ok(await playlist.getPlaylist(id))
    }
    case 'url': {
      const { source, musicId, quality } = body || {}
      if (!musicId) return fail('缺少 musicId')
      if (!SUPPORTED_SOURCES.includes(source) && !['kg', 'kw', 'mg'].includes(source)) return fail(`不支持的源: ${source}`)
      const result = await url.getUrl(source, musicId, quality)
      if (!result) return fail('获取播放地址失败')
      return ok(result)
    }
    default:
      return fail(`未知 action: ${action}`)
  }
}

// ---- Vercel serverless（POST /api）----
module.exports = async (req, res) => {
  try {
    let body = req.body || {}
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch {} }
    const action = req.query.action || body.action || 'search'
    const result = await handle(action, body)
    res.setHeader('Content-Type', 'application/json')
    res.status(200).json(result)
  } catch (e) {
    res.setHeader('Content-Type', 'application/json')
    res.status(500).json(fail(`服务错误: ${e.message}`))
  }
}

// ---- 本地调试（node api/index.js）----
if (require.main === module) {
  const http = require('http')
  const port = process.env.PORT || 7788
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, `http://localhost:${port}`)
      let body = {}
      if (req.method === 'POST') {
        let raw = ''
        for await (const chunk of req) raw += chunk
        try { body = JSON.parse(raw) } catch {}
      }
      const action = u.searchParams.get('action') || body.action || 'search'
      const result = await handle(action, { ...body, ...Object.fromEntries(u.searchParams) })
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(result))
    } catch (e) {
      res.setHeader('Content-Type', 'application/json')
      res.statusCode = 500
      res.end(JSON.stringify(fail(`服务错误: ${e.message}`)))
    }
  })
  server.listen(port, () => console.log(`CD Music server running at http://localhost:${port}`))
}
