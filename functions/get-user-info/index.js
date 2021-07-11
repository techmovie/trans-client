// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  traceUser: true
})
let db = null

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  cloud.updateConfig({
    env: wxContext.ENV
  })
  db = cloud.database()
  try {
    const res = await db.collection('user').where({
      openid: wxContext.OPENID
    }).limit(1).get()
    if (res.data.length < 1) {
      throw new Error('用户不存在')
    }
    const {unit, speedRefresh, nickName, avatarUrl, showTotalData} = res.data[0]
    return {
      code: 1,
      data: {
        unit,
        speedRefresh,
        nickName,
        avatarUrl,
        showTotalData
      },
      msg: ''
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
