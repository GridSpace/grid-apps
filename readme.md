[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://paypal.me/gridspace3d?locale.x=en_US)

Contributions in all forms (code, bug reports, community engagenment, cash money, etc) are warmly welcomed. They all go to the bottom line of making better apps.

![Discord](https://img.shields.io/discord/688863523207774209)
![GitHub](https://img.shields.io/github/license/GridSpace/grid-apps)
![Twitter Follow](https://img.shields.io/twitter/follow/grid_space_3d?label=follow&style=social)

### Hosted Apps

* [Grid.Space](https://grid.space) hosts [several live versions](https://grid.space/choose) of the code
* [Kiri:Moto](https://grid.space/kiri) -- A Unique, Multi-Modal, Browser-based Slicer for 3D printers, CNC mills and Laser cutters
* [Meta:Moto](https://grid.space/meta) -- A Recursive Block-based Modeler

### Live Versions

![Website](https://img.shields.io/website?url=https%3A%2F%2Fgrid.space%2F)
![GitHub package.json version (branch)](https://img.shields.io/github/package-json/v/GridSpace/grid-apps/rel-2.0)
![GitHub package.json version (branch)](https://img.shields.io/github/package-json/v/GridSpace/grid-apps/rel-2.1)
![GitHub package.json version](https://img.shields.io/github/package-json/v/GridSpace/grid-apps)

### Development Activity

![GitHub commit activity](https://img.shields.io/github/commit-activity/y/GridSpace/grid-apps)
![GitHub last commit](https://img.shields.io/github/last-commit/GridSpace/grid-apps)
![GitHub contributors](https://img.shields.io/github/contributors/GridSpace/grid-apps)

## Get Involved

* [Facebook Kiri:Moto Users Group](https://www.facebook.com/groups/kirimoto/)
* [YouTube Videos](https://www.youtube.com/c/gridspace)
* [Twitter Updates](https://twitter.com/grid_space_3d)
* [Wiki Reference](https://github.com/GridSpace/grid-apps/wiki)

### Testing Locally

```
git clone git@github.com:GridSpace/grid-apps.git
npm i
npm start
```

to start a local instance of the apps. then open
[Kiri:Moto](http://localhost:8080/kiri) or
[Meta:Moto](http://localhost:8080/meta) on your local host

### Windows Developers

this git repo requires symbolic link support. on Windows, this means you have to clone the repo in a command shell with Administrator privileges.

### Other Start Options

```
npm run-script start-secure
```
serves code as obfuscated, compressed bundles. this is the mode used to run on a public
web site, so you can't use "localhost" to test. to accommodate this, alias "debug" to 127.0.0.1
then access the apps from http://debug:8080/

requires node.js 12+
