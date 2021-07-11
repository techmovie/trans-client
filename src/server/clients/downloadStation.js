import wepy from 'wepy'

export default class Ds {
  constructor (options) {
    this.config = {
      ...options,
      path: '/webapi'
    }
    this.auth = ''
    this.authType = ''
  }

  async request (api, params = {}, method = 'GET', options = {}) {
    const { url, path } = this.config
    const auth = this.auth
    try {
      if (!auth) {
        const data = await this.testServer()
        if (data.code === -1) {
          throw new Error(data.msg)
        }
      }
      const requestOptions = {
        method: method,
        url: url + path + api,
        data: params,
        timeout: 20000,
        header: {
          Cookie: `id=${this.auth}`
        }
      }
      const res = await wepy.request(requestOptions)
      let resBody = res.data
      if (!resBody.success) {
        console.log(resBody)
        throw new Error(resBody.error.code)
      }
      return {
        code: res.statusCode || 1,
        msg: '请求成功',
        data: resBody.data
      }
    } catch (err) {
      console.log(err.message)
      return {
        code: err.statusCode || -1,
        msg: err.errMsg || err.message,
        data: null
      }
    }
  }

  async testServer () {
    const { url, path, username, password } = this.config
    const requestUrl = url + path + '/auth.cgi'
    try {
      const requestOptions = {
        method: 'GET',
        url: requestUrl,
        timeout: 13000,
        data: {
          api: 'SYNO.API.Auth',
          version: 2,
          method: 'login',
          account: username,
          passwd: password,
          session: 'DownloadStation',
          format: 'Cookie'
        },
        header: {
          'content-type': 'application/json'
        }
      }
      let res = await wepy.request(requestOptions)
      const resBody = res.data
      if (!resBody.data.sid) {
        throw new Error('身份验证失败')
      }
      this.auth = resBody.data.sid
      console.log('auth:', this.auth)
      return {
        code: 0,
        msg: '授权成功',
        data: {
          auth: this.auth
        }
      }
    } catch (err) {
      throw new Error(err.errMsg || err.message)
    }
  }

  getTorrentInfo (id) {
    return this.getTorrentList({ id })
  }

  async getTorrentList (params) {
    const { sort = 'added_on', page = 1, pageSize = 20, reverse = true, filter = 'all', id = '' } = params

    const res = await this.request(
      '/DownloadStation/task.cgi',
      {
        id: [id],
        api: 'SYNO.DownloadStation.Task',
        version: 1,
        method: 'list',
        additional: 'detail,transfer,tracker'
      }
    )
    let result = null
    if (res.code === -1 || !res.data || res.code > 200) {
      result = res
    } else {
      const transformData = res.data.tasks.map(item => {
        return this.transformTorrentList(item)
      })
      let orderList = null
      if (id && transformData.length <= 1) {
        orderList = transformData[0]
      } else {
        orderList = this.reOrderList(transformData, { sort, reverse, page, pageSize, filter })
      }
      result = {
        code: 1,
        msg: '请求成功',
        data: orderList
      }
    }
    return result
  }

  transformTorrentList (torrent) {
    let state = ''
    let stateText = ''
    switch (torrent.status) {
      case 'downloading':
      case 'finishing':
        state = 'downloading'
        stateText = '下载'
        break
      case 'extracting':
      case 'filehosting_waiting':
      case 'waiting':
        state = 'queued'
        stateText = '等待'
        break
      case 'seeding':
      case 'finished':
        state = 'seeding'
        stateText = '做种'
        break
      case 'paused':
        state = 'paused'
        stateText = '暂停'
        break
      case 'hash_checking':
        state = 'checking'
        stateText = '校验'
        break
      case 'error':
        state = 'error'
        stateText = '错误'
        break
      default:
        break
    }
    const { detail = {}, transfer = {} } = torrent.additional
    const { downloaded_pieces: downloadedPieces, size_downloaded: sizeDownloaded } = transfer
    const { total_pieces: totalPieces, uri } = detail
    const progress = downloadedPieces ? downloadedPieces / totalPieces : sizeDownloaded / torrent.size
    const result = {
      state,
      stateText,
      addOn: detail.create_time * 1000,
      completeOn: detail.completed_time * 1000,
      tag: '',
      completedData: transfer.size_downloaded,
      dlSpeed: transfer.speed_download,
      downloadedData: transfer.size_downloaded,
      eta: torrent.waiting_seconds,
      id: torrent.id,
      name: torrent.title,
      progress,
      ratio: transfer.size_uploaded / transfer.size_downloaded,
      savePath: detail.destination,
      size: torrent.size,
      totalSize: torrent.size,
      tracker: uri,
      uploadedData: transfer.size_uploaded,
      upSpeed: transfer.speed_upload
    }
    return result
  }

  filterList (list, filterKey) {
    let result = []
    if (filterKey === 'all') {
      result = list
    } else if (filterKey === 'active') {
      result = list.filter(item => item.dlSpeed > 0 || item.upSpeed > 0)
    } else {
      result = list.filter(item => item.state === filterKey)
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
    const pageList = pageSize > 0 ? filterList.slice(
      (page - 1) * pageSize,
      page * pageSize
    ) : filterList
    return pageList
  }

  async getClientInfo (params) {
    await this.testServer()
    let uploaded = 0; let downloaded = 0
    if (!params.forSpeed) {
      const listData = await this.getTorrentList({
        filter: 'all',
        pageSize: -1
      })
      if (listData.data && listData.data.length) {
        listData.data.forEach(item => {
          uploaded += item.uploadedData
          downloaded += item.downloadedData
        })
      } else {
        throw new Error('请求错误')
      }
    }

    const transInfo = await this.request(
      '/DownloadStation/statistic.cgi',
      {
        api: 'SYNO.DownloadStation.Statistic',
        version: 1,
        method: 'getinfo'
      }
    )
    const upSpeed = transInfo.data.speed_upload
    const dlSpeed = transInfo.data.speed_download

    return {
      code: 1,
      data: {
        uploaded,
        downloaded,
        upSpeed,
        dlSpeed,
        freeSpace: -1,
        totalDownloaded: uploaded,
        totalUploaded: downloaded
      },
      msg: '请求成功'
    }
  }

  async getClientData (params) {
    this.auth = params.auth || ''
    let uploaded = 0; let downloaded = 0
    let torrentList = []
    if (params.forSpeed) {
      const list = await this.getTorrentList({
        filter: 'all',
        pageSize: -1
      })
      list.data.forEach(item => {
        uploaded += item.uploadedData
        downloaded += item.downloadedData
      })
      torrentList = list.data
    }
    const transInfo = await this.request(
      '/DownloadStation/statistic.cgi',
      {
        api: 'SYNO.DownloadStation.Statistic',
        version: 1,
        method: 'getinfo'
      }
    )
    const upSpeed = transInfo.data.speed_upload
    const dlSpeed = transInfo.data.speed_download
    const serverState = {
      uploaded: uploaded,
      downloaded: downloaded,
      upSpeed,
      dlSpeed,
      freeSpace: -1,
      totalDownloaded: downloaded,
      totalUploaded: uploaded
    }
    const returnData = {
      rid: 0,
      tagList: [],
      serverInfo: serverState,
      removedTagList: [],
      torrents: torrentList,
      removedTorrents: []
    }
    return {
      code: 1,
      msg: '请求成功',
      data: returnData
    }
  }

  async pauseTorrent (params) {
    const res = await this.request(
      '/DownloadStation/task.cgi',
      {
        api: 'SYNO.DownloadStation.Task',
        version: 1,
        method: 'pause',
        id: params.id
      }
    )
    return res
  }

  async resumeTorrent (params) {
    const res = await this.request(
      '/DownloadStation/task.cgi',
      {
        api: 'SYNO.DownloadStation.Task',
        version: 1,
        method: 'resume',
        id: params.id
      }
    )
    return res
  }

  async deleteTorrent ({ id, deleteFile = true }) {
    const res = await this.request(
      '/DownloadStation/task.cgi',
      {
        api: 'SYNO.DownloadStation.Task',
        version: 1,
        method: 'delete',
        force_complete: false,
        id
      }
    )
    if (res.data[0].error > 0) {
      throw new Error('删除失败')
    }
    return res
  }

  async setLocation (params) {
    const res = await this.request(
      '/DownloadStation/task.cgi',
      {
        api: 'SYNO.DownloadStation.Task',
        version: 1,
        method: 'edit',
        destination: params.path,
        id: params.id
      }
    )
    return res
  }

  async addTorrentsUrl (params) {
    const { username, password } = this.config
    const defaults = {
      urls: '',
      savepath: ''
    }
    const reqParams = {
      ...defaults,
      ...params
    }
    const res = await this.request(
      '/DownloadStation/task.cgi',
      {
        api: 'SYNO.DownloadStation.Task',
        version: 1,
        method: 'create',
        uri: reqParams.urls,
        username,
        password,
        destination: reqParams.savepath
      }
    )
    if (!res.data.success) {
      throw new Error('添加失败')
    }
    return res
  }

  async addTorrentFile (params) {
    await this.testServer()
    const {username, password, url, path} = this.config
    const requestUrl = url + path + '/DownloadStation/task.cgi'
    const defaults = {
      savepath: ''
    }
    const reqParams = {
      ...defaults,
      ...params
    }
    if (reqParams.fileId) {
      delete reqParams.fileId
    }
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: requestUrl,
        filePath: params.fileId,
        name: 'file',
        formData: {
          api: 'SYNO.DownloadStation.Task',
          version: 1,
          method: 'create',
          username,
          password,
          destination: reqParams.savepath
        },
        header: {
          Cookie: `id=${this.auth}`
        },
        success(res) {
          const data = JSON.parse(res.data)
          if (!data.success) {
            throw new Error('添加失败')
          }

          resolve({
            code: 1,
            msg: '上传成功'
          })
        },
        fail(error) {
          reject(new Error(error))
        },
        complete() {
        }
      })
    })
  }

  async getDefaultSavePath () {
    const res = await this.request(
      '/DownloadStation/info.cgi',
      {
        api: 'SYNO.DownloadStation.Info',
        version: 1,
        method: 'getconfig'
      }
    )
    return {
      code: 1,
      data: res.data.default_destination,
      msg: '请求成功'
    }
  }
}
