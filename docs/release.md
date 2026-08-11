# Release Notes

Full docs @ https://docs.grid.space/projects/kiri-moto

# Release 4.7.0

A broad update focused on SLA/MSLA export coverage, DXF import, CAM routing and drilling fixes, and a substantial menu/theme cleanup across Kiri:Moto.

## SLA / MSLA

- add CTB export support with Chitubox machine profiles
- add Goo and PRZ export support for Elegoo and Phrozen targets
- add Photon Workshop family export support for newer Anycubic Photon machines
- add generic raster SLA and vector SLA output formats
- add volume rendering and make it the default SLA rendering path
- improve SLA support generation and support geometry handling
- add SLA raster, metadata, and process timing helpers for exposure, lift, retract, waits, PWM, and transition layers
- add tilt-motion support for Goo/Elegoo targets
- add memory growth and fallback handling for SLA wasm slicing
- add and enable new Anycubic Photon, Creality, Elegoo, and Phrozen SLA printer profiles
- add CTB conversion utility and MSLA format reference documentation

## CAM

- add basic finish cut capability to Area clear operations
- improve routing between Area operation regions
- add tool move epsilon to reduce false-positive collision detection
- fix contour filtering errors
- fix CPU contouring with more than one isolated body
- fix contour Y handling that could mutate cached widget vertices
- fix tool change dwell time
- force tool lift between drill operations
- fix drill marking with latent thru settings
- fix widget and tab assignment during slicing
- patch tab record format handling
- remove metric/imperial scaling factor from A axis output

## Import / Export

- add DXF import support
- add DXF spline support
- reconnect DXF open lines with shared endpoints
- normalize the DXF import dialog
- add automatic DXF unit detection and scaling, including Z/depth scaling
- proxy print start commands when needed
- add Bambu SSDP model option

## UI / Workflow

- rebuild the Kiri:Moto menubar from JS instead of static HTML
- restructure top menus and move mode tools into the menubar build
- add a shared palette and theme CSS foundation
- reorganize Kiri CSS and normalize menu colors
- make rotate and scale panels draggable
- make CAM setting groups collapsible
- move device/profile controls to the left menu
- move Save As commands into the file menu
- replace transient alerts with a busy spinner
- add middle-button drag support
- add automatic slideshow behavior for narrow windows
- improve popup positioning, z-index layering, and menu hover behavior
- add missing language keys for new menu items
- fix file New/Open state clearing and rebuild behavior

## Mesh:Tool / Void:Form

- update Mesh:Tool visuals and add document history support
- continue Void:Form boundary provenance work
- add Void:Form constraints and chamfer/offset planning docs
- improve Void:Form solids, geometry store, rebuild, and toolbar internals

## Platform / Build

- add localhost HTTP POST proxy support for embedded HTTPS contexts such as Onshape
- add CORS headers and secure-request handling for proxy routes
- fix Docker build steps and update Docker Node version
- fix esbuild mkdir race and node module external handling
- remove Windows build from GitHub workflow
- update Electron hide/show handling and Windows link workaround

# Release 4.6.3

## General

- merge experimental Void:Form app code
- add permissive graphics card flags for Linux Electron builds

## CAM

- fix register operation cutout modes

# Release 4.6.2

## CAM

- add Carvera Air device support
- add spindle spin-up delay for Carvera Air
- reduce max spindle speed for Carvera Air
- add trace offset Z option
- allow drill operations to obey Z bottom

## Features

- add install progress bar
- add OPFS support and API link
- add engine workspace export
- add layer diff support

## UI / Workflow

- resize engine code and preview boxes
- fix Mesh:Tool window close behavior so it returns to Kiri:Moto

## Bug Fixes

- fix leave XY offset for roughing cutout
- fix API URL object loading
- fix engine stock origin and center handling
- fix engine setMode()
- fix floating-point noise in Z vertices with shadow clipping

## Development

- expose mesh worker log function
- add slicePre() and slicePost() engine requirements
- update shared-array-buffer origin trial token

# Release 4.6.1

## CAM

- fix deep ease-down paths that wrap a polygon more than once
- add ease-down safeguards for bad geometry
- cap ease-down speed by engage setting
- correct tool shadow epsilon
- raise Z safe when Z top is above it
- improve outline strategy for depth-first operations
- add trace option to ignore part boundaries
- disable trace merge until Area can handle it properly

## FDM

- async FDM slicing layer diffs for roughly 3x speedup
- trim support shadow to overhangs
- improve support clipping
- change support gap offset from numeric to boolean
- refactor slice progress tracking
- tighten FDM slice shadow range

## Bug Fixes

- fix unit scale when visual Z is set
- fix G-code import origin
- fix negative level Z order
- fix wireframe opacity
- fix missing macro token handling
- filter invalid area polygons
- fix LOCAL const handling
- remove input filter on iOS mobile

## UI / Platform

- invert dolly sign
- remove beta tag
- update Electron app base
- fix docs formatting for controls.md

# Release 4.6.0

A major update focused on FDM support system improvements, belt printer support, CAM loop and selection workflows, and significant code modernization.

## Major Features

- redesign FDM support generation with manual support painting and erase mode
- add angle-aware support painting with automatic overhang filtering
- extract support structures into synthetic widgets for independent extruder assignment
- integrate manual support painting with belt printer coordinate transforms
- fix purge tower allocation for sparse, non-contiguous extruder configurations

## FDM

- add manual support painting visual overlay
- add automatic support generation using shadow projection
- support dedicated extruder selection for support structures
- clip belt-mode support to the angled platform
- fix support slice height propagation
- improve nested top fill offset calculations
- fix arc output center point calculations
- add delta thickness filtering for variable layer heights
- add Moonraker auto-start remote print option
- fix finish speed ratio calculations for flats and bridges

## CAM

- add Loop operation for rotary and indexing workflows
- add SVG trace path loading for arbitrary vector import
- add Area operation vertical-wall clearing option
- improve lathe step-down output for rotary operations
- add alternating/zigzag options for Area linear surfacing
- add shadow selection mode for Area operations
- improve drag knife routing
- add coastline move routes for contour operations
- support manual slice ordering
- improve progress reporting for shadow generation, Area surfacing, and lathe operations
- parallelize widget shadow generation
- add optional clip-to-stock for non-GPU topo3 contouring

## UI / Workflow

- add visual selection of Z top and Z bottom constraints
- show Z top/bottom overrides in operation summaries
- add collapsible operations list
- add slicing and preview statistics in developer mode hover
- persist widget transparency across sessions
- add expandable preview in developer mode
- add W shortcut for ghost/wire toggle
- improve colors, opacity, and edge rendering
- expose file type parsers as api.load

## Architecture

- document the FDM slicing pipeline
- reorganize UI code into app/init and app/ui modules
- extract keyboard, slider, and modal handling into dedicated modules
- consolidate STL/OBJ loading into unified load classes
- split widget into core and app-ui subclasses
- add async initialization for startup
- remove legacy code and unused dependencies
- add JSDoc developer documentation

## Bug Fixes

- normalize mouse wheel scrolling across Chrome, Firefox, and Safari
- fix widget cloning issues
- fix broken API sync link
- fix Z base layer height for parts not on bed
- fix ghost/wire/solid toggle states
- fix Area operation rotation handling
- fix Loop operation expansion and rendering
- fix shadow and lathe progress reporting
- fix trace outside with drape duplication
- fix starting offsets with multiple widgets
- fix import slider max-value click
- fix widget edge updates after mesh moves

## Platform

- add Snapmaker U1 belt printer profile
- remove deprecated Gridbots devices
- update FlashForge Adventurer 5M profile
- update Three.js and Manifold libraries
- add QuickJS evaluation engine for macros

# Release 4.5.1

## Bug Fixes

- fix findConnectedSurface for pocket operations in indexed mode
- fix use of flatness when dropping points in CPU contour processing
- fix erroneous tab matching in CPU contouring
- fix GPU contour Y coordinate handling with inside-only mode
- fix trace-through backward compatibility
- fix order-of-operations issue with tabs and inner-only processing

## Improvements

- increase Bambu FTP timeout for more reliable connectivity
- update FlashForge Adventurer 5M printer profile
- add support for exported formats in packed devices
- reorganize help menu layout
- expose file type parsers as api.load
- distinguish fit contents from resize operations
- improve visibility for hover-only UI elements
- update Three.js and Manifold libraries

# Release 4.5.0

## Major Features

- rewrite CNC path routing engine for improved collision detection
- add unified Area operation combining roughing, outlining, tracing, and surfacing workflows
- add taper ball tool support for CNC operations
- add on-the-fly switching between orthographic and perspective cameras
- preserve and restore camera projection settings across workspace import
- add Shift+F zoom to contents and F zoom to fit shortcuts

## CAM

- add Area clear, trace, outline, and surface modes
- add depth-first pocket routing
- add roughing flat passes option
- improve leave stock handling in XY and Z
- enable inside/outside trace for open polylines
- add trace-through option
- improve dogbone generation
- add wide cutout support for outlines
- add contour grace factor and stock clip-to restoration
- add linear surface output mode
- merge overlapping tabs automatically
- make tabs respect travel boundaries
- ensure ease-down paths avoid tabs
- improve tab cutting for indexed rotations
- speed up tool shadow computation with grid-bucketed recursive union
- improve travel boundary handling and outside travel safeties
- add rotational interpolation for G-code parsing
- improve lathe preview rendering
- add lathe axis reset macro
- improve drilling hole selection and circularity detection
- add milling direction per operation
- tighten arc tolerances for G-code output

## FDM

- add Solidify option to remove inner voids at slice time
- fix support on-demand detection
- improve bridge detection and handling

## Laser

- add stacking STL reconstruction option for multi-layer engraving

## UI / Workflow

- improve CAM render colors
- soften edge traces in light mode
- mute dark part outlines for better visibility
- improve indexed path visualization
- fix colors and layer-first shadow rendering
- hide outline omit-through option when not applicable
- improve settings mutex handling for legacy operation import
- fix safe moves between operations with widget platform offsets
- improve stock clipping for multiple models with offset centers
- fix origin selection with offset origin
- fix first-save behavior when moving between widgets

## Bug Fixes

- fix Z bottom validation and related error messages
- warn when Z bottom is below Z through
- fix trace tool shadow clone
- fix clamp min/max swap
- fix stock clear all functionality
- fix pocket bottom for slab slicing
- clamp single trace to Z top/bottom
- fix Area trace early termination conflict with drape
- filter empty slices from drape artifacts
- fix offsetting open polygons with array offsets
- skip raster when no paths are produced
- fix orthographic aspect ratio and zoom behavior
- fix ball taper rendering in indexed mode
- fix new tool units bug
- prevent double registration of frame listeners
- fix async/await issue in CAM prepare
- convert slice bounds errors to alerts

## Documentation / Build

- add geometry library JSDoc documentation
- update Kiri:Moto UI documentation and interface images
- add docs redirects and fix broken links
- update Docusaurus to 3.9
- improve cross-platform build workflow with cross-env
- update raster-path dependency
- improve Electron build process
- improve Onshape and Bambu Lab integration behavior

# Release 4.4.1

## CAM

- fix contour Y bounds swap
- fix tab cuts and stock clip-to in roughing operations
- fix outline stock clipping with offset origin
- fix origin selection with offset origin
- fix stock clipping for multiple models with offset centers
- fix multi-widget safe moves between operations
- fix thru cuts with new up/over tab paths

## FDM

- fix FDM support on-demand detection
- fix asset append missing module root

## Core

- fix bad worker reference
- add install pass-through for root requests

## Improvements

- improve smoothing and pocket developer-mode visuals
- change Electron build context detection
- move mods package dependencies to the main package
- move Bambu initialization to load-done
- remove beta tag
- backport cross-env dependency

# Release 4.4.0

## General

- add version numbering utility script
- split out help/info menu and language menus
- move install/uninstall/quit menu to center app menu
- add help menu visual callout
- improve language translation coverage
- improve build and serve workflow for alternate builds
- update service worker configuration
- add install/uninstall options in setup menu

## CAM

- implement tab hopping - toolpath goes up and over tab instead of interrupting cut (fixes #207)
- add GPU accelerated contouring for faster operations
- add radial GPU raster support (experimental)
- add new register mode that marks bottom cutout tabs
- add curves-only support to GPU contour
- add zsafe and move to safe z at start of new operations
- fix 'safe' moves during operation changes to be moves, not cuts
- fix tolerance/resolution for GPU raster mesh calculations
- fix NullPointerException with tabs in contour
- improve merge/co-planar point handling
- add slice layer naming using operation notes (fixes #447)
- fix level step down units (fixes #446)

## FDM

- document remain_time macro variable (refs #339)
- re-add base flow rate multiplier for belt mode (fixes #444)
- fix belt fan control ordering (fixes #438)
- exclude belt from bridge fan layer
- add centering feature for fill areas (fixes #448)

## Mesh:Tool

- add STEP export capability
- add STEP import with face generation
- improve face generation with inner holes
- add mesh scripting tool and persistence
- add plane and plane.loft operations
- add global edge map and edge reuse for better topology
- add devel device export option

## Electron

- clean up electron build process
- merge electron mod into core
- add service routes when available
- set proper content-type for appended code bodies

## Dependencies

- update @gridspace/raster-path to latest version with GPU acceleration
- update @gridspace/app-server for proper fallthrough handling
- switch from npmjs.org to git repos for @gridspace packages
- update WebGPU implementation

## Bug Fixes

- fix Bambu Lab local URL and module load order
- fix progress reporting for raster operations
- fix GPU lathe progress and contour API usage
- fix tool offsets when using GPU acceleration
- fix indexed rotations epsilon value for accurate zflat calculation
- fix traceload debug option
- sanitize topo3 resolution to avoid GPU floating-point errors

# Release 4.3

## General

- add lathe mode for CAM operations
- add volumetric flow calculations for FDM
- improve bundler with better dependency tracking
- migrate to ESM module format across codebase
- improve arc support in gcode generation

## FDM

- add scarf seams for better surface finish
- add hole compensation feature
- add spiral layer start option
- overhaul thin wall detection and handling
- improve volumetric flow rate controls
- add retraction tuning for better print quality

## CAM

- add lathe operation support with threading
- improve arc support for smoother toolpaths
- add drill from stock top option
- improve tab positioning and generation
- enhance surface selection and filtering
- add 4th axis lathe debug and testing mode
- improve tool path optimization

## Devices

- add new machine profiles
- improve device profile management

# Release 4.2

## CAM

- add arc support to gcode output for smoother paths
- add drill from stock top feature
- improve contour operations
- fix animation issues with shared tool numbers
- enhance trace operations with arc support
- improve pocket smoothing algorithms

## FDM

- improve support generation
- add new retraction options
- enhance layer time controls

## General

- improve gcode arc import and export
- fix file loading edge cases
- update device profiles

# Release 4.1

## CAM

- improve drill operations and positioning
- fix multi-part drilling bugs
- enhance trace line selection
- add dogbone support to trace ops
- improve pocket operation reliability
- fix trace selection with flip operations

## FDM

- add RatRig machine profiles
- improve Bambu Lab device control integration
- enhance support placement algorithms
- fix belt mode support generation

## General

- improve file import handling
- fix workspace restore for complex projects
- enhance mobile touch interactions
- update machine profiles for popular devices

# Release 4.0 (2024-01-21)

- major UI refactor
- add profile cloud sync
- add electron desktop binary builds
- add timelines for all cnc op chains
- add dragknife, wire-edm, waterjet device types
- add gerber import file support
- add SVG import dialog, more options
- add arbitrary belt slice angle
- add mesh sketching, new ui, menus, gears, patterns
- fix 3MF imports lacking mesh translation
- improve cam animation
- clean up and normalize dark mode
- optimize docker image size
- new machine profiles
- dozens of bug fixes

# Release 3.9 (2023-03-19)

- more graceful handling of security contexts blocking SharedArrayBuffer
- FDM refactor the 'detect' support feature for auto-placing manual supports
- FDM fix supports in belt mode
- CAM fix issue #230 shared tool numbers cause animation errors
- CAM fix surface / trace selection copy on hover/pop/new op
- CAM decrease cutting speed when entire tool is engaged in roughing
- CAM add dogbones support to traces ops
- CAM add scripted contour filtering (to be extended to other ops)
- CAM add calculation of taper length from angle
- CAM add open poly-line offsetting with trace op
- CAM clearly delineate ops reachable or not on timeline
- CAM add 4th axis lathe operation for debug and testing (can be optimized)
- CAM add rough all stock to aid lathe mode
- CAM stock is now always on, whether offset or absolute
- CAM add lathe worker parallelization (2x - 6x speedup)
- CAM fix pocket/trace selection with flip op

* CAM fix lathe yellow path in light mode

# Release 3.8 (2023-01-21)

- update server-side sample module code
- various fixes and improvements to CAM indexing
- various fixes and improvements to gcode variables
- improve gcode arc import decoding
- removed auto-decimation on object import
- FDM slicing memory reduction from team lychee
- FDM add new parameters, range overrides
- FDM fix raft line fill strategy
- CAM improve trace line selection with zoom adaptive thresholds
- CAM option to control first output point order
- CAM move to save Z between ops, refresh spindle speed
- CAM add origin offset optional parameters
- CAM add control to omit initial tool change
- CAM fix vertical face selection and step over defaults
- CAM fix multi-part object import / grouping
- CAM fix tracing nested polyline offset ordering
- CAM refactor of contouring yields 2x - 20x speedup
- CAM update traces to async slicing, fix use with flip
- CAM add threading support for all slicing ops
- CAM add omit pocket option to outline op
- CAM add trace support for taper tip diameter
- CAM add trace offset override parameter
- CAM add leave stock parameter to contour
- CAM add contour output density control (reduction)
- CAM improve parsing and visualization of large files

# Release 3.7 (2022-11-12)

- add CAM axes scaling gcode header directive
- add CAM 4th axis indexing support, timeline op, updated visuals
- update most CAM ops to work in 4th axis indexing mode
- align FDM top/bottom layer options with convention
- change Kiri:Moto SVG import to default to boolean repair
- add Mesh:Tool SVG import options for extrusion depth and boolean repair
- replace jscad/modeling with Manifold project for faster mesh boolean
- various CAM gcode, preview, animation fixes (3 axis)
- various mobile touch, file load fixes
- add FDM slice support growth option to help merging pillars
- add CAM tools export / import parity with devices and settings

# Release 3.6 (2022-10-22)

## Kiri:Moto

- add new Carvera machine target in CAM mode with laser support
- add laser output operators and device settings in CAM mode
- add fullscreen option. button next to user profile
- mobile pinch zoom and layer slider usability improvements
- update CLI to work in CAM mode and add working samples
- improved FDM preview rendering speed and reduced memory usage
- threaded task and message passing performance improvements
- refactor FDM supports and synthetic widgets to use more common code
- allow FDM mixing of automatic and manual / detected supports
- improve CAM animation speeds using shared array buffers
- improve CAM render quality using solids instead of lines
- add CAM leveling part offset parameters for XY and Z
- add CAM pocket smoothing and contouring which is closer to true 3 axis
- add CAM 3D engraving and marking with the pocket contouring operation
- fix CAM invalidation of tabs on scale and traces on scale or rotate
- fix belt fan override for base extrusions touching belt
- fix belt X axis label order

# Release 3.5 (2022-10-07)

## Kiri:Moto

- add optional service workers and manifest to support full PWA + install
- add support to run as Progressive Web Apps for installation and offline use
- add assembly import when KM used inside of onshape
- add configurable flatness for contour clipping
- add faster render mode for FDM slices
- add axis label remapping in FDM
- add new path rendering engine
- add bridging option in CAM contouring
- add option to force z max routing in CAM
- add option to ignore z bottom in CAM contouring
- add CAM pocket option to ignore interior features (outline only)
- add CAM Z bottom visualization, make it relative to stock instead of part
- add CAM Z bottom inversion option to flip operator
- add CAM custom gcode operator (can be used for pausing, too)
- add CAM z extend option on registration op independent of "Z Thru" global
- add CAM pocket surface selection filter by angle
- add optional CAM operation notes (helps with many similar ops)
- add option to limit CAM trace ops to Z bottom limit (when in use)
- extend url loading of workspaces to all formats
- alert when healing is enabled and non-manifold geometries are detected
- fix thin output start and end point tracking which broke retraction
- fix for importing with some obj formatting
- fix profile seeding for newer device record formats
- fix workspace import / restore for some file formats
- fix potential crash into stock during moves when parts are z bottom anchored

# Release 3.4 (2022-05-14)

## Kiri:Moto

- added batch processing to object adds/removes to speedup complex workspace restore
- substitute some prusa slicer [variables] with KM `{variables}` on import
- fix CNC output order for tool changes an spindle speed updates
- add CNC pocket operation using surface selection
- fix dog-bones on outlines cut by tabs
- skip pockets that resolve to null
- fix CNC contour path collision
- 10x speedup for true shadow generation
- add FDM gcode feature macros for transitions
- add FDM option to alternate shell winding direction
- add FDM print time estimate fudge factor for devices
- add `clear top` option to CNC outline operation
- add FDM layer retraction as a range option

## Mesh:Tool (1.2.0)

- auto-fog in wireframe view to aid close mesh inspections
- significant speed-up for large surface selections
- add boolean operations for subtract and intersect
- multi-body identification and isolation
- quick add primitives: cube, cylinder
- control wireframe transparency
- parameterize png image import
- code added to show camera focal point
- better Z split snapping using vertex closest to mouse

# Release 3.3 (2022-04-01)

## Kiri:Moto

- reorganization of code to use updated dependency loader (gapp)
- refactor main into supporting classes (part of a larger ui re-org)
- group "main" entry points under "kiri-run"
- extract and group utilities from print and other modules
- add thin wall pull-down & allow for newer strategies
- extract preview render engine from FDM
- allow loading of workspaces from url on page load
- properly import profiles attached to devices
- improved routing on "fast" layers & layers with multiple islands
- start/stop minions depending on whether threading enabled
- abstract file loading (onshape import, mesh replace, etc)
- enable/disable ray intersect path on feature state change
- new and updated device profiles: Prusa MK2S/MK3S+, Ender 3
- trigger solid layer when transitions lead to 50% projected areas
- limit non-manifold solution search depth
- refactor slicers to use single improved slice core (cnc deferred)
- add parameterized solid projection expansion (infill -> solid expand)
- add parameterized control of bridge/flat and infill print speeds
- add api control over threading workloads and use of wasm
- updates to raft generation: add border, connect infill lines
- fix phantom support generation off part or under bed
- template vars: nozzles used and layers until next use (IDEX)
- fdm export control of preamble comments position (for ultimaker)

## Mesh:Tool (1.1.0)

- add surface selection mode
- add preferences for normal length and color
- add preferences for face selection and surface matching (radians/radius)
- add svg and image import conversion (created shared load. libs)
- replace triangulation algorithm that was causing some union failures
- add pinned log busy spinner
- add version chooser
- add welcome menu

# Release 3.2 (2022-02-12)

https://forum.grid.space/t/kiri-moto-version-3-2/580

## General

- Better memory management
- Rendering speedups
- 3MF instancing support
- SVG import improvements
- Enable/Disable individual models

## FDM

- Improved non-manifold handling
- Gcode macro if/then/else code flow
- Updated CLI utility
- Draft Shields

## Belt

- Height-based spacing
- Random X layout

## CNC

- Drill marking option
- Numerous bug fixes

## Onshape

- Improved session management
