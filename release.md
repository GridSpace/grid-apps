# Release Notes

## `C` complete, `P` partial, `-` todo


# Release 3.3 (2022-04-01)

## Kiri:Moto

* `C` reorganization of code to use updated dependency loader (gapp)
* `C` refactor main into supporting classes (part of a larger ui re-org)
* `C` group "main" entry points under "kiri-run"
* `C` extract and group utilities from print and other modules
* `C` add thin wall pull-down & allow for newer strategies
* `C` extract preview render engine from FDM
* `C` allow loading of workspaces from url on page load
* `C` properly import profiles attached to devices
* `C` improved routing on "fast" layers & layers with multiple islands
* `C` start/stop minions depending on whether threading enabled
* `C` abstract file loading (onshape import, mesh replace, etc)
* `C` enable/disable ray intersect path on feature state change
* `C` new and updated device profiles: Prusa MK2S/MK3S+, Ender 3
* `C` trigger solid layer when transitions lead to 50% projected areas
* `C` limit non-manifold solution search depth
* `C` refactor slicers to use single improved slice core (cnc deferred)
* `C` add parameterized solid projection expansion (infill -> solid expand)
* `C` add parameterized control of bridge/flat and infill print speeds
* `C` add api control over threading workloads and use of wasm
* `C` updates to raft generation: add border, connect infill lines
* `C` fix phantom support generation off part or under bed
* `P` template vars: nozzles used and layers until next use (IDEX)
* `C` fdm export control of preamble comments position (for ultimaker)

## Mesh:Tool (1.1.0)

* `C` add surface selection mode
* `C` add preferences for normal length and color
* `C` add preferences for face selection and surface matching (radians/radius)
* `P` add svg and image import conversion (created shared load. libs)
* `C` replace triangulation algorithm that was causing some union failures
* `C` add pinned log busy spinner
* `C` add version chooser
* `C` add welcome menu


# Release 3.2 (2022-02-12)

https://forum.grid.space/t/kiri-moto-version-3-2/580

## General

* Better memory management
* Rendering speedups
* 3MF instancing support
* SVG import improvements
* Enable/Disable individual models

## FDM

* Improved non-manifold handling
* Gcode macro if/then/else code flow
* Updated CLI utility
* Draft Shields

## Belt

* Height-based spacing
* Random X layout

## CNC

* Drill marking option
* Numerous bug fixes

## Onshape

* Improved session management
