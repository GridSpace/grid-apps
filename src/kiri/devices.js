/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: kiri.api
// dep: kiri.settings
gapp.register("kiri.devices", (root, exports) => {

    let { kiri } = root,
        { api, conf } = kiri;

    // extend API
    Object.assign(api.show, {
        devices: showDevices
    });

    Object.assign(api.device, {
        clone: cloneDevice,
        code: currentDeviceCode,
        get: currentDeviceName,
        set: selectDevice,
        isBelt
    });

    Object.assign(api.devices, {
        show: showDevices,
        select: selectDevice,
        refresh: updateDeviceList,
        update_laser_state: updateLaserState
    });

    function isBelt() {
        return api.conf.get().device.bedBelt;
    }

    function currentDeviceName() {
        return api.conf.get().filter[api.mode.get()];
    }

    function currentDeviceCode() {
        return api.conf.get().devices[currentDeviceName()];
    }

    function getModeDevices() {
        // devices are injected into self scope by
        // app.js generateDevices()
        return Object.keys(devices[api.mode.get_lower()]).sort();
    }

    function showDevices() {
        api.settings.sync.get().then(_showDevices);
    }

    function _showDevices() {
        updateDeviceList();
        api.modal.show('setup');
    }

    function updateDeviceList() {
        renderDevices(getModeDevices());
    }

    function updateDeviceName(newname) {
        let selected = api.device.get(),
            devs = api.conf.get().devices;
        if (newname !== selected) {
            devs[newname] = devs[selected];
            delete devs[selected];
            selectDevice(newname);
            updateDeviceList();
        }
    }

    function putLocalDevice(devicename, obj) {
        api.conf.get().devices[devicename] = obj;
        api.conf.save();
    }

    function removeLocalDevice(devicename) {
        delete api.conf.get().devices[devicename];
        api.conf.save();
        api.settings.sync.put();
    }

    function isLocalDevice(devicename) {
        return api.conf.get().devices[devicename] ? true : false;
    }

    function getSelectedDevice() {
        return api.device.get();
    }

    function selectDevice(devicename) {
        if (isLocalDevice(devicename)) {
            setDeviceCode(api.conf.get().devices[devicename], devicename);
        } else {
            let code = devices[api.mode.get_lower()][devicename];
            if (code) {
                setDeviceCode(code, devicename);
            }
        }
    }

    // only for local filters
    function cloneDevice() {
        let name = `${getSelectedDevice().replace(/\./g,' ')}`;
        let code = api.clone(api.conf.get().device);
        code.mode = api.mode.get();
        if (name.toLowerCase().indexOf('my ') >= 0) {
            name = `${name} copy`;
        } else {
            name = `My ${name}`;
        }
        putLocalDevice(name, code);
        setDeviceCode(code, name);
        api.settings.sync.put();
    }

    function updateLaserState() {
        const dev = api.conf.get().device;
        $('laser-on').style.display = dev.useLaser ? 'flex' : 'none';
        $('laser-off').style.display = dev.useLaser ? 'flex' : 'none';
    }

    function setDeviceCode(code, devicename) {
        api.event.emit('device.select', devicename);
        try {
            if (typeof(code) === 'string') code = js2o(code) || {};

            let mode = api.mode.get(),
                lmode = mode.toLowerCase(),
                current = api.conf.get(),
                local = isLocalDevice(devicename),
                dev = current.device = conf.device_from_code(code,mode),
                dproc = current.devproc[devicename], // last process name for this device
                newdev = dproc === undefined,   // first time device is selected
                predev = current.filter[mode],  // previous device selection
                chgdev = predev !== devicename; // device is changing

            // fill missing device fields
            conf.fill_cull_once(dev, conf.defaults[lmode].d);

            // first time device use, add any print profiles and set to default if present
            if (code.profiles) {
                for (let profile of code.profiles) {
                    let profname = profile.processName;
                    // if no saved profile by that name for this mode...
                    if (!current.sproc[mode][profname]) {
                        console.log('adding profile', profname, 'to', mode);
                        current.sproc[mode][profname] = profile;
                    }
                    // if it's a new device, seed the new profile name as last profile
                    if (newdev && !current.devproc[devicename]) {
                        console.log('setting default profile for new device', devicename, 'to', profname);
                        current.devproc[devicename] = dproc = profname;
                    }
                }
            }

            dev.new = false;
            dev.deviceName = devicename;

            let { platform, ui, uc } = api;
            let { space } = kiri;

            ui.deviceBelt.checked = dev.bedBelt;
            ui.deviceRound.checked = dev.bedRound;
            ui.deviceOrigin.checked = dev.ctOriginCenter || dev.originCenter || dev.bedRound;
            ui.fwRetract.checked = dev.fwRetract;

            // add extruder selection buttons
            if (dev.extruders) {
                let ext = api.lists.extruders = [];
                dev.internal = 0;
                for (let i=0; i<dev.extruders.length; i++) {
                    ext.push({id:i, name:i});
                }
            }

            // disable editing for non-local devices
            [
                // ui.deviceName,
                ui.gcodePre,
                ui.gcodePost,
                ui.bedDepth,
                ui.bedWidth,
                ui.maxHeight,
                ui.useLaser,
                ui.resolutionX,
                ui.resolutionY,
                ui.deviceOrigin,
                ui.deviceRound,
                ui.deviceBelt,
                ui.fwRetract,
                ui.deviceZMax,
                ui.gcodeTime,
                ui.gcodeFan,
                ui.gcodeFeature,
                ui.gcodeTrack,
                ui.gcodeLayer,
                ui.extFilament,
                ui.extNozzle,
                ui.spindleMax,
                ui.gcodeSpindle,
                ui.gcodeDwell,
                ui.gcodeChange,
                ui.gcodeFExt,
                ui.gcodeSpace,
                ui.gcodeStrip,
                ui.gcodeLaserOn,
                ui.gcodeLaserOff,
                ui.laserMaxPower,
                ui.extPrev,
                ui.extNext,
                ui.extAdd,
                ui.extDel,
                ui.extOffsetX,
                ui.extOffsetY
            ].forEach(function(e) {
                e.disabled = !local;
            });

            ui.deviceSave.disabled = !local;
            ui.deviceDelete.disabled = !local;
            ui.deviceRename.disabled = !local;
            ui.deviceExport.disabled = !local;
            ui.deviceAdd.style.display = mode === 'SLA' ? 'none' : '';

            if (local) {
                ui.deviceAdd.innerText = "copy";
                ui.deviceDelete.style.display = '';
                ui.deviceRename.style.display = '';
                ui.deviceExport.style.display = '';
            } else {
                ui.deviceAdd.innerText = "customize";
                ui.deviceDelete.style.display = 'none';
                ui.deviceRename.style.display = 'none';
                ui.deviceExport.style.display = 'none';
            }
            ui.deviceAdd.disabled = dev.noclone;

            api.conf.update_fields();
            space.platform.setBelt(isBelt());
            platform.update_size();
            platform.update_origin();
            platform.update();
            updateLaserState();

            // store current device name for this mode
            current.filter[mode] = devicename;
            // cache device record for this mode (restored in setMode)
            current.cdev[mode] = dev;

            if (dproc) {
                // restore last process associated with this device
                api.conf.load(null, dproc);
            } else {
                api.conf.update();
            }

            api.conf.save();

            if (isBelt()) {
                // space.view.setHome(dev.bedBelt ? Math.PI/2 : 0, Math.PI / 2.5);
                space.view.setHome(0, Math.PI / 2.5);
            } else {
                space.view.setHome(0);
            }
            // when changing devices, update focus on widgets
            if (chgdev) {
                setTimeout(api.space.set_focus, 0);
            }

            uc.refresh(1);
            api.event.emit('device.selected', dev);
        } catch (e) {
            console.log({error:e, device:code, devicename});
            api.show.alert(`invalid or deprecated device: "${devicename}"`, 10);
            api.show.alert(`please select a new device`, 10);
            throw e;
            showDevices();
        }
        api.function.clear();
        api.event.settings();
    }

    function renderDevices(devices) {
        let selected = api.device.get() || devices[0],
            features = api.feature,
            devs = api.conf.get().devices,
            dfilter = typeof(features.device_filter) === 'function' ? features.device_filter : undefined;

        for (let local in devs) {
            if (!(devs.hasOwnProperty(local) && devs[local])) {
                continue;
            }
            let dev = devs[local],
                fdmCode = dev.cmd,
                fdmMode = (api.mode.get() === 'FDM');
            if (dev.mode ? (dev.mode === api.mode.get()) : (fdmCode ? fdmMode : !fdmMode)) {
                devices.push(local);
            }
        };

        devices = devices.sort();

        let { event, ui } = api;

        event.emit('devices.render', devices);

        ui.deviceSave.onclick = function() {
            event.emit('device.save');
            api.function.clear();
            api.conf.save();
            api.settings.sync.put();
            showDevices();
            api.modal.hide();
        };
        ui.deviceAdd.onclick = function() {
            api.function.clear();
            cloneDevice();
            showDevices();
        };
        ui.deviceDelete.onclick = function() {
            api.function.clear();
            removeLocalDevice(getSelectedDevice());
            selectDevice(getModeDevices()[0]);
            showDevices();
        };
        ui.deviceRename.onclick = function() {
            api.uc.prompt(`Rename "${selected}`, selected).then(newname => {
                if (newname) {
                    updateDeviceName(newname);
                    api.conf.save();
                    api.settings.sync.put();
                    showDevices();
                } else {
                    showDevices();
                }
            });
        };
        ui.deviceExport.onclick = function(event) {
            const record = {
                version: kiri.version,
                device: selected,
                process: api.process.code(),
                profiles: event.altKey ? api.settings.prof() : undefined,
                code: devs[selected],
                time: Date.now()
            };
            let exp = api.util.b64enc(record);
            api.device.export(exp, selected, { event, record });
        };

        let dedup = {};
        let list_cdev = [];
        let list_mdev = [];
        devices.forEach(function(device, index) {
            // prevent device from appearing twice
            // such as local name = standard device name
            if (dedup[device]) {
                return;
            }
            dedup[device] = device;
            let loc = isLocalDevice(device);
            if (dfilter && dfilter(device) === false) {
                return;
            }
            if (loc) {
                list_mdev.push(h.option(device));
            } else {
                list_cdev.push(h.option(device));
            }
        });

        let dev_list = $('dev-list');
        h.bind(dev_list, [
            h.option({ _: '-- My Devices --', disabled: true }),
            ...list_mdev,
            h.option({ _: '-- Stock Devices --', disabled: true }),
            ...list_cdev
        ]);
        let dev_opts = [...dev_list.options].map(o => o.innerText);
        dev_list.selectedIndex = dev_opts.indexOf(selected);
        dev_list.onchange = ev => {
            const seldev = dev_list.options[dev_list.selectedIndex];
            selectDevice(seldev.innerText);
            api.platform.layout();
        }
        selectDevice(selected);
    }

});
