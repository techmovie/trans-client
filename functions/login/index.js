// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  traceUser: true
})
let db = null
const crypto = require('crypto')
const rp = require('request-promise')
const APP_SECRET = '替换为自己的APP_SECRET'
const APP_ID = 'wx75929fba3c9f82e6'

const encryptSha1 = (data) => {
  return crypto.createHash('sha1').update(data, 'utf8').digest('hex')
}

/*
* 判断用户是否已注册
* @param {any}
* @return
* */
const isRegister = async (openid) => {
  const res = await db.collection('user').where({
    openid
  }).get()
  console.log('isRegister:', res)
  return res.data.length > 0
}

/*
* 更新数据库
* @param {any}
* @return
* */
const addUser = async (openid) => {
  try {
    console.log('adding-user:', openid)
    return await db.collection('user').add({
      data: {
        openid,
        createTime: db.serverDate()
      }
    })
  } catch (e) {
    console.log('adduser failed', e)
    throw new Error(e)
  }
}
/*
* 未注册增加user
* @param {any}
* @return
* */
const updateUser = async({openid}) => {
  const isRegistered = await isRegister(openid)
  console.log('isRegistered:', isRegistered)
  if (!isRegistered) {
    const res = await addUser(openid)
    console.log('added-user:', res)
  }
}
cloud.init()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  cloud.updateConfig({
    env: wxContext.ENV
  })
  db = cloud.database()
  const code = event.code
  try {
    await updateUser({
      openid: wxContext.OPENID,
      unionid: wxContext.UNIONID})
    const res = await rp({
      url: 'https://api.weixin.qq.com/sns/jscode2session',
      qs: {
        appid: APP_ID,
        secret: APP_SECRET,
        js_code: code,
        grant_type: 'authorization_code'
      },
      json: true
    })
    if (res.errcode) {
      throw new Error(res.errmsg)
    }
    console.log('session:', res.session_key)
    return {
      code: 1,
      msg: '登录成功',
      data: {
        skey: encryptSha1(res.session_key)
      }
    }
  } catch (error) {
    console.log(error)
    return {
      code: -1,
      msg: '登录失败',
      data: null
    }
  }
}
