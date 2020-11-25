# Kiri:Moto todo

## 2.4 tentative list
* cnc
*   tracing (chamfer, engrave)
*   auto feature detection (slicing), manual tabs
*   add tabs to shadow and slice model (for topo)
* fdm
*   continuous printing (z belt systems)
* laser
*   drag knife support
* all
*   2d image to 3d part
*   circular fit/layout when no-layout to prevent collisions

## `C` cosmetic, `F` functional, `P` performance, `B` bug fix

* `F` 2D image import
* `F` detect and report slow framerates
* `F` implement an in-app bug reporting system
* `P` improve decimation speed by avoiding in/out of Point?
* `P` duplicate objects should share same slice data unless rotated or scaled
* `P` worker state cache cleanup and organization
* `P` client/worker interface normalization

# FDM

* `B` expand > 0 producing artifacts with manual supports
* `B` fix adaptive slicing with multi-extruder
* `B` fix supports with grouped parts
* `B` sparse infill should follow polys between intersect points
* `B` multi-extruder rendering of raft fails to offset the rest of the print
* `B` multi-extruder purge blocks fail to generate properly for rafts
* `F` control for size of purge block (with 0=disabled)
* `F` add separate fill speed control
* `F` manual support addition / control
* `F` control layer start position
* `F` polishing and other non-planar work
* `F` gradient infill https://www.youtube.com/watch?v=hq53gsYREHU&feature=emb_logo
* `F` feather sharp tips by reducing extrusion in area of overlap
* `F` first layer segment large flat areas for better fill reliability
* `F` enable purge blocks when quick layers are detected
* `F` apply finish speed to exposed top and underside flat areas
* `F` expand internal supporting flats
* `F` first layer support speed should be same as shell speed
* `F` trim support offset from layer below
* `F` option to support interior bridges when 0% infill
* `F` calculate filament use per extruder per print
* `P` implement infill clipping in wasm
* `P` solid fill the tops of supports for down facing flats

# SLA

* `P` prioritize supports by length of unsupported span. mandatory when circularity > X
*     or % area of inner to outer poly is high (making it a thin shell)

# CAM

* `B` climb vs conventional not fully consistent after refactor
* `B` outside cutting direction in roughing mode inverted
* `B` clear voids has double interior pass because wrong offset shadow used
* `B` top clearing operations should use linear, not offset, passes
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
* `P` crossing open space check point is outside camshell before returning max z

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
