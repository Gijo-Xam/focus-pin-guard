/** Small, GNOME-independent delay helpers, so invalid settings are harmless. */
export const DELAYS = Array.from({length: 25}, (_, n) => n * 5);

export function validDelay(value) {
    return Number.isInteger(value) && value >= 0 && value <= 120 && value % 5 === 0;
}

export function parseAppDelays(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return {};
        const result = {};
        for (const [key, seconds] of Object.entries(parsed)) {
            if (key.length <= 256 && /^(desktop:|wmclass:)/.test(key) && validDelay(seconds))
                result[key] = seconds;
        }
        return result;
    } catch (_) {
        return {};
    }
}

export function effectiveDelay(identity, rules, windowDelay, appDelays, defaultDelay) {
    if (validDelay(windowDelay)) return windowDelay;
    // Match the most specific rule first (e.g. a PWA's WM_CLASS instead of Chrome).
    const matched = identity.candidates.find(key => rules.includes(key) &&
        Object.hasOwn(appDelays, key));
    return matched ? appDelays[matched] : (validDelay(defaultDelay) ? defaultDelay : 0);
}

export function delayLabel(value) {
    if (value === 0) return 'Immediately (0 s)';
    if (value === 60) return '1 minute';
    if (value === 120) return '2 minutes';
    return `${value} seconds`;
}
