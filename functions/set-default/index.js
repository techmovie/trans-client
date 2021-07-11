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
  const {id, isDefault} = event
  try {
    await db.collection('serverList').where({
      openid: wxContext.OPENID,
      isDefault: true
    }).update({
      data: {
        isDefault: false
      }
    })
    await db.collection('serverList').where({
      openid: wxContext.OPENID,
      _id: id
    }).update({
      data: {
        isDefault
      }
    })
    return {
      code: 1,
      msg: '编辑成功'
    }
  } catch (e) {
    console.log(e)
    return {
      code: -1,
      msg: '编辑失败'
    }
  }
}
