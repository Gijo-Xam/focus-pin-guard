// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.
// Preferences run in GTK4, separate from GNOME Shell.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import {configurePin, verifyPin, isValidPin} from './pin.js';
import {DELAYS, validDelay, parseAppDelays, delayLabel} from './timers.js';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const VALUES = DELAYS;
const OVERRIDE_LABELS = ['Use app/global default', ...VALUES.map(delayLabel)];
function parseList(raw) {
    try {
        const array = JSON.parse(raw);
        return Array.isArray(array) ? array.filter(item =>
            item && Number.isInteger(item.id) && typeof item.key === 'string') : [];
    } catch (_) { return []; }
}

export default class FocusPinGuardPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(880, 780);
        window.search_enabled = true;
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({
            title: 'Application protection', icon_name: 'changes-prevent-symbolic',
        });
        window.add(page);

        const timerGroup = new Adw.PreferencesGroup({
            title: 'Automatic locking',
            description: 'Countdown starts as soon as you leave a protected window. Return before time expires to stay unlocked.',
        });
        page.add(timerGroup);
        const delay = new Adw.ComboRow({
            title: 'Lock after switching away',
            subtitle: '0 to 120 seconds in 5-second steps',
            model: Gtk.StringList.new(VALUES.map(delayLabel)),
        });
        delay.selected = Math.max(0, VALUES.indexOf(settings.get_uint('lock-delay')));
        timerGroup.add(delay);
        delay.connect('notify::selected', () =>
            settings.set_uint('lock-delay', VALUES[delay.selected] ?? 0));
        settings.connect('changed::lock-delay', () => {
            const selected = Math.max(0, VALUES.indexOf(settings.get_uint('lock-delay')));
            if (delay.selected !== selected) delay.selected = selected;
        });


        const pinGroup = new Adw.PreferencesGroup({
            title: 'Four-digit PIN',
            description: 'This extension has its own PIN and does not access the previous WhatsApp extension. Change the PIN by entering the old one first.',
        });
        page.add(pinGroup);
        const existingPin = new Adw.PasswordEntryRow({title: 'Current PIN (required for changes)'});
        const newPin = new Adw.PasswordEntryRow({title: 'New 4-digit PIN'});
        const confirmPin = new Adw.PasswordEntryRow({title: 'Confirm new PIN'});
        for (const entry of [existingPin, newPin, confirmPin]) {
            entry.set_input_purpose(Gtk.InputPurpose.PIN);
            pinGroup.add(entry);
        }
        const savePinRow = new Adw.ActionRow({
            title: 'Save PIN', subtitle: 'Set the PIN once, then use it for all protected apps',
        });
        const saveButton = new Gtk.Button({label: 'Save PIN', valign: Gtk.Align.CENTER});
        savePinRow.add_suffix(saveButton);
        pinGroup.add(savePinRow);
        const statusRow = new Adw.ActionRow({title: settings.get_string('pin-hash') ? 'PIN configured' : 'PIN not configured'});
        pinGroup.add(statusRow);
        saveButton.connect('clicked', () => {
            const old = existingPin.get_text();
            const proposed = newPin.get_text();
            const confirmation = confirmPin.get_text();
            if (!isValidPin(proposed) || proposed !== confirmation) {
                statusRow.title = 'Enter matching four-digit PINs';
                return;
            }
            if (settings.get_string('pin-hash') && !verifyPin(settings, old)) {
                statusRow.title = 'Incorrect current PIN';
                return;
            }
            configurePin(settings, proposed);
            existingPin.set_text('');
            newPin.set_text('');
            confirmPin.set_text('');
            statusRow.title = 'PIN saved';
        });

        const openGroup = new Adw.PreferencesGroup({
            title: 'Currently open windows',
            description: 'Select a delay for each open window (or keep its app/global default). Use Window for this instance; Always persists protection for the app.',
        });
        page.add(openGroup);
        let openRows = [];
        const refreshOpen = () => {
            for (const row of openRows) openGroup.remove(row);
            openRows = [];
            const windows = parseList(settings.get_string('running-windows'));
            if (!windows.length) {
                const placeholder = new Adw.ActionRow({
                    title: 'No application windows detected',
                    subtitle: 'The extension must be enabled in your GNOME desktop.',
                });
                openGroup.add(placeholder);
                openRows.push(placeholder);
            }
            for (const item of windows) {
                const row = new Adw.ComboRow({
                    title: String(item.title || item.app || 'Application').slice(0, 100),
                    subtitle: `${item.app || 'Application'} · ${item.temporary ? 'Window protected' :
                        item.protected ? 'App protected' : 'Not protected'} · ${item.key}`,
                    model: Gtk.StringList.new(OVERRIDE_LABELS),
                });
                const selected = validDelay(item.windowDelay)
                    ? VALUES.indexOf(item.windowDelay) + 1 : 0;
                row.selected = selected;
                row.connect('notify::selected', () => settings.set_string('action-request',
                    JSON.stringify({id: item.id, command: 'set-window-delay',
                        value: row.selected === 0 ? null : VALUES[row.selected - 1],
                        stamp: Date.now()})));

                const once = new Gtk.Button({
                    label: 'Window', valign: Gtk.Align.CENTER,
                    tooltip_text: 'Protect this window until it closes',
                });
                once.connect('clicked', () => settings.set_string('action-request',
                    JSON.stringify({id: item.id, command: 'window', stamp: Date.now()})));
                row.add_suffix(once);
                if (item.temporary) {
                    const remove = new Gtk.Button({
                        label: 'Unprotect', valign: Gtk.Align.CENTER,
                        tooltip_text: 'Remove only the temporary window rule',
                    });
                    remove.connect('clicked', () => settings.set_string('action-request',
                        JSON.stringify({id: item.id, command: 'remove-window', stamp: Date.now()})));
                    row.add_suffix(remove);
                }
                const always = new Gtk.Button({
                    label: 'Always', valign: Gtk.Align.CENTER,
                    tooltip_text: 'Persistently protect this application',
                });
                always.connect('clicked', () => settings.set_string('action-request',
                    JSON.stringify({id: item.id, command: 'app', stamp: Date.now()})));
                row.add_suffix(always);
                openGroup.add(row);
                openRows.push(row);
            }
        };
        settings.connect('changed::running-windows', refreshOpen);
        refreshOpen();

        const permanentGroup = new Adw.PreferencesGroup({
            title: 'Permanently protected applications',
            description: 'These rules remain active for future windows and after a restart. Remove a rule to stop protecting that application.',
        });
        page.add(permanentGroup);
        const installed = Gio.AppInfo.get_all()
            .filter(app => app.get_id() && app.should_show())
            .map(app => ({id: app.get_id(), name: app.get_display_name()}))
            .sort((a, b) => a.name.localeCompare(b.name));
        const names = new Map(installed.map(app => [`desktop:${app.id}`, app.name]));
        const appDelayLabels = ['Use global default', ...VALUES.map(delayLabel)];
        let protectedRows = [];
        const updateRules = () => {
            for (const row of protectedRows) permanentGroup.remove(row);
            protectedRows = [];
            const rules = settings.get_strv('protected-apps');
            if (!rules.length) {
                const placeholder = new Adw.ActionRow({title: 'No additional permanent app rules'});
                permanentGroup.add(placeholder);
                protectedRows.push(placeholder);
            }
            for (const rule of rules) {
                const row = new Adw.ComboRow({
                    title: names.get(rule) || rule.replace(/^(desktop:|wmclass:)/, ''),
                    subtitle: `${rule} · Permanent app protection`,
                    model: Gtk.StringList.new(appDelayLabels),
                });
                const appDelays = parseAppDelays(settings.get_string('app-delays'));
                row.selected = validDelay(appDelays[rule]) ? VALUES.indexOf(appDelays[rule]) + 1 : 0;
                row.connect('notify::selected', () => {
                    const updated = parseAppDelays(settings.get_string('app-delays'));
                    if (row.selected === 0) delete updated[rule];
                    else updated[rule] = VALUES[row.selected - 1];
                    settings.set_string('app-delays', JSON.stringify(updated));
                });

                const button = new Gtk.Button({
                    label: 'Remove', valign: Gtk.Align.CENTER,
                    tooltip_text: 'Remove this permanent protection rule',
                });
                button.connect('clicked', () => {
                    settings.set_strv('protected-apps',
                        settings.get_strv('protected-apps').filter(candidate => candidate !== rule));
                    const updated = parseAppDelays(settings.get_string('app-delays'));
                    delete updated[rule];
                    settings.set_string('app-delays', JSON.stringify(updated));
                });
                row.add_suffix(button);
                permanentGroup.add(row);
                protectedRows.push(row);
            }
        };
        settings.connect('changed::protected-apps', updateRules);
        updateRules();

        const catalogGroup = new Adw.PreferencesGroup({
            title: 'Add an installed application',
            description: 'Search for a desktop application and choose Protect. For Chrome web apps, the open-windows list above is more accurate.',
        });
        page.add(catalogGroup);
        const searchRow = new Adw.ActionRow({title: 'Find an application'});
        const search = new Gtk.SearchEntry({
            placeholder_text: 'Search installed apps', width_chars: 22,
            valign: Gtk.Align.CENTER,
        });
        searchRow.add_suffix(search);
        catalogGroup.add(searchRow);
        let resultRows = [];
        const refreshSearch = () => {
            for (const row of resultRows) catalogGroup.remove(row);
            resultRows = [];
            const term = search.get_text().trim().toLowerCase();
            if (term.length < 2) return;
            const matches = installed.filter(app =>
                `${app.name} ${app.id}`.toLowerCase().includes(term)).slice(0, 12);
            for (const app of matches) {
                const key = `desktop:${app.id}`;
                const row = new Adw.ActionRow({title: app.name, subtitle: app.id});
                const button = new Gtk.Button({
                    label: settings.get_strv('protected-apps').includes(key) ? 'Added' : 'Protect',
                    valign: Gtk.Align.CENTER,
                });
                button.sensitive = !settings.get_strv('protected-apps').includes(key);
                button.connect('clicked', () => {
                    const keys = settings.get_strv('protected-apps');
                    if (!keys.includes(key)) settings.set_strv('protected-apps', [...keys, key]);
                    button.label = 'Added';
                    button.sensitive = false;
                });
                row.add_suffix(button);
                catalogGroup.add(row);
                resultRows.push(row);
            }
        };
        search.connect('search-changed', refreshSearch);
        settings.connect('changed::protected-apps', refreshSearch);

        const guide = new Adw.PreferencesGroup({
            title: 'Select windows from Overview or the dock',
            description: 'Right-click an app icon in GNOME’s dock for persistent protection, or right-click a window preview in Overview to protect only that window. Standard GNOME window menus also expose Focus PIN actions.',
        });
        page.add(guide);
        const note = new Adw.ActionRow({
            title: 'Separate from the old extension',
            subtitle: 'Uses a new extension ID, a new settings schema and an independent PIN.',
        });
        guide.add(note);
    }
}
