import { listAllProducts } from "../product-data";
import { adminUsersExist, requireAdminSession } from "../admin-session";
import { redirect } from "next/navigation";
import AdminClient from "./admin-client";
import { getSiteSettings, listStoreSpecialHours } from "../site-settings";
import { listProductMetrics } from "../product-analytics";
import { listAuditLogs } from "../audit-log";
import { listCatalogCategories } from "../product-categories";
import { listNoResultSearches } from "../search-analytics";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await adminUsersExist())) redirect("/admin/setup");
  const user = await requireAdminSession();

  const [productList, settings, metrics, auditLogs, categories, specialHours, noResultSearches] = await Promise.all([
    user.canManageProducts || user.canViewAnalytics ? listAllProducts() : Promise.resolve([]),
    getSiteSettings(),
    user.canViewAnalytics ? listProductMetrics() : Promise.resolve([]),
    user.role === "owner" ? listAuditLogs() : Promise.resolve([]),
    user.canManageProducts ? listCatalogCategories(true) : Promise.resolve([]),
    user.canManageContent ? listStoreSpecialHours() : Promise.resolve([]),
    user.canViewAnalytics ? listNoResultSearches() : Promise.resolve([]),
  ]);
  return (
    <AdminClient
      initialProducts={productList}
      initialSettings={settings}
      metrics={metrics}
      displayName={user.displayName}
      username={user.username}
      role={user.role}
      canManageProducts={user.canManageProducts}
      canManageContent={user.canManageContent}
      canViewAnalytics={user.canViewAnalytics}
      auditLogs={auditLogs}
      initialCategories={categories}
      initialSpecialHours={specialHours}
      noResultSearches={noResultSearches}
      referenceTime={new Date().toISOString()}
    />
  );
}
