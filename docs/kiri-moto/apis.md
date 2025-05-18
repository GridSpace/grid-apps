---
description: Various ways to access Kiri:Moto's internals (2.6 and newer versions only)
---

# API, CLI, Embedding

## Javascript Slicer Engine

The latest slicing engine code is served live at `https://grid.space/code/engine.js`

This can be embedded in your page then accessed with the API calls defined on the [Engine APIs](kiri-moto/engine-apis) page

An example page is [here](https://grid.space/kiri/engine.html).



## Command Line API

The slicer engine is also available as a command-line utility

```
node src/kiri-run/cli --help

cli <options> <file>
   --verbose           | enable verbose logging
   --dir=[dir]         | root directory for file paths (default: '.')
   --model=[file]      | model file to load (or last parameter)
   --source=[file]     | source file list (defaults to kiri engine)
   --device=[file]     | device definition file (json)
   --process=[file]    | process definition file (json)
   --controller=[file] | controller definition file (json)
   --output=[file]     | gcode output to file or '-' for stdout
   --position=x,y,z    | move loaded model to position x,y,z
   --rotate=x,y,z      | rotate loaded model x,y,z radians
   --scale=x,y,z       | scale loaded model in x,y,z
   --move=x,y,z        | move loaded model x,y,z millimeters
```

Example [Device](https://github.com/GridSpace/grid-apps/blob/master/src/cli/kiri-fdm-device.json) and [Process](https://github.com/GridSpace/grid-apps/blob/master/src/cli/kiri-fdm-process.json) settings which are defined in [init.js](https://github.com/GridSpace/grid-apps/blob/master/src/kiri/conf.js) around line `250`

JSON dictionaries can be used for reference from the [CLI package](https://github.com/GridSpace/grid-apps/tree/master/src/cli)

## Embedding Kiri:Moto with an IFrame

Kiri:Moto is designed to be embedded in a page using an IFrame. The look and feel and other controls are available for the loaded page using a messaging API. An example page is [here](https://grid.space/kiri/frame.html).

| function                    | description                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| setFrame(_id\_obj_)         | id or object of IFrame with Kiri:Moto loaded                                                            |
| load(_url_)                 | load an [STL](https://en.wikipedia.org/wiki/STL\_\(file\_format\)) referred to by _url_                 |
| clear()                     | remove all objects from workspace                                                                       |
| parse(_data_)               | parse the text or binary contents of an [STL](https://en.wikipedia.org/wiki/STL\_\(file\_format\)) file |
| setMode(_mode_)             | where _mode_ comes from:`[ "CAM", "FDM", "LASER", "SLA" ]`                                              |
| setDevice(_options_)        | change default Device options                                                                           |
| setProcess(options)         | change default Process options                                                                          |
| setController(options)      | change default Core options                                                                             |
| slice()                     | async slice of loaded object                                                                            |
| prepare()                   | async path routing of slice data                                                                        |
| export()                    | async gcode generation from routed paths                                                                |
| onmessage(_fn_)             | function will receive all IFrame messages                                                               |
| onevent(_event, data_)      | function will receive named messages                                                                    |
| emit(_event, data_)         | send named event with data payload                                                                      |
| alert(_msg, time_)          | show alert message with optional time in seconds                                                        |
| process(_percent, message_) | set progress bar (0.0 to 1.0) with optional message                                                     |

## Events

| Key              | Output | Description                                    |
| ---------------- | ------ | ---------------------------------------------- |
| animate          |        | CNC Animation Started                          |
| boolean.update   |        | Boolean checkbox values sync'd                 |
| code.load        |        | GCode or SVG code is being loaded / parsed     |
| code.loaded      |        | GCode / SVG code parsing complete              |
| device.set       |        | A new machine / device was selected            |
| export           |        | GCode / SVG export dialog is open              |
| help.show        |        | A Help dialog is open                          |
| init-done        |        | App is fully initialized                       |
| init.one         |        | App is starting to initialize                  |
| init.two         |        | App is binding UI elements                     |
| key.esc          |        | \[ESC] key was pressed                         |
| keypress         |        | A non-control or meta key was pressed          |
| load.lib         |        | A script extension was loaded                  |
| modal.show       |        | A modal dialog is showing                      |
| mode.set         |        | App mode changed: `FDM, CNC, Laser, SLA`       |
| mouse.hover      |        | Mouse is hovering over a feature of interest   |
| mouse.hover.down |        | Mouse down on a feature of interest            |
| mouse.hover.up   |        | Mouse up on a feature of interest              |
| platform.layout  |        | Platform auto-layout was performed             |
| preview.begin    |        | Preview Mode calculations started              |
| preview.end      |        | Preview Mode calculations complete             |
| preview.error    |        | Preview Mode calculations encountered an error |
| print            |        | Legacy: same as `preview.end`                  |
| range.updates    |        | FDM Range records were changed                 |
| reload           |        | App page will reload in 100ms                  |
| resize           |        | App page was resized                           |
| selection.drag   |        | Generated during object drag                   |
| selection.move   |        | After object drag completes                    |
| selection.rotate |        | Selected objects were rotated                  |
| selection.scale  |        | Selected objects were scaled                   |
| settings         |        | Settings object changed                        |
| settings.load    |        | Settings object was replaced                   |
| settings.saved   |        | Settings object was saved                      |
| slice            |        | Deprecated                                     |
| slice.begin      |        | Slicing calculations started                   |
| slice.end        |        | Slicing calculations complete                  |
| slice.error      |        | Slicing calculations encountered and error     |
| slider.label     |        | Slider labels changed                          |
| slider.pos       |        | Slider position changed                        |
| slider.set       |        | Slider values changed                          |
| view.set         |        | View mode changed: `slice, preview, animate`   |
| widget.add       |        | An object was added to the workspace           |
| widget.delete    |        | An object was deleted from the workspace       |
| widget.deselect  |        | An object was de-selected                      |
| widget.rotate    |        | An object was rotated                          |
| widget.select    |        | An object was selected                         |
