import corePackage from '../../../../packages/core/package.json';

// Production origin used for absolute URLs in metadata, the sitemap and robots.
export const siteUrl = 'https://tallyui.com';
// The version comes from @tallyui/core's package.json so the snippet follows each release.
export const tallyVersion: string = corePackage.version;
