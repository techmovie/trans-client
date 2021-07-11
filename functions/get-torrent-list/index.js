// 云函数入口文件
const cloud = require('wx-server-sdk')
const TransClient = require('@techmovie/trans-client-server').default
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  traceUser: true
})
const APP_SECRET = '替换为自己的APP_SECRET'

const decrypt = (key, raw) => {
  try {
    raw = Buffer.from(raw, 'base64')

    const iv = raw.slice(0, 16)
    let rawData = raw.slice(16, raw.length)
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)

    let decoded = decipher.update(rawData, 'binary', 'utf8')
    decoded += decipher.final('utf8')

    return JSON.parse(decoded)
  } catch (error) {
    throw new Error(error.message)
  }
}
// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  cloud.updateConfig({
    env: wxContext.ENV
  })
  try {
    const {page = 1, reverse = false, filter = 'all', sort = 'added_on'} = event
    const serverInfo = decrypt(APP_SECRET, event.encryptedData)
    const {type, urlAlias, userName, password} = serverInfo
    const serverData = {
      type,
      url: urlAlias,
      username: userName,
      password
    }
    if (serverInfo.isLocalNetwork) {
      return {
        action: 'getTorrentList',
        params: {
          page,
          reverse,
          filter,
          sort
        },
        data: serverData
      }
    } else {
      let client = new TransClient(serverData)
      client = client.init()
      const res = await client.getTorrentList({
        page,
        reverse,
        filter
      })
      return res
    }
  } catch (error) {
    console.log(error.message)
    return {
      code: -1,
      msg: error.message,
      data: null
    }
  }
}
