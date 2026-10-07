// Guards the home header's docs and GitHub links (backlog item 61).
import { FrameworkProvider } from 'fumadocs-core/framework';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { baseOptions } from './layout.shared';

describe('home header', () => {
  it('links to docs, components, status and changelog', () => {
    const markup = renderToStaticMarkup(
      <FrameworkProvider
        usePathname={() => '/'}
        useParams={() => ({})}
        useRouter={() => ({ push: () => {}, refresh: () => {} })}
        Link={({ href, ...props }) => <a href={href} {...props} />}
      >
        <HomeLayout {...baseOptions()}>
          <p>Home page</p>
        </HomeLayout>
      </FrameworkProvider>,
    );
    const container = document.createElement('div');
    container.innerHTML = markup;
    const hrefs = Array.from(container.querySelectorAll('a'), (anchor) => anchor.getAttribute('href'));

    for (const href of [
      '/docs',
      '/docs/components',
      '/docs/status',
      '/docs/changelog',
      'https://github.com/TallyUI/tallyui',
    ]) {
      expect(hrefs).toContain(href);
    }
  });
});
