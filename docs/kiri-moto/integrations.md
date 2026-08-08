---
description: >-
  Kiri:Moto is designed to be embedded in or accessible through other web-based
  applications
---

# Integrations

## OctoPrint

Use the [GridSpace OctoPrint](https://plugins.octoprint.org/plugins/gridspace/) plugin to spool jobs directly from Kiri:Moto to any printer on your local network

## Onshape

Kiri:Moto is available inside of [Onshape](https://onshape.com/) as a web-app extension. Once [installed](https://www.youtube.com/watch?v=AbbZjj5FMGE) through Onshape's App store, Kiri:Moto can be added as a tab (just like a Part Studio) inside of any document in which you have edit capabilities. In this mode, Kiri:Moto's import function is replaced to bring up Onshape's part dialog. This makes it easy to load parts directly for slicing without first having to export them.

## Lychee Slicer

Kiri:Moto's FDM engine is used to power the FDM mode of Mango 3D's [Lychee Slicer](https://lychee.mango3d.io/)

## SimplyPrint.io

Kiri:Moto is the slicing engine behind [SimplyPrint's](https://simplyprint.io/) web-based printer management system.

## Sienci's CAMLab

[CAMLab](http://camlab.sienci.com/camlab) is a fork of an earlier version of Kiri:Moto.

## CNCjs

[CNCjs](https://cncjs.io/) is a web-based controller for GRBL and other CNC firmware. Kiri:Moto's laser mode can send gcode directly to CNCjs using the `tools/cncjs-bridge` shim included in this repository.

The bridge is a zero-dependency Node.js server that accepts Kiri's OctoPrint-format uploads and forwards them to CNCjs's `/api/gcode` endpoint.

### Setup

```
cd tools/cncjs-bridge
node bridge.js
```

The bridge listens on port **5310** by default. In Kiri:Moto's laser export dialog, enable the **exportOcto** controller setting, then set the host to `http://localhost:5310` with no API key.

In the laser device settings, configure the laser on/off commands for GRBL:
- **Laser On**: `M3 S{power}`
- **Laser Off**: `M5`

Enable GRBL laser mode on your controller once with `$32=1` via the CNCjs console.

## Thingiverse

Like Onshape, Kiri:Moto is integrated as a native [Thing-app](https://www.thingiverse.com/apps/kirimoto) into Thingiverse. As a user of Thingiverse, you can elect to have Kiri:Moto show up as a "way to open" a Thing file. This provides the convenience of directly accessing, slicing, and printing parts on Thingiverse without first having to download them and then re-import them into a slicer.

Unfortunately, as of this writing, Thingiverse Thing Apps are broken (again)
