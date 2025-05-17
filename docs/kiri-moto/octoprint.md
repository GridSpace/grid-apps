---
description: There are two primary ways to send jobs from Kiri:Moto to OctoPrint
---

# OctoPrint

## Grid.Space OctoPrint Plugin

Available through the OctoPrint plugin interface and on [GitHub](https://github.com/GridSpace/OctoPrint-GridSpace), this plugin allow zero-configuration printing to any local OctoPrint server directly from Kiri:Moto. Grid:Local must be selected under Preferences for local servers to show up in the export dialog.

![](/img/gridlocal.png)

The `send` button will spool a print directly to OctoPrint where it will sit under local `Files`. The `admin` button will open a browser window to the OctoPrint interface.

![](/img/gridsend.png)



## Local Sending

OctoPrint has a web api endpoint that can be configured on `Export` when enabled.

![](/img/octoprint.png)

This will result in the following dialog section to appear in the export dialog.

![](/img/opexport.png)
