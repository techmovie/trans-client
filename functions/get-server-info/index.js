// 云函数入口文件
const cloud = require('wx-server-sdk')
const APP_SECRET = '替换为自己的APP_SECRET'
const crypto = require('crypto')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  traceUser: true
})

const decrypt = (key, raw) => {
  try {
    raw = Buffer.from(raw, 'base64')

    const iv = raw.slice(0, 16)
    let rawData = raw.slice(16, raw.length)
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)

    let decoded = decipher.update(rawData, 'binary', 'utf8')
    decoded += decipher.final('utf8')

    return decoded
  } catch (error) {
    throw new Error(error.message)
  }
}
// 云函数入口函数
exports.main = async(event) => {
  const wxContext = cloud.getWXContext()
  cloud.updateConfig({
    env: wxContext.ENV
  })
  try {
    const {encryptedData} = event
    const rawData = decrypt(APP_SECRET, encryptedData)
    return JSON.parse(rawData)
  } catch (e) {
    throw new Error(e.message)
  }
}
