import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {DELAYS, validDelay, parseAppDelays, effectiveDelay, delayLabel} from '../extension/timers.js';
import {windowIdentity} from '../extension/identity.js';

const firefox = windowIdentity('firefox', 'firefox', 'firefox.desktop');
const chromePwa = windowIdentity('crx_abcabcabcabc', 'crx_abcabcabcabc', 'google-chrome.desktop');

test('dropdown enumerates immediate to two minutes in five-second increments', () => {
    assert.equal(DELAYS.length, 25);
    assert.deepEqual(DELAYS, Array.from({length: 25}, (_, n) => n * 5));
    assert.equal(delayLabel(0), 'Immediately (0 s)');
    assert.equal(delayLabel(120), '2 minutes');
});
test('no tolerance for invalid negative, fractional, or out-of-range timeout', () => {
    for (const value of [-5, -1, 1, 4, 121, 125, 30.1, '5', null, undefined])
        assert.equal(validDelay(value), false);
    for (const value of DELAYS) assert.equal(validDelay(value), true);
});
test('invalid or hostile app delay metadata is ignored', () => {
    assert.deepEqual(parseAppDelays('{'), {});
    assert.deepEqual(parseAppDelays('[]'), {});
    assert.deepEqual(parseAppDelays('{"__proto__":3,"desktop:firefox.desktop":7,"wmclass:good":10}'),
        {'wmclass:good': 10});
});
test('one-window value overrides app override and default', () => {
    const rule = firefox.primary;
    const appDelays = {[rule]: 60};
    assert.equal(effectiveDelay(firefox, [rule], 5, appDelays, 30), 5);
    assert.equal(effectiveDelay(firefox, [rule], null, appDelays, 30), 60);
    assert.equal(effectiveDelay(firefox, [], null, appDelays, 30), 30);
    assert.equal(effectiveDelay(firefox, [], null, {}, 0), 0);
});
test('per-app override only applies to matching protected PWA', () => {
    const rule = chromePwa.primary;
    assert.equal(effectiveDelay(chromePwa, [rule], null, {[rule]:120}, 0), 120);
    assert.equal(effectiveDelay(firefox, [rule], null, {[rule]:120}, 0), 0);
});
