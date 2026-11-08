'use strict';
/* PinForge server: serves the simulator and compiles C for STM32F103 with arm-none-eabi-gcc.
   No npm dependencies. Compiling untrusted code: see validate() and the README security notes. */
const http = require('http'), fs = require('fs'), fsp = require('fs/promises'), path = require('path'), os = require('os');
const { execFile } = require('child_process');

const PORT = +process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public'), TC = path.join(__dirname, 'toolchain');
const TMO = +process.env.COMPILE_TIMEOUT || 40000;
const MAX_SRC = 32 * 1024, MAX_BUSY = 2, RATE = +process.env.RATE || 20; // compiles per minute per IP
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const ASM_OK = new Set(['wfi', 'wfe', 'nop', 'sev', 'cpsid i', 'cpsie i', 'dmb', 'dsb', 'isb', 'bkpt', 'bkpt 0', 'svc 0', 'svc #0']);

// Cheap checks on the raw text (the real include/asm checks run on the PREPROCESSED output below).
function validateRaw(code) {
  if (typeof code !== 'string' || !code.trim()) return 'No source code was sent.';
  if (code.length > MAX_SRC) return 'Source is too large (max 32 KB).';
  if (/\u0000/.test(code)) return 'Invalid characters in source.';
  if (/\b_Pragma\b|^[ \t]*#[ \t]*pragma\b/m.test(code)) return '#pragma is not allowed on the shared compile server.';
  if (/\/(dev|proc|sys|etc|root|home|var|usr|app)\//i.test(code)) return 'Absolute file paths are not allowed on the shared compile server.';
  return null;
}
// Runs on the output of `gcc -E`: comments are gone, macros are expanded, line splices are joined.
function validatePre(pre) {
  if (/^\s*#\s*pragma\b/m.test(pre)) return '#pragma is not allowed on the shared compile server.';
  if (/incbin|\.include|\.file\b|\.incbin/i.test(pre)) return 'This construct is not allowed on the shared compile server.';
  for (const m of pre.matchAll(/\b(__asm__|__asm|asm)\b/g)) {
    const rest = pre.slice(m.index + m[0].length);
    const mm = rest.match(/^\s*(?:volatile|__volatile__)?\s*\(\s*((?:"(?:[^"\\\n]|\\.)*"\s*)+)((?::\s*:\s*:\s*"memory"\s*)?)\)/);
    if (!mm) return 'Inline assembly is limited to simple instructions: wfi, wfe, nop, sev, cpsid i, cpsie i, dmb, dsb, isb, bkpt, svc 0.';
    const text = [...mm[1].matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map(x => x[1]).join('').replace(/\\n|\\t/g, ' ').trim().replace(/\s+/g, ' ').toLowerCase();
    if (!ASM_OK.has(text)) return 'Inline assembly "' + text.slice(0, 30) + '" is not on the allow list (wfi, wfe, nop, sev, cpsid i, cpsie i, dmb, dsb, isb, bkpt, svc 0).';
  }
  return null;
}

const run = (cmd, args, opts) => new Promise(res => execFile(cmd, args, Object.assign({ timeout: 10000, maxBuffer: 1 << 20 }, opts), (err, stdout, stderr) => res({ err, stdout: String(stdout), stderr: String(stderr) })));

let gccVersion = null, GCCINC = '', LIM = [];
run('prlimit', ['--version']).then(r => { if (!r.err) LIM = ['prlimit', '--as=1610612736', '--cpu=40', '--fsize=4194304', '--']; console.log('prlimit:', LIM.length ? 'on' : 'unavailable'); });
run('arm-none-eabi-gcc', ['-print-file-name=include']).then(r => { GCCINC = path.resolve(r.stdout.trim()); });
run('arm-none-eabi-gcc', ['--version']).then(r => { gccVersion = r.err ? null : r.stdout.split('\n')[0]; console.log('gcc:', gccVersion || 'NOT FOUND'); });

let warmMs = null;
setTimeout(() => { const t0 = Date.now(); compile('#include <stdint.h>\nint main(void){for(;;);}\n', 'Os').then(r => { warmMs = Date.now() - t0; console.log('warm-up compile', r.ok ? 'ok in ' + warmMs + ' ms' : 'FAILED: ' + r.log); }); }, 1500);
let busy = 0; const hits = new Map();
function limited(ip) { const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 60000); a.push(now); hits.set(ip, a); if (hits.size > 5000) hits.clear(); return a.length > RATE; }

const lim = (cmd, args) => LIM.length ? [LIM[0], LIM.slice(1).concat([cmd], args)] : [cmd, args];
async function compile(code, opt) {
  const bad = validateRaw(code); if (bad) return { ok: false, log: 'error: ' + bad };
  const O = ['O0', 'O1', 'O2', 'Os'].includes(opt) ? '-' + opt : '-Os';
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pf-'));
  try {
    await fsp.writeFile(path.join(dir, 'main.c'), code);
    const env = { PATH: '/usr/bin:/bin', LANG: 'C', TMPDIR: dir };
    const why = (r, stage) => {
      const sig = r.err && (r.err.signal || ''), tail = (r.stderr || '').split('\n').filter(l => l && !/^\.+ /.test(l)).join(' ').slice(-300);
      return 'error: the ' + stage + ' step ' + (r.err && r.err.killed ? 'timed out' : 'failed') + ' (exit ' + (r.err && r.err.code) + ', signal ' + (sig || 'none') + ')' + (tail ? ' - ' + clean(tail) : '') + (r.err && r.err.killed ? ' - the free server is slow, try again.' : '');
    };
    const clean = s => s.split(dir + '/').join('').split(TC + '/').join('').trim();
    const inc = ['-nostdinc', '-isystem', GCCINC, '-I', TC, '-ffreestanding'];
    // 1) preprocess, and check which files were really included
    let [c, a] = lim('arm-none-eabi-gcc', ['-E', '-H', ...inc, 'main.c', '-o', 'pre.i']);
    const p1 = await run(c, a, { cwd: dir, env, timeout: TMO });
    const incs = [...p1.stderr.matchAll(/^\.+ (.+)$/gm)].map(m => path.resolve(m[1]));
    const okInc = f => f.startsWith(TC + path.sep) || f.startsWith(GCCINC + path.sep);
    if (incs.some(f => !okInc(f))) return { ok: false, log: 'error: only <stdint.h>, <stdbool.h>, <stddef.h>, "stm32f1.h" and "stm32f10x.h" can be included.' };
    const diag = s => clean(s.split('\n').filter(l => !/^\.+ /.test(l) && !/^Multiple include guards|^ \/|^Use '#pragma once'/.test(l)).join('\n'));
    if (p1.err) return { ok: false, log: diag(p1.stderr) || why(p1, 'preprocessing') };
    const pre = await fsp.readFile(path.join(dir, 'pre.i'), 'utf8');
    const bad2 = validatePre(pre); if (bad2) return { ok: false, log: 'error: ' + bad2 };
    // 2) compile exactly the text that was checked, link with our startup + linker script
    [c, a] = lim('arm-none-eabi-gcc', ['-mcpu=cortex-m3', '-mthumb', O, '-Wall', '-Wextra', '-fmax-errors=20', '-fno-diagnostics-color', '-nostdlib', '-ffreestanding', '-ffunction-sections', '-fdata-sections',
      '-T', path.join(TC, 'link.ld'), '-Wl,--gc-sections', path.join(TC, 'startup.c'), '-x', 'cpp-output', 'pre.i', '-o', 'out.elf', '-lgcc']);
    const r = await run(c, a, { cwd: dir, env, timeout: TMO });
    if (r.err) return { ok: false, log: clean(r.stderr) || why(r, 'compile/link') };
    const o = await run('arm-none-eabi-objcopy', ['-O', 'binary', 'out.elf', 'out.bin'], { cwd: dir, env });
    if (o.err) return { ok: false, log: clean(o.stderr) || why(o, 'objcopy') };
    const bin = await fsp.readFile(path.join(dir, 'out.bin'));
    if (bin.length > 65536) return { ok: false, log: 'error: program is larger than the 64 KB Flash.' };
    const sz = await run('arm-none-eabi-size', ['out.elf'], { cwd: dir, env }); const p = sz.stdout.split('\n')[1] ? sz.stdout.split('\n')[1].trim().split(/\s+/).map(Number) : [];
    return { ok: true, bin: bin.toString('base64'), size: bin.length, text: p[0], data: p[1], bss: p[2], log: clean(r.stderr) };
  } finally { fsp.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

const send = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); res.end(b); };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST' }); return res.end(); }
    if (url.pathname === '/api/health') return send(res, 200, { ok: !!gccVersion, gcc: gccVersion, warm_ms: warmMs, timeout_ms: TMO });
    if (url.pathname === '/api/compile' && req.method === 'POST') {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      if (limited(ip)) return send(res, 429, { ok: false, log: 'error: too many builds, wait a minute and try again.' });
      if (busy >= MAX_BUSY) return send(res, 429, { ok: false, log: 'error: compiler is busy, try again in a few seconds.' });
      let body = ''; let tooBig = false;
      req.on('data', c => { body += c; if (body.length > MAX_SRC * 2) { tooBig = true; req.destroy(); } });
      await new Promise(r => req.on('end', r).on('close', r));
      if (tooBig) return send(res, 413, { ok: false, log: 'error: request too large.' });
      let j; try { j = JSON.parse(body); } catch (e) { return send(res, 400, { ok: false, log: 'error: bad request.' }); }
      if (!gccVersion) return send(res, 503, { ok: false, log: 'error: the compiler is not installed on this server.' });
      busy++; try { return send(res, 200, await compile(j.code, j.opt)); } finally { busy--; }
    }
    // static files
    let p = decodeURIComponent(url.pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.normalize(path.join(PUB, p));
    if (!f.startsWith(PUB + path.sep) && f !== PUB) { res.writeHead(403); return res.end('Forbidden'); }
    const data = await fsp.readFile(f).catch(() => null);
    if (!data) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data);
  } catch (e) { try { send(res, 500, { ok: false, log: 'error: server error.' }); } catch (_) {} }
}).listen(PORT, () => console.log('PinForge listening on :' + PORT));

module.exports = { validatePre, validateRaw };
