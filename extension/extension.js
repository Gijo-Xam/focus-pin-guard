// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.
// Window privacy cover, not OS-level process isolation.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as AppMenu from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';
import * as WindowMenu from 'resource:///org/gnome/shell/ui/windowMenu.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {windowIdentity, matchRule, checkedDelay, remainingLockMillis} from './identity.js';
import {verifyPin, isValidPin} from './pin.js';
import {validDelay, parseAppDelays, effectiveDelay} from './timers.js';
import {isDashToDockMenu, dockWindows} from './dockCompatibility.js';

export default class FocusPinGuard extends Extension {
    enable() {
        this._disabled = false;
        this._settings = this.getSettings();
        this._states = new Map();
        this._connections = [];
        this._nextId = 1;
        this._dialog = null;
        this._dialogWindow = null;
        this._checking = false;
        this._attemptSerial = 0;
        this._attempts = 0;
        this._nextAllowedUs = 0;
        this._pick = null;
        this._lastFocusedWindow = global.display.focus_window;
        this._tracker = Shell.WindowTracker.get_default();
        this._isConfigured = Boolean(this._settings.get_string('pin-hash'));
        this._overviewIdleId = 0;

        this._injections = new InjectionManager();
        this._appMenus = new Set();
        this._dockMenus = new Map();
        this._previewGestures = new Map();
        this._installContextMenus();
        this._createIndicator();
        this._connect(global.window_group, 'child-added', (_group, actor) => this._track(actor));
        this._connect(global.display, 'notify::focus-window', () => this._onFocusChanged());
        this._connect(Main.overview, 'showing', () => this._onOverviewShowing());
        this._connect(Main.overview, 'hidden', () => this._onOverviewHidden());
        this._connect(this._settings, 'changed::protected-apps', () => this._syncAll());
        this._connect(this._settings, 'changed::pin-hash', () => {
            this._isConfigured = Boolean(this._settings.get_string('pin-hash'));
            for (const state of this._states.values()) state.unlocked = false;
            this._syncAll();
        });
        this._connect(this._settings, 'changed::lock-delay', () => this._rescheduleAll());
        this._connect(this._settings, 'changed::app-delays', () => {
            this._rescheduleAll(); this._publishRunning();
        });
        this._connect(this._settings, 'changed::action-request', () => this._handleRequest());

        for (const actor of global.get_window_actors()) this._track(actor);
        this._publishRunning();
        this._handleRequest();
        this._onFocusChanged();
        if (!this._isConfigured)
            Main.notify('Focus PIN Guard', 'Set a 4-digit PIN in the extension Preferences.');
    }

    disable() {
        this._disabled = true;
        ++this._attemptSerial;
        this._pick = null;
        if (this._overviewIdleId) {
            GLib.Source.remove(this._overviewIdleId);
            this._overviewIdleId = 0;
        }
        this._closeDialog();
        this._injections?.clear();
        // The dock is owned by a different extension. Remove only the menu
        // items and handlers created by Focus PIN Guard.
        for (const menu of this._dockMenus?.keys() ?? [])
            this._clearDockMenu(menu);
        this._dockMenus?.clear();
        this._dockMenus = null;
        this._injections = null;
        for (const menu of this._appMenus ?? []) {
            menu._focusPinSection?.destroy();
            menu._focusPinSeparator?.destroy();
            delete menu._focusPinSection;
            delete menu._focusPinSeparator;
        }
        this._appMenus?.clear();
        this._appMenus = null;
        for (const [clone, gesture] of this._previewGestures ?? []) {
            // Do not leave handlers behind in existing Overview previews.
            try { clone.remove_action(gesture); } catch (_) { /* clone destroyed */ }
        }
        this._previewGestures?.clear();
        this._previewGestures = null;
        this._overviewContextMenu?.destroy();
        this._overviewContextMenu = null;
        for (const [object, id] of this._connections) this._disconnect(object, id);
        this._connections = [];
        for (const state of this._states.values()) this._removeState(state);
        this._states.clear();
        this._states = null;
        this._indicator?.destroy();
        this._indicator = null;
        this._settings?.set_string('running-windows', '[]');
        this._settings = null;
    }

    _connect(object, signal, callback) {
        const id = object.connect(signal, callback);
        this._connections.push([object, id]);
        return id;
    }
    _disconnect(object, id) {
        object.disconnect(id);
    }
    /**
     * Add actions to GNOME's existing application menu (Overview Dash icons),
     * desktop-window menu, and individual Overview preview right clicks.
     * GNOME's own menu items remain intact; InjectionManager restores methods.
     */
    _installContextMenus() {
        const guard = this;
        this._injections.overrideMethod(AppMenu.AppMenu.prototype, '_updateWindowsSection',
            original => function (...args) {
                const result = original.call(this, ...args);
                if (!guard._disabled) guard._populateAppMenu(this);
                return result;
            });
        this._injections.overrideMethod(AppMenu.AppMenu.prototype, 'open',
            original => function (...args) {
                if (!guard._disabled) guard._populateAppMenu(this);
                return original.call(this, ...args);
            });
        this._injections.overrideMethod(WindowMenu.WindowMenu.prototype, '_buildMenu',
            original => function (window, ...args) {
                const result = original.call(this, window, ...args);
                if (!guard._disabled) guard._addWindowMenuActions(this, window);
                return result;
            });
        this._injections.overrideMethod(Workspace.Workspace.prototype, '_addWindowClone',
            original => function (...args) {
                const clone = original.call(this, ...args);
                if (!guard._disabled && clone) guard._makePreviewContextMenu(clone);
                return clone;
            });
        // Dash to Dock uses a separate DockAppIconMenu. Its popup() recreates
        // everything in _rebuildMenu() before calling PopupMenu.open(). Hook
        // that shared open method but modify ONLY menus with the dock's CSS
        // class and a Shell.App source. No Dash to Dock internals are patched.
        this._injections.overrideMethod(PopupMenu.PopupMenu.prototype, 'open',
            original => function (...args) {
                if (!guard._disabled && isDashToDockMenu(this)) {
                    try { guard._populateDockMenu(this); }
                    catch (error) { logError(error, 'Focus PIN Guard: Dash to Dock integration'); }
                }
                return original.call(this, ...args);
            });
    }
    _populateAppMenu(menu) {
        if (!menu._app || !this._isConfigured) {
            menu._focusPinSection?.removeAll();
            menu._focusPinSeparator?.hide();
            return;
        }
        if (!menu._focusPinSection) {
            // A dedicated section makes action ownership and clean-up obvious.
            menu._focusPinSection = new PopupMenu.PopupMenuSection();
            menu._focusPinSeparator = new PopupMenu.PopupSeparatorMenuItem();
            menu.addMenuItem(menu._focusPinSeparator);
            menu.addMenuItem(menu._focusPinSection);
            this._appMenus.add(menu);
        }
        menu._focusPinSeparator.show();
        const section = menu._focusPinSection;
        section.removeAll();
        const app = menu._app;
        const windows = app.get_windows().filter(w => !w.skip_taskbar);
        // A standalone Chromium web app often reports Chrome's desktop ID;
        // prefer its unique PWA WM_CLASS when only that window is in the icon.
        const onlyState = windows.length === 1 ? this._findWindow(windows[0]) : null;
        const onlyIdentity = onlyState ? this._identity(onlyState).primary : '';
        const appRule = onlyIdentity.startsWith('wmclass:crx_') ||
            onlyIdentity.startsWith('wmclass:chrome-')
            ? onlyIdentity : `desktop:${app.get_id()}`;
        const always = this._settings.get_strv('protected-apps').includes(appRule);
        section.addAction(always ? 'Focus PIN: Stop protecting application' :
            'Focus PIN: Always protect application', () => {
            if (this._disabled) return;
            if (always) this._removePermanentRule(appRule);
            else this._protectAppByKey(appRule);
        });
        if (windows.length > 0) {
            section.addAction('Focus PIN: Lock protected windows now', () => {
                if (this._disabled) return;
                for (const window of windows) {
                    const state = this._findWindow(window);
                    if (state && state.shield) this._lock(state);
                }
            });
            section.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            for (const window of windows.slice(0, 15)) {
                const state = this._findWindow(window);
                if (!state) continue;
                const caption = (window.get_title?.() || app.get_name()).slice(0, 42);
                section.addAction(state.temporary ? `Remove window lock: ${caption}` :
                    `Protect only this window: ${caption}`, () => {
                    if (this._disabled) return;
                    if (state.temporary) this._unprotectWindow(state);
                    else this._protectWindow(state);
                });
            }
        }
    }
    _clearDockMenu(menu) {
        const record = this._dockMenus?.get(menu);
        if (!record) return;
        this._dockMenus.delete(menu);
        if (record.destroySignal) {
            try { menu.disconnect(record.destroySignal); } catch (_) { /* dock menu gone */ }
        }
        for (const item of record.items) {
            try { item.destroy(); } catch (_) { /* dock already rebuilt it */ }
        }
    }
    _populateDockMenu(menu) {
        // Called AFTER DockAppIconMenu._rebuildMenu() and BEFORE the menu opens.
        // Dash to Dock's removeAll() destroys previously added sections.
        this._clearDockMenu(menu);
        if (!this._isConfigured || !this._settings) return;

        const source = menu.sourceActor;
        const app = source.app;
        const appId = app.get_id();
        const windows = dockWindows(source);
        const onlyState = windows.length === 1 ? this._findWindow(windows[0]) : null;
        const primary = onlyState ? this._identity(onlyState).primary : '';
        // Chromium PWAs can share one desktop ID with Chrome; use their
        // distinctive WM_CLASS when it is available, as the v1.1 menu does.
        const appRule = primary.startsWith('wmclass:crx_') ||
            primary.startsWith('wmclass:chrome-')
            ? primary : appId ? `desktop:${appId}` : primary;
        if (!appRule) return;

        const section = new PopupMenu.PopupMenuSection();
        const separator = new PopupMenu.PopupSeparatorMenuItem();
        // Keep Dash to Dock's standard Quit action at the bottom.
        const quitIndex = menu._quitMenuItem
            ? menu._getMenuItems().indexOf(menu._quitMenuItem) : -1;
        const index = quitIndex >= 0 ? quitIndex : menu.numMenuItems;
        menu.addMenuItem(separator, index);
        menu.addMenuItem(section, index + 1);
        const isProtected = this._settings.get_strv('protected-apps').includes(appRule);
        section.addAction(isProtected
            ? 'Focus PIN: Stop protecting application'
            : 'Focus PIN: Always protect application', () => {
            if (this._disabled) return;
            if (isProtected) this._removePermanentRule(appRule);
            else this._protectAppByKey(appRule);
        });
        const protectedWindows = windows
            .map(window => this._findWindow(window))
            .filter(state => state?.shield);
        if (protectedWindows.length) {
            section.addAction('Focus PIN: Lock protected windows now', () => {
                if (this._disabled) return;
                for (const state of protectedWindows) {
                    this._cancelTimer(state);
                    this._lock(state);
                }
            });
        }
        if (windows.length) {
            section.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            for (const window of windows.slice(0, 12)) {
                const state = this._findWindow(window);
                if (!state) continue;
                const name = (window.get_title?.() || app.get_name()).slice(0, 44);
                section.addAction(state.temporary
                    ? `Focus PIN: Remove window rule — ${name}`
                    : `Focus PIN: Protect this window — ${name}`, () => {
                    if (this._disabled) return;
                    if (state.temporary) this._unprotectWindow(state);
                    else this._protectWindow(state);
                });
            }
        }
        // Remove the additions on disable, without touching Dash to Dock's items.
        const destroySignal = menu.connect('destroy', () => {
            this._dockMenus?.delete(menu);
        });
        this._dockMenus.set(menu, {items: [separator, section], destroySignal});
    }
    _removePermanentRule(rule) {
        const rules = this._settings.get_strv('protected-apps');
        this._settings.set_strv('protected-apps', rules.filter(key => key !== rule));
        const overrides = parseAppDelays(this._settings.get_string('app-delays'));
        if (Object.hasOwn(overrides, rule)) {
            delete overrides[rule];
            this._settings.set_string('app-delays', JSON.stringify(overrides));
        }
        this._syncAll();
    }
    _protectAppByKey(key) {
        if (!this._isConfigured || !key || key === 'desktop:null') {
            Main.notify('Focus PIN Guard', 'Set your PIN in Preferences first.');
            return;
        }
        const rules = this._settings.get_strv('protected-apps');
        if (!rules.includes(key)) this._settings.set_strv('protected-apps', [...rules, key]);
        this._syncAll();
        Main.notify('Focus PIN Guard', `Always protecting: ${key}`);
    }
    _addWindowMenuActions(menu, window) {
        const state = this._findWindow(window);
        if (!state || !this._isConfigured) return;
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        menu.addAction(state.temporary ? 'Focus PIN: Remove window rule' :
            'Focus PIN: Protect this window', () => {
            if (state.temporary) this._unprotectWindow(state);
            else this._protectWindow(state);
        });
        menu.addAction('Focus PIN: Always protect this application', () =>
            this._protectApp(state));
        if (state.shield)
            menu.addAction('Focus PIN: Lock window now', () => this._lock(state));
    }
    _makePreviewContextMenu(clone) {
        if (!clone.metaWindow) return;
        const gesture = new Clutter.ClickGesture({
            required_button: Clutter.BUTTON_SECONDARY,
            recognize_on_press: true,
        });
        gesture.connect('recognize', () => this._showPreviewMenu(clone));
        clone.add_action(gesture);
        this._previewGestures.set(clone, gesture);
        clone.connect('destroy', () => this._previewGestures?.delete(clone));
    }
    _showPreviewMenu(clone) {
        if (this._disabled || !this._isConfigured || !clone.metaWindow) {
            Main.notify('Focus PIN Guard', 'Create a PIN in Preferences first.');
            return;
        }
        const state = this._findWindow(clone.metaWindow);
        if (!state) return;
        this._overviewContextMenu?.destroy();
        const menu = new PopupMenu.PopupMenu(clone, 0.5, St.Side.TOP);
        menu.actor.add_style_class_name('focus-pin-guard-context');
        Main.uiGroup.add_child(menu.actor);
        menu.addAction(state.temporary ? 'Remove window protection' :
            'Protect only this window', () => {
            if (state.temporary) this._unprotectWindow(state);
            else this._protectWindow(state);
        });
        const rule = this._identity(state).primary;
        menu.addAction(this._settings.get_strv('protected-apps').includes(rule)
            ? 'Stop permanently protecting this app'
            : 'Always protect this application', () => {
            if (this._settings.get_strv('protected-apps').includes(rule))
                this._removePermanentRule(rule);
            else this._protectApp(state);
        });
        if (state.shield)
            menu.addAction('Lock this window now', () => this._lock(state));
        const manager = new PopupMenu.PopupMenuManager(clone);
        manager.addMenu(menu);
        this._overviewContextMenu = menu;
        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            if (this._overviewContextMenu === menu) this._overviewContextMenu = null;
            menu.destroy();
        };
        clone.connect('destroy', release);
        menu.connect('open-state-changed', (_menu, open) => {
            if (!open) release();
        });
        menu.open(BoxPointer.PopupAnimation.FULL);
    }
    _createIndicator() {
        this._indicator = new PanelMenu.Button(0, 'Focus PIN Guard', false);
        this._indicator.add_child(new St.Icon({
            icon_name: 'changes-prevent-symbolic', style_class: 'system-status-icon',
        }));
        const menu = this._indicator.menu;
        menu.addAction('Protect focused window (until closed)', () => {
            const state = this._findWindow(this._lastFocusedWindow);
            if (state) this._protectWindow(state);
            else Main.notify('Focus PIN Guard', 'Select an application window first.');
        });
        menu.addAction('Always protect focused application', () => {
            const state = this._findWindow(this._lastFocusedWindow);
            if (state) this._protectApp(state);
            else Main.notify('Focus PIN Guard', 'Select an application window first.');
        });
        menu.addAction('Stop protecting focused window (one-time rule)', () => {
            const state = this._findWindow(this._lastFocusedWindow);
            if (state?.temporary) this._unprotectWindow(state);
            else Main.notify('Focus PIN Guard', 'No one-window rule on the focused window. Remove permanent rules in Settings.');
        });
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        // The picker works with GNOME Overview, dock, and taskbar activations.
        menu.addAction('Choose window in Overview · one-time', () => this._startPick('window'));
        menu.addAction('Choose app in Overview · always', () => this._startPick('app'));
        menu.addAction('Lock protected windows now', () => {
            for (const state of this._states.values()) {
                this._cancelTimer(state);
                if (state.shield) this._lock(state);
            }
            this._closeDialog();
        });
        menu.addAction('Extension settings…', () => this.openPreferences());
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }
    _startPick(mode) {
        if (!this._isConfigured) {
            Main.notify('Focus PIN Guard', 'Configure your PIN first.');
            return;
        }
        this._pick = {mode, armed: false, initialWindow: global.display.focus_window};
        this._indicator.menu.close();
        Main.notify('Focus PIN Guard', 'Choose a window from Overview or your dock/taskbar.');
        Main.overview.show();
        this._pick.armed = true;
    }
    _finishPick() {
        if (!this._pick || !this._pick.armed || Main.overview.visible) return;
        const window = global.display.focus_window;
        const pick = this._pick;
        // Closing Overview with Escape restores the original focus; do not
        // silently protect that window or arm an accidental future selection.
        this._pick = null;
        if (!window || window === pick.initialWindow) {
            Main.notify('Focus PIN Guard', 'Selection cancelled. To protect the focused window, use the panel menu.');
            return;
        }
        const state = this._findWindow(window);
        if (!state) {
            Main.notify('Focus PIN Guard', 'No supported application window was selected.');
            return;
        }
        if (pick.mode === 'app') this._protectApp(state);
        else this._protectWindow(state);
    }
    _findWindow(window) {
        for (const state of this._states?.values() ?? []) {
            if (state.window === window) return state;
        }
        return null;
    }
    _track(actor) {
        if (!actor || typeof actor.get_meta_window !== 'function' || this._states.has(actor)) return;
        const window = actor.get_meta_window();
        if (!window || window.is_skip_taskbar?.()) return;
        const state = {
            id: this._nextId++, window, actor, signals: [], shield: null,
            temporary: false, windowDelay: null, unlocked: false, pendingId: 0, blurredAtUs: 0,
            promptDeferred: false,
        };
        this._states.set(actor, state);
        state.signals.push([window, window.connect('notify::title', () => {
            this._sync(state); this._publishRunning();
        })]);
        state.signals.push([window, window.connect('notify::wm-class', () => {
            this._sync(state); this._publishRunning();
        })]);
        state.signals.push([actor, actor.connect('destroy', () => this._untrack(actor))]);
        this._sync(state);
        this._publishRunning();
    }
    _untrack(actor) {
        const state = this._states?.get(actor);
        if (!state) return;
        if (this._dialogWindow === state.window) this._closeDialog();
        this._removeState(state);
        this._states.delete(actor);
        this._publishRunning();
    }
    _removeState(state) {
        this._cancelTimer(state);
        for (const [object, id] of state.signals) this._disconnect(object, id);
        state.signals = [];
        if (state.shield) {
            state.shield.destroy();
            state.shield = null;
        }
    }
    _identity(state) {
        const window = state.window;
        const app = this._tracker.get_window_app(window);
        return windowIdentity(window.get_wm_class?.(), window.get_wm_class_instance?.(),
            app?.get_id?.(), window.get_gtk_application_id?.());
    }
    _matches(state) {
        if (state.temporary) return true;
        const rules = this._settings.get_strv('protected-apps');
        return matchRule(this._identity(state), rules);
    }
    _syncAll() {
        if (!this._states) return;
        for (const state of this._states.values()) this._sync(state);
        this._onFocusChanged();
        this._publishRunning();
    }
    _sync(state) {
        if (!this._isConfigured || !this._matches(state)) {
            this._cancelTimer(state);
            if (state.shield) { state.shield.destroy(); state.shield = null; }
            state.unlocked = false;
            if (this._dialogWindow === state.window) this._closeDialog();
            return;
        }
        if (!state.shield) this._makeShield(state);
        if (state.shield) state.shield.visible = !state.unlocked;
        if (state.window === global.display.focus_window && !this._dialog &&
                !Main.overview.visible && !state.unlocked) this._openDialog(state);
    }
    _makeShield(state) {
        // Attached to the compositor window actor, so Overview previews are also covered.
        const shield = new St.Widget({
            style_class: 'apl-shield', reactive: true,
            layout_manager: new Clutter.BinLayout(),
        });
        shield.add_constraint(new Clutter.BindConstraint({
            source: state.actor, coordinate: Clutter.BindCoordinate.SIZE,
        }));
        const content = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, style_class: 'apl-shield-content',
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
        });
        content.add_child(new St.Label({
            text: 'Application locked', style_class: 'apl-shield-title',
        }));
        content.add_child(new St.Label({
            text: 'Select the window and enter your PIN', style_class: 'apl-shield-detail',
        }));
        shield.add_child(content);
        try {
            state.actor.add_child(shield);
            state.actor.set_child_above_sibling(shield, null);
            state.shield = shield;
        } catch (error) {
            logError(error, 'Focus PIN Guard: unable to add window shield');
            shield.destroy();
            Main.notify('Focus PIN Guard', 'Unable to cover a window on this GNOME version.');
        }
    }
    _cancelTimer(state) {
        if (state.pendingId) {
            GLib.Source.remove(state.pendingId);
            state.pendingId = 0;
        }
    }
    _lock(state) {
        if (!state.shield) return;
        state.unlocked = false;
        state.shield.show();
        state.promptDeferred = false;
    }
    _scheduleLock(state) {
        if (!state.shield || !state.unlocked) return;
        if (!state.blurredAtUs) state.blurredAtUs = GLib.get_monotonic_time();
        this._cancelTimer(state);
        const delay = this._delayForState(state);
        const remainingMs = remainingLockMillis(
            state.blurredAtUs, GLib.get_monotonic_time(), delay);
        if (remainingMs === 0) { this._lock(state); return; }
        state.pendingId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            remainingMs, () => {
                state.pendingId = 0;
                if (!this._disabled && state.shield &&
                        (Main.overview.visible || global.display.focus_window !== state.window))
                    this._lock(state);
                return GLib.SOURCE_REMOVE;
            });
    }
    _delayForState(state) {
        return effectiveDelay(
            this._identity(state), this._settings.get_strv('protected-apps'),
            state.windowDelay, parseAppDelays(this._settings.get_string('app-delays')),
            checkedDelay(this._settings.get_uint('lock-delay')));
    }
    _rescheduleAll() {
        for (const state of this._states?.values() ?? []) {
            if (state.shield && state.unlocked && state.blurredAtUs)
                this._scheduleLock(state);
        }
    }
    _onOverviewShowing() {
        if (this._dialog) this._closeDialog();
        for (const state of this._states?.values() ?? []) {
            if (!state.shield) continue;
            if (!state.blurredAtUs) state.blurredAtUs = GLib.get_monotonic_time();
            this._scheduleLock(state);
        }
    }
    _onOverviewHidden() {
        // Picking a window that was already focused may not emit notify::focus-window.
        if (this._overviewIdleId) GLib.Source.remove(this._overviewIdleId);
        this._overviewIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._overviewIdleId = 0;
            if (!this._disabled) { this._finishPick(); this._onFocusChanged(); }
            return GLib.SOURCE_REMOVE;
        });
    }
    _onFocusChanged() {
        if (this._disabled || !this._states || !this._isConfigured) return;
        if (this._dialog) return;
        const focus = global.display.focus_window;
        if (focus) this._lastFocusedWindow = focus;
        if (this._pick && !Main.overview.visible) this._finishPick();
        for (const state of this._states.values()) {
            if (!state.shield) continue;
            if (state.window === focus && !Main.overview.visible) {
                this._cancelTimer(state);
                state.blurredAtUs = 0;
            } else {
                // Dismissing the modal only defers this focus visit. Next
                // visit must offer the PIN again, even if already locked.
                state.promptDeferred = false;
                if (!state.blurredAtUs) state.blurredAtUs = GLib.get_monotonic_time();
                this._scheduleLock(state);
            }
        }
        const state = this._findWindow(focus);
        if (state && state.shield && !state.unlocked && !state.promptDeferred &&
                !Main.overview.visible) this._openDialog(state);
    }
    _protectWindow(state) {
        state.temporary = true;
        state.unlocked = false;
        this._sync(state);
        this._publishRunning();
        Main.notify('Focus PIN Guard', `Protected this window until it closes: ${state.window.get_title()}`);
    }
    _unprotectWindow(state) {
        state.temporary = false;
        this._sync(state); // permanent rules are not changed
        this._publishRunning();
        Main.notify('Focus PIN Guard', 'Removed one-window rule. Permanent app rules are unchanged.');
    }
    _protectApp(state) {
        const {primary} = this._identity(state);
        if (!primary) {
            Main.notify('Focus PIN Guard', 'No stable app identifier. Protect one window instead.');
            return;
        }
        this._protectAppByKey(primary);
        this._publishRunning();
    }
    _publishRunning() {
        if (!this._settings || !this._states) return;
        const list = [];
        for (const state of this._states.values()) {
            const identity = this._identity(state);
            if (!identity.primary) continue;
            list.push({
                id: state.id, title: state.window.get_title?.() || 'Untitled window',
                key: identity.primary, app: this._tracker.get_window_app(state.window)?.get_name?.() ||
                    state.window.get_wm_class?.() || 'Application',
                temporary: state.temporary,
                protected: this._matches(state),
                windowDelay: state.windowDelay,
                effectiveDelay: this._delayForState(state),
            });
        }
        const value = JSON.stringify(list.slice(0, 100));
        if (this._settings.get_string('running-windows') !== value)
            this._settings.set_string('running-windows', value);
    }
    _handleRequest() {
        if (!this._settings || !this._states) return;
        const request = this._settings.get_string('action-request');
        if (!request) return;
        this._settings.set_string('action-request', '');
        let payload;
        try { payload = JSON.parse(request); } catch (_) { return; }
        if (!Number.isInteger(payload.id)) return;
        const state = [...this._states.values()].find(s => s.id === payload.id);
        if (!state) return;
        if (payload.command === 'window') this._protectWindow(state);
        if (payload.command === 'app') this._protectApp(state);
        if (payload.command === 'remove-window') this._unprotectWindow(state);
        if (payload.command === 'set-window-delay' &&
            (payload.value === null || validDelay(payload.value))) {
            state.windowDelay = payload.value;
            if (state.shield && state.unlocked && state.blurredAtUs)
                this._scheduleLock(state);
        }
        this._publishRunning();
    }
    _openDialog(state) {
        if (this._dialog || this._disabled) return;
        const dialog = new ModalDialog.ModalDialog({destroyOnClose: false});
        this._dialog = dialog;
        this._dialogWindow = state.window;
        const box = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, style_class: 'apl-dialog-box',
        });
        box.add_child(new St.Label({
            text: 'Unlock application', style_class: 'apl-dialog-title',
        }));
        box.add_child(new St.Label({
            text: state.window.get_title?.() || 'Protected window',
            style_class: 'apl-dialog-message',
        }));
        const entry = new St.PasswordEntry({
            style_class: 'apl-entry', hint_text: '4-digit PIN', can_focus: true, x_expand: true,
        });
        box.add_child(entry);
        const status = new St.Label({text: '', style_class: 'apl-dialog-message'});
        box.add_child(status);
        dialog.contentLayout.add_child(box);
        dialog.setInitialKeyFocus(entry);
        dialog.setButtons([
            {label: 'Not now', action: () => {
                state.promptDeferred = true; this._closeDialog();
            }, key: Clutter.KEY_Escape},
            {label: 'Unlock', isDefault: true,
                action: () => this._submit(state, entry, status)},
        ]);
        entry.clutter_text.connect('activate', () => this._submit(state, entry, status));
        if (!dialog.open()) this._closeDialog();
    }
    _submit(state, entry, status) {
        if (this._disabled || this._dialogWindow !== state.window || this._checking) return;
        const pin = entry.get_text();
        entry.set_text('');
        if (!isValidPin(pin)) {
            status.set_text('Enter exactly 4 digits.');
            return;
        }
        const now = GLib.get_monotonic_time();
        if (now < this._nextAllowedUs) {
            status.set_text(`Retry in ${Math.ceil((this._nextAllowedUs - now) / 1e6)}s.`);
            return;
        }
        this._checking = true;
        status.set_text('Checking…');
        const serial = ++this._attemptSerial;
        const valid = verifyPin(this._settings, pin);
        if (this._disabled || serial !== this._attemptSerial ||
                this._dialogWindow !== state.window) return;
        this._checking = false;
        if (valid) {
            this._attempts = 0; this._nextAllowedUs = 0;
            state.unlocked = true;
            state.shield?.hide();
            state.blurredAtUs = 0;
            this._closeDialog();
        } else {
            this._attempts++;
            if (this._attempts >= 3)
                this._nextAllowedUs = GLib.get_monotonic_time() +
                    Math.min(30, 2 ** (this._attempts - 2)) * 1e6;
            status.set_text('Incorrect PIN, or verification failed.');
            entry.grab_key_focus();
        }
    }
    _closeDialog() {
        ++this._attemptSerial;
        this._checking = false;
        if (this._dialog) {
            const dialog = this._dialog;
            this._dialog = null;
            this._dialogWindow = null;
            dialog.connect('closed', () => {
                dialog.destroy();
                if (!this._disabled) this._onFocusChanged();
            });
            dialog.close();
        }
    }
}
