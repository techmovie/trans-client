// 云函数入口文件
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const APP_SECRET = '替换为自己的APP_SECRET'

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  traceUser: true
})
let db = null

const encrypt = (key, raw) => {
  var iv = crypto.randomBytes(16)
  key = Buffer.from(key)

  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)

  let crypted = cipher.update(raw, 'utf8', 'binary')
  crypted += cipher.final('binary')
  crypted = Buffer.from(crypted, 'binary')

  // 拼接iv串
  let enc = Buffer.concat([iv, Buffer.from(crypted, 'base64')])
  enc = enc.toString('base64')

  return enc
}
const editServer = async (data) => {
  const {openid, id} = data
  try {
    delete data.openid
    delete data.id
    return await db.collection('serverList').where({
      openid,
      _id: id
    }).update({
      data: {
        ...data
      }
    })
  } catch (e) {
    throw new Error(e)
  }
}
const getServerUrl = (data) => {
  let protocol = data.isHttps ? 'https://' : 'http://'
  let {url, port} = data
  port = port ? ':' + port : ''
  if (url.endsWith('/')) {
    url = url.substr(0, url.length - 1)
    console.log(url)
  }
  if (/^(http|https):\/\/\w+/.test(url)) {
    protocol = ''
  }
  if (/.+(:\d+)$/.test(url)) {
    port = ''
  }
  console.log(url)
  if (/.+(\/)$/.test(url)) {
    url = url.substring(0, url.length - 1)
  }
  console.log(`${protocol}${url}${port}`)
  return `${protocol}${url}${port}`
}
// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  cloud.updateConfig({
    env: wxContext.ENV
  })
  db = cloud.database()
  const {userName, password, alias, id, port, url, isHttps, isLocalNetwork} = event
  const type = event.type === 'qbittorrent' ? 'qbitorrent' : event.type
  let isDefault = event.isDefault
  try {
    const encryptedData = encrypt(APP_SECRET, JSON.stringify({
      type,
      userName,
      password,
      port,
      url,
      isLocalNetwork,
      isHttps,
      urlAlias: getServerUrl(event)
    }))
    if (isDefault) {
      await db.collection('serverList').where({
        openid: wxContext.OPENID,
        isDefault: true
      }).update({
        data: {
          isDefault: false
        }
      })
    }
    const res = await editServer({
      encryptedData,
      isDefault,
      alias,
      type,
      id,
      isLocalNetwork,
      openid: wxContext.OPENID
    })
    return {
      code: 1,
      msg: '编辑成功',
      data: {
        ...res,
        encryptedData
      }
    }
  } catch (e) {
    console.log(e.message)
    return {
      code: -1,
      msg: '编辑失败'
    }
  }
}
