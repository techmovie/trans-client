import wepy from 'wepy'
import {base64Encode, cookieParse} from '../../utils'
export default class Utorrent {
  constructor (options) {
    this.config = {
      path: '/gui/',
      ...options
    }
    this.auth = ''
    this.cookie = ''
  }

  async request (params = {}, method = 'GET', options = {}) {
    const { url, username, password, path } = this.config
    const requestUrl = url + path
    const auth = this.auth
    try {
      if (!auth) {
        const data = await this.testServer()
        if (data.code === -1 || data.code > 200) {
          throw new Error('身份验证失败,请检查用户名或密码')
        }
      }
      const authorization = this.getAuthorization(username, password)
      const requestOptions = {
        method: method,
        url: requestUrl,
        timeout: 20000,
        header: {
          Authorization: 'Basic ' + authorization,
          Cookie: `GUID=${this.cookie || ''}`
        },
        data: {
          token: this.auth,
          ...params
        }
      }

      const res = await wepy.request({ ...requestOptions })

      const resBody = res.data
      if (resBody) {
        return {
          code: res.statusCode || 1,
          msg: '请求成功',
          data: resBody
        }
      } else {
        throw new Error(resBody)
      }
    } catch (error) {
      console.log(error)
      return {
        code: error.statusCode || -1,
        msg: error.errMsg || error.message,
        data: error
      }
    }
  }

  getAuthorization (username, password) {
    return base64Encode(`${username || ''}:${password || ''}`)
  }

  async testServer () {
    const { url, username, password, path } = this.config
    const requestUrl = url + path + 'token.html'
    const auth = this.getAuthorization(username, password)
    const options = {
      method: 'GET',
      timeout: 13000,
      url: requestUrl,
      header: {
        Authorization: 'Basic ' + auth
      }
    }
    try {
      const res = await wepy.request(options)
      if (!res.cookies || !res.cookies.length) {
        throw new Error('身份验证失败')
      }
      const cookie = cookieParse(res.cookies[0])
      if (!cookie || cookie.key !== 'GUID') {
        throw new Error('登录失败')
      }
      this.cookie = cookie.value
      const match = res.data.match(/>([^<]+)</)
      if (match) {
        this.auth = match[match.length - 1]
        return {
          code: 0,
          msg: '授权成功',
          data: {
            auth: this.auth
          }
        }
      } else {
        throw new Error('身份验证失败,请检查用户名或密码')
      }
    } catch (err) {
      throw new Error(err.errMsg || err.message)
    }
  }

  async getTorrentList (params = {}) {
    const {
      sort = 'added_on',
      page = 1,
      pageSize = 20,
      reverse = true,
      filter = 'all'
    } = params
    const res = await this.request({
      list: 1
    })
    let result = null
    if (res.code === -1 || !res.data || res.code > 200) {
      result = res
    } else {
      const allListData = res.data.torrents
      if (params.id) {
        return allListData.find(item => {
          return item[0] === params.id
        })
      }
      const transformData = allListData.map((item) => {
        return this.transformTorrentList(item)
      })
      const orderList = this.reOrderList(transformData, {
        sort,
        reverse,
        page,
        pageSize,
        filter
      })
      result = {
        code: 1,
        msg: '请求成功',
        data: orderList
      }
    }
    return result
  }

  filterList (list, filterKey) {
    let result = []
    if (filterKey === 'all') {
      result = list
    } else if (filterKey === 'active') {
      result = list.filter((item) => item.dlSpeed > 0 || item.upSpeed > 0)
    } else {
      result = list.filter((item) => item.state === filterKey)
    }
    return result
  }

  getTimeString (time) {
    return new Date(time).getTime()
  }

  reOrderList (list, options) {
    const { sort, reverse, page, pageSize, filter } = options
    // 先筛选 后排序
    const filterList = this.filterList(list, filter)
    // 默认从小到大排序
    filterList.sort((item, other) => {
      if (sort === 'added_on') {
        const pre = this.getTimeString(item.addOn)
        const last = this.getTimeString(other.addOn)
        if (pre > last) {
          return reverse ? -1 : 1
        }
        if (pre < last) {
          return reverse ? 1 : -1
        }
      }
      if (item[sort] > other[sort]) {
        return reverse ? -1 : 1
      }
      if (item[sort] < other[sort]) {
        return reverse ? 1 : -1
      }
    })
    const pageList =
      pageSize > 0
        ? filterList.slice((page - 1) * pageSize, page * pageSize)
        : filterList
    return pageList
  }

  transformTorrentList (torrent) {
    const torrentStatus = torrent[21]
    let state = ''
    let stateText = ''
    if (torrentStatus.includes('Downloading')) {
      state = 'downloading'
      stateText = '下载'
    }
    if (torrentStatus.includes('Queued')) {
      state = 'queued'
      stateText = '等待'
    }
    if (
      torrentStatus.includes('Paused') ||
      torrentStatus.includes('Finished') ||
      torrentStatus.includes('Stopped')
    ) {
      state = 'paused'
      stateText = '暂停'
    }
    if (torrentStatus.includes('Checked')) {
      state = 'checking'
      stateText = '校验'
    }
    if (torrentStatus.includes('Error')) {
      state = 'error'
      stateText = '错误'
    }
    if (torrentStatus.includes('Seeding')) {
      state = 'seeding'
      stateText = '做种'
    }
    const result = {
      state,
      stateText,
      addOn: torrent[23] * 1000,
      completeOn: torrent[24] * 1000,
      downloadDataLeft: torrent[18],
      tag: torrent[11],
      completedData: torrent[5],
      dlSpeed: torrent[9],
      downloadedData: torrent[5],
      uploadedData: torrent[6],
      upSpeed: torrent[8],
      eta: torrent[10],
      id: torrent[0],
      name: torrent[2],
      progress: torrent[4] / 1000,
      ratio: torrent[7] / 1000,
      savePath: torrent[26],
      size: torrent[3],
      totalSize: undefined,
      tracker: undefined
    }
    return result
  }

  async getClientInfo () {
    await this.testServer()
    const dirData = await this.request({
      action: 'list-dirs'
    })
    let listData = await this.getTorrentList({
      filter: 'all',
      pageSize: -1
    })
    listData = listData.data
    let uploadedData = 0
    let downloadedData = 0
    let upSpeed = 0
    let dlSpeed = 0
    const tagList = []
    listData.forEach((item) => {
      upSpeed += item.upSpeed
      dlSpeed += item.dlSpeed
      uploadedData += item.uploadedData
      downloadedData += item.downloadedData
      if (item.tag && !tagList.includes(item.tag)) {
        tagList.push(item.tag)
      }
    })
    const freeSpace =
      dirData.data['download-dirs'][0].available * Math.pow(10, 6)
    return {
      code: 1,
      data: {
        uploaded: uploadedData,
        downloaded: downloadedData,
        upSpeed,
        dlSpeed,
        freeSpace,
        totalDownloaded: downloadedData,
        totalUploaded: uploadedData,
        tags: tagList
      },
      msg: '请求成功'
    }
  }

  async getClientData (params) {
    this.auth = params.auth || ''
    const dirData = await this.request({
      action: 'list-dirs'
    })
    const list = await this.request(
      {
        cid: params.cid || 0,
        list: 1
      }
    )
    const torrentList = list.data.torrents.map(torrent => {
      return this.transformTorrentList(torrent)
    })
    const transInfo = await this.request(
      {
        action: 'getxferhist'
      }
    )
    const uploadedData = transInfo.data.transfer_history.daily_upload.reduce((pre, cur) => {
      return pre + cur
    })
    const downloadedData = transInfo.data.transfer_history.daily_download.reduce((pre, cur) => {
      return pre + cur
    })
    let upSpeed = 0; let dlSpeed = 0
    const tagList = []
    torrentList.forEach(item => {
      upSpeed += item.upSpeed
      dlSpeed += item.dlSpeed
      if (item.tag && !tagList.includes(item.tag)) {
        tagList.push(item.tag)
      }
    })
    const freeSpace = dirData.data['download-dirs'][0].available * Math.pow(10, 6)
    const removedTorrentList = list.data.torrentm || []
    const serverState = {
      uploaded: uploadedData,
      downloaded: downloadedData,
      upSpeed,
      dlSpeed,
      freeSpace,
      totalDownloaded: downloadedData,
      totalUploaded: uploadedData,
      tags: tagList
    }
    const returnData = {
      rid: list.data.torrentc,
      tagList,
      serverInfo: serverState,
      removedTagList: [],
      torrents: torrentList,
      removedTorrents: removedTorrentList
    }
    return {
      code: 1,
      msg: '请求成功',
      data: returnData
    }
  }

  async pauseTorrent (params) {
    const res = await this.request({
      action: 'pause',
      hash: params.id
    })
    return res
  }

  async resumeTorrent (params) {
    const res = await this.request({
      action: 'start',
      hash: params.id
    })
    return res
  }

  async getDefaultSavePath (params) {
    return {
      code: 1,
      data: '',
      msg: '请求成功'
    }
  }

  async deleteTorrent ({ id, deleteFile = true }) {
    const res = await this.request({
      action: deleteFile ? 'removedata' : 'remove',
      hash: id
    })
    return res
  }

  async getExtraInfo (id) {
    const res = await this.request({
      action: 'getprops',
      hash: id
    })
    const info = res.data.props[0]
    return {
      tracker: info.trackers,
      dlLimit: info.dlrate > 0 ? info.dlrate : -1,
      upLimit: info.ulrate > 0 ? info.ulrate : -1
    }
  }

  async getTorrentInfo (id) {
    await this.testServer()
    const extraInfo = await this.getExtraInfo(id)
    const torrentInfo = await this.getTorrentList({ id })
    return {
      code: 1,
      data: {
        ...extraInfo,
        ...this.transformTorrentList(torrentInfo)
      }
    }
  }

  async recheck (params) {
    const res = await this.request({
      action: 'recheck',
      hash: params.id
    })
    return res
  }

  async setDlLimit (params) {
    const res = await this.request({
      action: 'setprops',
      hash: params.id,
      s: 'dlrate',
      v: parseInt(params.limit) * 1000 || -1
    })
    return res
  }

  async setUpLimit (params) {
    const res = await this.request({
      action: 'setprops',
      hash: params.id,
      s: 'ulrate',
      v: parseInt(params.limit) * 1000 || -1
    })
    return res
  }

  async setTag (params) {
    const res = await this.request({
      action: 'setprops',
      s: 'label',
      hash: params.id,
      v: params.tags
    })
    return res
  }

  async addTorrentFile (params) {
    await this.testServer()
    const {username, password, url, path} = this.config
    const authorization = this.getAuthorization(username, password)
    const requestUrl = url + path
    const defaults = {
      savepath: '',
      category: '',
      paused: false,
      upLimit: -1,
      dlLimit: -1
    }
    const reqParams = {
      ...defaults,
      ...params
    }
    if (reqParams.fileId) {
      delete reqParams.fileId
    }
    if (reqParams.torrent) {
      const filePath = wx.env.USER_DATA_PATH + '/ut.torrent'
      wx.getFileSystemManager().writeFileSync(filePath, reqParams.torrent, 'base64')
      params.fileId = filePath
    }
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: requestUrl + `?action=add-file&path=${reqParams.savepath}&token=${this.auth}`,
        filePath: params.fileId,
        name: 'torrent_file',
        header: {
          Authorization: 'Basic ' + authorization,
          Cookie: `GUID=${this.cookie || ''}`
        },
        success(res) {
          const data = JSON.parse(res.data)
          if (data.error) {
            throw new Error(data.error)
          }
          resolve({
            code: 1,
            msg: '上传成功'
          })
        },
        fail(error) {
          console.log(JSON.stringify(error))
          reject(new Error(error))
        },
        complete() {
          if (reqParams.torrent) {
            wx.getFileSystemManager().unlinkSync(params.fileId)
          }
        }
      })
    })
  }
}
