# Kiri:Moto todo

## `C` cosmetic, `F` functional, `P` performance, `B` bug fix

* `F` add click-to-activate/dismiss for configuration panels
* `F` implement an in-app bug reporting system
* `F` extend mesh object to store raw + annotations (rot,scale,pos)
*     share raw data w/ dups, encode/decode
* `F` gcode color to speed visualization bar
* `F` X,Y,Z colored axes visualizations
* `P` bail on decimation if it's proving ineffective
* `P` improve decimation speed by avoiding in/out of Point?
* `P` server-side processing (determine protocol and storage)
* `P` refactor / simplify POLY.expand (put onus on collector)
* `P` duplicate objects should share same slice data unless rotated or scaled
* `F` https://poeditor.com/projects/view_terms?id=336467&per_page=20

# FDM

* `B` fix adaptive slicing with multi-extruder
* `B` fix supports with grouped parts
* `F` speculative background preview generation
* `F` control for size of purge block (with 0=disabled)
* `F` add separate fill speed control
* `F` manual support addition / control
* `F` polishing and other non-planar work
* `F` gradient infill https://www.youtube.com/watch?v=hq53gsYREHU&feature=emb_logo
* `F` feather sharp tips by reducing extrusion in area of overlap
* `F` first layer segment large flat areas for better fill reliability
* `F` enable purge block when quick layers are detected
* `F` apply finish speed to exposed top and underside flat areas
* `F` expand internal supporting flats
* `F` first layer support speed should be same as shell speed
* `F` determine start point from gcode preamble
* `F` trim support offset from layer below
* `F` option to support interior bridges when 0% infill
* `F` calculate filament use per extruder per print
* `P` refactor thin fill to use outline and inside poly normal dist to self
* `P` segment large polygons for extremely large parts / infill
* `P` implement infill clipping in wasm

# SLA

* `P` prioritize supports by length of unsupported span. mandatory when circularity > X
*     or % area of inner to outer poly is high (making it a thin shell)

# CAM

* `B` outline slicing should be distinct from roughing which handles flats
* `B` excessive moves with tabs. allow reversing in open polys or do not nest them
* `B` fails in pancaking (clone) when there are no sliced layers (like z bottom too high)
* `B` contouring should extend beyond part boundaries by tool radius
* `B` outside cutting direction in roughing mode inverted
* `B` widen outside cuts to prevent chatter on deep (metal) features
* `F` provide planar or other visual hint of current z bottom offset
* `F` redo collision code use fixed slices and path/poly intersection instead of a topo map
* `F` z bounded slices (extension of z bottom offset feature)
* `F` z planar settings visualizations
* `F` use arcs to connect hard angles
* `F` lead-in milling
* `F` trapezoidal tabs (in the Z axis)
* `F` ease-in and ease-out especially on tab cut-out start/stop
* `F` implement z line-only follows for ball/taper
* `F` add option to spiral in vs out (optimal tool life) vs mixed (optimal path)
* `F` add endmill spiral direction to fully respect climb vs conventional
* `F` add support for tapered ball mills
* `F` warn when part > stock or cuts go outside bed
* `F` add M03 tool feedrate support
* `P` refactor slicing around flats w/ interpolation instead of culling
* `P` disable topo generation when no contour xy and no depth first
* `P` store tab and camshell polys in widget.topo to minimize z on edge moves
* `P` contouring is going back to z top too often
* `P` option to skip milling holes that would be drilled
* `P` crossing open space check point is outside camshell before returning max z
* `P` background worker to speculatively generate topo maps (and maybe pre-slicing)

# Laser

* `F` overcuts, radii for drag knives
* `F` output option to uniquely color code each layer
* `F` add PLT / HP-GL output format (https://en.wikipedia.org/wiki/HP-GL)

# References

* https://www.canva.com/colors/color-wheel/
* http://lcamtuf.coredump.cx/gcnc/full/
* http://wiki.imal.org/howto/cnc-milling-introduction-cutting-tools
* http://www.twak.co.uk/2011/01/degeneracy-in-weighted-straight.html
* http://photon.chrisgraf.de/

# More CNC

* https://www.researchgate.net/publication/250328721_Toolpath_Optimization_on_Automatic_Removal_Uncut_and_Application
