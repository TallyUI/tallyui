#!/usr/bin/env node
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cliRequire = createRequire(require.resolve('@changesets/cli/package.json'));
const getReleasePlan = cliRequire('@changesets/get-release-plan').default;
const plan = await getReleasePlan(process.cwd());
const requestedMajor = plan.changesets.some(changeset =>
  changeset.releases.some(release => release.type === 'major')
);
const majors = plan.releases.filter(release => release.type === 'major');

if (majors.length && !requestedMajor) {
  for (const release of majors) {
    console.error(`${release.name} ${release.oldVersion} → ${release.newVersion}`);
  }
  console.error('check:release-plan: unrequested major; likely workspace:* peers or the onlyUpdatePeerDependentsWhenOutOfRange config key being ignored. See docs/RELEASING.md.');
  process.exit(1);
}

if (!plan.changesets.length) {
  console.log('check:release-plan: no pending changesets');
} else {
  const highest = ['major', 'minor', 'patch'].find(type =>
    plan.releases.some(release => release.type === type)
  ) ?? 'none';
  console.log(`check:release-plan: ${plan.releases.length} releases, highest ${highest}`);
}
