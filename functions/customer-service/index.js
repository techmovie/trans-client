// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  traceUser: true
})
const getMediaId = async (fileId) => {
  const res = await cloud.callFunction({
    name: 'upload-temp-image',
    data: {
      fileId
    }
  })
  return res.result
}
// 云函数入口函数
exports.main = async (event, context) => {
  const {Content} = event
  const wxContext = cloud.getWXContext()
  cloud.updateConfig({
    env: wxContext.ENV
  })

  console.log(event)
  try {
    const msg = Content ? `${Content}`.toLowerCase() : ''
    if (msg === 'transclient' || msg === '公众号' || msg === '2') {
      const res = await getMediaId('cloud://product-1gapq5os57c5165b.7072-product-1gapq5os57c5165b-1301060991/qrcode_for_gh_da481ad14724_344.jpg')
      await cloud.openapi.customerServiceMessage.send({
        touser: wxContext.OPENID,
        msgtype: 'image',
        image: {
          mediaId: res.mediaId
        }
      })
      console.log('公众号')
    } else if (msg === '1') {
      await cloud.openapi.customerServiceMessage.send({
        touser: wxContext.OPENID,
        msgtype: 'link',
        link: {
          title: '加入TG群组',
          description: '反馈问题，获取最近更新',
          thumb_url: 'https://i.loli.net/2020/04/25/f2jwGndvxDyUMTQ.png',
          url: 'https://t.me/joinchat/ILYS-BvdHjxEiYC21-Tt4A'
        }
      })
      console.log('TG群组')
    } else if (msg === '0') {
      return {
        MsgType: 'transfer_customer_service',
        ToUserName: wxContext.OPENID,
        FromUserName: 'gh_1be3c7972ccd',
        CreateTime: parseInt(+new Date() / 1000)
      }
    } else if (msg === '3') {
      const res = await getMediaId('cloud://product-1gapq5os57c5165b.7072-product-1gapq5os57c5165b-1301060991/IMG_0080.jpeg')
      await cloud.openapi.customerServiceMessage.send({
        touser: wxContext.OPENID,
        msgtype: 'image',
        image: {
          mediaId: res.mediaId
        }
      })
      console.log('微信群')
    } else {
      await cloud.openapi.customerServiceMessage.send({
        touser: wxContext.OPENID,
        msgtype: 'text',
        text: {
          content: '您好,欢迎使用TransClient。 \n\n 回复0:接入人工客服 \n 回复1:获取Telegram群组链接 \n 回复2:获取公众号二维码 \n 回复3:加入微信群'
        }
      })
    }

    return 'success'
  } catch (error) {
    console.log(error)
    return error
  }
}
