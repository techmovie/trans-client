import wepy from 'wepy'
import { base64Encode, makeFormdata, api } from '../../utils'
export default class Rutorrent {
  constructor(options) {
    this.config = {
      path: '/',
      ...options
    }
    this.auth = ''
    this.cookie = ''
  }

  async request(reqPath, params = '', method = 'POST', options = {}) {
    const { url, username, password, path } = this.config
    const requestUrl = url + path + reqPath
    try {
      const authorization = this.getAuthorization(username, password)
      const requestOptions = {
        method,
        url: requestUrl,
        timeout: 20000,
        header: {
          Authorization: 'Basic ' + authorization
        },
        data: params
      }
      const res = await wepy.request({ ...requestOptions })
      const resBody = res.data
      return {
        code: res.statusCode || 1,
        msg: '请求成功',
        data: resBody
      }
    } catch (err) {
      throw new Error(err.errMsg || err.message)
    }
  }

  getAuthorization(username, password) {
    return base64Encode(`${username || ''}:${password || ''}`)
  }

  async testServer() {
    const { url, username, password, path } = this.config
    const requestUrl = url + path + 'php/getsettings.php'
    const auth = this.getAuthorization(username, password)
    const options = {
      method: 'GET',
      url: requestUrl,
      timeout: 13000,
      header: {
        Authorization: 'Basic ' + auth
      }
    }
    try {
      await wepy.request(options)
      this.auth = auth
      console.log('token:', this.auth)
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
    const trackerHost = await this.getTrackerHost({ id })
    const torrentInfo = await this.getTorrentList({ id })
    console.log(torrentInfo)
    return {
      code: 1,
      data: {
        ...torrentInfo,
        tracker: trackerHost
      }
    }
  }

  async getTorrentList(params = {}) {
    const {
      sort = 'added_on',
      page = 1,
      pageSize = 20,
      reverse = true,
      filter = 'all',
      id = ''
    } = params
    const res = await this.request(
      'plugins/httprpc/action.php',
      'mode=list&cmd=d.throttle_name%3D&cmd=d.custom%3Dchk-state&cmd=d.custom%3Dchk-time&cmd=d.custom%3Dsch_ignore&cmd=cat%3D%22%24t.multicall%3Dd.hash%3D%2Ct.scrape_complete%3D%2Ccat%3D%7B%23%7D%22&cmd=cat%3D%22%24t.multicall%3Dd.hash%3D%2Ct.scrape_incomplete%3D%2Ccat%3D%7B%23%7D%22&cmd=d.custom%3Dx-pushbullet&cmd=cat%3D%24d.views%3D&cmd=d.custom%3Dseedingtime&cmd=d.custom%3Daddtime'
    )

    let result = null
    if (res.code === -1 || !res.data || res.code > 200) {
      result = res
    } else {
      if (id) {
        const listData = res.data.t
        if (!listData || !listData[id]) {
          throw new Error('种子不存在')
        }
        return this.transformTorrentList(listData[id])
      }
      const allListData = this.getListArray(res.data.t)
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

  getListArray(list) {
    const torrentKeys = Object.keys(list)
    return torrentKeys.length
      ? torrentKeys.map((key) => {
        return { id: key, ...list[key] }
      })
      : []
  }

  filterList(list, filterKey) {
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

  getTimeString(time) {
    return new Date(time).getTime()
  }

  reOrderList(list, options) {
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

  transformTorrentList(torrent) {
    let state = 'paused'
    let stateText = '暂停'
    // https://github.com/Novik/ruTorrent/blob/44d43229f07212f20b53b6301fb25882125876c3/js/rtorrent.js
    const isOpen = torrent[0]
    const getState = torrent[3]
    const isActive = torrent[28]
    const msg = torrent[29]
    const getHashing = torrent[23]
    const isHashChecking = torrent[1]
    const completedChunks = torrent[6]
    const hashedChunks = torrent[24]
    const chunkSize = torrent[13]
    const chunksTotal = torrent[7]
    const chunksProcessing =
      isHashChecking === '0' ? completedChunks : hashedChunks
    const dlSpeed = parseInt(torrent[12])
    const eta =
      dlSpeed > 0
        ? ((chunksTotal - completedChunks) * chunkSize) / dlSpeed
        : -1
    const completeOn = torrent[42].replace('\\n', '')
    const basePath = torrent[25]
    const pos = basePath.lastIndexOf('/')
    const savePath =
      basePath.substring(pos + 1) === torrent[4]
        ? basePath.substring(0, pos)
        : basePath

    const result = {
      addOn: torrent[43] * 1000,
      completeOn: completeOn * 1000,
      downloadDataLeft: parseInt(torrent[5] - torrent[8]),
      tag: decodeURIComponent(torrent[14]).trim(),
      completedData: parseInt(torrent[8]),
      dlSpeed,
      downloadedData: parseInt(torrent[8]),
      uploadedData: parseInt(torrent[9]),
      upSpeed: parseInt(torrent[11]),
      eta,
      id: torrent.id,
      name: torrent[4],
      progress: chunksProcessing / chunksTotal,
      ratio: torrent[10] / 1000,
      savePath,
      size: parseInt(torrent[5]),
      totalSize: undefined,
      tracker: undefined,
      trackerStatus: msg
    }
    if (isOpen !== '0') {
      if (getState === '0' || isActive === '0') {
        state = 'paused'
        stateText = '暂停'
      } else {
        if (result.progress === 1) {
          state = 'seeding'
          stateText = '做种'
        } else {
          state = 'downloading'
          stateText = '下载'
        }
      }
    }
    if (getHashing !== '0') {
      state = 'queued'
      stateText = '等待'
    }
    if (isHashChecking !== '0') {
      state = 'checking'
      stateText = '校验'
    }
    if (msg.length && msg !== 'Tracker: [Tried all trackers.]') {
      state = 'error'
      stateText = '错误'
    }
    result.state = state
    result.stateText = stateText
    return result
  }

  async getClientInfo() {
    const dirData = await this.request('plugins/diskspace/action.php')
    let listData = await this.getTorrentList({
      filter: 'all',
      pageSize: -1
    })
    const transInfo = await this.request(
      'plugins/httprpc/action.php',
      'mode=ttl'
    )
    const uploaded = parseInt(transInfo.data[0])
    const downloaded = parseInt(transInfo.data[1])
    listData = listData.data
    const tagList = []
    let upSpeed = 0
    let dlSpeed = 0
    listData.forEach((item) => {
      upSpeed += item.upSpeed
      dlSpeed += item.dlSpeed
      if (item.tag && !tagList.includes(item.tag)) {
        tagList.push(decodeURIComponent(item.tag))
      }
    })
    const freeSpace = dirData.data.free
    return {
      code: 1,
      data: {
        uploaded,
        downloaded,
        upSpeed,
        dlSpeed,
        freeSpace,
        tag: tagList,
        totalDownloaded: uploaded,
        totalUploaded: downloaded
      },
      msg: '请求成功'
    }
  }

  async getClientData(params) {
    const dirData = await this.request('plugins/diskspace/action.php')
    const list = await this.request(
      'plugins/httprpc/action.php',
      `cid=${params.rid}&mode=list&cmd=d.throttle_name%3D&cmd=d.custom%3Dchk-state&cmd=d.custom%3Dchk-time&cmd=d.custom%3Dsch_ignore&cmd=cat%3D%22%24t.multicall%3Dd.hash%3D%2Ct.scrape_complete%3D%2Ccat%3D%7B%23%7D%22&cmd=cat%3D%22%24t.multicall%3Dd.hash%3D%2Ct.scrape_incomplete%3D%2Ccat%3D%7B%23%7D%22&cmd=d.custom%3Dx-pushbullet&cmd=cat%3D%24d.views%3D&cmd=d.custom%3Dseedingtime&cmd=d.custom%3Daddtime`
    )
    const torrentList = this.getListArray(list.data.t).map((torrent) => {
      return this.transformTorrentList(torrent)
    })
    const transInfo = await this.request(
      'plugins/httprpc/action.php',
      'mode=ttl'
    )
    const tagList = []
    let upSpeed = 0
    let dlSpeed = 0
    torrentList.forEach((item) => {
      upSpeed += item.upSpeed
      dlSpeed += item.dlSpeed
      if (item.tag && !tagList.includes(item.tag)) {
        tagList.push(decodeURIComponent(item.tag))
      }
    })
    const freeSpace = dirData.data.free
    const uploaded = parseInt(transInfo.data[0])
    const downloaded = parseInt(transInfo.data[1])
    const removedTorrentList = list.data.d || []
    const serverState = {
      uploaded,
      downloaded,
      upSpeed,
      dlSpeed,
      freeSpace,
      totalDownloaded: uploaded,
      totalUploaded: downloaded
    }
    const returnData = {
      rid: list.data.cid,
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

  async pauseTorrent(params) {
    try {
      const res = await this.request(
        'plugins/httprpc/action.php',
        `mode=pause&hash=${params.id}`
      )
      if (!res.data) {
        throw new Error('操作失败')
      }
      return res
    } catch (error) {
      return {
        code: -1,
        msg: error.message
      }
    }
  }

  async resumeTorrent(params) {
    try {
      const res = await this.request(
        'plugins/httprpc/action.php',
        `mode=start&hash=${params.id}`
      )
      if (!res.data) {
        throw new Error('操作失败')
      }
      return res
    } catch (error) {
      return {
        code: -1,
        msg: error.message
      }
    }
  }

  async getDefaultSavePath() {
    const res = await this.request('plugins/httprpc/action.php', 'mode=stg')
    return {
      code: 1,
      data: res.data[4],
      msg: '请求成功'
    }
  }

  async recheck(params) {
    const res = await this.request(
      'plugins/httprpc/action.php',
      `mode=recheck&hash=${params.id}`
    )
    return res
  }

  async getTrackerHost(params) {
    const res = await this.request(
      'plugins/httprpc/action.php',
      `mode=trk&hash=${params.id}`
    )
    if (res.code !== -1) {
      return res.data[0][0]
    }
    return ''
  }

  async updateTracker({ id }) {
    const paramsObj = {
      methodCall: {
        methodName: 'd.tracker_announce',
        params: {
          param: {
            value: { string: id }
          }
        }
      }
    }
    const xmlData = await api('build-xml', {
      params: paramsObj
    })
    const params = xmlData.data
    const res = await this.request('plugins/httprpc/action.php', params)
    return res
  }

  async setLocation(params) {
    const res = await this.request(
      'plugins/datadir/action.php',
      `move_addpath=1&move_datafiles=1&move_fastresume=1&hash=${params.id}&datadir=${params.path}`
    )
    return res
  }

  async setTag(params) {
    const res = await this.request(
      'plugins/httprpc/action.php',
      `mode=setlabel&hash=${params.id}&v=${params.tags}&s=label`
    )
    return res
  }

  async deleteTorrent({ id, deleteFile = true }) {
    let params = ''
    if (deleteFile) {
      const paramsObj = {
        methodCall: {
          methodName: 'system.multicall',
          params: {
            param: {
              value: {
                array: {
                  data: {
                    value: [
                      {
                        struct: {
                          member: [
                            {
                              name: 'methodName',
                              value: { string: 'd.custom5.set' }
                            },
                            {
                              name: 'params',
                              value: {
                                array: {
                                  data: {
                                    value: [{ string: id }, { string: '1' }]
                                  }
                                }
                              }
                            }
                          ]
                        }
                      },
                      {
                        struct: {
                          member: [
                            {
                              name: 'methodName',
                              value: { string: 'd.delete_tied' }
                            },
                            {
                              name: 'params',
                              value: {
                                array: {
                                  data: {
                                    value: { string: id }
                                  }
                                }
                              }
                            }
                          ]
                        }
                      },
                      {
                        struct: {
                          member: [
                            {
                              name: 'methodName',
                              value: { string: 'd.erase' }
                            },
                            {
                              name: 'params',
                              value: {
                                array: {
                                  data: {
                                    value: { string: id }
                                  }
                                }
                              }
                            }
                          ]
                        }
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      }
      const xmlData = await api('build-xml', {
        params: paramsObj
      })
      params = xmlData.data
    } else {
      params = `mode=remove&hash=${id}`
    }
    console.log(params)
    const res = await this.request('plugins/httprpc/action.php', params)
    return res
  }

  async addTorrentsUrl(params) {
    const defaults = {
      urls: '',
      savepath: '',
      category: '',
      paused: false,
      type: 'url'
    }
    const reqParams = {
      ...defaults,
      ...params
    }
    return this.addTorrent(reqParams)
  }

  addTorrent(params) {
    const { url, username, password, path } = this.config
    const requestUrl = url + path + 'php/addtorrent.php'
    const authorization = this.getAuthorization(username, password)
    const formData = {
      dir_edit: params.savepath,
      label: params.category,
      json: 'true'
    }
    formData.url = params.urls
    if (params.paused) {
      formData.torrents_start_stopped = 'true'
    }
    const reqData = makeFormdata(formData)
    const requestOptions = {
      method: 'POST',
      url: requestUrl,
      header: {
        Authorization: 'Basic ' + authorization,
        'content-type': 'multipart/form-data; boundary=transclient'
      },
      data: reqData
    }
    return new Promise((resolve, reject) => {
      wepy
        .request({ ...requestOptions })
        .then((res) => {
          if (res.data.result !== 'Success') {
            reject(new Error('上传失败'))
          }
          resolve({
            code: 1,
            msg: '上传成功'
          })
        })
        .catch((error) => {
          reject(error.message)
        })
    })
  }

  async addTorrentFile(params) {
    const { url, username, password, path } = this.config
    const requestUrl = url + path + 'php/addtorrent.php'
    const authorization = this.getAuthorization(username, password)
    const formData = {
      dir_edit: params.savepath,
      label: params.category,
      json: 'true'
    }
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: requestUrl,
        filePath: params.fileId,
        name: 'torrent_file',
        formData,
        header: {
          Authorization: 'Basic ' + authorization
        },
        success(res) {
          const data = JSON.parse(res.data)
          if (data.result !== 'Success') {
            throw new Error('添加失败')
          }
          resolve({
            code: 1,
            msg: '上传成功'
          })
        },
        fail(error) {
          reject(new Error(error))
        }
      })
    })
  }
}
