# Kiri:Moto todo

* hide the bed with a checkbox? indication of part outside printable area?
* set page background color? or dark mode?
* better small screen support (on screen button for hiding side panels, compact selectors)
* widget general add-ons (fdm supports, cam tabs)
* extend mesh object to store raw + annotations (rot,scale,pos)
*    share raw data w/ dups, encode/decode
* bail on decimation if it's proving ineffective
* improve decimation speed by avoiding in/out of Point
* server-side processing (determine protocol and storage)
* refactor / simplify POLY.expand (put onus on collector)
* cloned objects should share same slice data unless rotated
* remember object's original position/orientation for reset/multi-object import alignment

# FDM todo

* gradient infill https://www.youtube.com/watch?v=hq53gsYREHU&feature=emb_logo
* disable infill fingerprinting for gyroids
* first layer segment large flat areas for better fill reliability
* adaptive column to compensate for fine or layers that finish too quickly and melt
* apply finish speed to exposed top and underside flat areas
* expand internal supporting flats
* first layer support speed should be same as shell speed
* add lay-flat auto-rotation or from selected face
* refactor thin fill to use outline and inside poly normal dist to self
* check for support / brim intersections on first layer
* determine start point from gcode preamble
* fix wrong first point in general (all modes)
* trim support offset from layer below
* feather sharp tips by reducing extrusion in area of overlap
* dual extruder support
* add manual supports
* option to support interior bridges when 0% infill
* fix multiple part layout export offset (resend position @ print time)

# CAM todo

* refactor slicing around flats w/ interpolation instead of culling
* optimize away topo generation (for z hop/move) when part is flat
* add option to spiral in vs out (optimal tool life) vs mixed (optimal path)
* ease-in and ease-out especially on tab cut-out start/stop
* milling order option: by operation or by part
* store tab and camshell polys in widget.topo to minimize z on edge moves
* add endmill spiral direction to influence next point
* improve 'clockwise' setting to take into account spindle direction, etc (climb/conventional)
* lead-in milling
* linear finishing going back to z top too often
* fix ease down and re-enable (need failure case)
* warn when part > stock or cuts go outside bed
* option to skip milling holes that would be drilled
* add M03 tool feedrate support (https://forum.grid.space/index.php?p=/discussion/14/s-parameter#latest)
* fails in pancaking (clone) when there are no sliced layers (like z bottom too high)
* crossing open space check point is outside camshell before returning max z
* compensate for leave-stock in outside roughing (w/ tabs)
* fix zooming, workspace thickness for larger workspaces
* linear x/y not obeying inset from pocket only
* check normals for downward facing facets. mark top for slice skirt/pancake

# Laser todo

* add proper devices
* color coding according to # of identical polys that show up in stacked layers
* overcuts, radii for drag knives
* sla :: svg modified from http://garyhodgson.github.io/slic3rsvgviewer/?file=examples/belt_pulley3.svg

# References

* other
  -----
* http://lcamtuf.coredump.cx/gcnc/full/
* http://wiki.imal.org/howto/cnc-milling-introduction-cutting-tools
* http://www.twak.co.uk/2011/01/degeneracy-in-weighted-straight.html


# Sample FDM Pause/Unpause ```

G91        ; Relative Positioning
G0 Z20     ; Move Bed down 20mm
G90        ; Absolute positioning
G0 X10 Y10 ; Move to 10,10
M2000      ; Raise3D N2 Pause command
G91        ; Relative Positioning
G0 Z-20    ; Move Bed up 20mm
G90        ; Absolute positioning

```
