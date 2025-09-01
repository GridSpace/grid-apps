---
description: A 3D Mesh Repair and Editing Tool, and 2D Sketch Tool in one
title: 'Mesh:Tool'
id: mesh-tool
---

# Mesh:Tool

## About

[Mesh:Tool](https://grid.space/mesh) is an intentionally simplified tool designed to address the most common cases of mesh editing and repair. It is under active development with new features daily or weekly. This means the docs can get out of date quickly.

Mesh:Tool is part of the [Grid.Apps GitHub Repo](https://github.com/GridSpace/grid-apps) and is Open Source under the [MIT License](https://en.wikipedia.org/wiki/MIT_License). It runs entirely in browser, is not connected to the cloud, and does not collect or share any model data. [Desktop builds](https://github.com/GridSpace/grid-apps/releases) are available whiel start in the Slicer view. Use the central drop-menu to switch to Mesh:Tool.

Browse the Mesh:Tool [video playlist](https://www.youtube.com/playlist?list=PLRoVgyRoWZps84Scj5wQ2LYK-wMu-7r0L) on YouTube

Join a discussion on the [Grid.Space Discord Server](https://discord.com/invite/E6QEjWpD8g) or [Forums](https://forum.grid.space/)

## Getting Started

It's as simple as dropping models onto the workspace or clicking the import button. Models dropped or imported together will be grouped together. Supported types: STL, OBJ, SVG, Gerber

## 3D and 2D Editing

There are two primary modes of operation: 3D Mesh and 2D Sketch. Use the Mode menu to select or clicking on an object or sketch will automatically change modes.

3D Meshes can be booleaned and faces reparied. Importing 2D file formats when in Object mode will result in auto-extrusion.

2D Sketch entities can be drawn directly or come from imports of SVG or Gerber files. Select a sketch to import 2D file components. Sketches or selections can be extruded parametrically.

## Keyboard / Mouse Shortcuts

| Key                    | Action                                            |
| ---------------------- | ------------------------------------------------- |
| [Delete]               | Delete Selection                                  |
| E                      | Extrude Sketch or Sketch Selection                |
| I                      | Import File(s)                                    |
| M                      | Merge Selection into a Single Model               |
| S                      | Enter Split Mode (click splits on selected plane) |
| V                      | Focus Camera on Center of Selection               |
| X                      | Export Selection as OBJ or STL                    |
| Shift + A              | Analyze Selection Geometries                      |
| Shift + D              | Duplicate Selection                               |
| Shift + S              | Toggle Selection Visibility                       |
| Shift + G              | Group or Re-Group                                 |
|                        | **Rotation**                                      |
| Left and Right Arrows  | Rotate around Z                                   |
| Up and Down Arrows     | Rotate around Y                                   |
| Shift + Left/Right     | Rotate around X                                   |
|                        | **View**                                          |
| H                      | Home view                                         |
| T                      | Top down view                                     |
| Z                      | Reset Viewport                                    |
| Meta + Click           | Set Camera Focus                                  |
| Mouse Wheel / 2 Finger | Zoom In / Out                                     |
|                        | **Move**                                          |
| F                      | Floor: Put Model Bottoms on Grid                  |
| C                      | Center Selection on Grid                          |
| Ctrl + Click           | _Lay Flat_: Rotate Clicked Face Toward Grid       |
| Shift + Drag           | Move Selection in the X/Y Plane                   |
|                        | **Workspace**                                     |
| B                      | Toggle Selection Bounding Box                     |
| G                      | Toggle Grid Lines                                 |
| L                      | Toggle Log Message Display                        |
| N                      | Toggle Normals Visualization                      |
| Q                      | Open Preferences Dialog                           |
| W                      | Toggle Wireframe Visualization                    |

## Screenshots

![](</img/Screenshot 2024-07-30 at 11.27.49 AM.png>)

![](</img/meshtool vid hero.png>)

![](</img/Screen Shot 2022-01-11 at 11.22.35 PM.png>)
