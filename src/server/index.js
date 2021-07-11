import Qbittorrent from './clients/qbittorrent'
import Transmission from './clients/transmission'
import Deluge from './clients/deluge'
import Utorrent from './clients/utorrent'
import Rutorrent from './clients/rutorrent'
import Ds from './clients/downloadStation'
const defaultOption = {
  baseUrl: '',
  username: '',
  password: '',
  timeout: 5000,
  type: 'qbittorrent' // transmission,deluge
}

export default class TransClient {
  constructor (options) {
    this.config = {
      ...defaultOption,
      ...options
    }
  }

  init () {
    let client = null
    const { type } = this.config
    if (type === 'qbitorrent') {
      client = new Qbittorrent(this.config)
    } else if (type === 'transmission') {
      client = new Transmission(this.config)
    } else if (type === 'deluge') {
      client = new Deluge(this.config)
    } else if (type === 'utorrent') {
      client = new Utorrent(this.config)
    } else if (type === 'rutorrent') {
      client = new Rutorrent(this.config)
    } else if (type === 'downloadStation') {
      client = new Ds(this.config)
    }
    return client
  }
}
