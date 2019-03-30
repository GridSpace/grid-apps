# Kiri:Moto todo

* widget general add-ons (fdm supports, cam tabs)
* extend mesh object to store raw + annotations (rot,scale,pos)
*    share raw data w/ dups, encode/decode
* bail on decimation if it's proving ineffective
* improve decimation speed by avoiding in/out of Point
* server-side processing (determine protocol and storage)
* move more kiri code (like printing) into modules like serial
* refactor / simplify POLY.expand (put onus on collector)
* add simple solid (tube-like) rendering in place of lines
* cloned objects should share same slice data unless rotated
* remember object's original position/orientation for reset/multi-object import alignment

# FDM todo

* store/recover grid:print target against printer selected in device
* expand internal supporting flats
* first layer support speed should be same as shell speed
* use fill spacing for top raft fill spacing
* add lay-flat auto-rotation or from selected face
* refactor thin fill to use outline and inside poly normal dist to self
* check for support / brim intersections on first layer
* determine start point from gcode preamble
* fix wrong first point in general (all modes)
* trim support offset from layer below
* feather sharp tips by reducing extrusion in area of overlap
* dual extruder support
* add manual supports
* fan / layer control
* update forum
* option to support interior bridges when 0% infill
* fix multiple part layout export offset (resend position @ print time)

# CAM todo

* refactor slicing around flats w/ interpolation instead of culling
* optimize away topo generation (for z hop/move) when part is flat
* add imperial / metric units switch in (future) global config options
* add option to spiral in vs out (optimal tool life) vs mixed (optimal path)
* pocket order should consider distance as well as size
* ease-in and ease-out especially on tab cut-out start/stop
* import options: unify bodies.
* milling order option: by operation or by part
* store tab and camshell polys in widget.topo to minimize z on edge moves
* trimming linear finishing to tabs
* improve 'clockwise' setting to take into account spindle direction, etc
* linear finishing cutting out tabs
* linear finishing going back to z top too often
* fix ease down and re-enable
* warn when part > stock or cuts go outside bed
* option to skip milling holes that would be drilled
* sender speed control slider (0%-200%) ?
* add M03 tool feedrate support (https://forum.grid.space/index.php?p=/discussion/14/s-parameter#latest)
* fails in pancaking (clone) when there are no sliced layers (like z bottom too high)
* crossing open space check point is outside camshell before returning max z
* compensate for leave-stock in outside roughing (w/ tabs)
* fix zooming, workspace thickness for larger workspaces
* only show toolchange alert/pause after the first M6
* raise z by leave-stock in roughing? if so, see next
* if (raise z) above, add clear-flats to finishing
* revisit tabs - just cut polys instead
* try chunking topo until smaller blocks for processing (fit in cacheline)
* linear x/y scan overflow (y) w/ topo model
* linear x/y not obeying inset from pocket only
* check normals for downward facing facets. mark top for slice skirt/pancake

# Laser todo

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
