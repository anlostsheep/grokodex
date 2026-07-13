export function okResult(tool, fields = {}) {
    return {
        ok: true,
        tool,
        ...fields,
    };
}
export function failResult(tool, code, message, hint) {
    return {
        ok: false,
        tool,
        error: hint === undefined ? { code, message } : { code, message, hint },
    };
}
export function envelopeToText(env) {
    return JSON.stringify(env, null, 2);
}
//# sourceMappingURL=errors.js.map