// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.
import GLib from 'gi://GLib';

// A salted, iterated verifier avoids a plaintext PIN on disk. Four-digit PINs
// are inherently weak and the GSettings database is accessible to this user.
const ROUNDS = 8192;
export function isValidPin(value) {
    return /^[0-9]{4}$/.test(value);
}
export function derivePin(pin, salt) {
    let digest = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256,
        `${salt}:${pin}`, -1);
    for (let i = 1; i < ROUNDS; ++i)
        digest = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256,
            `${salt}:${digest}`, -1);
    return digest;
}
export function verifyPin(settings, candidate) {
    const salt = settings.get_string('pin-salt');
    const expected = settings.get_string('pin-hash');
    if (!isValidPin(candidate) || !salt || !expected)
        return false;
    const actual = derivePin(candidate, salt);
    // Avoid short-circuiting on the first differing character.
    let different = expected.length ^ actual.length;
    for (let i = 0; i < actual.length; i++)
        different |= actual.charCodeAt(i) ^ (expected.charCodeAt(i) || 0);
    return different === 0;
}
export function configurePin(settings, newPin) {
    if (!isValidPin(newPin))
        return false;
    const salt = GLib.uuid_string_random();
    const verifier = derivePin(newPin, salt);
    settings.delay();
    settings.set_string('pin-salt', salt);
    settings.set_string('pin-hash', verifier);
    settings.apply();
    return true;
}
