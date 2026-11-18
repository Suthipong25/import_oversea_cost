import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import { listStandaloneAgentCosts } from '@/modules/agent-costs/service';
import { listShipmentsForUser } from '@/modules/shipments/service';
import { AgentCostLibraryClient } from '@/components/agent-cost-library-client';

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const [sp, libraryData, shipments] = await Promise.all([
    searchParams,
    listStandaloneAgentCosts(user),
    listShipmentsForUser(user),
  ]);

  const canCreate = hasPermission(user.role, 'rates:ingest');

  return (
    <AgentCostLibraryClient
      initialTab={sp.tab === 'history' ? 'history' : 'library'}
      initialItems={libraryData.items}
      catalog={libraryData.catalog}
      suppliers={libraryData.suppliers}
      fxRateUsdToThb={libraryData.fxRateUsdToThb}
      fxSnapshot={libraryData.fxSnapshot}
      shipments={shipments.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
      }))}
      canCreate={canCreate}
    />
  );
}
