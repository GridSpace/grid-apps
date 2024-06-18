## Grid.Space Web Applications

[![Website](https://img.shields.io/website?url=https%3A%2F%2Fgrid.space%2F)](https://grid.space/kiri/)
![GitHub package.json version (branch)](https://img.shields.io/github/package-json/v/GridSpace/grid-apps/rel-3.3)
![GitHub package.json version (branch)](https://img.shields.io/github/package-json/v/GridSpace/grid-apps/rel-3.4)
![GitHub package.json version (branch)](https://img.shields.io/github/package-json/v/GridSpace/grid-apps/rel-3.5)
![GitHub package.json version (branch)](https://img.shields.io/github/package-json/v/GridSpace/grid-apps/rel-3.6)

[`Grid.Space`](https://grid.space) hosts [several live versions](https://grid.space/choose) of this code

[`Kiri:Moto`](https://grid.space/kiri) is a browser-based Slicer for 3D printers, CNC mills, and Laser cutters

[`Mesh:Tool`](https://grid.space/mesh) is a browser-based mesh repair and editing tool

## Electron Builds (Desktop Binaries)

https://github.com/GridSpace/grid-apps/releases/

Click on "Assets" under the release name to reveal files

Linux x86 requires the following to run:

```
sudo apt -y install fuse
chmod 755 KiriMoto-linux-x86_64.AppImage
./KiriMoto-linux-x86_64.AppImage --no-sandbox
```

The Windows and Mac binaries are not signed, so you will need to jump through a few "safety" hoops to get them to open the first time.

## Primary Documentation

https://docs.grid.space/projects/kiri-moto

https://docs.grid.space/projects/mesh-tool

## Development Activity

![GitHub commit activity](https://img.shields.io/github/commit-activity/w/GridSpace/grid-apps)
![GitHub last commit](https://img.shields.io/github/last-commit/GridSpace/grid-apps)
![GitHub contributors](https://img.shields.io/github/contributors/GridSpace/grid-apps)

## Community Engagement

[Discord](https://discord.com/invite/suyCCgr)
 | [YouTube](https://www.youtube.com/c/gridspace)
 | [Twitter](https://twitter.com/grid_space_3d)

[![Discord](https://img.shields.io/discord/688863523207774209)](https://discord.com/channels/688863523207774209/688863523211968535)
![GitHub](https://img.shields.io/github/license/GridSpace/grid-apps)
[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://paypal.me/gridspace3d?locale.x=en_US)
![Twitter Follow](https://img.shields.io/twitter/follow/grid_space_3d?label=follow&style=social)


## Testing Locally (with Docker)

```
git clone git@github.com:GridSpace/grid-apps.git
cd grid-apps
docker-compose -f src/dock/compose.yml up
```

## Testing Locally (with NodeJS)

```
git clone git@github.com:GridSpace/grid-apps.git
cd grid-apps
npm i
npm install -g @gridspace/app-server
gs-app-server --debug
```

to start a local instance of the apps. then use a browser to open
[localhost:8080/kiri](http://localhost:8080/kiri)

if installing the app-server fails or gives you permissions errors, then your node installation (on linux/mac) is installed as another user (like root). try instead:

```
sudo npm install -g @gridspace/app-server
```

Alternatively, if you are using a packaged version of npm that ships with
a Linux distribution, but still want to install in your home directory, you
can use

```
npm config set prefix ~/.local
```

If gs-app-server is not found, then perhaps ~/.local/bin is not in
your path. You can either add it to your path, or you can run:

```
~/.local/bin/gs-app-server --debug
```

You can now access your environment of grid-apps by going to
[localhost:8080/kiri](http://127.0.0.1:8080/kiri)

## Windows Developers

this git repo requires symbolic link support. on Windows, this means you have to clone the repo in a command shell with Administrator privileges.

## Other Start Options

```
gs-app-server
```
serves code as obfuscated, compressed bundles. this is the mode used to run on a public
web site.

requires node.js 12+

## Javascript Slicing APIs

A script include that injects a web worker into the page that will asynchronously perform any of Kiri’s slicing and gcode generation functions. And a frame messaging API for controlling Kiri:Moto inside an IFrame.

* https://grid.space/kiri/engine.html
* https://grid.space/kiri/frame.html
