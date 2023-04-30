# Application modules

This allows for the loading of server-side modules which can, in turn,
inject browser modules into applications like Kiri:Moto.

To enable the sample module:

* create a `mod` directory at the root of grid-apps
* copy the sample directory into the mod directory: `mod/sample`
* (re)start `gs-app-server`
* you will see log lines at start-up similar to this

```
220128.120432 '[head]' { module: './mod/sample/init.js' }
220128.120432 '[head]' '--- sample server-side module loaded ---'
```

* reloading Kiri:Moto from localhost, you will see these javascript
* console log messages indicaing the new module code is running

```
--- kiri main module start ---
--- kiri main module started ---
{server_said: 'received 39 bytes'}
--- kiri worker module start ---
--- kiri worker module started ---
```
