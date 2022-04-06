# Release Notes

Full docs @ https://docs.grid.space/projects/kiri-moto

# Release 3.4 (in progress)

## `C` complete, `I` in progress, `-` todo

## Kiri:moto

* `C` added batch processing to object adds/removes to speedup complex workspace restore
* `C` fix CAM output order for tool changes an spindle speed updates
* `I` add CAM pocket operation using surface selection
* `-` refactor cnc to use new core slicer engine
* `-` improve vertex replacement and widget update matrix tracking

## Mesh:Tool

* `C` multi-body identification and isolation
* `-` parameterize svg and image import


# Release 3.3 (2022-04-01)

## Kiri:Moto

* reorganization of code to use updated dependency loader (gapp)
* refactor main into supporting classes (part of a larger ui re-org)
* group "main" entry points under "kiri-run"
* extract and group utilities from print and other modules
* add thin wall pull-down & allow for newer strategies
* extract preview render engine from FDM
* allow loading of workspaces from url on page load
* properly import profiles attached to devices
* improved routing on "fast" layers & layers with multiple islands
* start/stop minions depending on whether threading enabled
* abstract file loading (onshape import, mesh replace, etc)
* enable/disable ray intersect path on feature state change
* new and updated device profiles: Prusa MK2S/MK3S+, Ender 3
* trigger solid layer when transitions lead to 50% projected areas
* limit non-manifold solution search depth
* refactor slicers to use single improved slice core (cnc deferred)
* add parameterized solid projection expansion (infill -> solid expand)
* add parameterized control of bridge/flat and infill print speeds
* add api control over threading workloads and use of wasm
* updates to raft generation: add border, connect infill lines
* fix phantom support generation off part or under bed
* template vars: nozzles used and layers until next use (IDEX)
* fdm export control of preamble comments position (for ultimaker)

## Mesh:Tool (1.1.0)

* add surface selection mode
* add preferences for normal length and color
* add preferences for face selection and surface matching (radians/radius)
* add svg and image import conversion (created shared load. libs)
* replace triangulation algorithm that was causing some union failures
* add pinned log busy spinner
* add version chooser
* add welcome menu


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
