import wepy from 'wepy'
import { base64Encode } from '../../utils'
// https://github.com/transmission/transmission/blob/master/extras/rpc-spec.txt
export default class Transmission {
  constructor(options) {
    this.config = {
      path: '/transmission/rpc',
      ...options
    }
  }

  async testServer() {
    const res = await this.request('session-get')
    return res
  }

  async getTorrentInfo(id) {
    const res = this.getTorrentList({ ids: id })
    return res
  }

  async getTorrentList(params = {}) {
    const ids = params.ids || '' // 筛选ids
    const {
      sort = 'added_on',
      page = 1,
      pageSize = 20,
      reverse = true,
      filter = 'all'
    } = params
    const fields = [
      'id',
      'addedDate',
      'doneDate',
      'name',
      'totalSize',
      'error',
      'errorString',
      'eta',
      'isFinished',
      'isStalled',
      'hashString',
      'labels',
      'peersGettingFromUs',
      'peersSendingToUs',
      'leftUntilDone',
      'percentDone',
      'pieceSize',
      'rateDownload',
      'rateUpload',
      'recheckProgress',
      'recheckProgress',
      'sizeWhenDone',
      'status',
      'trackers',
      'downloadDir',
      'uploadedEver',
      'downloadedEver',
      'uploadRatio',
      'uploadedEver',
      'downloadLimit',
      'uploadLimit',
      'downloadLimited',
      'uploadLimited'
    ]
    const reqParams = {
      fields
    }
    if (ids) {
      reqParams.ids = ids
    }

    const res = await this.request('torrent-get', reqParams)
    let result = null
    if (res.code === -1 || !res.data || res.code !== 200) {
      result = res
    } else {
      const allListData = res.data.torrents
      if (ids && allListData.length === 1) {
        return {
          code: 1,
          msg: '请求成功',
          data: this.transformTorrentList(allListData[0])
        }
      }
      const orderList = this.reOrderList(allListData, {
        sort,
        reverse,
        page,
        pageSize,
        filter
      })
      result = {
        code: 1,
        msg: '请求成功',
        data: orderList.map((torrent) => {
          return this.transformTorrentList(torrent)
        })
      }
    }
    return result
  }

  reOrderList(list, options) {
    const { sort, reverse, page, pageSize, filter } = options
    // 先筛选 后排序
    const filterList = this.filterList(list, filter)

    const sortKey = this.getSortKey(sort)
    // 默认从小到大排序
    filterList.sort((item, other) => {
      if (item[sortKey] > other[sortKey]) {
        return reverse ? -1 : 1
      }
      if (item[sortKey] < other[sortKey]) {
        return reverse ? 1 : -1
      }
    })
    const pageList = filterList.slice((page - 1) * pageSize, page * pageSize)
    return pageList
  }

  filterList(list, filterKey) {
    const stateData = {
      downloading: [4],
      seeding: [6],
      paused: [0],
      queued: [3, 5],
      error: [2, 1],
      checking: [2, 1]
    }
    let result = []
    if (filterKey === 'all') {
      result = list
    } else if (filterKey === 'error') {
      result = list.filter((item) => item.error !== 0)
    } else if (filterKey === 'active') {
      result = list.filter(
        (item) => item.peersSendingToUs > 0 || item.peersGettingFromUs > 0
      )
    } else {
      result = list.filter(
        (item) => stateData[filterKey].indexOf(item.status) > -1
      )
    }
    return result
  }

  getSortKey(key) {
    const sortObject = {
      added_on: 'addedDate',
      name: 'name',
      size: 'totalSize',
      ratio: 'uploadRatio'
    }
    return sortObject[key]
  }

  async getClientData(params) {
    this.auth = params.auth || ''
    let rid = params.rid || 0
    const ids = rid > 0 ? 'recently-active' : rid
    const fields = [
      'id',
      'addedDate',
      'doneDate',
      'name',
      'totalSize',
      'error',
      'errorString',
      'eta',
      'isFinished',
      'isStalled',
      'hashString',
      'labels',
      'peersGettingFromUs',
      'peersSendingToUs',
      'leftUntilDone',
      'percentDone',
      'pieceSize',
      'rateDownload',
      'rateUpload',
      'recheckProgress',
      'recheckProgress',
      'sizeWhenDone',
      'status',
      'trackers',
      'downloadDir',
      'uploadedEver',
      'downloadedEver',
      'uploadRatio',
      'uploadedEver'
    ]
    const reqParams = {
      fields
    }
    if (ids) {
      reqParams.ids = ids
    }
    const getTorrentList = this.request('torrent-get', reqParams)
    const getTransInfo = this.request('session-stats')
    const getDefaultSavePath = this.request('session-get')
    const result = await Promise.all([
      getTorrentList,
      getTransInfo,
      getDefaultSavePath
    ])
    const clientData = Object.assign(result[1].data, result[2].data)
    const serverState = this.transformClientInfo(clientData)
    const torrentList = result[0].data.torrents || []
    const removedTorrentList = result[0].data.removed || []
    const returnData = {
      rid: rid++,
      serverInfo: serverState,
      torrents: this.handleTorrentList(torrentList),
      removedTorrents: this.handleTorrentList(removedTorrentList)
    }
    return {
      code: 1,
      msg: '请求成功',
      data: returnData
    }
  }

  handleTorrentList(list) {
    if (list.length === 0) {
      return []
    }
    return list.map((torrent) => {
      return this.transformTorrentList(torrent)
    })
  }

  async getClientInfo() {
    await this.testServer()
    const getTransInfo = this.request('session-stats')
    const getDefaultSavePath = this.request('session-get')
    const result = await Promise.all([getTransInfo, getDefaultSavePath])
    const returnData = Object.assign(result[0].data, result[1].data)
    const res = {
      code: 1,
      msg: '请求成功',
      data: this.transformClientInfo(returnData)
    }
    return res
  }

  async getDefaultSavePath() {
    const res = await this.request('session-get')
    return {
      code: 1,
      data: res.data['download-dir'],
      msg: '请求成功'
    }
  }

  async pauseTorrent(params) {
    const res = await this.request('torrent-stop', {
      ids: params.id
    })
    return res
  }

  async resumeTorrent(params) {
    const res = await this.request('torrent-start', {
      ids: params.id
    })
    return res
  }

  async deleteTorrent({ id, deleteFile = true }) {
    const res = await this.request('torrent-remove', {
      ids: id,
      'delete-local-data': deleteFile
    })
    return res
  }

  async recheck(params) {
    const res = await this.request('torrent-verify', {
      ids: params.id
    })
    return res
  }

  async updateTracker(params) {
    const res = await this.request('torrent-reannounce', {
      ids: [params.id]
    })
    return res
  }

  async setDlLimit(params) {
    const res = await this.request('torrent-set', {
      downloadLimited: true,
      ids: params.id,
      downloadLimit: parseInt(params.limit) || 0
    })
    return res
  }

  async setUpLimit(params) {
    const res = await this.request('torrent-set', {
      uploadLimited: true,
      ids: params.id,
      uploadLimit: parseInt(params.limit) || 0
    })
    return res
  }

  async setLocation(params) {
    const res = await this.request('torrent-set-location', {
      ids: [params.id],
      location: params.path,
      move: true
    })
    return res
  }

  async setTorrentName(params) {
    const res = await this.request('torrent-rename-path', {
      ids: [params.id],
      name: params.name
    })
    return res
  }

  // 3.0支持
  async setTag(params) {
    const res = await this.request('torrent-set', {
      ids: [params.id],
      labels: [params.tags]
    })
    return res
  }

  async addTorrentsUrl(params) {
    const defaults = {
      urls: '',
      savepath: '',
      category: '',
      paused: false
    }
    const reqParams = {
      ...defaults,
      ...params
    }
    const res = await this.request('torrent-add', {
      filename: reqParams.urls,
      'download-dir': reqParams.savepath,
      paused: reqParams.paused
    })
    return res
  }

  async addTorrentFile(params) {
    const defaults = {
      savepath: '',
      category: '',
      paused: false
    }
    const reqParams = {
      ...defaults,
      ...params
    }
    if (reqParams.fileId) {
      delete reqParams.fileId
    }
    const fileData = wx
      .getFileSystemManager()
      .readFileSync(params.fileId, 'base64')
    reqParams.metainfo = fileData
    const res = await this.request('torrent-add', {
      metainfo: reqParams.metainfo,
      'download-dir': reqParams.savepath,
      paused: reqParams.paused
    })
    return res
  }

  transformTorrentList(torrent) {
    let state = ''
    let stateText = ''
    switch (torrent.status) {
      case 4:
        state = 'downloading'
        stateText = '下载'
        break
      case 3:
      case 5:
        state = 'queued'
        stateText = '等待'
        break
      case 6:
        state = 'seeding'
        stateText = '做种'
        break
      case 0:
        state = 'paused'
        stateText = '暂停'
        break
      case 1:
      case 2:
        state = 'checking'
        stateText = '校验'
        break
      default:
        break
    }
    if (torrent.error !== 0) {
      state = 'error'
      stateText = '错误'
    }
    const result = {
      state,
      stateText,
      addOn: torrent.addedDate * 1000,
      completeOn: torrent.doneDate * 1000,
      tag:
        torrent.labels && torrent.labels.length ? torrent.labels.join(',') : '',
      dlSpeed: torrent.rateDownload,
      downloadedData: torrent.downloadedEver,
      eta: torrent.eta,
      id: torrent.id,
      name: torrent.name,
      progress: torrent.percentDone,
      ratio: torrent.uploadRatio,
      savePath: torrent.downloadDir,
      size: torrent.sizeWhenDone,
      totalSize: torrent.totalSize,
      tracker: torrent.trackers[0].announce,
      uploadedData: torrent.uploadedEver,
      upSpeed: torrent.rateUpload,
      upLimit: torrent.uploadLimited ? torrent.uploadLimit * 1000 : -1,
      dlLimit: torrent.downloadLimited ? torrent.downloadLimit * 1000 : -1,
      trackerStatus: torrent.errorString
    }
    return result
  }

  transformClientInfo(clientInfo) {
    const result = {
      uploaded: clientInfo['current-stats'].uploadedBytes,
      upSpeed: clientInfo.uploadSpeed,
      totalUploaded: clientInfo['cumulative-stats'].uploadedBytes,
      dlSpeed: clientInfo.downloadSpeed,
      downloaded: clientInfo['current-stats'].downloadedBytes,
      totalDownloaded: clientInfo['cumulative-stats'].downloadedBytes,
      freeSpace: clientInfo['download-dir-free-space']
    }
    const ratio = result.totalUploaded / result.totalDownloaded
    result.globalRatio = ratio
    return result
  }

  async request(methodName, params = {}, method = 'POST', options = {}) {
    const requestUrl = this.config.url + this.config.path
    const { username, password } = this.config
    try {
      const header = {
        'X-Transmission-Session-Id': this.auth
      }
      const auth = base64Encode(`${username || ''}:${password || ''}`)
      header.Authorization = 'Basic ' + auth
      const requestOptions = {
        method: method,
        url: requestUrl,
        header,
        timeout: 20000,
        data: {
          method: methodName,
          arguments: params,
          tag: ''
        },
        json: true
      }
      const res = await wepy.request(requestOptions)
      if (res.statusCode && res.statusCode === 409) {
        console.log(res.header)
        this.auth = res.header['X-Transmission-Session-Id']
        const result = this.request(methodName, params)
        return result
      }
      const resBody = res.data
      if (resBody.result === 'success') {
        return {
          code: res.statusCode || 1,
          msg: '请求成功',
          data: resBody.arguments
        }
      } else {
        throw new Error(resBody.result)
      }
    } catch (err) {
      console.log(err)
      return {
        code: err.statusCode || -1,
        msg: err.errMsg || err.message
      }
    }
  }
}
