---
description: Variable Substitutions and Expressions in GCode Macros
---

# GCode Macros

## All Modes

### "Header"/"Footer" Only Macros

- \{top\} = offset in mm of bed top Y axis
- \{left\} = offset in mm of bed left X axis
- \{right\} = offset in mm of bed right X axis
- \{bottom\} = offset in mm of bed bottom Y axis

### "Footer" Only Macros

- \{time\} = job run time (printing/milling) in seconds (fractional)
- \{print-time\} = alias for \{time\} ... deprecated after 2.8
- \{print_time\} = alias for \{time\} ... 2.9 and beyond


## FDM (3D Printing) Mode Only

### FDM Macros

- \{temp\} = hot end temperature
- \{bed_temp\} = bed temperature
- \{fan_speed\} = active cooling fan speed (usually 0-255)
- \{material\} = length in mm of material (filament) used
- \{layers\} = total # of layers
- \{layer\} = current layer number
- \{height\} = current layer height in mm
- \{range(_from_,_to_)\} = evaluated using \{layer\} and \{layers\}
- \{pos_x\} = last output X position
- \{pos_y\} = last output Y position
- \{pos_z\} = last output Z position
- \{progress\} = 0-100% state of print output
- \{tool\} | \{nozzle\} = current tool in use
- \{tool_count\} = number of tools used in print
- \{tool_used\__n_\} = whether tool # _n_ is used in print
- \{z_max\} = max build height in mm
- \{z\} = current z position
- \{e\} = amount of filament extruded

### "Feature" only Macros (v3.4+)
- \{feature\} = feature region of the print (brims, infill, etc)
- \{minx|miny|maxx|maxy\} = position in mm of extents of the print area

### Logical Code Flow (IF / ELIF / ELSE / END)
```
;; IF { layer >= 10 && layer <= 20 }
;; ..... inside 10-20 layer={layer}
;; ELIF { layer >= 15 && layer <= 25 }
;; ..... inside 15-25 layer={layer}
;; ELSE
;; ..... did not match previous tests layer={layer}
;; END
```

### PREAMBLE control (v3.4+) 
Allows for intro comment and config list to be re-positioned after the header or disabled. This was introduced to allow GCode output to work with Ultimaker.

`;; PREAMBLE OFF`

`;; PREAMBLE END`

## CAM Mode Only

### CAM Macros

- \{tool\} = CAM tool #
- \{tool_name\} = CAM tool name
- \{time\} = dwell time in seconds
- \{time_ms\} = dwell time in milliseconds
- \{time_sec\} = dwell time in seconds
- \{speed\} = spindle speed
- \{spindle\}, \{rpm\} = spindle speed (v2.7+)
- \{feed\} = last output feed rate
- \{pos_x\} = last output X position
- \{pos_y\} = last output Y position
- \{pos_z\} = last output Z position

### CAM Header Directives

Comments Rewrite (v3.8+) converts `;` comments into `()` parenthesis format

`;; COMMENT_REWRITE_PARENS`

Minimize the size of GCode output (v3.8+)

`;; COMPACT-OUTPUT`

Set decimal precision (n = integer) (v3.8+)

`;; DECIMALS = n`

### Axis Scaling (v3.7+)
Allows for a factor to be applied to X,Y,Z coordinates. Useful for some machines like the Roland MDX-40A that uses an unusual coordinate space. Default axis scale is `1`

_`;; SCALE { "X":100, "Y":100, "Z":100 }`_

 ## CAM & FDM Modes 
 
 ### Simple Algebraic Expression Support

- Text inside `{}` is evaluated algebraically with access to JS classes and methods
- `{Math.min(layer/layers, 0.5) + 1}`
- `{token+n} {token-n}`

### Axis Remapping (v3.5+)
 Allows for over-riding the default axis names. Useful for swapping axes and changing output for specific firmware targets. The format of the map is a JSON object._

`;; AXISMAP {"X":"Y", "Y":"Z", "E":"E1"}`


## Laser Mode Only

### Laser Macros

- \{power\} = laser power
- \{color\} = assigned color
- \{thick\} = assigned thickness
- \{z\} = current z position
