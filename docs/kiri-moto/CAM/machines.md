---
description: machine setup for CAM machines
---

# Machine Setup


The Machine Setup tab defines the physical capabilities of your CNC machine, its firmware behavior, and how G-code should be generated. A properly configured machine profile ensures your output matches your hardware's constraints and expectations.

you can access it from the top right menu:

![](/img/CAM/machinesTab.png)

---

## 🔧 Workspace Dimensions

These values define your machine’s cutting envelope. Use your *actual usable* dimensions here, not the marketing ones.

- **X (width)** — Maximum horizontal travel (left to right)  
- **Y (depth)** — Maximum front-to-back travel  
- **Z (height)** — Maximum vertical travel (top to bottom)  

The units of these values are set based off the units set in your global preferences (defaults to mm).

---

## ⚙️ Firmware Settings

- **Max Spindle** — The highest RPM your spindle supports. This limits the `feed` speeds set in your [cam operations](/kiri-moto/CAM/ops) to generate proper and safe `S` values in G-code.

---

## 📤 Output Options

Customize how your G-code is formatted for your controller or post-processor:

- **Strip Comments** — Removes all G-code comments for cleaner, smaller files  
- **Token Spacer** — Inserts a space between G-code tokens (e.g., `G1 X1 Y1` vs `G1X1Y1`)  
- **Enable Laser** — enables [Laser](ops#Laser-Mode-Only) operations (typically uses `M3/M5`, adjusts movement strategy)  
- **File Extension** — Optional override for exported file type (e.g., `.nc`, `.ngc`,`.cnc`,`.cam`, `.gcode`, `.txt`)

> 💡 Leave the extension blank to default to `.gcode`.

---

## 🧱 G-code Macros

Macros insert custom G-code at key stages of toolpath generation. Each tab corresponds to a different context:
in these boxes, you have access to [gcode macros](../gcode-macros). Not all macros are available in all contexts, so be careful!

- **Header** — Runs once at the beginning of the job (e.g., mode override, move to safe Z) 
- **Footer** — Runs at the end of the job (e.g., spindle stop, move to safe Z)  
- **Tool** — Called when changing tools. automatic tool changes and tool measument can be put here.
- **Dwell** — Code for pausing movement/spindle at specified positions
- **Spindle** — Code to set spindle RPM


## RML dialect
Kiri Moto supports the [RML](https://downloadcenter.rolanddg.com/contents/manuals/PNC-3200_USE2_E_R5.pdf) dialect of G-code.

When a machine's file extention is set to `.rml`, Kiri Moto will use the RML dialect, using `PU` for non-cut moves, and `Z` for cut moves. RML commands can be used in the `Header`, `Footer`, `Tool`, `Dwell`, and `Spindle` sections of the Machine Setup tab in the same way that G-code commands are used.


## Contribute a Machine Profile

We love to add new machines to the Kiri Moto library. If you have a tested machine that you'd like to add, you can export your workspace as a `.kmz` file, and share it on the [discord](https://discord.gg/suyCCgr) or [forums](htps://forum.grid.space).

If you want to submit a PR, you can find instructions for how to do so [here](https://github.com/GridSpace/grid-apps/blob/master/contributing.md#how-to-add-a-new-machine). 



