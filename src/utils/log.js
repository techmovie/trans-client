const log = wx.getRealtimeLogManager ? wx.getRealtimeLogManager() : null
const logger = {
  info() {
    if (!log) return
    log.info(arguments)
  },
  warn() {
    if (!log) return
    log.warn(arguments)
  },
  error() {
    if (!log) return
    log.error(arguments)
  },
  setFilterMsg(msg) { // 从基础库2.7.3开始支持
    if (!log || !log.setFilterMsg) return
    if (typeof msg !== 'string') return
    log.setFilterMsg(msg)
  },
  addFilterMsg(msg) { // 从基础库2.8.1开始支持
    if (!log || !log.addFilterMsg) return
    if (typeof msg !== 'string') return
    log.addFilterMsg(msg)
  }
}
export default logger
