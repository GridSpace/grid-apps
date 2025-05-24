---
description: Keyboard Shortcuts and Mouse Controls
label: ops
---

# Operations

ops, not to be confused with [opps](https://knowyourmeme.com/memes/opp-opps) are the operations applied to a model to remove material. The operations tab also contains meta operations that represent parts of the manufacturing process, but do not nessecarity generate toolpaths.

These operation include:

- Toolpath Operations
  - Global
    - [Outline](#outline)
    - [level](#level)
    - [rough](#rough)
    - [contour](#contour)
  - Specific
    - [Drill](#drill)
    - [Trace](#trace)
    - [Pocket](#pocket)
- Other Operations
  - [Gcode](#gcode)
  - [Register](#register)
- Laser Operations
  - [laser on](#laser-on)
  - [laser off](#laser-off) 
- Indexed Operations
  - [Index](#index)
  - [lathe](#lathe)


## Global Operations

Operations that apply to all objects in the workspace. 

### Outline

![](/img/CAM/outlineExample.png)

The Outline op generates a toolpath surrounding the edges of a part. It is highly configurable and can select both internal or external edges specifically. The Outline operation is great for:

- Cutting out many objects at once
- Generating a rough/finishing pass on an object
- Easily avoiding spefic parts like pockets or holes

## Specific Operations

### Outline
 
## Laser Mode Only


