# Grid.Space Applications

![GitHub commit activity](https://img.shields.io/github/commit-activity/w/GridSpace/grid-apps)
![GitHub package.json version (branch)](https://img.shields.io/github/package-json/v/GridSpace/grid-apps/rel-3.9)
![GitHub package.json version (branch)](https://img.shields.io/github/package-json/v/GridSpace/grid-apps/rel-4.0)
![GitHub package.json version (branch)](https://img.shields.io/github/package-json/v/GridSpace/grid-apps/rel-4.1)

![GitHub contributors](https://img.shields.io/github/contributors/GridSpace/grid-apps)
![GitHub last commit](https://img.shields.io/github/last-commit/GridSpace/grid-apps)
![GitHub](https://img.shields.io/github/license/GridSpace/grid-apps)


# Community

[Discord](https://discord.com/invite/suyCCgr) -- Live Chat  
[Forums](https://forum.grid.space/) -- Long Form and Archival Discussion  
[BlueSky](https://bsky.app/profile/grid.space) -- Like the Good 'Ol Days  
[YouTube](https://www.youtube.com/c/gridspace) -- Content when I have time  

# Free and Open Source

Kiri:Moto and Mesh:Tool are completely open source and free for use without restriction. Over 12 years in development, this passion project has grown well beyond its original scope. It has consumed most of my free time for many years. Please consider donating to support continued development GitHub sponsorship or PayPal.  

[![GitHub Sponsors](https://img.shields.io/github/sponsors/GridSpace)](https://github.com/sponsors/GridSpace)
[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://paypal.me/gridspace3d?locale.x=en_US)

# Documentation
[Documentation](https://docs.grid.space/) -- Could really use help with this  

Docs are build with [Docusaurus](https://docusaurus.io/) and served using [GitHub Pages](https://pages.github.com/).

You can build and view the docs locally with:
```
git clone git@github.com:GridSpace/grid-apps.git
cd grid-apps
npm run setup
npm run docs-dev
```

# HTML5 Web Apps (Installable)

[`Grid.Space`](https://grid.space) hosts [several live versions](https://grid.space/choose) of this code

[`Kiri:Moto`](https://grid.space/kiri) is a browser-based Slicer for 3D printers, CNC mills, and Laser cutters

[`Mesh:Tool`](https://grid.space/mesh) is a browser-based mesh repair and editing tool


# Electron Builds (Desktop Binaries)

https://github.com/GridSpace/grid-apps/releases/

Click on "Assets" under the release name to reveal files

Linux x86 requires the following to run:

```
sudo apt -y install fuse
chmod 755 KiriMoto-linux-x86_64.AppImage
./KiriMoto-linux-x86_64.AppImage --no-sandbox
```

The Windows and Mac binaries are not signed, so you will need to jump through a few safety hoops to get them to open the first time.


# Linux / Mac Developers

## Testing Locally (with Docker)

```
git clone git@github.com:GridSpace/grid-apps.git
cd grid-apps
npm run setup
docker-compose -f src/dock/compose.yml up
```

## Testing Locally (with Electron)

```
git clone git@github.com:GridSpace/grid-apps.git
cd grid-apps
npm run setup
npm run start
```

## Testing Locally (with NodeJS)

```
git clone git@github.com:GridSpace/grid-apps.git
cd grid-apps
npm run setup
npm run dev
```

## TrueNAS Via YAML

`Apps > Discover Apps > Install via YAML`

```
services:
  kirimoto:
    build:
      context: https://github.com/GridSpace/grid-apps.git#refs/tags/latest
      dockerfile: ./src/dock/Dockerfile
    ports:
      - "8080:8080"
```

## For any default install...

Then open a browser to [localhost:8080/kiri](http://localhost:8080/kiri)

# Windows Developers

Follow the instructions in [this issue comment](https://github.com/GridSpace/grid-apps/issues/331#issuecomment-2692492302).

# Javascript Slicing APIs

A script include that injects a web worker into the page that will asynchronously perform any of Kiri’s slicing and gcode generation functions. And a frame messaging API for controlling Kiri:Moto inside an IFrame.

* https://grid.space/kiri/engine.html
* https://grid.space/kiri/frame.html
