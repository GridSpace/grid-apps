/** Copyright 2014-2017 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_kiri_serial = exports;

(function() {
    if (!self.kiri) return;
    if (self.kiri.serial) return;

    // tinyg motor (en/dis)able $me / $md
    // tinyg '%' to flush queue
    // grbl motor (en/dis)able $1=<ms> (free after ms) $1=255 (always energized)

    var SELF = self,
        KIRI = SELF.kiri,
        SPACE = KIRI.space,
        LOC = SELF.location,
        SDB = moto.KV,
        API = kiri.api,
        initDone = false,
        nextID = new Date().getTime(),
        localQueue = [], // buffered command queue
        localQueueMax = 1500, // max local buffer
        bounds = null, // bounding box of gcode
        gcode = null, // gcode buffer
        gcodeIndex = 0, // gcode buffer send index
        gcodeAbort = false, // send abort
        logBuffer = [], // on screen log buffer
        sendBatchMax = 1000, // max to queue to waiting
        gcLinesSent, // status of local lines sent
        gcRemoteQueue, // status of remote queue
        gcPaused = false, // true if user paused
        status = null, // machine status
        socket, // connection to serial sender
        ports, // list of available ports
        senderTimeout, // repeating sender call
        waitingForAck = [], // ids sent to spjs awaiting ack
        spjsQueueCount = 0, // spjs mem queue size
        spjsQueueCountMax = 1500, // do not send to spjs over this queue size
        selectedPort,
        selectedMode,
        commandInput,
        logDiv,
        jogInput,
        hostInput,
        queueInput,
        connect, // button
        senderStatus, // machine status
        senderDialog,
        senderGcPause, // pause button
        senderPortClose, // button
        senderSelectMode, // select dropdown
        senderSelectPort; // select dropdown

    var init_tinyg = [
            '{"ej":""}',  // enable json
            '{"js":1}',   // json syntax strict
            '{"sr":n}',   // status request
            '{"sv":1}',   // status verbosity filtered
            '{"si":250}', // status interval 250ms
            '{"qr":n}',   // request queue report
            '{"qv":1}',   // set queue report verbosity
            '{"ec":0}',   // disable LF (from CRLF)
            '{"jv":4}',   // json verbosity 4
            '{"hp":n}',   // get hardware platform
            '{"fb":n}',   // get firmware version
            '{"mt":n}',   // get motor timeout
            '{"sr":n}',
            '{"pos":n}'   // request position info
        ],
        init_grbl = [
            '*init*',     // init port
            '*status*'    // request position info
        ];

    KIRI.serial = {
        setGCode: setGCode,
        show: show,
        hide: hide,
        toggle: toggle,
        init: init
    };

    function init() {
        if (initDone) return;
        initDone = true;

        var pre = LOC.protocol === 'https:' ? 'wss://' : 'ws://',
            rpx = $('srxi'),
            rpy = $('sryi'),
            rpz = $('srzi'),
            wpx = $('saxi'),
            wpy = $('sayi'),
            wpz = $('sazi');

        senderDialog = $('sender');
        senderStatus = $('sender-status');
        commandInput = $('sender-command');
        logDiv = $('sender-log');
        jogInput = $('sender-jog');
        hostInput = $('sender-host');
        connect = $('sender-connect');
        gcLinesSent = $('sender-gc-sent');
        gcRemoteQueue = $('sender-gc-queue');
        senderSelectMode = $('sender-mode');
        senderSelectPort = $('sender-port');
        senderPortClose = $('sender-port-close');
        senderGcPause = $('sender-gc-pause');

        senderSelectMode.onchange = selectMode;
        senderSelectPort.onchange = selectPort;
        senderPortClose.onclick = closePort;
        senderPortClose.disabled = true;

        $('sender-close').onclick = hide;
        $('sender-spjs').onclick = function() { window.open("https://wiki.grid.space/wiki/GCode-Sender-in-CAM-Mode", "_help")};
        $('sjx-').onclick = function() { jog('X',-1) };
        $('sjx+').onclick = function() { jog('X',1) };
        $('sjy-').onclick = function() { jog('Y',-1) };
        $('sjy+').onclick = function() { jog('Y',1) };
        $('sjz-').onclick = function() { jog('Z',-1) };
        $('sjz+').onclick = function() { jog('Z',1) };
        $('sender-set-zero').onclick = function() { sendNow("G92 X0Y0Z0") };
        $('sender-goto-zero').onclick = function() { sendNow("G90 G0X0Y0Z0") };
        $('sender-ctrlx').onclick = softReset;
        $('sender-hold').onclick = feedHold;
        $('sender-resume').onclick = feedResume;

        $('sender-pad').onmouseover = function() {
            jogInput.focus();
        };
        $('sender-pad').addEventListener('keydown', function(ev) {
            var dist = (ev.cmdKey ? 0.1 : 1);
            switch (ev.keyCode) {
                case 37: // left arrow
                    jog('X', -dist);
                    ev.preventDefault();
                    break;
                case 39: // right arrow
                    jog('X', dist);
                    ev.preventDefault();
                    break;
                case 38: // up arrow
                    jog(ev.shiftKey ? 'Z' : 'Y', dist);
                    ev.preventDefault();
                    break;
                case 40: // down arrow
                    jog(ev.shiftKey ? 'Z' : 'Y', -dist);
                    ev.preventDefault();
                    break;
            }
        });

        $('sender-gc-runbox').onclick = runbox;

        $('sender-gc-send').onclick = programStart;
        senderGcPause.onclick = programPause;
        $('sender-gc-abort').onclick = programAbort;

        hostInput.value = SDB['kiri-serial'] || '';

        SPACE.onEnterKey([
            commandInput, function() {
                if (selectedPort) {
                    sendNow(commandInput.value);
                    emit("&raquo; "+commandInput.value);
                }
                commandInput.value = '';
            }
        ]);

        var handleMessageData = function(dm) {
            dm = dm.trim();
            if (dm.charAt(0) === '<') {
                // grbl status update
                dm = dm.substring(1,dm.length-2);
                dm = dm.split('|');
                // console.log(dm);
                status = dm.shift();
                senderStatus.value = status;
                switch (status) {
                    case 'Idle':
                    case 'Run':
                    case 'Home':
                    case 'Check':
                        senderStatus.style.color = '#080';
                        break;
                    case 'Hold':
                    case 'Door':
                        senderStatus.style.color = '#800';
                        break;
                    case 'Alarm':
                        senderStatus.style.color = '#880';
                        break;
                }
                var dmt, tt, tv;
                while (dmt = dm.shift()) {
                    dmt = dmt.split(":");
                    tt = dmt[0];
                    tv = dmt[1].split(",");
                    switch (tt) {
                        case 'MPos':
                            rpx.value = tv[0];
                            rpy.value = tv[1];
                            rpz.value = tv[2];
                            break;
                        case 'MPos':
                            wpx.value = tv[0];
                            wpy.value = tv[1];
                            wpz.value = tv[2];
                            break;
                        case 'WCO':
                            wpx.value = tv[0];
                            wpy.value = tv[1];
                            wpz.value = tv[2];
                            break;
                        case 'FS':
                            break;
                        case 'Ov':
                            break;
                    }
                }
            } else
            if (dm.charAt(0) === '{') {
                // tinyg status update
                dm = js2o(dm);
                var ro = dm.sr || (dm.r && dm.r.sr ? dm.r.sr : null);
                if (ro) {
                    if (ro.posx !== undefined) rpx.value = ro.posx;
                    if (ro.posy !== undefined) rpy.value = ro.posy;
                    if (ro.posz !== undefined) rpz.value = ro.posz;
                }
                var stat = dm.stat || (dm.r && dm.r.stat ? dm.r.stat : null) || 1;
                status = ['Unknown','Ready','Alarm','Stop','End','Run','Hold','Probe','Homing'][stat];
                senderStatus.style.color = ['#000','#080','#880','#000','#000','#000','#800','#000','#000'][stat];
                senderStatus.value = status;
                // console.log(dm);
            } else
            if (dm && dm !== 'ok') emit("&laquo; "+dm);
        }

        var handleSocketData = function(msg) {
            var data = msg.data.trim();
            if (data.charAt(0) === '{') {
                data = js2o(data);
                // if (data.Cmd) console.log(data);
                if (data.Cmd && data.Cmd === 'Queued' && data.Data) queueAck(data.Data);
                if (data.QCnt >= 0) {
                    spjsQueueCount = data.QCnt;
                    gcRemoteQueue.value = spjsQueueCount;
                }
                if (data.SerialPorts) updatePortList(data.SerialPorts);
                if (selectedPort && data.P === selectedPort.Name) {
                    // console.log(data);
                    if (data.D) handleMessageData(data.D);
                }
            } else if (data.length > 0) {
                console.log("** "+data.trim().replace('\n',' ... '));
            }
        }

        var onSocketClose = function() {
            socket = null;
            connect.innerHTML = 'connect';
            senderSelectMode.disabled = true;
            senderSelectPort.disabled = true;
        };

        connect.onclick = function() {
            if (socket) {
                // connect.innerHTML = 'connect';
                socket.close();
                socket = null;
                return;
            }

            if (!hostInput.value) {
                return alert('please enter the host:port of your SPJS server');
            }

            SDB['kiri-serial'] = hostInput.value;

            try {
                socket = new WebSocket(pre + hostInput.value + "/ws");
            } catch (e) {
                emit("** unable to connect to "+hostInput.value);
                return;
            }
            socket.onopen = function() {
                emit("** websocket open to "+hostInput.value);
                socket.send('list');
            };
            socket.onerror = function(e) {
                emit("** socket error with SPJS server @ "+hostInput.value);
                connect.disabled = false;
                socket.close();
                // console.log(e);
            };
            socket.onclose = onSocketClose;
            socket.onmessage = handleSocketData;
            connect.innerHTML = 'disconnect';
            connect.disabled = true;
        };

        if (socket && ports) {
            updatePortList(ports);
            emit();
        }

        // start sender
        sender();
    }

    function sendOpenSequence() {
        var seq = [];
        switch (selectedMode) {
            case 'grbl': seq = init_grbl; break;
            case 'tinyg': seq = init_tinyg; break;
        }
        seq.forEach(function(line) {
            sendNow(line);
        });
    }

    function sender() {
        // prevent multiple senders
        if (senderTimeout) return;
        drainQueue();
        // setup next call to sender()
        senderTimeout = setTimeout(function() {
            senderTimeout = null;
            sender();
        }, 100);
    }

    function o2js(o) {
        return JSON.stringify(o);
    }

    function js2o(s) {
        try {
            return JSON.parse(s);
        } catch (e) {
            console.log(e);
            console.log(s);
        }
    }

    function log(msg) {
        console.log("serial | "+msg);
    }

    function sendGcode() {
        if (gcode) {
            // timeout and loop at waiting threshold
            if (waitingForAck.length || localQueue.length > localQueueMax) {
                setTimeout(sendGcode, 100);
                return;
            }
            console.log({
                gcode: (gcode !== null ? gcode.length : 0),
                idx: gcodeIndex,
                waitack: waitingForAck.length,
                abort: gcodeAbort
            });
            // queue up 500 more
            while (gcodeIndex < gcode.length && !gcodeAbort) {
                sendToQueue(gcode[gcodeIndex++]);
                // drain queue every 500 lines
                if (gcodeIndex % 500 === 0) {
                    // wait 100ms before trying to send again
                    setTimeout(sendGcode, 100);
                    return;
                }
            }
            drainQueue();
        }
    }

    function setGCode(gc, runbox) {
        try {
            gcode = gc.split('\n');
            bounds = runbox;
            $('sender-gc-lines').value = gcode ? gcode.length : '';
        } catch (e) {
            console.log(e);
        }
    }

    function closePort() {
        if (!selectedPort) return;
        emit("** closing port: "+selectedPort.Name);
        socket.send('close '+selectedPort.Name);
        senderSelectPort.selectedIndex = 0;
        senderSelectMode.selectedIndex = 0;
        senderPortClose.disabled = true;
        selectedPort = null;
        selectedMode = null;
    }

    function updatePortSettings() {
        // console.log({ups:1, selectedPort:selectedPort, selectedMode:selectedMode});
        if (selectedPort) {
            if (selectedPort.IsOpen) {
                if (selectedMode) {
                    senderPortClose.disabled = false;
                    if (selectedMode != selectedPort.BufferAlgorithm) {
                        alert("to change a port's mode, first close it");
                        selectPort();
                    } else {
                        setTimeout(sendOpenSequence, 500);
                    }
                } else {
                    closePort();
                }
            } else {
                if (selectedMode) {
                    emit("** opening port: "+selectedPort.Name);
                    socket.send('open '+selectedPort.Name+' 115200 '+selectedMode);
                    senderPortClose.disabled = false;
                    setTimeout(sendOpenSequence, 500);
                }
            }
        }
    }

    // UI select trigger
    function selectPort() {
        var value = senderSelectPort[senderSelectPort.selectedIndex].value,
            newport = ports[value],
            algo;
        if (value >= 0) {
            selectedPort = newport;
            // console.log([selectedPort,value]);
            switch (newport.BufferAlgorithm) {
                case 'grbl': senderSelectMode.selectedIndex = 1; break;
                case 'tinyg': senderSelectMode.selectedIndex = 2; break;
                default: senderSelectMode.selectedIndex = 0; break;
            }
            senderPortClose.disabled = !newport.IsOpen;
            if (newport.BufferAlgorithm) selectMode();
        }
    }

    // UI select trigger
    function selectMode() {
        if (senderSelectMode.selectedIndex) {
            selectedMode = senderSelectMode[senderSelectMode.selectedIndex].value;
        } else {
            selectedMode = '';
        }
        // console.log([senderSelectMode,selectedMode]);
        updatePortSettings();
    }

    function updatePortList(portList) {
        emit("** received port list");

        var portsHTML = '<option>select port</option>',
            portModes = [];

        ports = portList;
        ports.forEach(function(port, index) {
            portsHTML += '<option value='+index+'>' + port.Friendly + '</option>';
        });

        connect.disabled = false;
        senderSelectMode.selecteIndex = 0;
        senderSelectPort.selecteIndex = 0;
        senderSelectMode.disabled = false;
        senderSelectPort.disabled = false;
        senderSelectPort.innerHTML = portsHTML;
    }

    // send immediately bypassing queue
    function sendNow(cmd) {
        if (!(socket && selectedPort)) return;
        socket.send('send '+selectedPort.Name+' '+cmd);
    }

    // buffer to mem queue which drains to spjs
    function sendToQueue(cmd) {
        localQueue.push(cmd);
    }

    // spjs ack (wrote) queue entry
    function queueAck(data) {
        data.forEach(function(el) {
            waitingForAck.remove(el.Id);
            gcLinesSent.value = gcodeIndex - waitingForAck.length;
        });
    }

    // drain from mem queue to spjs
    function drainQueue() {
        // return if no live socket
        if (!(socket && selectedPort)) return;

        // return if paused or empty outbound buffer
        if (gcPaused || localQueue.length === 0) return;

        // return if waiting or queued to queue too large
        if (waitingForAck.length > 0 || spjsQueueCount > spjsQueueCountMax) {
            return;
        }

        // blast out next batch of queued to queue
        var toolChange = false,
            count = 0,
            data = [],
            line,
            next;

        while (count++ < sendBatchMax && localQueue.length > 0) {
            next = (nextID++).toString();
            waitingForAck.push(next);
            line = localQueue.shift();
            if (line.indexOf("M6") === 0) {
                toolChange = true;
                // grbl doesn't support M6 so
                // just stop sending until unpaused
                if (selectedMode === 'grbl') break;
            }
            data.push({D:line, Id:next});
            // for tinyg pause after M6 sent
            if (toolChange) break;
        }

        socket.send('sendjson '+o2js({
            P: selectedPort.Name,
            Data: data
        }));

        if (toolChange) {
            emit("** tool change");
            setPause(true);
            var alertToolChange = SDB['sender-alert-toolchange'];
            if (!alertToolChange && !confirm("tool change. unpause to continue.\nshow this dialog in the future?")) {
                SDB['sender-alert-toolchange'] = 'no';
            }
            // alert("tool change. click unpause to continue");
            // setPause(false);
        }
    }

    function setPause(paused) {
        if (paused === gcPaused) return;
        gcPaused = paused;
        senderGcPause.innerHTML = paused ? 'unpause' : 'pause';
        senderGcPause.style.color = paused ? '#800' : '#000';
        if (paused) emit("** program paused. unpause to continue");
    }

    function emit(msg) {
        if (!logDiv) return console.log({unable_to_emit: msg});
        if (msg) {
            msg = msg.replace('<','&lt').replace('>','&gt');
            logBuffer.push(msg);
            if (logBuffer.length > 100) logBuffer = logBuffer.slice(1);
        }
        logDiv.innerHTML = logBuffer.join('<br>');
        logDiv.scrollTop = logDiv.scrollHeight;
    }

    function jog(axis, delta) {
        delta = (delta || 1) * (parseFloat(jogInput.value) || 1);
        sendNow("G91 G0 " + axis + delta.toString());
        sendNow("G90");
    }

    function softReset() {
        sendNow("\x18");
        // for tinyg, we need to flush the buffer and resume
        // so that the commands will be processed
        if (selectedMode === 'tinyg') sendNow('%~');
        // for grbl, also reset an alarms
        if (selectedMode === 'grbl') sendNow('$X');
    }

    function feedHold() {
        sendNow("!");
    }

    function feedResume() {
        sendNow("~");
        // send unlock if alarm is set
        if (selectedMode === 'grbl' && status === 'Alarm') sendNow('$X');
    }

    function runbox() {
        if (!bounds) return;
        sendNow(["G0X",bounds.min.x,"Y",bounds.min.y].join(''));
        sendNow(["G0X",bounds.max.x,"Y",bounds.min.y].join(''));
        sendNow(["G0X",bounds.max.x,"Y",bounds.max.y].join(''));
        sendNow(["G0X",bounds.min.x,"Y",bounds.max.y].join(''));
        sendNow(["G0X0Y0"]);
    }

    function hide() {
        senderDialog.style.display = 'none';
    }

    function show() {
        senderDialog.style.display = 'block';
        senderDialog.style.right = (kiri.api.ui.ctrlRight.offsetWidth + 5) + 'px';
    }

    function toggle() {
        if (senderDialog.style.display === 'block') hide(); else show();
    }

    function programStart() {
        gcodeIndex = 0;
        gcodeAbort = false;
        gcLinesSent.value = 0;
        setPause(false);
        feedResume();
        sendGcode();
    }

    function programPause() {
        setPause(!gcPaused);
        gcodeAbort = false;
    }

    function programAbort() {
        gcodeIndex = 0;
        gcodeAbort = true;
        gcLinesSent.value = 0;
        localQueue = [];
        setPause(false);
        feedHold();
    }
})();
