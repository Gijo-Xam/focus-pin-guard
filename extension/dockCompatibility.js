// Dash to Dock constructs its own DockAppIconMenu, not GNOME's AppMenu.
// Detect its PopupMenu instance structurally: no importing another extension's
// private modules, no modification of the dock extension itself.
export function isDashToDockMenu(menu) {
    return Boolean(menu?.actor?.has_style_class_name?.('dock-app-menu') &&
        menu?.sourceActor?.app &&
        typeof menu.sourceActor.app.get_id === 'function' &&
        typeof menu.addMenuItem === 'function');
}

export function dockWindows(sourceActor) {
    const windows = typeof sourceActor?.getInterestingWindows === 'function'
        ? sourceActor.getInterestingWindows()
        : sourceActor?.app?.get_windows?.() ?? [];
    if (!Array.isArray(windows)) return [];
    return [...new Set(windows)].filter(window =>
        window && !window.skip_taskbar && !window.skipTaskbar &&
        !window.is_skip_taskbar?.());
}
