// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  traceUser: true
})
let db = null
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  cloud.updateConfig({
    env: wxContext.ENV
  })
  db = cloud.database()
  try {
    const {alias, id} = event
    const res = await db.collection('serverList').where({
      openid: wxContext.OPENID,
      alias
    }).get()
    if (res.data.length > 0) {
      const server = res.data[0]
      if (server._id !== id) {
        throw new Error('已有重复别名')
      }
    }
    return {
      code: 1,
      msg: '请求成功',
      data: null
    }
  } catch (error) {
    return {
      code: -1,
      msg: error.message,
      data: null
    }
  }
}
