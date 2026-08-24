import HomeClient from "./home-client";
import { listPublicProducts } from "./product-data";
import { getSiteSettings, listStoreSpecialHours } from "./site-settings";
import { listCatalogCategories } from "./product-categories";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [products, settings, categories, specialHours] = await Promise.all([listPublicProducts(), getSiteSettings(), listCatalogCategories(), listStoreSpecialHours()]);
  return <HomeClient initialProducts={products} settings={settings} categories={categories} specialHours={specialHours} />;
}
