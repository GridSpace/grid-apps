# Grid:Apps Future Notes

## `C` cosmetic, `F` functional, `P` performance, `B` bug fix

# Kiri:Moto

* `B` origin (and bed size) bug (Onshape?) when switching device modes
* `B` can't drag slider bar on ipad / ios -- touch pad scrolling dodgy
* `B` prevent or ask for really large models when scaling (crash ui)

* `P` duplicate objects should share same slice data unless rotated or scaled
* `P` allow selection to be decimated on demand (context menu?)
* `P` move all persisted / workspace settings/data to IndexedDB (LS limitations)
* `P` do not move (average) endpoints connected to long lines in decimate
* `P` explore widget vertex reloading / replacing (Onshape) (issue #48)
* `P` faster ray intersect https://github.com/gkjohnson/three-mesh-bvh/
* `P` try material clipping planes for slice range selection

* `F` edit in Mesh:Tool
* `F` custom device vars for profiles / ranges / gcode
* `F` show slider range values in workspace units (on hover?)
* `F` allow select of a range by typing in values in slices or workspace units
* `F` complete and expose grouping feature
* `F` add svgnest-like arrange algorithm
* `F` warn if part hanging in negative Z space or off bed in general
* `F` date column and sorting in recent files list

* `C` reflow device dialog to add bottom tabbing, vertical macro list

# FDM

* `B` fix support projection/end with grouped parts
* `B` multi-extruder rendering of raft fails to offset the rest of the print
* `B` multi-extruder purge blocks fail to generate properly for rafts

* `F` add layer start position as a range option
* `F` support pillar top/bottom should conform to part
* `F` support pillar should have solid top/bottom
* `F` more explicit line width control with ranges and min/max adaptive
* `F` test outlining solid projected areas (internally)
* `F` gradient infill https://www.youtube.com/watch?v=hq53gsYREHU&feature=emb_logo
* `F` feather sharp tips by reducing extrusion in area of overlap
* `F` first layer segment large flat areas for better fill reliability
* `F` option to support interior bridges when 0% infill
* `F` calculate filament use per extruder per print
* `F` expand internal supporting flats / solids before projection

* `P` reduce fan speed for bridging
* `P` enable purge blocks when quick layers are detected
* `P` refactor skirt, brim, raft as synth widget instead of in path routing
* `P` extruder + filament max flow rate cap in planner
* `P` revisit path routing / optimization
* `P` solid fill the tops of supports for down facing flats

# FDM - SLA

# `P` common support area detection (fork new fdm code)
* `P` prioritize supports by length of unsupported span. mandatory when circularity > X
*     or % area of inner to outer poly is high (making it a thin shell)

# FDM - BELT

* `B` auto bed resizing leaves the origin in the wrong place at first
* `B` re-add progress calls for all work units

* `F` promote forced layer retraction to a range parameter
* `F` test and enable arcs in belt more
* `F` anchors should be generated anywhere needed in the print, not just head
* `F` slightly angle supports to lean into the Z of the part

# CAM

* `B` tab cuts cause loss of direction, parenting, depth, and it's hard to fix
* `B` tabs are not cut to exact height
* `B` tabs do not properly track widget mirror events
* `B` first rough step too far down in certain circumstances?
* `B` need to force cut line at synthetic z bottom (midlines, etc)
* `B` contour does not honor clip to stock

* `F` add `plunge max` to contouring that can override z feed limit
* `F` roughing flats should be constrained to flat region
* `F` limit cut depth to flute length of selected tool (or warn)
* `F` add ease-down support to trace op
* `F` change color of line selection in trace op when not a closed poly
* `F` add linear clearing strategy
* `F` add adaptive clearing strategy
* `F` user-defined origin (issue #28)
* `F` intelligently turn circle hole pocket clear into spiral down
* `F` trace follow hole that matches endmill should turn into a drill op
* `F` add climb/conventional into each operation
* `F` update analyzer to detect overhangs from faces, not slices
* `F` extend acute roughing on inside polys to clear small voids
* `F` option to use part / STL coordinate space to determine X,Y origin
* `F` validate muti-part layout and spacing exceeds largest outside tool diameter
* `F` polygon simplification option in tracing (for image derived maps)
* `F` parameterize dropping close points in prep.js. ensure long segments remain straight
* `F` flat and volumetric rendering of paths
* `F` z planar settings visualizations
* `F` convert acute angles to arcs to avoid jerk
* `F` lead-in milling
* `F` trapezoidal tabs in Z
* `F` ease-in and ease-out especially on tab cut-out start/stop
* `F` add option to spiral in vs out (optimal tool life) vs mixed (optimal path)
* `F` add support for tapered ball mills
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
* `P` allow faster z movements when contouring (not plunging)
* `P` common / faster shadow generator using vertices shared with ledges

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
