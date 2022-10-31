# Release Notes

Full docs @ https://docs.grid.space/projects/kiri-moto

# Release 3.7

* align FDM top/bottom layer options with convention
* add Mesh:Tool SVG import options for extrusion depth and boolean repair
* replace jscad/modeling with Manifold project for faster mesh boolean
* various CAM gcode, preview, animation fixes (3 axis)
* various mobile touch, file load fixes
* add FDM slice support growth option to help merging pillars
* add CAM tools export / import parity with devices and settings


# Release 3.6 (2022-10-22)

## Kiri:Moto

* add new Carvera machine target in CAM mode with laser support
* add laser output operators and device settings in CAM mode
* add fullscreen option. button next to user profile
* mobile pinch zoom and layer slider usability improvements
* update CLI to work in CAM mode and add working samples
* improved FDM preview rendering speed and reduced memory usage
* threaded task and message passing performance improvements
* refactor FDM supports and synthetic widgets to use more common code
* allow FDM mixing of automatic and manual / detected supports
* improve CAM animation speeds using shared array buffers
* improve CAM render quality using solids instead of lines
* add CAM leveling part offset parameters for XY and Z
* add CAM pocket smoothing and contouring which is closer to true 3 axis
* add CAM 3D engraving and marking with the pocket contouring operation
* fix CAM invalidation of tabs on scale and traces on scale or rotate
* fix belt fan override for base extrusions touching belt
* fix belt X axis label order


# Release 3.5 (2022-10-07)

## Kiri:Moto

* add optional service workers and manifest to support full PWA + install
* add support to run as Progressive Web Apps for installation and offline use
* add assembly import when KM used inside of onshape
* add configurable flatness for contour clipping
* add faster render mode for FDM slices
* add axis label remapping in FDM
* add new path rendering engine
* add bridging option in CAM contouring
* add option to force z max routing in CAM
* add option to ignore z bottom in CAM contouring
* add CAM pocket option to ignore interior features (outline only)
* add CAM Z bottom visualization, make it relative to stock instead of part
* add CAM Z bottom inversion option to flip operator
* add CAM custom gcode operator (can be used for pausing, too)
* add CAM z extend option on registration op independent of "Z Thru" global
* add optional CAM operation notes (helps with many similar ops)
* add option to limit CAM trace ops to Z bottom limit (when in use)
* extend url loading of workspaces to all formats
* alert when healing is enabled and non-manifold geometries are detected
* fix thin output start and end point tracking which broke retraction
* fix for importing with some obj formatting
* fix profile seeding for newer device record formats
* fix workspace import / restore for some file formats
* fix potential crash into stock during moves when parts are z bottom anchored


# Release 3.4 (2022-05-14)

## Kiri:Moto

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
