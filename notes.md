# Kiri:Moto todo

## `C` cosmetic, `F` functional, `P` performance, `B` bug fix

* `F` implement an in-app bug reporting system
* `F` extend mesh object to store raw + annotations (rot,scale,pos)
*     share raw data w/ dups, encode/decode
* `F` gcode color to speed visualization bar
* `P` bail on decimation if it's proving ineffective
* `P` improve decimation speed by avoiding in/out of Point?
* `P` server-side processing (determine protocol and storage)
* `P` refactor / simplify POLY.expand (put onus on collector)
* `P` duplicate objects should share same slice data unless rotated or scaled

# FDM

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
* `P` disable infill fingerprinting for gyroids
* `P` refactor thin fill to use outline and inside poly normal dist to self

# SLA

* `P` prioritize supports by length of unsupported span. mandatory when circularity > X

# CAM

* `B` fails in pancaking (clone) when there are no sliced layers (like z bottom too high)
* `B` linear finishing should extend beyond part boundaries by tool radius
* `B` outside cutting direction in roughing mode inverted
* `F` do not mill out thru-pockets. cut outline only.
* `F` use arcs to connect hard angles
* `F` do not rough areas that go all the way through the part
      https://github.com/GridSpace/grid-apps/issues/20
* `F` send gcode to cncjs
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
* `P` disable topo generation when no linear xy and no depth first
* `P` store tab and camshell polys in widget.topo to minimize z on edge moves
* `P` linear finishing is going back to z top too often
* `P` option to skip milling holes that would be drilled
* `P` crossing open space check point is outside camshell before returning max z
* `P` background worker to speculatively generate topo maps (and maybe pre-slicing)

# Laser

* `F` overcuts, radii for drag knives

# References

* https://www.canva.com/colors/color-wheel/
* http://lcamtuf.coredump.cx/gcnc/full/
* http://wiki.imal.org/howto/cnc-milling-introduction-cutting-tools
* http://www.twak.co.uk/2011/01/degeneracy-in-weighted-straight.html
* http://photon.chrisgraf.de/
