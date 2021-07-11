// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  traceUser: true
})

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const {fileId} = event
  cloud.updateConfig({
    env: wxContext.ENV
  })
  const fileData = await cloud.downloadFile({
    fileID: fileId
  })
  const buffer = fileData.fileContent
  const res = await cloud.openapi.customerServiceMessage.uploadTempMedia({
    type: 'image',
    media: {
      contentType: 'image/jpg',
      value: buffer
    }
  })
  return res
}
