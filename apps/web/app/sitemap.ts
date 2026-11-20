import type { MetadataRoute } from "next";
import { loadVoyages } from "@/lib/data";
import { site } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["/", "/method"];
  for (const { voyage } of loadVoyages()) {
    pages.push(`/voyages/${voyage.id}`);
    for (const r of voyage.regrowths) pages.push(`/voyages/${voyage.id}/${r.target.id}`);
  }
  return pages.map((path) => ({ url: `${site.url}${path === "/" ? "" : path}`, changeFrequency: "weekly", priority: path === "/" ? 1 : 0.7 }));
}
