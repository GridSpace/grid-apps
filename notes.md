# Grid:Apps Future Notes

## `C` cosmetic, `F` functional, `P` performance, `B` bug fix

* `F` experiment with structuredClone(), SharedArrayBuffer, createImageBitmap()
* `F` test #private fields, array.at() for negative indices

# Kiri:Moto

* `B` origin (and bed size) bug (Onshape?) when switching device modes
* `B` can't drag slider bar on ipad / ios -- touch pad scrolling dodgy
* `B` prevent or ask for really large models when scaling (crash ui)

* `P` duplicate objects should share same slice data unless rotated or scaled
* `P` allow selection to be decimated on demand (context menu?)
* `P` move all persisted / workspace settings/data to IndexedDB (LS limitations)
* `P` do not move (average) endpoints connected to long lines in decimate
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

* `F` convert ranges to z offsets while continuing to show layer #
* `F` support pillar top/bottom should conform to part
* `F` support pillar should have solid top/bottom
* `F` more explicit line width control with ranges and min/max adaptive
* `F` test outlining solid projected areas (internally)
* `F` gradient infill https://www.youtube.com/watch?v=hq53gsYREHU&feature=emb_logo
* `F` feather sharp tips by reducing extrusion in area of overlap
* `F` segment large flat areas on first layer to mitigate peeling
* `F` option to support interior bridges when 0% infill
* `F` calculate filament use per extruder per print
* `F` expand internal supporting flats / solids before projection

* `P` reduce fan speed and extrusion factor for bridges
* `P` auto purge pullars when quick layers are detected for extra cooling
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

* `B` tab cuts cause loss of direction, parenting, depth, and it's hard to fix
* `B` tabs do not properly track widget mirror events
* `B` tabs are not cut to exact height
* `B` first rough step too far down in certain circumstances?
* `B` need to force cut line at synthetic z bottom (midlines, etc)
* `B` contour does not honor clip to stock

* `F` separate leveling op. add features like uni-directional cutting
* `F` add pause operation with optional gcode
* `F` add option for op-major ordering (instead of part major)
* `F` animate only selected range (as an option)
* `F` add `plunge max` to contouring that can override z feed limit
* `F` roughing flats should be constrained to flat region, not create a layer
* `F` limit cut depth to flute length of selected tool (or warn)
* `F` change color of line selection in trace op when not a closed poly
* `F` add linear clearing strategy
* `F` add adaptive clearing strategy
* `F` add ease-down support to trace op
* `F` user-defined origin (issue #28)
* `F` intelligently turn circle hole pocket clear into spiral down
* `F` add climb/conventional into each operation
* `F` extend acute roughing on inside polys to clear small voids
* `F` validate muti-part layout and spacing exceeds largest outside tool diameter
* `F` parameterize dropping close points in prep.js. ensure long segments remain straight
* `F` flat and volumetric rendering of paths
* `F` z planar settings visualizations
* `F` lead-in milling
* `F` trapezoidal tabs in Z
* `F` add support for tapered ball mills
* `F` ease-in and ease-out especially on tab cut-out start/stop
* `F` add option to spiral in vs out (optimal tool life) vs mixed (optimal path)
* `F` can animation clear the mesh in areas where the cuts go through the stock?
* `F` support lathe mode / A-axis / rotary
* `F` gcode output option as zip for multiple or flip ops or tool change
* `F` maintain several part orientations + op chains in a single profile

* `P` port slicing to common core & refactor accordingly
* `P` decrease cutting speed when entire tool is engaged (start of roughing)
* `P` clear void should cut inside-to-out when a part would be freed from stock
* `P` port arc code from FDM export to CAM export
* `P` common part pre-analyze to speed up 'slice' and improve shadow (overhangs)
* `P` redo all path route / planning in prepare to account for terrain before camOut

# SLA

* `P` blit layers w/ 3JS ortho camera to canvas

# Laser

* `F` add PLT / HP-GL output format (https://en.wikipedia.org/wiki/HP-GL)

# OctoPrint plugin

* subfolder parameter for dropped files
* auto-kick check box in preferences


# Mesh:Tool

* send to Kiri:Moto workspace (or update model vertices in place)
* better z snap using just vertexes from face intersected
* add section view. local clip. raycast skip points above plane
* add isolate op = separate bodies
* add decimate op = face reduction
* add flatten/crush op: for z bottoms (or surfaces?)
* allow setting model/group origin for scale/rotate
* fix mirror to work with groups (just models currently)
* bounding box toggle should be global, not selection
* add analyze results dialog
* remove/hide auto-repair function
