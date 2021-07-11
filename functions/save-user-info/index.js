// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  traceUser: true
})
let db = null
const saveUserInfo = async (data) => {
  try {
    await db.collection('user').where({
      openid: data.openid
    }).update({
      data: {
        ...data.userinfo
      }
    })
  } catch (error) {
    throw new Error(error)
  }
}
// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  cloud.updateConfig({
    env: wxContext.ENV
  })
  db = cloud.database()
  try {
    const userData = event.userinfo.data
    const userinfo = userData || event.userinfo
    await saveUserInfo({
      openid: wxContext.OPENID,
      userinfo
    })
    return {
      code: 1,
      msg: '',
      data: null
    }
  } catch (error) {
    console.log(error.message)
    return {
      code: -1,
      msg: '服务器异常',
      data: null
    }
  }
}
