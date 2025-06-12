---
description: Overview of cam mode
---

# CAM Mode Overview

Kiri:Moto's CAM mode is designed for subtractive manufacturing processes, primarily [CNC](https://en.wikipedia.org/wiki/Computer_numerical_control) milling. This mode provides a streamlined, browser-based workflow for generating toolpaths from 3D models and exporting G-code for a wide range of machines.

This page provides a high-level overview of the CAM workflow. There are subpages for specific parts of the workflow.

---

## Arrange

Begin by importing your model(s) into the workspace. The **Arrange** stage allows you to:

- Translate and rotate parts on the base platform
- Align multiple objects relative to each other
- Snap objects flat to the bed
- Apply other [transformations](<https://en.wikipedia.org/wiki/Transformation_(function)>) like scaling and mirroring
- Set your [profile options](processOpts)
- set your [machine](machines) settings
- set your [tool library](tools)
- set your [CAM operations](ops)

You can set profile options, and machine and tool settings in any part of the workflow, but doing so will not automatically update other parts of the workflow. You will need to re-slice after making changes.

---

## Slice

The Slice stage generates toolpaths based on user-defined [CAM operations](ops). The software makes use of [worker threads](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) to slice the model without blocking the UI.

When working with complex models, you can toggle specific layers of the slice by toggling them at the botom of the page

![](/img/CAM/sliceToggle.png)

The bottom of the page also has a progress bar that is draggable and shows the order of operations.

---

## Preview

The Preview tab is quite similar to the Slice tab, but has a few key differences:

- Shows tool speeds
- Shows tool movement types (rapid move/ milling move)
- Visually shows tool offsets and tool changes
- Allows inspection of toolpath order and direction
- Helps detect gouges, collisions, or inefficient moves

![](/img/CAM/preview.png)

Overall, the Preview tab gives a more in-depth view of the toolpaths that will be generated.

---

## Animate

Animate is a useful tool to get a sense of how the tool will move through the stock without the risk of actually cutting anything.
Animate can show if your gode will collide with the stock, cut too deep, or cut in a place you don't expect.

![](/img/CAM/animate.gif)

---

## Export

Once you're confident in your setup, use the Export menu to generate machine-ready [G-code](https://en.wikipedia.org/wiki/G-code).

![](/img/CAM/exportMenu.png)

Most of the configuration for this step is done in the [Machine](kiri-moto/CAM/machines) settings, so be sure to have that configured before exporting.
The tab will give you a time estimate for the job (excluding tool changes), and an option to export G-code to a single file, or as a zipped archive of the sepate operation for each tool.
