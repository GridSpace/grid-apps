# Kiri:Moto todo and notes

## 2.4 roadmap
* `laser`
* - drag knife support

## 2.5 roadmap
# `cnc`
# - lathe, A-axis
# - complex process order
# - split gcode output
# - double-sided assistance
# - redo path planning
# `fdm`
# - redo automatic supports using faces instead of deltas
# - bind process to z ranges or boxed regions
# - non-planar actual
# `all`
# - improve device list, selection, management, customization

## `C` cosmetic, `F` functional, `P` performance, `B` bug fix

* `F` mesh / stl export (like w/ images, rotate, scale, future cleanup ops)
* `F` right click / context menu (object deletion, etc)
* `F` detect and report slow framerates
* `P` duplicate objects should share same slice data unless rotated or scaled
* `P` optimize object import to vertices + indexes to save memory
* `P` allow selection to me decimated on demand (context menu?)
* `P` improve decimation speed by avoiding in/out of Point?
* `P` client/worker interface normalization

# FDM

* `B` fix adaptive slicing with multi-extruder
* `B` fix supports with grouped parts
* `B` multi-extruder rendering of raft fails to offset the rest of the print
* `B` multi-extruder purge blocks fail to generate properly for rafts
* `F` redo auto supports to use poly faces rather than deltas
* `F` control for size of purge block (with 0=disabled)
* `F` control layer start position
* `F` add separate fill speed control
* `F` polishing and other non-planar work
* `F` gradient infill https://www.youtube.com/watch?v=hq53gsYREHU&feature=emb_logo
* `F` first layer segment large flat areas for better fill reliability
* `F` feather sharp tips by reducing extrusion in area of overlap
* `F` enable purge blocks when quick layers are detected
* `F` option to support interior bridges when 0% infill
* `F` trim support offset from layer below
* `F` calculate filament use per extruder per print
* `F` first layer support speed should be same as shell speed
* `F` apply finish speed to exposed top and underside flat areas
* `F` expand internal supporting flats / solids before projection
* `F` continuous printing (z belt systems)
* `P` implement infill clipping in wasm
* `P` solid fill the tops of supports for down facing flats
* `P` sparse infill should follow polys between intersect points

# SLA

* `P` prioritize supports by length of unsupported span. mandatory when circularity > X
*     or % area of inner to outer poly is high (making it a thin shell)

# CAM

* `B` crossing interior open spaces doesn't lift high enough
*     https://forum.grid.space/t/g0-movement-hits-the-stock-using-custom-tabs-positioning/171/2
* `B` climb vs conventional not fully consistent after refactor
* `B` outside cutting direction in roughing mode inverted
* `B` top clearing operations should use linear, not offset, passes
* `F` exports separate files for each operation
* `F` animation should clear the mesh in areas where the cuts go through the stock?
* `F` switch z top offset to an z anchor (top/bottom) + offset
* `F` use 3 registration holes to prevent rotation accidents (midline offset one axis)
* `F` parameterize dropping close points in prep.js. ensure long segments remain straight
* `F` flat and volumetric rendering of paths
* `F` z bounded slices (extension of z bottom offset feature)
* `F` z planar settings visualizations
* `F` use arcs to connect acute angles
* `F` extend acute roughing on inside polys to clear small voids
* `F` lead-in milling
* `F` adaptive clearing in roughing mode
* `F` trapezoidal tabs (in the Z axis)
* `F` ease-in and ease-out especially on tab cut-out start/stop
* `F` implement z line-only follows for ball/taper
* `F` add option to spiral in vs out (optimal tool life) vs mixed (optimal path)
* `F` add support for tapered ball mills
* `F` warn when part > stock or cuts go outside bed
* `F` A-B linked cutting profiles for double-sided milling / part flips
* `P` crossing open space check point is outside camshell before returning max z
* `P` detect render message backlog and pause or warn
* `P` redo all path route / planning in prepare to account for terrain before camOut

# Laser

* `F` overcuts, radii for drag knives
* `F` add PLT / HP-GL output format (https://en.wikipedia.org/wiki/HP-GL)

# References

* https://www.canva.com/colors/color-wheel/
* http://lcamtuf.coredump.cx/gcnc/full/
* http://wiki.imal.org/howto/cnc-milling-introduction-cutting-tools
* http://www.twak.co.uk/2011/01/degeneracy-in-weighted-straight.html
* http://photon.chrisgraf.de/

# More CNC

* https://www.researchgate.net/publication/250328721_Toolpath_Optimization_on_Automatic_Removal_Uncut_and_Application
