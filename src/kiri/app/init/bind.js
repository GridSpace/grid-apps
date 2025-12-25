/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../../moto/webui.js';
import { api } from '../api.js';

export function bind() {
    return {
        alert: {
            dialog:         $('alert-area'),
            text:           $('alert-text')
        },
        func: {
            slice:          $('act-slice'),
            preview:        $('act-preview'),
            animate:        $('act-animate'),
            export:         $('act-export')
        },
        label: {
            slice:          $('label-slice'),
            preview:        $('label-preview'),
            animate:        $('label-animate'),
            export:         $('label-export'),
        },
        acct: {
            help:           $('app-help'),
            don8:           $('app-don8'),
            mesh:           $('app-mesh'),
            export:         $('app-export')
        },
        dev: {
            header:         $('dev-header'),
            search:         $('dev-search'),
            filter:         $('dev-filter')
        },
        mesh: {
            name:           $('mesh-name'),
            points:         $('mesh-points'),
            faces:          $('mesh-faces'),
        },

        stats: {
            fps:            $('fps'),
            rms:            $('rms'),
            div:            $('stats'),
            rnfo:           $('rnfo'),
        },

        load:               $('load-file'),
        speeds:             $('speeds'),
        speedbar:           $('speedbar'),

        context:            $('context-menu'),

        // ltsetup:            $('lt-setup'),
        // ltfile:             $('lt-file'),
        // ltview:             $('lt-view'),
        // ltact:              $('lt-start'),
        // edit:               $('lt-tools'),
        nozzle:             $('menu-nozzle'),

        modal:              $('modal'),
        modalBox:           $('modal-box'),
        modals: {
            help:           $('mod-help'),
            setup:          $('mod-setup'),
            prefs:          $('mod-prefs'),
            files:          $('mod-files'),
            saves:          $('mod-saves'),
            tools:          $('mod-tools'),
            xany:           $('mod-x-any'),
            xsla:           $('mod-x-sla'),
            xlaser:         $('mod-x-laser'),
            don8:           $('mod-don8'),
            any:            $('mod-any'),
        },

        catalog: {
            body:           $('catalogBody'),
            list:           $('catalogList'),
        },

        devices: {
            div:            $('devices'),
            add:            $('device-add'),
            delete:         $('device-del'),
            export:         $('device-exp'),
            rename:         $('device-ren'),
            save:           $('device-save'),
        },

        setMenu:            $('set-menu'),
        settings:           $('settings'),
        settingsBody:       $('settingsBody'),
        settingsList:       $('settingsList'),
        settingsName:       $('settingsName'),
        settingsSave:       $('settingsSave'),

        slider: {
            div:            $('slider'),
            hi:             $('slider-hi'),
            hold:           $('slider-hold'),
            lo:             $('slider-lo'),
            max:            $('slider-max'),
            mid:            $('slider-mid'),
            min:            $('slider-zero'),
            range:          $('slider-center'),
        },

        loading:            $('progress').style,
        progress:           $('progbar').style,
        prostatus:          $('progtxt'),
        selection:          $('selection'),

        size: {
            X:              $('size_x'),
            Y:              $('size_y'),
            Z:              $('size_z'),
        },
        scale: {
            X:              $('scale_x'),
            Y:              $('scale_y'),
            Z:              $('scale_z'),
        },
        lock: {
            X:              $('lock_x'),
            Y:              $('lock_y'),
            Z:              $('lock_z'),
        },

        stock:              $('stock'),
        stockWidth:         $('stock-width'),
        stockDepth:         $('stock-width'),
        stockHeight:        $('stock-width'),
    };
}
