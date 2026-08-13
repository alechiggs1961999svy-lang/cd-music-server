// 网易云加密 — 纯 Node 版，参照 Binaryify/NeteaseCloudMusicApi 的 crypto.js
// （洛雪 RN 版引用了它；RN 原生模块内部有 base64 解码，Node 版直接按 utf8 处理 key）
const crypto = require('crypto')

const iv = '0102030405060708'
const presetKey = '0CoJUm6Qyw8W8jud'
const linuxapiKey = 'rFgB&h#%2?^eDg:Q'
const publicKey = '-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB\n-----END PUBLIC KEY-----'
const eapiKey = 'e82ckenh8dichen8'

const aesEncrypt = (buffer, mode, key, iv) => {
  const cipher = crypto.createCipheriv(mode, key, iv)
  return Buffer.concat([cipher.update(buffer), cipher.final()])
}

const aesDecrypt = (buffer, mode, key, iv) => {
  const decipher = crypto.createDecipheriv(mode, key, iv)
  return Buffer.concat([decipher.update(buffer), decipher.final()])
}

const rsaEncrypt = (buffer, key) => {
  buffer = Buffer.concat([Buffer.alloc(128 - buffer.length), buffer])
  return crypto.publicEncrypt({ key, padding: crypto.constants.RSA_NO_PADDING }, buffer)
}

// weapi（备用）
const weapi = object => {
  const text = JSON.stringify(object)
  const secretKey = String(Math.random()).substring(2, 18)
  return {
    params: aesEncrypt(
      Buffer.from(aesEncrypt(Buffer.from(text).toString('base64'), 'aes-128-cbc', presetKey, iv).toString('base64')),
      'aes-128-cbc',
      secretKey,
      iv,
    ),
    encSecKey: rsaEncrypt(Buffer.from(secretKey).reverse(), publicKey).toString('hex'),
  }
}

// linuxapi（歌单详情）
const linuxapi = object => {
  const text = JSON.stringify(object)
  return {
    eparams: aesEncrypt(
      Buffer.from(text).toString('base64'),
      'aes-128-ecb',
      linuxapiKey,
      '',
    ).toString('hex').toUpperCase(),
  }
}

// eapi（搜索）
const eapi = (url, object) => {
  const text = typeof object === 'object' ? JSON.stringify(object) : object
  const message = `nobody${url}use${text}md5forencrypt`
  const digest = crypto.createHash('md5').update(message).digest('hex')
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`
  return {
    params: aesEncrypt(
      Buffer.from(data).toString('base64'),
      'aes-128-ecb',
      eapiKey,
      '',
    ).toString('hex').toUpperCase(),
  }
}

module.exports = { weapi, eapi, linuxapi }
