if (self.kiri)
  self.kiri.load((api) => {
    console.log('ELECTRON MODULE RUNNING');
    api.electron = {};
    api.event.on('init-done', () => {
      $('app-name-text').innerText = 'More Info';
      $('top-sep').style.display = 'flex';
    });
    api.stats.set('kiri', self.kiri.version + 'e');
  });
if (self.mesh && self.mesh.api) {
  self.mesh.api.electron = {};
}
