import { RenderMode, ServerRoute } from '@angular/ssr';

// Every page is prerendered. Record pages get their ids from the catalog build's
// /_data/routes.json (served from the build output during prerendering).
async function routeData(): Promise<{ datasets: string[]; dataset_aliases: { from: string }[]; courses: string[] }> {
  const res = await fetch('/_data/routes.json');
  if (!res.ok) throw new Error(`prerender: /_data/routes.json answered ${res.status}; run the catalog build first`);
  return res.json();
}

export const serverRoutes: ServerRoute[] = [
  {
    path: 'datasets/:id',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      const d = await routeData();
      return [...d.datasets, ...d.dataset_aliases.map((a) => a.from)].map((id) => ({ id }));
    },
  },
  {
    path: 'courses/:id',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return (await routeData()).courses.map((id) => ({ id }));
    },
  },
  { path: '**', renderMode: RenderMode.Prerender },
];
