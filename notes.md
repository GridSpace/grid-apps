# Grid:Apps Future Notes

## `C` cosmetic, `F` functional, `P` performance, `B` bug fix

* `F` experiment with structuredClone(), SharedArrayBuffer, createImageBitmap()
* `F` test #private fields, array.at() for negative indices
* `F` option to hide platform when viewing from below

# Kiri:Moto

* `B` origin (and bed size) bug (Onshape?) when switching device modes
* `B` can't drag slider bar on ipad / ios -- touch pad scrolling dodgy
* `B` prevent or ask for really large models when scaling (crash ui)

* `P` refactor vertex replacement and widget update matrix tracking
* `P` duplicate objects should share same slice data unless rotated or scaled
* `P` allow selection to be decimated on demand (context menu?)
* `P` move all persisted / workspace settings/data to IndexedDB (LS limitations)
* `P` faster ray intersect https://github.com/gkjohnson/three-mesh-bvh/
* `P` try material clipping planes for slice range selection

* `F` edit in Mesh:Tool
* `F` custom device vars for profiles / ranges / gcode
* `F` show slider range values in workspace units (on hover?)
* `F` allow select of a range by typing in values in slices or workspace units
* `F` complete and expose grouping feature
* `F` add svgnest-like arrange algorithm
* `F` date column and sorting in recent files list
* `F` warn if part hanging in negative Z space or off bed in general

# FDM

* `B` fix support projection/end with grouped parts
* `B` multi-extruder rendering of raft fails to offset the rest of the print
* `B` multi-extruder purge blocks fail to generate properly for rafts

* `F` add 'random' and 'seam' start point options
* `F` convert ranges to z offsets while continuing to show layer #
* `F` support pillar top/bottom should conform to part
* `F` more explicit line width control with ranges and min/max adaptive
* `F` test outlining solid projected areas (internally)
* `F` gradient infill https://www.youtube.com/watch?v=hq53gsYREHU&feature=emb_logo
* `F` feather sharp tips by reducing extrusion in area of overlap
* `F` segment large flat areas on first layer to mitigate peeling
* `F` option to support interior bridges when 0% infill
* `F` calculate filament use per extruder per print
* `F` expand internal supporting flats / solids before projection (threshold)

* `P` reduce fan speed and extrusion factor for bridges
* `P` auto purge pillars when quick layers are detected for extra cooling
* `P` extruder + filament max flow rate cap in planner
* `P` solid fill the tops of supports for down facing flats

# FDM - SLA

# `P` common support area detection (fork new fdm code)
* `P` prioritize supports by length of unsupported span. mandatory when circularity > X
*     or % area of inner to outer poly is high (making it a thin shell)

# FDM - BELT

* `B` auto bed resizing leaves the origin in the wrong place at first
* `B` re-add progress calls for all work units

* `F` test and enable arcs in belt more
* `F` slightly angle supports to lean into the Z of the part
* `F` anchors should be generated anywhere needed in the print, not just head

# CAM

* `B` feed rate for next tool set before tool change (push/pop feed rates?)
* `B` tab cuts cause loss of direction, parenting, depth, and it's hard to fix
* `B` tabs do not properly track widget mirror events
* `B` tabs are not cut to exact height
* `B` first rough step too far down in certain circumstances?
* `B` need to force cut line at synthetic z bottom (midlines, etc)
* `B` contour does not honor clip to stock

* `F` get gcode coordinates off a part with point/click or hover?
* `F` include tools in default devices (Carvera)
* `F` add `match faces` option in `outline` operation
* `F` add {progress} substitution and maybe {time-remaining} if can be calc'd
* `F` import and follow 2D paths (conformed like pocket contours)
* `F` add user-defined origin (issue #28)
* `F` add custom gcode operation for things like injecting pauses
* `F` all ops should allow limit and milling direction / ease down overrides
* `F` drill op should allow selecting holes >= current tool
* `F` intelligently turn circle hole pocket clear into spiral down
* `F` add option for op-major ordering (instead of part major)
* `F` add `plunge max` to contouring that can override z feed limit
* `F` add lead-in milling (requires adding clamp / no go areas)
* `F` add linear clearing strategy
* `F` add adaptive clearing strategy
* `F` add ease-down support to trace op
* `F` add climb/conventional into each operation
* `F` add support for tapered ball mills
* `F` change color of line selection in trace op when not a closed poly
* `F` limit cut depth to flute length of selected tool (or warn)
* `F` validate muti-part layout and spacing exceeds largest outside tool diameter
* `F` parameterize dropping close points in prep.js. ensure long segments remain straight
* `F` trapezoidal tabs in Z
* `F` ease-in and ease-out especially on tab cut-out start/stop
* `F` maintain several part orientations + op chains in a single profile

* `P` improve parser - do not require spaced tokens and support implied G0 / G1
* `P` outer corner arc moves
* `P` log Z interpolation for contour XYZ moves
* `P` option to start with the smallest poly by area on layer change
* `P` refactor slicing engine to add minion threading
* `P` decrease cutting speed when entire tool is engaged (start of roughing, rest machining)
* `P` port arc code from FDM export to CAM export
* `P` redo all path route / planning in prepare to account for terrain before camOut

# SLA

* `P` blit layers w/ 3JS ortho camera to canvas

# Laser

* `F` add PLT / HP-GL output format (https://en.wikipedia.org/wiki/HP-GL)

# OctoPrint plugin

* subfolder parameter for dropped files
* auto-kick check box in preferences


# Mesh:Tool

* add undo/redo
* click to repair normals based on a known good (selected) face
* send to Kiri:Moto workspace (or update model vertices in place)
* better z snap using just vertexes from face intersected
* add section view. local clip. raycast skip points above plane
* add decimate op = face reduction
* add flatten/crush op: for z bottoms (or surfaces?)
* allow setting model/group origin for scale/rotate
* fix mirror to work with groups (just models currently)
* bounding box toggle should be global, not selection
* add analyze results dialog
* remove/hide auto-repair function
