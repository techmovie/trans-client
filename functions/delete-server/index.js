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
    const res = await db.collection('serverList')
    .where({
      openid: wxContext.OPENID,
      _id: event.id
    }).remove()
    return {
      code: 1,
      msg: '删除成功',
      data: res.stats
    }
  } catch (error) {
    console.log(error.message)
    return {
      code: -1,
      msg: '删除失败,请重试',
      data: null
    }
  }
}
