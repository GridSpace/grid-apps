---
description: options for accessing KM's engine APIs
label: Engine APIs
---

# Engine APIs
The `Engine` class serves as an abstraction layer for interacting with the `kiri` 3D slicing engine. It handles loading and parsing STL files, manipulating widgets (3D models), configuring slicing parameters, and executing the toolpath generation pipeline: slice, prepare, and export.

This API is designed with method chaining in mind, and provides hooks for custom event listeners.

you can view some example of how to use the engine [here](https://grid.space/kiri/engine.html).


---

## Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `load(url)` | Loads an [STL](https://en.wikipedia.org/wiki/STL\_\(file\_format\)) file from a given URL and centers the model. | `Promise<Engine>` |
| `clear()` | Clears all objects from workspace. | `void` |
| `parse(data)` | Parses raw [STL](https://en.wikipedia.org/wiki/STL\_\(file\_format\)) data and loads it as a centered widget. | `Promise<Engine>` |
| `setListener(listener)` | Sets an event listener function to receive engine progress updates  | `Engine` |
| `setRender(bool)` | Enables or disables rendering. | `Engine` |
| `setMode(mode)` | Sets the slicing mode where mode is "CAM"|"FDM"|"LASER"|"SLA" . | `Engine` |
| `setDevice(device)` | Merges a custom device profile into the current settings. | `Engine` |
| `setProcess(process)` | Merges custom slicing process parameters. | `Engine` |
| `setController(controller)` | Sets the slicing controller settings and starts/stops the worker pool accordingly. | `Engine` |
| `setTools(tools)` | Sets the tool definitions (e.g. cutters, extruders). | `Engine` |
| `setStock(stock)` | Sets the stock material dimensions. | `Engine` |
| `setOrigin(x, y, z)` | Defines the origin point for the part. | `Engine` |
| `moveTo(x, y, z)` | Moves the widget to the specified absolute coordinates. | `Engine` |
| `move(x, y, z)` | Moves the widget by the specified delta values. | `Engine` |
| `scale(x, y, z)` | Scales the widget along each axis. | `Engine` |
| `rotate(x, y, z)` | Rotates the widget in degrees along each axis. | `Engine` |
| `slice()` | Starts the slicing process and returns once complete. | `Promise<Engine>` |
| `prepare()` | Prepares the sliced toolpaths for export (e.g. G-code generation). | `Promise<Engine>` |
| `export()` | Exports the toolpaths as a string (e.g. G-code). | `Promise<string>` |

---

## Events via Listener

If a listener is set via `setListener(fn)`, it will be called with events such as:

- `{ loaded, vertices }` — when an STL file is loaded
- `{ parsed, vertices }` — when raw data is parsed
- `{ slice: msg }` — when slicing is complete
- `{ prepare: { update } }` — during toolpath preparation
- `{ prepare: { done: true } }` — when preparation is complete
- `{ export: { segment } }` — during G-code segment export
- `{ export: { done } }` — when export is finished

These allow for building progress indicators or responding to processing stages.