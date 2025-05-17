---
description: A 3D Mesh Repair and Editing Tool, and 2D Sketch Tool in one
title: "Mesh:Tool"
id: mesh-tool
---

# Mesh:Tool

## About

[Mesh:Tool](https://grid.space/mesh) is an intentionally simplified tool designed to address the most common cases of mesh editing and repair. It is under active development with new features daily or weekly. This means the docs can get out of date quickly.

Mesh:Tool is part of the [Grid.Apps GitHub Repo](https://github.com/GridSpace/grid-apps) and is Open Source under the [MIT License](https://en.wikipedia.org/wiki/MIT\_License). It runs entirely in browser, is not connected to the cloud, and does not collect or share any model data. [Desktop builds](https://github.com/GridSpace/grid-apps/releases) are available whiel start in the Slicer view. Use the central drop-menu to switch to Mesh:Tool.

Browse the Mesh:Tool [video playlist](https://www.youtube.com/playlist?list=PLRoVgyRoWZps84Scj5wQ2LYK-wMu-7r0L) on YouTube

Join a discussion on the [Grid.Space Discord Server](https://discord.com/invite/E6QEjWpD8g) or [Forums](https://forum.grid.space/)

## Getting Started

It's as simple as dropping models onto the workspace or clicking the import button. Models dropped or imported together will be grouped together. Supported types: STL, OBJ, SVG, Gerber

## 3D and 2D Editing

There are two primary modes of operation: 3D Mesh and 2D Sketch. Use the Mode menu to select or clicking on an object or sketch will automatically change modes.

3D Meshes can be booleaned and faces reparied. Importing 2D file formats when in Object mode will result in auto-extrusion.

2D Sketch entities can be drawn directly or come from imports of SVG or Gerber files. Select a sketch to import 2D file components. Sketches or selections can be extruded parametrically.

## Keyboard / Mouse Shortcuts

<table><thead><tr><th width="212.5359955621766"></th><th width="289.3333333333333"></th></tr></thead><tbody><tr><td></td><td><strong>Selection</strong></td></tr><tr><td>[Delete]</td><td>Delete Selection</td></tr><tr><td>E</td><td>Extrude Sketch or Sketch Selection</td></tr><tr><td>I</td><td>Import File(s)</td></tr><tr><td>M</td><td>Merge Selection into a Single Model</td></tr><tr><td>S</td><td>Enter Split Mode (click splits on selected plane)</td></tr><tr><td>V</td><td>Focus Camera on Center of Selection</td></tr><tr><td>X</td><td>Export Selection as OBJ or STL</td></tr><tr><td>Shift + A</td><td>Analyze Selection Geometries</td></tr><tr><td>Shift + D</td><td>Duplicate Selection</td></tr><tr><td>Shift + S</td><td>Toggle Selection Visibility</td></tr><tr><td>Shift + G</td><td>Group or Re-Group</td></tr><tr><td></td><td><strong>Rotation</strong></td></tr><tr><td>Left and Right Arrows</td><td>Rotate around Z</td></tr><tr><td>Up and Down Arrows</td><td>Rotate around Y</td></tr><tr><td>[Shift] + Left/Right</td><td>Rotate around X</td></tr><tr><td></td><td><strong>View</strong></td></tr><tr><td>H</td><td>Home view</td></tr><tr><td>T</td><td>Top down view</td></tr><tr><td>Z</td><td>Reset Viewport</td></tr><tr><td>[Meta] + Click</td><td>Set Camera Focus</td></tr><tr><td>Mouse Wheel or 2 Finger dolly</td><td>Zoom In / Out</td></tr><tr><td></td><td><strong>Move</strong></td></tr><tr><td>F</td><td>Floor: Put Model Bottoms on Grid</td></tr><tr><td>C</td><td>Center Selection on Grid</td></tr><tr><td>[Ctrl] + Click</td><td><em>Lay Flat</em>: Rotate Clicked Face Toward Grid</td></tr><tr><td>[Shift] + Drag</td><td>Move Selection in the X/Y Plane</td></tr><tr><td></td><td><strong>Workspace</strong></td></tr><tr><td>B</td><td>Toggle Selection Bounding Box</td></tr><tr><td>G</td><td>Toggle Grid Lines</td></tr><tr><td>L</td><td>Toggle Log Message Display</td></tr><tr><td>N</td><td>Toggle Normals Visualization</td></tr><tr><td>Q</td><td>Open Preferences Dialog</td></tr><tr><td>W</td><td>Toggle Wireframe Visualization</td></tr></tbody></table>

## Screenshots

![](</img/Screenshot 2024-07-30 at 11.27.49 AM.png>)

![](</img/meshtool vid hero.png>)

![](</img/Screen Shot 2022-01-11 at 11.22.35 PM.png>)
