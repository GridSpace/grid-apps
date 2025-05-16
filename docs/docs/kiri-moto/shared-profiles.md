---
description: For Classrooms and Shared Workstations, Maintain Consistent Setups
---

# Shared Profiles

[Kiri:Moto](https://grid.space/kiri/) stores all settings in our browser's local cache. There are times when you want to share settings between computers or setup a master config that is shared in classroom settings. In order to facilitate this, Kiri:Moto provides two hot keys and a URL short-cut for loading a default configuration at the time the application page loads.

* `U` key (uppercase) to get a unique settings key
* `u` key (lowercase) to restore a setting with a given key
* append `#key` to Kiri's URL to load the app with a given key

Using the last method, you can create a master settings configuration then give our or link to Kiri with an url that looks like:

[https://grid.space/kiri/#setting/ver](https://grid.space/kiri/#setting/ver)

where `setting/ver` comes from the unique settings dialog. You may notice that when you use the `U` hot-key, Kiri's URL changes in your browser to reflect the settings key.

## Remote Load

`https://grid.space/kiri/?wrk:[domain]/[path]`

the content _must_ be delivered over https and CORS header `Access-Control-Allow-Origin` must be set to `grid.space` or `*`

## Onshape

When using Kiri:Moto inside of Onshape, Kiri's settings are automatically persisted on the server and associated with your Onshape User ID. That way when you access Kiri in Onshape from another computer, your settings are automatically imported.
