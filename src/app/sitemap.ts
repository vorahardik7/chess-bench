import type { MetadataRoute } from 'next';
import { getLatestResults } from './lib/results';
import { getModelRoute, getSiteUrl } from './lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const results = await getLatestResults();
  const latestUpdatedAt =
    results.models
      .map((model) => model.updatedAt)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ??
    results.generatedAt ??
    new Date().toISOString();

  return [
    {
      url: `${siteUrl}/`,
      lastModified: latestUpdatedAt,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${siteUrl}/dataset`,
      lastModified: results.generatedAt ?? latestUpdatedAt,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...results.models.map((model) => ({
      url: `${siteUrl}${getModelRoute(model.id)}`,
      lastModified: model.updatedAt ?? latestUpdatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
