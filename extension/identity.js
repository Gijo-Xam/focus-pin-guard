/** Application/window identity helpers; no GNOME dependencies, easy to test. */
export function normalizeClass(value) {
    return String(value ?? '').trim().toLowerCase();
}

export function windowIdentity(wmClass, wmInstance, desktopId, gtkId = '') {
    const klass = normalizeClass(wmClass);
    const instance = normalizeClass(wmInstance);
    const desktop = String(desktopId ?? '').trim();
    const gtk = String(gtkId ?? '').trim();
    const candidates = [];
    const add = value => { if (value && !candidates.includes(value)) candidates.push(value); };
    // Chromium installed web apps often share a Chrome desktop ID. Use their
    // distinct WM_CLASS instead, avoiding accidental protection of all Chrome.
    const pwa = [klass, instance].find(value => /^(crx_|chrome-[a-z0-9_-]{8,})/.test(value));
    if (pwa) add(`wmclass:${pwa}`);
    if (gtk) add(`desktop:${gtk.endsWith('.desktop') ? gtk : `${gtk}.desktop`}`);
    if (desktop) add(`desktop:${desktop}`);
    if (klass) add(`wmclass:${klass}`);
    if (instance) add(`wmclass:${instance}`);
    const primary = pwa ? `wmclass:${pwa}` :
        (desktop ? `desktop:${desktop}` :
            gtk ? `desktop:${gtk.endsWith('.desktop') ? gtk : `${gtk}.desktop`}` :
                (klass ? `wmclass:${klass}` : instance ? `wmclass:${instance}` : ''));
    return {primary, candidates};
}

export function matchRule(identity, protectedApps) {
    return identity.candidates.some(rule => protectedApps.includes(rule));
}

export function checkedDelay(seconds) {
    const n = Number(seconds);
    return Number.isInteger(n) && n >= 0 && n <= 120 && n % 5 === 0 ? n : 0;
}

/** Milliseconds left until focus-away locking; 0 means lock now. */
export function remainingLockMillis(leftAtUs, nowUs, delaySeconds) {
    const delay = checkedDelay(delaySeconds);
    const elapsedUs = Math.max(0, nowUs - leftAtUs);
    return Math.max(0, Math.ceil(delay * 1000 - elapsedUs / 1000));
}
