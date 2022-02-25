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
* `P` limit non-manifold solution search depth (parameterize)
* `P` refactor slicers to use single improved slice core (cnc tbd)
* `P` template vars: nozzles used and layers until next use (IDEX)
* `-` workflow to edit in M:T and bounce back / replace vertices
* `-` tighten export dialogs (reduce size for smaller screens)

## Mesh:Tool

* `-` face selection and matching preferences
* `-` add prefs for normal length, maybe color picker
* `-` svg and image import conversion (share code with Kiri:Moto)
