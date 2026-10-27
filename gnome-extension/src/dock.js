// SPDX-License-Identifier: GPL-3.0-or-later
// Floating bottom dock for the GNOME desktop.

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class Dock {
    constructor(extension) {
        this._extension = extension;
        this._appSystem = Shell.AppSystem.get_default();
        this._settings = new Gio.Settings({ schema_id: 'org.gnome.shell' });

        this._container = new St.BoxLayout({
            name: 'isle-dock-container',
            style_class: 'isle-dock-container',
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this._dockBox = new St.BoxLayout({
            style_class: 'isle-dock',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._container.add_child(this._dockBox);

        Main.layoutManager.addChrome(this._container, {
            affectsStruts: false,
            trackFullscreen: true,
        });

        this._appChangedId = this._appSystem.connect('app-state-changed', () => this._refresh());
        this._installedChangedId = this._appSystem.connect('installed-changed', () => this._refresh());
        this._favChangedId = this._settings.connect('changed::favorite-apps', () => this._refresh());
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => this._updatePosition());

        this._refresh();
        this._updatePosition();
    }

    _updatePosition() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) return;

        const [, natWidth] = this._container.get_preferred_width(-1);
        const [, natHeight] = this._container.get_preferred_height(-1);

        const x = monitor.x + Math.floor((monitor.width - natWidth) / 2);
        const y = monitor.y + monitor.height - natHeight - 12;

        this._container.set_position(x, y);
    }

    _refresh() {
        this._dockBox.destroy_all_children();

        // Application Launcher button
        const launcherBtn = new St.Button({
            style_class: 'isle-dock-item launcher',
            reactive: true,
            can_focus: true,
            track_hover: true,
        });
        const launcherIcon = new St.Label({
            text: '✦',
            style_class: 'isle-dock-launcher-icon',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        launcherBtn.set_child(launcherIcon);
        launcherBtn.connect('clicked', () => {
            Main.overview.toggle();
        });
        this._dockBox.add_child(launcherBtn);

        // Separator
        const sep = new St.Widget({ style_class: 'isle-dock-sep' });
        this._dockBox.add_child(sep);

        // Pinned & Running applications
        const favApps = this._settings.get_strv('favorite-apps');
        const runningApps = this._appSystem.get_running();

        const seenIds = new Set();
        const allApps = [];

        for (const id of favApps) {
            const app = this._appSystem.lookup_app(id);
            if (app && !seenIds.has(id)) {
                seenIds.add(id);
                allApps.push(app);
            }
        }

        for (const app of runningApps) {
            const id = app.get_id();
            if (!seenIds.has(id)) {
                seenIds.add(id);
                allApps.push(app);
            }
        }

        for (const app of allApps) {
            const itemBox = new St.BoxLayout({
                vertical: true,
                style_class: 'isle-dock-item-wrapper',
                y_align: Clutter.ActorAlign.CENTER,
            });

            const btn = new St.Button({
                style_class: 'isle-dock-item',
                reactive: true,
                can_focus: true,
                track_hover: true,
            });

            const icon = app.create_icon_texture(44);
            btn.set_child(icon);

            btn.connect('clicked', () => {
                app.activate();
            });

            itemBox.add_child(btn);

            // Active dot indicator
            const isRunning = app.state === Shell.AppState.RUNNING;
            const dot = new St.Widget({
                style_class: isRunning ? 'isle-dock-dot active' : 'isle-dock-dot',
            });
            itemBox.add_child(dot);

            this._dockBox.add_child(itemBox);
        }

        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._updatePosition();
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        if (this._appChangedId) this._appSystem.disconnect(this._appChangedId);
        if (this._installedChangedId) this._appSystem.disconnect(this._installedChangedId);
        if (this._favChangedId) this._settings.disconnect(this._favChangedId);
        if (this._monitorsChangedId) Main.layoutManager.disconnect(this._monitorsChangedId);

        Main.layoutManager.removeChrome(this._container);
        this._container.destroy();
    }
}
