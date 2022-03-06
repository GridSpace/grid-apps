# Release Notes

## `C` complete, `P` partial, `-` todo

# Release 3.3

## Kiri:Moto

* `C` reorganization of code to use updated dependency loader
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
* `P` template vars: nozzles used and layers until next use (IDEX)
* `-` improved vertex replacement and widget update matrix tracking

## Mesh:Tool

* `C` add preferences for normal length and color
* `-` add preferences for face selection and matching
* `P` add svg and image import conversion (created shared load. libs)
* `C` replace triangulation algorithm that was causing some union failures
* `C` add version chooser
* `C` add welcome menu
