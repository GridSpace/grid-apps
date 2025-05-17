---
description: Frequently Asked Questions
---

# FAQ

## Is Kiri:Moto free? Open Source?

Entirely.

The source code is on [GitHub](https://github.com/GridSpace/grid-apps) if you want to install and run it yourself. It is available under the [MIT](https://en.wikipedia.org/wiki/MIT\_License) license, which is one of the most liberal in terms of allowing you to do what you want with the code without restriction.

Multiple live [versions](https://grid.space/choose) (including current development branches) are served free of charge and free of ads on [Grid.Space](https://grid.space/kiri/).

## How does it compare to other slicers?

It has similar capabilities to other 3D printing slicers like Cura, Simplify3D, and PrusaSlicer.

It is very different in several important ways:

* There is no software to install or maintain. It's just a web page.
* As a web app, it runs in a security sandbox and cannot access data on your hard drive
* It offers several modes of operation for most of the common maker tools, like CNC mills
* It is updated quite frequently (several times a week) with bug fixes and new features

## What language is it written in?

It is almost entirely Javascript. There are a few minor modules compiled into WASM for performance.

## What file types are supported?

[STL](https://en.wikipedia.org/wiki/STL\_\(file\_format\)), [OBJ](https://en.wikipedia.org/wiki/Wavefront\_.obj\_file), and [3MF](https://github.com/3MFConsortium/spec\_core/blob/master/3MF%20Core%20Specification.md) files are supported for 3D part import. [SVG](https://en.wikipedia.org/wiki/Scalable\_Vector\_Graphics) files import and auto-convert into 3D models. [PNG](https://en.wikipedia.org/wiki/Portable\_Network\_Graphics) files are supported for 2D image to 3D model conversion.

## What if my printer isn't supported?

You can either find a device close to yours and "customize" it in the device dialog. Or you can import a PrusaSlicer .ini file and it will auto-convert into Device + Profile settings. Caveat: macro logic is not automatically converted.

## How can I get involved?

Start with the [forum](https://forum.grid.space/) discussions. If you want to get involved with Kiri:Moto development, download the [code](https://github.com/GridSpace/grid-apps) and join the Discord [server](https://discord.com/invite/suyCCgr).

## Where does the name come from?

Kiri comes from Kiri-e, which is the Japanese art of paper-cutting. Moto is short for "modeling tool".

