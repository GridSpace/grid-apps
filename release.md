# Release Notes

Full docs @ https://docs.grid.space/projects/kiri-moto


# Release 3.5 (future)

## Kiri:moto

* ~ refactor vertex replacement and widget update matrix tracking
* ~ refactor cnc to use core slicer engine


# Release 3.4 (2022-05-14 est)

## Kiri:moto

* added batch processing to object adds/removes to speedup complex workspace restore
* substitute some prusa slicer [variables] with KM {variables} on import
* fix CNC output order for tool changes an spindle speed updates
* add CNC pocket operation using surface selection
* fix dog-bones on outlines cut by tabs
* skip pockets that resolve to null
* fix CNC contour path collision
* 10x speedup for true shadow generation
* add FDM gcode feature macros for transitions
* add FDM option to alternate shell winding direction
* add FDM print time estimate fudge factor for devices
* add `clear top` option to CNC outline operation
* add FDM layer retraction as a range option

## Mesh:Tool (1.2.0)

* auto-fog in wireframe view to aid close mesh inspections
* significant speed-up for large surface selections
* add boolean operations for subtract and intersect
* multi-body identification and isolation
* quick add primitives: cube, cylinder
* control wireframe transparency
* parameterize png image import
* ~ undo / redo for some operations
* code added to show camera focal point
* better Z split snapping using vertex closest to mouse


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
