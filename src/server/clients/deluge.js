import wepy from 'wepy'
import { cookieParse } from '../../utils'

export default class Deluge {
  constructor(options) {
    this.config = {
      path: '/json',
      ...options
    }
    this.auth = ''
    this.requestId = 1
  }

  async request(methodName, params = [], method = 'POST', options = {}) {
    const requestUrl = this.config.url + this.config.path
    try {
      if (!this.auth) {
        const data = await this.testServer()
        if (data.code === -1) {
          throw new Error(data.msg)
        }
      }
      const requestOptions = {
        method: method,
        url: requestUrl,
        timeout: 20000,
        header: {
          Cookie: `_session_id=${this.auth || ''}`,
          'content-type': 'application/json'
        },
        data: {
          method: methodName,
          params,
          id: this.requestId
        }
      }
      const res = await wepy.request(requestOptions)
      if (res.data.error) {
        throw new Error(res.data.error.message || '请求失败')
      }
      return {
        code: res.statusCode || 1,
        msg: '请求成功',
        data: res.data.result
      }
    } catch (err) {
      return {
        code: err.statusCode || -1,
        msg: err.errMsg || err.message
      }
    }
  }

  async testServer() {
    const requestUrl = this.config.url + this.config.path
    const { password } = this.config
    const options = {
      method: 'POST',
      url: requestUrl,
      timeout: 13000,
      data: {
        method: 'auth.login',
        params: [password],
        id: this.requestId
      },
      header: {
        'content-type': 'application/json'
      }
    }
    try {
      const res = await wepy.request(options)
      if (!res.cookies || !res.cookies.length) {
        throw new Error('身份验证失败')
      }
      const cookie = cookieParse(res.cookies[0])
      this.authType = cookie.key
      if (!cookie || cookie.key !== '_session_id') {
        throw new Error('登录失败')
      }
      this.auth = cookie.value
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

  async getTorrentInfo(id) {
    const res = await this.request('web.get_torrent_status', [
      id,
      [
        'queue',
        'name',
        'total_wanted',
        'state',
        'progress',
        'num_seeds',
        'total_seeds',
        'label',
        'num_peers',
        'total_peers',
        'total_uploaded',
        'total_payload_upload',
        'download_payload_rate',
        'upload_payload_rate',
        'eta',
        'tracker_status',
        'tracker_host',
        'ratio',
        'time_added',
        'save_path',
        'total_done',
        'total_uploaded',
        'max_download_speed',
        'max_upload_speed',
        'seeds_peers_ratio'
      ]
    ])
    if (!res.data) {
      throw new Error('请求失败')
    }
    const result = {
      code: 1,
      msg: '请求成功',
      data: this.transformTorrentList(res.data)
    }
    return result
  }

  async getTorrentList(params = {}) {
    const {
      sort = 'added_on',
      page = 1,
      pageSize = 20,
      reverse = true,
      filter = 'all'
    } = params
    const filterObj =
      filter === 'all' ? {} : { state: this.getFilterKey(filter) }
    const res = await this.request('web.update_ui', [
      [
        'queue',
        'name',
        'total_wanted',
        'state',
        'progress',
        'num_seeds',
        'total_seeds',
        'label',
        'num_peers',
        'total_peers',
        'total_uploaded',
        'total_payload_upload',
        'download_payload_rate',
        'upload_payload_rate',
        'eta',
        'tracker_status',
        'tracker_host',
        'ratio',
        'time_added',
        'save_path',
        'total_done',
        'total_uploaded',
        'max_download_speed',
        'max_upload_speed',
        'seeds_peers_ratio'
      ],
      filterObj
    ])
    let result = null
    const allListData = this.getListArray(res.data.torrents || {})
    const orderList = this.reOrderList(allListData, {
      sort,
      reverse,
      page,
      pageSize
    })
    result = {
      code: 1,
      msg: '请求成功',
      data: orderList.map((torrent) => {
        return this.transformTorrentList(torrent)
      })
    }
    return result
  }

  getListArray(list) {
    const torrentKeys = Object.keys(list)
    return torrentKeys.length
      ? torrentKeys.map((key) => {
        return { id: key, ...list[key] }
      })
      : []
  }

  getFilterKey(filter) {
    console.log(this.firstUpperCase(filter))
    return this.firstUpperCase(filter)
  }

  firstUpperCase([first, ...rest]) {
    return first.toUpperCase() + rest.join('')
  }

  reOrderList(list, options) {
    const { sort, reverse, page, pageSize } = options
    const sortKey = this.getSortKey(sort)
    // 默认从小到大排序
    list.sort((item, other) => {
      if (item[sortKey] > other[sortKey]) {
        return reverse ? -1 : 1
      }
      if (item[sortKey] < other[sortKey]) {
        return reverse ? 1 : -1
      }
    })
    const pageList = list.slice((page - 1) * pageSize, page * pageSize)
    return pageList
  }

  getSortKey(key) {
    const sortObject = {
      added_on: 'time_added',
      name: 'name',
      size: 'total_wanted',
      ratio: 'ratio'
    }
    return sortObject[key]
  }

  transformTorrentList(torrent) {
    let state = ''
    let stateText = ''
    switch (torrent.state) {
      case 'Downloading':
        state = 'downloading'
        stateText = '下载'
        break
      case 'Queued':
        state = 'queued'
        stateText = '等待'
        break
      case 'Seeding':
        state = 'seeding'
        stateText = '做种'
        break
      case 'Paused':
        state = 'paused'
        stateText = '暂停'
        break
      case 'Checking':
        state = 'checking'
        stateText = '校验'
        break
      case 'Active':
        state = 'Active'
        stateText = '活动'
        break
      case 'Error':
        state = 'error'
        stateText = '错误'
        break
      default:
        break
    }
    const result = {
      state,
      stateText,
      addOn: torrent.time_added * 1000,
      completeOn: undefined,
      downloadDataLeft: torrent.total_wanted - torrent.total_done,
      tag: torrent.label,
      completedData: torrent.total_done,
      dlSpeed: torrent.download_payload_rate,
      downloadedData: torrent.total_done,
      uploadedData: torrent.total_uploaded,
      upSpeed: torrent.upload_payload_rate,
      eta: torrent.eta,
      id: torrent.id,
      name: torrent.name,
      progress: torrent.progress / 100,
      ratio: torrent.ratio,
      savePath: torrent.save_path,
      size: torrent.total_wanted,
      totalSize: undefined,
      tracker: torrent.tracker_host,
      trackerStatus: torrent.tracker_status,
      upLimit:
        torrent.max_upload_speed >= 0 ? torrent.max_upload_speed * 1024 : -1,
      dlLimit:
        torrent.max_download_speed >= 0
          ? torrent.max_download_speed * 1024
          : -1
    }
    return result
  }

  async getDefaultSavePath(params) {
    const res = await this.request('core.get_config_values', [
      ['download_location']
    ])
    return {
      code: 1,
      data: res.data.download_location,
      msg: '请求成功'
    }
  }

  async getClientInfo() {
    await this.testServer()
    const availableMethods = await this.listMethods()
    const freeSpace = this.request('web.update_ui', [[], {}])
    let transInfo = new Promise((resolve) => {
      resolve(null)
    })
    const sessionkeys = [
      'payload_download_rate',
      'payload_upload_rate',
      'total_payload_download',
      'total_payload_upload',
      'total_download',
      'total_upload'
    ]
    if (availableMethods.data.indexOf('core.get_session_status')) {
      transInfo = this.request('core.get_session_status', [sessionkeys])
    }

    const result = await Promise.all([freeSpace, transInfo])
    const tagData = result[0].data.filters.label || []
    const tagList = tagData.map((item) => item[0])
    const returnData = Object.assign(result[0].data.stats, result[1].data, {
      tags: tagList
    })
    const res = {
      code: 1,
      msg: '请求成功',
      data: this.transformClientInfo(returnData)
    }
    return res
  }

  transformClientInfo(clientInfo) {
    const result = {
      uploaded: clientInfo.total_payload_upload,
      upSpeed: clientInfo.payload_upload_rate,
      dlSpeed: clientInfo.payload_download_rate,
      totalUploaded: clientInfo.total_payload_upload,
      downloaded: clientInfo.total_payload_download,
      totalDownloaded: clientInfo.total_payload_download,
      freeSpace: clientInfo.free_space,
      tag: clientInfo.tags
    }
    const ratio = result.totalUploaded / result.totalDownloaded
    result.globalRatio = ratio
    return result
  }

  async getClientData(params) {
    this.auth = params.auth || ''
    this.requestId = params.rid || 1
    await this.testServer()
    const availableMethods = await this.listMethods()
    const mainData = this.request('web.update_ui', [[], {}])
    let transInfo = new Promise((resolve) => {
      resolve(null)
    })
    const sessionkeys = [
      'payload_download_rate',
      'payload_upload_rate',
      'total_payload_download',
      'total_payload_upload',
      'total_download',
      'total_upload'
    ]
    if (availableMethods.data.indexOf('core.get_session_status')) {
      transInfo = this.request('core.get_session_status', [sessionkeys])
    }
    const result = await Promise.all([mainData, transInfo])
    const updateData = result[0].data
    console.log(result[0])
    const tagData = updateData.filters.label || []
    const tagList = tagData.map((item) => item[0])
    const serverState = Object.assign(updateData.stats, result[1].data)
    const clientInfo = this.transformClientInfo(serverState)
    const torrentList = this.getListArray(updateData.torrents).map(
      (torrent) => {
        return this.transformTorrentList(torrent)
      }
    )
    const returnData = {
      rid: result[0].id,
      tagList,
      serverInfo: clientInfo,
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

  async pauseTorrent(params) {
    const res = await this.request('core.pause_torrent', [[params.id]])
    return res
  }

  async resumeTorrent(params) {
    const res = await this.request('core.resume_torrent', [[params.id]])
    return res
  }

  async deleteTorrent({ id, deleteFile = true }) {
    const res = await this.request('core.remove_torrent', [id, deleteFile])
    return res
  }

  async recheck(params) {
    const res = await this.request('core.force_recheck', [[params.id]])
    return res
  }

  async updateTracker(params) {
    const res = await this.request('core.force_reannounce', [[params.id]])
    return res
  }

  async setDlLimit(params) {
    const res = await this.request('core.set_torrent_options', [
      [params.id],
      { max_download_speed: parseInt(params.limit) / 1.024 }
    ])
    return res
  }

  async setUpLimit(params) {
    const res = await this.request('core.set_torrent_options', [
      [params.id],
      { max_upload_speed: parseInt(params.limit) / 1.024 }
    ])
    return res
  }

  async setLocation(params) {
    const res = await this.request('core.move_storage', [
      [params.id],
      params.path
    ])
    return res
  }

  async addTorrentsUrl(params) {
    const defaults = {
      urls: '',
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
    const res = await this.request('core.add_torrent_url', [
      reqParams.urls,
      {
        download_location: reqParams.savepath,
        add_paused: reqParams.paused,
        max_upload_speed: reqParams.upLimit,
        max_download_speed: reqParams.dlLimit
      }
    ])
    return res
  }

  async addTorrentFile(params) {
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
    const fileData = wx
      .getFileSystemManager()
      .readFileSync(params.fileId, 'base64')
    const res = await this.request('core.add_torrent_file', [
      'torrent',
      fileData,
      {
        download_location: reqParams.savepath,
        add_paused: reqParams.paused,
        max_upload_speed: reqParams.upLimit,
        max_download_speed: reqParams.dlLimit
      }
    ])
    return res
  }

  async listMethods() {
    const res = await this.request('system.listMethods')
    return res
  }

  async getSessionState() {
    const res = await this.request('core.get_session_status', [
      ['payload_download_rate', 'payload_upload_rate']
    ])
    return res
  }
}
