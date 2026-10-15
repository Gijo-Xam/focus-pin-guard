import assert from 'node:assert/strict';
import {isDashToDockMenu, dockWindows} from '../extension/dockCompatibility.js';
const menu = {
    actor: {has_style_class_name: name => name === 'dock-app-menu'},
    sourceActor: {app: {get_id: () => 'whatsapp.desktop'}},
    addMenuItem() {},
};
assert.equal(isDashToDockMenu(menu), true);
assert.equal(isDashToDockMenu({...menu, actor: {has_style_class_name: () => false}}), false);
assert.equal(isDashToDockMenu({...menu, sourceActor: {}}), false);
assert.equal(isDashToDockMenu(null), false);
const a = {is_skip_taskbar: () => false};
const hidden = {is_skip_taskbar: () => true};
assert.deepEqual(dockWindows({getInterestingWindows: () => [a, hidden, a]}), [a]);
assert.deepEqual(dockWindows({app: {get_windows: () => [a]}}), [a]);
assert.deepEqual(dockWindows(null), []);
console.log('Dash to Dock detection and window filtering tests passed');
