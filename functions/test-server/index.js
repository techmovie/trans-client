// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  traceUser: true
})
const TransClient = require('@techmovie/trans-client-server').default
const crypto = require('crypto')
const APP_SECRET = '替换为自己的APP_SECRET'
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
const getServerList = async (openid) => {
  try {
    const res = await db.collection('serverList').where({
      openid,
      isDefault: true
    }).get()
    return res.data
  } catch (e) {
    throw new Error(e)
  }
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
const addServer = async (data) => {
  try {
    return await db.collection('serverList').add({
      data
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
const confirmAddServer = async (event, openid) => {
  const {userName, password, isDefault, alias, port, url, isHttps, isLocalNetwork} = event
  const type = event.type === 'qbittorrent' ? 'qbitorrent' : event.type
  delete event.confirm
  const encryptedData = encrypt(APP_SECRET, JSON.stringify({
    type,
    userName,
    password,
    port,
    url,
    isHttps,
    isLocalNetwork,
    urlAlias: getServerUrl(event)
  }))
  const serverList = await getServerList(openid)// 是否有已设置为默认的服务器
  if (serverList.length > 0 && isDefault) {
    const server = serverList[0]
    await editServer({
      id: server._id,
      openid: openid,
      isDefault: false
    })
  }
  const res = await addServer({
    encryptedData,
    isDefault: isDefault,
    alias,
    type,
    isLocalNetwork,
    openid: openid,
    createTime: db.serverDate()
  })
  return {
    code: 1,
    msg: '添加成功',
    data: {
      ...res,
      encryptedData
    }
  }
}
// 云函数入口函数
exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  cloud.updateConfig({
    env: wxContext.ENV
  })
  db = cloud.database()
  const {userName, password, confirm = false} = event
  const type = event.type === 'qbittorrent' ? 'qbitorrent' : event.type
  try {
    // 添加服务器到数据库
    if (confirm) {
      return confirmAddServer(event, wxContext.OPENID)
    }
    if (type === 'qbitorrent' && (!userName || !password)) {
      throw new Error('请填写用户名密码')
    }
    if (type === 'deluge' && (!password)) {
      throw new Error('请填写密码')
    }
    const serverData = {
      type,
      url: getServerUrl(event),
      username: userName,
      password
    }
    if (event.isLocalNetwork) {
      return {
        action: 'testServer',
        data: serverData
      }
    }
    let client = new TransClient(serverData)
    client = client.init()
    const res = await client.testServer()
    console.log(res)
    console.log('openid:', wxContext.OPENID)
    console.log('type:', type)
    console.log('test-server:', res)
    if (res.code === 401 || res.code === 403) {
      throw new Error('请检查用户名或密码')
    }
    if (res.msg.includes('openssl')) {
      throw new Error('HTTPS连接错误')
    }
    if (res.code === -1 && res.msg.includes('ENOTFOUND')) {
      throw new Error('URL地址不存在')
    }
    if (res.code === 301) {
      throw new Error('请检查URL或端口号')
    }
    return res
  } catch (error) {
    let msg = error.errorMessage || error.message
    console.log(error)
    if (msg.includes('timed out')) {
      msg = '连接超时'
    }
    return {
      code: -1,
      msg
    }
  }
}
