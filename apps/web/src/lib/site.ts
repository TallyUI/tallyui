import corePackage from '../../../../packages/core/package.json';
import databasePackage from '../../../../packages/database/package.json';

// Production origin used for absolute URLs in metadata, the sitemap and robots.
export const siteUrl = 'https://tallyui.com';
// The version comes from @tallyui/core's package.json so the snippet follows each release.
export const tallyVersion: string = corePackage.version;
// The RxDB version comes from @tallyui/database's package.json so the snippet follows its pin.
export const rxdbVersion: string = databasePackage.dependencies.rxdb;
