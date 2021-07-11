const cloud = require('wx-server-sdk')
const builder = require('xmlbuilder')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  traceUser: true
})

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const {params} = event
  cloud.updateConfig({
    env: wxContext.ENV
  })
  try {
    const data = builder.create(params, { encoding: 'UTF-8' }).end()
    return {
      data,
      code: 1
    }
  } catch (error) {
    return {
      msg: error.message,
      code: -1
    }
  }
}
