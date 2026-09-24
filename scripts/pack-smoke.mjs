import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tallyui-pack-'));
const failures = [];
const tarballs = [];
const packages = [];
const resolveOnly = ['@tallyui/components', '@tallyui/primitives', '@tallyui/storage-sqlite'];

try {
  const license = fs.readFileSync(path.join(root, 'LICENSE'));
  for (const base of ['packages', 'connectors']) {
    for (const entry of fs.readdirSync(path.join(root, base), { withFileTypes: true })) {
      const dir = path.join(root, base, entry.name);
      const manifest = path.join(dir, 'package.json');
      if (!entry.isDirectory() || !fs.existsSync(manifest)) continue;
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (pkg.private !== true) packages.push({ dir, name: pkg.name });
    }
  }
  if (packages.length !== 11) {
    throw new Error(`Expected 11 packages; found ${packages.length}: ${packages.map(p => p.name).join(', ')}`);
  }

  for (const { dir, name } of packages) {
    const start = failures.length;
    const check = (condition, message) => {
      if (!condition) failures.push(`${name}: ${message}`);
    };
    try {
      const before = new Set(fs.readdirSync(tmp));
      execFileSync('pnpm', ['pack', '--pack-destination', tmp], { cwd: dir, stdio: 'pipe' });
      const created = fs.readdirSync(tmp).filter(file => file.endsWith('.tgz') && !before.has(file));
      if (created.length !== 1) throw new Error(`Expected one new tarball, found ${created.length}`);
      const tarball = path.join(tmp, created[0]);
      tarballs.push(tarball);
      const files = new Set(execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split('\n'));
      const read = file => execFileSync('tar', ['-xzOf', tarball, `package/${file}`]);
      // pnpm pack/publish copies the workspace-root LICENSE into each tarball; guard it.
      check(files.has('package/LICENSE'), 'missing package/LICENSE');
      if (files.has('package/LICENSE')) check(read('LICENSE').equals(license), 'LICENSE differs from root LICENSE');
      check(files.has('package/package.json'), 'missing package/package.json');
      if (!files.has('package/package.json')) continue;
      const packed = JSON.parse(read('package.json').toString('utf8'));
      const checkFiles = value => {
        if (typeof value === 'string') {
          check(files.has(`package/${value.replace(/^\.\//, '')}`), `missing entry file ${value}`);
        } else if (value && typeof value === 'object') {
          for (const child of Object.values(value)) checkFiles(child);
        }
      };
      checkFiles(packed.main);
      checkFiles(packed.types);
      checkFiles(packed.exports?.['.']);
      for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
        for (const [dependency, range] of Object.entries(packed[field] ?? {})) {
          check(!range.includes('workspace:'), `${field}.${dependency} contains workspace: (${range})`);
        }
      }
      check(packed.license === 'MIT', 'license must be MIT');
      check(packed.repository?.url === 'git+https://github.com/TallyUI/tallyui.git', 'repository.url does not match');
      if (failures.length === start) console.log(`ok ${packed.name}@${packed.version} (${files.size} files)`);
    } catch (error) {
      failures.push(`${name}: ${error.message}${error.stdout ? `\n${error.stdout}` : ''}`);
    }
  }

  if (!process.argv.includes('--skip-install') && failures.length === 0) {
    const project = path.join(tmp, 'project');
    fs.mkdirSync(project);
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({
      name: 'tallyui-pack-smoke', private: true, type: 'module',
    }));
    try {
      execFileSync('npm', [
        'install', '--no-audit', '--no-fund', '--ignore-scripts', '--legacy-peer-deps',
        '--package-lock=false', ...tarballs, 'react', 'rxdb@16.21.1', 'rxjs',
      ], { cwd: project, stdio: 'inherit' });
      fs.writeFileSync(path.join(project, 'smoke.mjs'), `
const resolveOnly = ${JSON.stringify(resolveOnly)};
for (const name of ${JSON.stringify(packages.map(pkg => pkg.name))}) {
  try {
    if (resolveOnly.includes(name)) {
      import.meta.resolve(name);
    } else {
      const module = await import(name);
      if (Object.keys(module).length === 0) throw new Error('module has zero exports');
    }
  } catch (error) {
    console.error(name + ': ' + error.message);
    process.exitCode = 1;
  }
}
`);
      execFileSync(process.execPath, ['smoke.mjs'], { cwd: project, stdio: 'inherit' });
    } catch (error) {
      failures.push(`Install/import smoke test (${packages.map(pkg => pkg.name).join(', ')}): ${error.message}`);
    }
  }
} catch (error) {
  failures.push(error.message);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
}
