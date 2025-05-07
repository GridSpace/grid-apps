/**
 * for electron standalone build support
 */
module.exports = function (server) {
  // insert script before all others in kiri client
  server.inject('kiri', 'electron.js')
  // insert scripts into mesh client
  server.inject('mesh', 'electron.js')
}
