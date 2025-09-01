

# Bambu LAN Sending

Kiri:Moto can send files to a Bambu printer over a local network. It may be easier in some cases to use an SD card to transfer Gcode, but connecting to the printer over a network allows for extra features like remote monitoring and starting of prints.

## Prerequisites

- Kiri:Moto must be run locally, not through `grid.space/kiri`. You can see binary builds of the code [here](https://github.com/gridspace/apps/releases). This is a fundimental security limitation of web-apps.
- Have the IP, Lan Code, and Serial # of your printer handy.

## Connecting to your printer

1. Open the Machine settings tab.
2. Select your bambu machine from the dropdown.
3. If you haven't already, click `customize` in the top right corner of the dialog box

![](/img/bambu-network/customizePrinter.png)

4. Click `manage`

![](/img/bambu-network/managePrinter.png)

5. Add the IP, Lan Code, and Serial # of your printer into the dialog on the left.

![](/img/bambu-network/addCode.png)

6. Now, when you select `Export` a new section will pop up allowing you to select a printer and ams spool, and then send and/or print your file.

![](/img/bambu-network/export.png)




