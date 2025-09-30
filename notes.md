# Grid:Apps Future Notes

## `C` cosmetic, `F` functional, `P` performance, `B` bug fix

* `F` option to hide platform when viewing from below

# Kiri:Moto

* `B` origin (and bed size) bug (Onshape?) when switching device modes
* `B` can't drag slider bar on ipad / ios -- touch pad scrolling dodgy
* `B` prevent or ask for really large models when scaling (crash ui)

* `P` refactor vertex replacement and widget update matrix tracking
* `P` duplicate objects should share same slice data unless rotated or scaled
* `P` move all persisted / workspace settings/data to IndexedDB (LS limitations)
* `P` faster ray intersect https://github.com/gkjohnson/three-mesh-bvh/
* `P` try material clipping planes for slice range selection
* `P` switch png lib to https://github.com/photopea/UPNG.js

* `F` edit in Mesh:Tool
* `F` custom device vars for profiles / ranges / gcode
* `F` show slider range values in workspace units (on hover?)
* `F` allow select of a range by typing in values in slices or workspace units
* `F` complete and expose grouping feature
* `F` add svgnest-like arrange algorithm
* `F` date column and sorting in recent files list
* `F` highlight part outside workspace bounds (like can neg Z shader)

# FDM

* `B` fix support projection/end with grouped parts
* `B` multi-extruder rendering of raft fails to offset the rest of the print
* `B` multi-extruder purge blocks fail to generate properly for rafts

* `F` new parameter to cap output flow rate (on printer device)
* `F` new parameters for bridging speed / bridge fan control
* `F` convert ranges to z offsets while continuing to show layer #
* `F` support pillar top/bottom should conform to part
* `F` more explicit line width control with ranges and min/max adaptive
* `F` test outlining solid projected areas (internally)
* `F` gradient infill https://www.youtube.com/watch?v=hq53gsYREHU&feature=emb_logo
* `F` segment large flat areas on first layer to mitigate peeling
* `F` option to support interior bridges when 0% infill
* `F` calculate filament use per extruder per print
* `F` expand internal supporting flats / solids before projection (threshold)

* `P` auto purge pillars when quick layers are detected for extra cooling
* `P` solid fill the tops of supports for down facing flats

# FDM - BELT

* `B` auto bed resizing leaves the origin in the wrong place at first
* `B` re-add progress calls for all work units

* `F` test and enable arcs in belt more
* `F` slightly angle supports to lean into the Z of the part
* `F` anchors should be generated anywhere needed in the print, not just head

# CAM

* `B` rapid moves should be max of terrain zmax and last cut layer height (roughing)
* `B` feed rate for next tool set before tool change (push/pop feed rates?)
* `B` tab cuts cause loss of direction, parenting, depth, and it's hard to fix
* `B` tabs do not properly track widget mirror events
* `B` tabs are not cut to exact height
* `B` contour does not honor clip to stock

* `F` add lathe step down to eliminate the need for roughing
* `F` allow import, rotation, scaling of stock
* `F` get gcode coordinates off a part with point/click or hover?
* `F` include tools in default devices (Carvera)
* `F` add `match faces` option in `outline` operation
* `F` add {progress} substitution and maybe {time-remaining} if can be calc'd
* `F` import and follow 2D paths (conformed like pocket contours)
* `F` add `plunge max` to contouring that can override z feed limit
* `F` add lead-in milling (requires adding clamp / no go areas)
* `F` add linear clearing strategy
* `F` add adaptive clearing strategy
* `F` add support for tapered ball mills
* `F` change color of line selection in trace op when not a closed poly
* `F` limit cut depth to flute length of selected tool (or warn)
* `F` validate muti-part layout and spacing exceeds largest outside tool diameter
* `F` trapezoidal tabs in Z
* `F` ease-in and ease-out especially on tab cut-out start/stop
* `F` maintain several part orientations + op chains in a single profile

* `P` outer outside corners as arc moves
* `P` improve parser - do not require spaced tokens and support implied G0 / G1
* `P` log Z interpolation for contour XYZ moves
* `P` option to start with the smallest poly by area on layer change
* `P` redo all path route / planning in prepare to account for terrain before camOut

# Laser

* `F` add PLT / HP-GL output format (https://en.wikipedia.org/wiki/HP-GL)

# OctoPrint plugin

* subfolder parameter for dropped files
* auto-kick check box in preferences

# Mesh:Tool

* add undo/redo
* add TextGeometry
* https://threejs.org/docs/#examples/en/geometries/TextGeometry
* https://dustinpfister.github.io/2023/07/05/threejs-text-geometry/
* font to path with https://github.com/paulzi/svg-text-to-path
* click to repair normals based on a known good (selected) face
* send to Kiri:Moto workspace (or update model vertices in place)
* better z snap using just vertexes from face intersected
* add section view. local clip. raycast skip points above plane
* add decimate op = face reduction
* add flatten/crush op: for z bottoms (or surfaces?)
* allow setting model/group origin for scale/rotate
* fix mirror to work with groups (just models currently)
* add analyze results dialog
* remove/hide auto-repair function

# Other

* preferred icons https://icons.getbootstrap.com/
