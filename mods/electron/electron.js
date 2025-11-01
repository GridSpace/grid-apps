if (self.kiri && !self.kiri.electron) {
    self.kiri.electron = {};
    self.kiri.load(api => {
        console.log('ELECTRON MODULE LOADED');
        api.event.on('init-done', () => {
            $('app-name-text').innerText = "More Info";
            $('top-sep').style.display = 'flex';
        });
        api.stats.set('kiri', api.version + 'e');
    });
}

if (self.mesh && self.mesh) {
    self.mesh.electron = {};
}
