# Kiri:Moto todo

* store settings profile used per-device so re-loaded on device switch
* prevent text selection of non-input
* widget general add-ons (fdm supports, cam tabs)
* bail on decimation if it's proving ineffective
* improve decimation speed by avoiding in/out of Point
* dismissable transient message/alert
* modal non-alert-based dialog & spinner
* ability to cancel slice operations (complicated w/ workers)
* server-side processing (determine protocol and storage)
* move more kiri code (like printing) into modules like serial
* include device + settings in exported gcode as comments
* frame api * https://plus.google.com/u/0/+JakobFlierl/posts/hn6eirr6fXC
* refactor / simplify POLY.expand (put onus on collector)
* add simple solid (tube-like) rendering in place of lines
* extend mesh object to store raw + annotations (rot,scale,pos), share raw data w/ dups, encode/decode
* cloned objects share same slices data unless rotated
* remember object's original position/orientation for reset/multi-object import alignment
* gcode import break up "layers" on z move with no x/y move

# Onshape todo

* popup warning when detect 3rd party storage blocked (chrome)
* watch for changed part version to prompt re-import
* re-used disk cached version of parts if not changed
* remap mouse/kbd to match onshape when running inside?

# CAM todo

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

# FDM todo

* preview doesn't show proper z offsets
* trim support offset from layer below
* add support gap layers (defaults to 1)
* use fill spacing for top raft fill spacing
* fix thin fill (outside). compute before sparse as separate logic.
* add pause at specified layers
* fix slow seek to first point (raft) and wrong first point in general (all modes)
* add lay-flat auto-rotation or from selected face
* add manual supports
* determine start point from gcode preamble
* check for support / brim intersections on first layer
* solid fill every other line, two passes. minimize heat/sag. better fill between
* fan / layer control * update forum
* dual extruder support
* add min layer time (slowdown or cool-off wait)
* option to support interior bridges when 0% infill
* fix multiple part layout export offset (resend position @ print time)
* implement gyroid infill * https://en.wikipedia.org/wiki/Gyroid

# Laser todo

* interior poly offsets are in the wrong direction
* overcuts, radii for drag knives
* sla :: svg modified from http://garyhodgson.github.io/slic3rsvgviewer/?file=examples/belt_pulley3.svg

# References

* shader examples to enable object-clipping
  -----
* http://jsfiddle.net/LK84y/9/
* http://www.html5rocks.com/en/tutorials/webgl/shaders/

* other
  -----
* http://lcamtuf.coredump.cx/gcnc/full/
* http://www.tcs.fudan.edu.cn/rudolf/Courses/Algorithms/Alg_cs_07w/Webprojects/Zhaobo_hull/
* https://en.wikipedia.org/wiki/Graham_scan
* http://www.cambam.info/doc/0.9.7/cam/Pocket.aspx
* http://hackaday.com/2016/01/22/pack-your-plywood-cuts-with-genetic-algortihms/
* http://wiki.imal.org/howto/cnc-milling-introduction-cutting-tools
* http://www.twak.co.uk/2011/01/degeneracy-in-weighted-straight.html


# Sample FDM Pause/Unpause ```

; --- pause ---
G91        ; Relative Positioning
G0 Z20     ; Move Bed down 20mm
G90        ; Absolute positioning
G0 X10 Y10 ; Move to 10,10
M2000      ; Raise3D N2 Pause command

; --- un-pause ---
G91        ; Relative Positioning
G0 Z-20    ; Move Bed up 20mm
G90        ; Absolute positioning

```
