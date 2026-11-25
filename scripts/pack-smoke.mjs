import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tallyui-pack-'));
const failures = [];
const tarballs = [];
const packages = [];
const specifiers = [];
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
      for (const [key, value] of Object.entries(packed.exports)) {
        if (typeof value === 'object') specifiers.push(key === '.' ? packed.name : `${packed.name}/${key.slice(2)}`);
      }
      const checkFiles = value => {
        if (typeof value === 'string') {
          if (value.includes('*')) {
            check(false, `wildcard exports aren't checked; the script needs extending: ${value}`);
            return;
          }
          check(files.has(`package/${value.replace(/^\.\//, '')}`), `missing entry file ${value}`);
        } else if (value && typeof value === 'object') {
          for (const child of Object.values(value)) checkFiles(child);
        }
      };
      checkFiles(packed.main);
      checkFiles(packed.types);
      checkFiles(packed.exports);
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
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
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
for (const spec of ${JSON.stringify(specifiers)}) {
  try {
    require.resolve(spec);
  } catch (error) {
    console.error(spec + ' (require): ' + error.message);
    process.exitCode = 1;
  }
}
`);
      execFileSync(process.execPath, ['smoke.mjs'], { cwd: project, stdio: 'inherit' });
    } catch (error) {
      failures.push(`Install/import smoke test (${packages.map(pkg => pkg.name).join(', ')}): ${error.message}`);
    }

    // The packed .d.ts must load each package's className augmentation for react-native; one program per package.
    try {
      const modules = path.join(project, 'node_modules');
      fs.mkdirSync(path.join(modules, '@types'), { recursive: true });
      for (const dep of ['react-native', 'react-native-svg', '@types/react']) {
        const source = path.join(root, 'packages', 'components', 'node_modules', dep);
        if (!fs.existsSync(source)) throw new Error(`${source} is missing; run pnpm install`);
        if (!fs.existsSync(path.join(modules, dep))) fs.symlinkSync(source, path.join(modules, dep), 'dir');
      }
      const programs = {
        primitives: `import '@tallyui/primitives';
import { Text, View } from 'react-native';
export const ok = <View className="p-2"><Text className="text-sm">ok</Text></View>;
// @ts-expect-error className is a string
export const bad = <View className={1} />;
`,
        components: `import { HStack, Text } from '@tallyui/components';
import { TextInput, View } from 'react-native';
export const ok = <HStack className="gap-2"><Text className="text-sm">ok</Text></HStack>;
export const data = <View dataSet={{ print: 'hide' }} />;
export const input = <TextInput placeholderTextColorClassName="accent-muted" />;
// @ts-expect-error className is a string
export const bad = <HStack className={1} />;
`,
      };
      for (const [name, source] of Object.entries(programs)) {
        fs.writeFileSync(path.join(project, `types-${name}.tsx`), source);
        fs.writeFileSync(path.join(project, `tsconfig.${name}.json`), JSON.stringify({
          compilerOptions: {
            noEmit: true, strict: true, skipLibCheck: true, jsx: 'react-jsx', module: 'esnext',
            moduleResolution: 'bundler', target: 'es2022', types: [],
          },
          files: [`types-${name}.tsx`],
        }));
        try {
          execFileSync(process.execPath, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', `tsconfig.${name}.json`], {
            cwd: project, encoding: 'utf8', stdio: 'pipe',
          });
          console.log(`ok packed types (${name})`);
        } catch (error) {
          failures.push(`Packed types (${name}): ${error.message}\n${error.stdout ?? ''}`);
        }
      }
    } catch (error) {
      failures.push(`Packed types: ${error.message}`);
    }

    // A store plugin installs core alone, with no react, rxdb or rxjs: ./server must load there (arch 1a).
    const serverOnly = path.join(tmp, 'server-only');
    fs.mkdirSync(serverOnly);
    fs.writeFileSync(path.join(serverOnly, 'package.json'), JSON.stringify({
      name: 'tallyui-pack-smoke-server-only', private: true, type: 'module',
    }));
    try {
      const coreTarball = tarballs[packages.findIndex(pkg => pkg.name === '@tallyui/core')];
      if (!coreTarball) throw new Error('no @tallyui/core tarball');
      execFileSync('npm', [
        'install', '--no-audit', '--no-fund', '--ignore-scripts', '--package-lock=false', coreTarball,
      ], { cwd: serverOnly, stdio: 'inherit' });
      if (fs.existsSync(path.join(serverOnly, 'node_modules', 'react'))) throw new Error('node_modules/react was installed');
      fs.writeFileSync(path.join(serverOnly, 'server.mjs'), `
import { createRequire } from 'node:module';
const required = createRequire(import.meta.url)('@tallyui/core/server');
if (Object.keys(required).length === 0) throw new Error('require() has zero exports');
const imported = await import('@tallyui/core/server');
if (Object.keys(imported).length === 0) throw new Error('import() has zero exports');
`);
      execFileSync(process.execPath, ['server.mjs'], { cwd: serverOnly, stdio: 'inherit' });
    } catch (error) {
      failures.push(`Server-only install (no react): ${error.message}`);
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
