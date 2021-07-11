import wepy from 'wepy'
import { cookieParse } from '../../utils'

// https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1)
export default class Qbittorrent {
  constructor(options) {
    this.config = {
      path: '/api/v2',
      ...options
    }
    this.auth = ''
    this.authType = ''
  }
  async request(api, params = {}, method = 'POST', options = {}) {
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
          'content-type': 'application/x-www-form-urlencoded',
          Cookie: `${this.authType}=${this.auth || ''}`,
          ...options.headers
        }
      }
      const res = await wepy.request(requestOptions)
      const resBody = res.data
      return {
        code: res.statusCode || 1,
        msg: '请求成功',
        data: resBody
      }
    } catch (err) {
      return {
        code: err.statusCode || -1,
        msg: err.errMsg || err.message,
        data: null
      }
    }
  }

  async testServer() {
    const requestUrl = this.config.url + this.config.path + '/auth/login'
    const { username, password } = this.config
    const options = {
      method: 'POST',
      url: requestUrl,
      timeout: 13000,
      data: {
        username,
        password
      },
      header: {
        'content-type': 'application/x-www-form-urlencoded'
      }
    }
    try {
      const res = await wepy.request(options)
      if (!res.cookies || !res.cookies.length) {
        throw new Error('身份验证失败')
      }
      const cookie = cookieParse(res.cookies[0])
      this.authType = cookie.key
      if (!cookie || !this.authType) {
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
      console.log('testServer:', err)
      throw new Error(err.errMsg || err.message)
    }
  }

  async getTorrentInfo(id) {
    const data = await this.getTorrentList({ hashes: id })
    return data
  }

  async recheck(params) {
    const res = await this.request('/torrents/recheck', {
      hashes: params.id
    })
    return res
  }

  async updateTracker(params) {
    const res = await this.request('/torrents/reannounce', {
      hashes: params.id
    })
    return res
  }

  async setDlLimit(params) {
    const res = await this.request('/torrents/setDownloadLimit', {
      hashes: params.id,
      limit: params.limit * 1000 || -1
    })
    return res
  }

  async setUpLimit(params) {
    const res = await this.request('/torrents/setUploadLimit', {
      hashes: params.id,
      limit: params.limit * 1000 || -1
    })
    return res
  }

  async setLocation(params) {
    /*
    * 400: Save path is empty
      403: User does not have write access to directory
      409: Unable to create save path directory
    * @param {any}
    * @return
    * */
    const res = await this.request('/torrents/setLocation', {
      hashes: params.id,
      location: params.path
    })
    return res
  }

  async setTorrentName(params) {
    const res = await this.request('/torrents/rename', {
      hash: params.id,
      name: params.name
    })
    return res
  }

  async setTag(params) {
    const res = await this.request('/torrents/addTags', {
      hashes: params.id,
      tags: params.tags
    })
    return res
  }
  async removeTag(params) {
    const res = await this.request('/torrents/removeTags', {
      hashes: params.id,
      tags: params.tags
    })
    return res
  }
  async getTorrentList(params) {
    const defaults = {
      sort: 'added_on',
      reverse: true,
      page: 1,
      pageSize: 20
    }
    if (params.sort) {
      params.sort = this.transformFilterKey(params.sort)
    }
    params.reverse = `${params.reverse}`
    const reqParams = {
      ...defaults,
      ...params
    }
    const filter = params.filter || 'all'
    if (!(filter === 'all' || filter === 'active')) {
      delete params.filter
    }
    const res = await this.request('/torrents/info', reqParams)
    let result = null
    if (res.code === -1 || !res.data || res.code !== 200) {
      result = res
    } else {
      if (params.hashes && res.data && res.data[0]) {
        return {
          code: res.code || 1,
          msg: res.msg || '请求成功',
          data: this.transformTorrentList(res.data[0])
        }
      }
      const resultList = this.filterList(res.data, filter)
      const { page, pageSize } = reqParams
      const sliceData = resultList.slice(
        (page - 1) * pageSize,
        page * pageSize
      )
      result = {
        code: res.code || 1,
        msg: res.msg || '请求成功',
        data: sliceData.map((torrent) => {
          return this.transformTorrentList(torrent)
        })
      }
    }
    return result
  }

  filterList(list, filterKey) {
    const stateData = {
      downloading: ['stalledDL', 'forcedDL', 'metaDL', 'downloading'],
      seeding: ['stalledUP', 'forcedUP', 'uploading'],
      paused: ['pausedDL', 'pausedUP'],
      queued: ['allocating', 'queuedUP', 'queuedDL'],
      error: ['unknown', 'missingFiles', 'error'],
      checking: ['moving', 'checkingResumeData', 'CheckingUP', 'checkingDL']
    }
    let result = []
    if (filterKey === 'all' || filterKey === 'active') {
      result = list
    } else {
      result = list.filter(
        (item) => stateData[filterKey].indexOf(item.state) > -1
      )
    }
    return result
  }

  transformFilterKey(key) {
    const sortObject = {
      added_on: 'added_on',
      name: 'name',
      size: 'total_size',
      ratio: 'ratio'
    }
    return sortObject[key]
  }

  async getClientData(params) {
    this.auth = params.auth || ''
    this.authType = params.authType || 'SID'
    const res = await this.request('/sync/maindata', {
      rid: params.rid || 0
    })
    if (!res.data) {
      throw new Error('请求失败')
    }
    const tagList = Object.keys(res.data.categories || {})
    const removedTagList = Object.keys(res.data.categories_removed || {})
    const serverState = this.transformClientInfo(res.data.server_state)
    const torrentList = res.data.torrents || []
    const removedTorrentList = res.data.torrents_removed || []
    const returnData = {
      rid: res.data.rid,
      auth: this.auth,
      authType: this.authType,
      tagList,
      serverInfo: serverState,
      removedTagList,
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
    if (Object.keys(list).length === 0) {
      return []
    }
    return Object.keys(list).map((key) => {
      const torrentData = {
        hash: key,
        ...list[key]
      }
      return this.transformTorrentList(torrentData)
    })
  }

  async getClientInfo(params) {
    const res = await this.request('/sync/maindata')
    if (!res.data) {
      throw new Error('请求失败')
    }
    const clientInfo = res.data.server_state
    return {
      code: 1,
      msg: '请求成功',
      data: this.transformClientInfo(clientInfo)
    }
  }

  async pauseTorrent(params) {
    const res = await this.request('/torrents/pause', {
      hashes: params.id
    })
    return res
  }

  async resumeTorrent(params) {
    const res = await this.request('/torrents/resume', {
      hashes: params.id
    })
    return res
  }

  async deleteTorrent({ id, deleteFile = true }) {
    const res = await this.request('/torrents/delete', {
      hashes: id,
      deleteFiles: `${deleteFile}`
    })
    return res
  }

  async addTorrentsUrl(params) {
    const defaults = {
      urls: '',
      savepath: '',
      category: '',
      paused: false,
      upLimit: -1,
      dlLimit: -1,
      rootFolder: false,
      skipCheck: false
    }
    const reqParams = {
      ...defaults,
      ...params
    }
    const res = await this.request('/torrents/add', {
      urls: reqParams.urls,
      savepath: reqParams.savepath,
      category: reqParams.category,
      paused: `${reqParams.paused}`,
      upLimit: reqParams.upLimit,
      dlLimit: reqParams.dlLimit,
      root_folder: `${reqParams.rootFolder}`,
      skip_checking: `${reqParams.skipCheck}`
    })
    if (!res.data) {
      throw new Error('添加失败')
    }
    if (res.data.startsWith('Fail')) {
      throw new Error('添加失败')
    }
    return res
  }

  async addTorrentFile(params) {
    await this.testServer()
    const requestUrl = this.config.url + this.config.path + '/torrents/add'
    const defaults = {
      savepath: '',
      category: '',
      paused: false,
      upLimit: -1,
      dlLimit: -1,
      rootFolder: false,
      skipCheck: false
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
        name: 'torrents',
        formData: {
          savepath: reqParams.savepath,
          category: reqParams.category,
          paused: `${reqParams.paused}`,
          upLimit: reqParams.upLimit,
          dlLimit: reqParams.dlLimit,
          root_folder: `${reqParams.rootFolder}`,
          skip_checking: `${reqParams.skipCheck}`
        },
        header: {
          Cookie: `${this.authType}=${this.auth || ''}`
        },
        success(res) {
          console.log(res.data.startsWith('Fail'))
          if (res.data.startsWith('Fail')) {
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
        complete() {}
      })
    })
  }

  async getDefaultSavePath(params) {
    const res = await this.request('/app/defaultSavePath', params)
    return res
  }

  transformClientInfo(clientInfo) {
    const result = {
      uploaded: clientInfo.up_info_data,
      upSpeed: clientInfo.up_info_speed,
      totalUploaded: clientInfo.alltime_ul,
      dlSpeed: clientInfo.dl_info_speed,
      downloaded: clientInfo.dl_info_data,
      totalDownloaded: clientInfo.alltime_dl,
      globalRatio: clientInfo.global_ratio,
      freeSpace: clientInfo.free_space_on_disk,
      tags: clientInfo.tags,
      category: clientInfo.category
    }
    return result
  }

  getTorrentState(status) {
    let state = ''
    let stateText = ''
    switch (status) {
      case 'downloading':
      case 'metaDL':
      case 'forcedDL':
      case 'stalledDL':
        state = 'downloading'
        stateText = '下载'
        break
      case 'queuedDL':
      case 'queuedUP':
      case 'allocating':
        state = 'queued'
        stateText = '等待'
        break
      case 'uploading':
      case 'forcedUP':
      case 'stalledUP':
        state = 'seeding'
        stateText = '做种'
        break
      case 'pausedUP':
      case 'pausedDL':
        state = 'paused'
        stateText = '暂停'
        break
      case 'checkingDL':
      case 'checkingUP':
      case 'checkingResumeData':
      case 'moving':
        state = 'checking'
        stateText = '校验'
        break
      case 'error':
      case 'missingFiles':
      case 'unknown':
        state = 'error'
        stateText = '错误'
        break
      default:
        break
    }
    return {
      state,
      stateText
    }
  }

  transformTorrentList(torrent) {
    const { stateText, state } = this.getTorrentState(torrent.state)
    const result = {
      state,
      stateText,
      addOn: torrent.added_on * 1000,
      completeOn: torrent.completion_on * 1000,
      tag: torrent.tags,
      category: torrent.category,
      completedData: torrent.completed,
      dlSpeed: torrent.dlspeed,
      downloadedData: torrent.downloaded,
      eta: torrent.eta,
      id: torrent.hash,
      name: torrent.name,
      progress: torrent.progress,
      ratio: torrent.ratio,
      savePath: torrent.save_path,
      size: torrent.size,
      totalSize: torrent.total_size,
      tracker: torrent.tracker,
      uploadedData: torrent.uploaded,
      upSpeed: torrent.upspeed,
      upLimit: torrent.up_limit >= 0 ? torrent.up_limit : -1,
      dlLimit: torrent.dl_limit >= 0 ? torrent.dl_limit : -1
    }
    return result
  }
}
