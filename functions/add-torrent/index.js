// 云函数入口文件
const cloud = require('wx-server-sdk')
const rp = require('request-promise')
const fs = require('fs')
const path = require('path')
const TransClient = require('@techmovie/trans-client-server').default
const crypto = require('crypto')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  traceUser: true
})

const APP_SECRET = '替换为自己的APP_SECRET'

const decrypt = (key, raw) => {
  try {
    raw = Buffer.from(raw, 'base64')

    const iv = raw.slice(0, 16)
    let rawData = raw.slice(16, raw.length)
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)

    let decoded = decipher.update(rawData, 'binary', 'utf8')
    decoded += decipher.final('utf8')

    return JSON.parse(decoded)
  } catch (error) {
    throw new Error(error.message)
  }
}
const getFileBufferFromUrl = (url) => {
  return new Promise((resolve, reject) => {
    try {
      const httpStream = rp({
        method: 'GET',
        url
      })
      const fileName = `${new Date().getTime()}.torrent`
      const writeStream = fs.createWriteStream(path.join('/tmp', fileName))
      httpStream.pipe(writeStream)
      const fileBuffer = []
      httpStream.on('data', (chunk) => {
        fileBuffer.push(chunk)
      })
      writeStream.on('close', async () => {
        resolve({
          file: Buffer.concat(fileBuffer),
          fileName
        })
      })
    } catch (error) {
      reject(error)
    }
  })
}
// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  cloud.updateConfig({
    env: wxContext.ENV
  })
  try {
    const {type, url, paused, savePath, upLimit, dlLimit, fileId, skipCheck = false, rootFolder = false} = event
    const serverInfo = decrypt(APP_SECRET, event.encryptedData)
    const {type: serverType, urlAlias, userName, password} = serverInfo
    const serverData = {
      type: serverType,
      url: urlAlias,
      username: userName,
      password
    }
    let client = new TransClient(serverData)
    client = client.init()
    if (type === 'url') {
      if (serverType === 'utorrent') {
        console.log('ut url上传')
        const {file, fileName} = await getFileBufferFromUrl(url)
        if (serverInfo.isLocalNetwork) {
          return {
            action: 'addTorrentFile',
            params: {
              torrent: file.toString('base64'),
              paused,
              savepath: savePath
            },
            data: serverData
          }
        }
        await client.addTorrentFile({
          torrent: file,
          paused,
          savepath: savePath
        })
        fs.unlinkSync(path.join('/tmp', fileName))
      } else {
        console.log('url上传')
        if (serverInfo.isLocalNetwork) {
          return {
            action: 'addTorrentsUrl',
            params: {
              urls: url,
              paused,
              skipCheck,
              rootFolder,
              savepath: savePath,
              upLimit: upLimit > 0 ? upLimit * 1000 : -1,
              dlLimit: dlLimit > 0 ? dlLimit * 1000 : -1
            },
            data: serverData
          }
        }
        await client.addTorrentsUrl({
          urls: url,
          paused,
          skipCheck,
          rootFolder,
          savepath: savePath,
          upLimit: upLimit > 0 ? upLimit * 1000 : -1,
          dlLimit: dlLimit > 0 ? dlLimit * 1000 : -1
        })
      }
    } else {
      if (serverInfo.isLocalNetwork) {
        return {
          action: 'addTorrentFile',
          params: {
            fileId: fileId,
            paused,
            skipCheck,
            rootFolder,
            savepath: savePath,
            upLimit: upLimit > 0 ? upLimit * 1000 : -1,
            dlLimit: dlLimit > 0 ? dlLimit * 1000 : -1
          },
          data: serverData
        }
      }
      const fileData = await cloud.downloadFile({
        fileID: fileId
      })
      console.log('文件上传:', fileId)
      const buffer = fileData.fileContent
      await cloud.deleteFile({
        fileList: [fileId]
      })
      await client.addTorrentFile({
        torrent: Buffer.from(buffer, 'base64'),
        paused,
        skipCheck,
        rootFolder,
        savepath: savePath,
        upLimit: upLimit > 0 ? upLimit * 1000 : -1,
        dlLimit: dlLimit > 0 ? dlLimit * 1000 : -1
      })
    }
    return {
      code: 1,
      msg: '添加成功'
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
