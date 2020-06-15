[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://paypal.me/gridspace3d?locale.x=en_US)

Contributions in all forms (code, bug reports, community engagenment, cash money, etc) are warmly welcomed. They all go to the bottom line of making better apps.

### Hosted Apps

* [Grid.Space](https://grid.space) hosts [several live versions](https://grid.space/choose) of the code
* [Kiri:Moto](https://grid.space/kiri) -- A Unique, Multi-Modal, Browser-based Slicer for 3D printers, CNC mills and Laser cutters
* [Meta:Moto](https://grid.space/meta) -- A Recursive Block-based Modeler

### Getting Started

```
npm i
npm start
```

to start a local instance of the apps. then open
[Kiri:Moto](http://localhost:8080/kiri) or
[Meta:Moto](http://localhost:8080/meta) on your local host

### Windows Developers

this git repo requires symbolic link support. on Windows, this means you have to clone the repo in a shell window running with Administrator privileges.

### Other Start Options

```
npm run-script start-secure
```
serves code as obfuscated, compressed bundles. this is the mode used to run on a public
web site, so you can't use "localhost" to test. to accommodate this, alias "debug" to 127.0.0.1
then access the apps from http://debug:8080/

requires node.js 12+

## More Information

* [Facebook Group](https://www.facebook.com/groups/kirimoto/)
* [YouTube Tutorials](https://www.youtube.com/c/gridspace)
* [Twitter](https://twitter.com/grid_space_3d)
* [Wiki](https://github.com/GridSpace/grid-apps/wiki)
