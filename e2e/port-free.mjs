// Preflight: `node e2e/port-free.mjs <port>` exits 0 if the port is free, else names the busy addresses and holder
// and exits 1. Without it, an Expo finding its port taken exits 0, and Playwright tests whatever holds the port.
import { execFileSync } from 'node:child_process';
import net from 'node:net';

const port = Number(process.argv[2]);
// Each address is bound separately: on macOS (SO_REUSEADDR) a bind succeeds beside a holder on a different
// address of the same port, so a loopback bind misses a wildcard holder and a wildcard bind misses a loopback one.
const HOSTS = ['127.0.0.1', '::1', '0.0.0.0', '::'];
// Bind errors meaning the host lacks that address family (e.g. no IPv6 loopback), not that the port is taken.
const NO_SUCH_ADDRESS = ['EADDRNOTAVAIL', 'EAFNOSUPPORT'];

const canBind = (host) =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (error) => resolve(NO_SUCH_ADDRESS.includes(error.code)));
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });

function holder() {
  try {
    const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
    const [command, pid] = out.split('\n')[1].trim().split(/\s+/);
    return `${command} (pid ${pid})`;
  } catch {
    return 'unknown';
  }
}

const busy = [];
for (const host of HOSTS) if (!(await canBind(host))) busy.push(host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`);
if (busy.length > 0) {
  console.error(`e2e: port ${port} is already in use (${busy.join(', ')}) by ${holder()}; stop it, or set E2E_REUSE=1 to test that server`);
  process.exit(1);
}
