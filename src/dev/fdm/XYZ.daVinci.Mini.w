{
    "pre":[
        "T{tool}                ; select extruder #0",
        "M104 S{temp}           ; set nozzle temp",
        "M109 S{temp}           ; wait for nozzle to heat",
        "G21                    ; set units to millimeters",
        "M82                    ; absolute extrusion mode",
        "G28                    ; home",
        "G1 Z15 F6000           ; lower platform 15mm",
        "G92 E0                 ; zero out extruder position",
        "G1 F200 E3             ; prime the extruder 3mm"
    ],
    "post":[
        "M107                   ; fan off",
        "M104 S0                ; set nozzle temp to 0",
        "M140 S0                ; set bed temp to 0",
        "G92 E0                 ; zero out extruder position",
        "G1 E-1 F300            ; retract filament",
        "G28 X0 Y0              ; home X Y",
        "M84                    ; disable steppers"
    ],
    "cmd":{
        "fan_power": "M106 S{fan_speed}"
    },
    "settings":{
        "origin_center": false,
        "extrude_abs": true,
        "bed_width": 150,
        "bed_depth": 150,
        "build_height": 150
    }
}
