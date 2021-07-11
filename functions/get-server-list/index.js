// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  traceUser: true
})

let db = null

/*
* 服务器列表
* @param {any}
* @return
* */
const getServerList = async (data) => {
  try {
    const res = await db.collection('serverList')
    .where({
      openid: data.openid
    })
    .orderBy('createTime', 'desc')
    .get()
    const servers = res.data
    servers.forEach((server, index) => {
      if (server.isDefault) {
        servers.splice(index, 1)
        servers.unshift(server)
      }
    })
    return {
      code: 1,
      data: servers || [],
      msg: ''
    }
  } catch (e) {
    throw new Error(e)
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
    const res = await getServerList({
      openid: wxContext.OPENID
    })
    return res
  } catch (error) {
    console.log(error.message)
    return {
      code: -1,
      msg: error.message,
      data: null
    }
  }
}
