import logger from './log'
import TransClient from '../server'
const api = (funcName, data, options = {}) => {
  const defaults = {
    needAuth: false,
    hideLoading: false
  }
  const option = {
    ...defaults,
    ...options
  }
  if (!option.hideLoading) {
    wx.showLoading({mask: true})
  }
  return new Promise((resolve, reject) => {
    const params = {
      ...data
    }
    if (option.needAuth) {
      if (!params.encryptedData) {
        reject(new Error('缺少服务器信息'))
      }
    }
    wx.cloud.callFunction({
      name: funcName,
      data: params
    }).then(res => {
      const result = res.result
      if (result.code === -1 || result.code >= 400) {
        throw new Error(result.msg)
      }

      if (!option.hideLoading && !result.action) {
        wx.hideLoading()
      }
      // 局域网返回字段中包含action
      if (result.action) {
        sendLocalRequest(result, resolve, reject)
      } else {
        resolve(result)
      }
    }).catch(error => {
      if (!option.hideLoading) {
        wx.hideLoading()
      }
      logger.error(error)
      if (error.errMsg && (error.errMsg.includes('timeout') || error.errMsg.includes('timed out'))) {
        reject(new Error('连接超时'))
      }
      const msg = error.errMsg || error.message
      const message = msg.length > 40 ? '服务器异常' : msg
      reject(new Error(message))
    })
  })
}
const sendLocalRequest = async (result, resolve, reject) => {
  let client = new TransClient(result.data)
  client = client.init()
  try {
    const res = await client[result.action](result.params || {})
    if (res.code === -1 || res.code >= 400) {
      throw new Error(res.msg)
    }
    console.log(res)
    resolve(res)
  } catch (error) {
    console.log('sendLocalRequest', error)
    const msg = error.errMsg || error.message
    if (msg && (msg.includes('timed out') || msg.includes('timeout'))) {
      reject(new Error('连接超时'))
    }
    reject(new Error(msg))
  } finally {
    wx.hideLoading()
  }
}
const cookieParse = (cookie) => {
  const cookieData = cookie.split(';')[0].split('=')
  return {
    key: cookieData[0],
    value: cookieData[1]
  }
}

const base64Encode = (string) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
  let result = ''

  var i = 0
  do {
    let a = string.charCodeAt(i++)
    let b = string.charCodeAt(i++)
    let c = string.charCodeAt(i++)

    a = a || 0
    b = b || 0
    c = c || 0

    let b1 = (a >> 2) & 0x3F
    let b2 = ((a & 0x3) << 4) | ((b >> 4) & 0xF)
    let b3 = ((b & 0xF) << 2) | ((c >> 6) & 0x3)
    let b4 = c & 0x3F

    if (!b) {
      b3 = b4 = 64
    } else if (!c) {
      b4 = 64
    }

    result += characters.charAt(b1) + characters.charAt(b2) + characters.charAt(b3) + characters.charAt(b4)
  } while (i < string.length)

  return result
}
const makeFormdata = (obj = {}) => {
  let result = ''
  for (let name of Object.keys(obj)) {
    let value = obj[name]
    result +=
    '\r\n--transclient' +
    '\r\nContent-Disposition: form-data; name="' + name + '"' +
    '\r\n' +
    '\r\n' + value
  }
  return result + '\r\n--transclient--'
}

export {
  api,
  cookieParse,
  makeFormdata,
  base64Encode
}
