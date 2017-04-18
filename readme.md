# KiriMoto

`KiriMoto` is a unique multi-modal, extensible slicer, gcode generation framework

## Getting Started

```
npm update
npm start
```

to start a local testing instance of KiriMoto on port 8080

## Other Start Options

```
npm run-script start-web
```
serves code as obfuscated, compressed bundles. this is the mode used to run on a public
web site, so you can't use "localhost" to test. to accomodate this, alias "debug" to 127.0.0.1
then access KiriMoto on http://debug:8080
