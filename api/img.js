// 封面图片代理：music.126.net 在部分手机（VPN/证书）加载失败，统一走自家域名
const { requestBuffer } = require('../src/http')

// 只允许代理已知音乐平台图床，防止被当开放代理滥用
const ALLOWED = /\.(music\.126\.net|gtimg\.cn|kugou\.com|kuwo\.cn)$/

module.exports = async (req, res) => {
  try {
    const url = req.query.url
    if (!url || typeof url !== 'string') { res.status(400).end(); return }
    const host = (() => { try { return new URL(url).hostname } catch { return '' } })()
    if (!ALLOWED.test(host)) { res.status(400).end(); return }

    const r = await requestBuffer(url, { timeout: 8000 })
    if (r.status !== 200 || !r.buffer || r.buffer.length === 0) { res.status(404).end(); return }

    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(200).send(r.buffer)
  } catch (e) {
    res.status(500).end()
  }
}
