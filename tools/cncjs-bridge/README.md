# kiri-cncjs-bridge

A zero-dependency Node.js shim that lets Kiri:Moto's laser export send gcode directly to [CNCjs](https://cncjs.io/).

Kiri's "send to host" export speaks OctoPrint's multipart upload format. CNCjs has its own REST API. This bridge accepts the OctoPrint-format POST from Kiri and forwards the gcode to CNCjs's `/api/gcode` endpoint.

## Requirements

- Node.js 18+
- CNCjs running and connected to your machine (default: `http://localhost:8000`)

## Usage

```
node bridge.js
```

The bridge listens on port **5310**. Leave it running while you work.

## Kiri:Moto setup

1. In Preferences, enable **exportOcto**
2. In the laser export dialog, set:
   - **host**: `http://localhost:5310`
   - **api key**: _(leave blank)_
   - **type**: `octoprint`

## Laser device setup (GRBL)

In your Kiri laser device settings, set:
- **Laser On**: `M3 S{power}`
- **Laser Off**: `M5`

Send `$32=1` once from the CNCjs console to enable GRBL laser mode.
