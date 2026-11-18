import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chargeAliases, chargeCatalog } from '@/lib/db/schema';
import { SubjectsManagerClient } from '@/components/subjects-manager-client';

export default async function ChargeSubjectsPage() {
  const [subjects, aliases] = await Promise.all([
    db.select().from(chargeCatalog).orderBy(asc(chargeCatalog.displayOrder)),
    db.select().from(chargeAliases),
  ]);

  return (
    <SubjectsManagerClient
      subjects={subjects.map((sub) => ({
        id: sub.id,
        code: sub.code,
        nameEn: sub.nameEn,
        nameTh: sub.nameTh,
        category: sub.category,
        defaultWhtPercent: sub.defaultWhtPercent,
        isSectionHeader: sub.isSectionHeader,
        aliases: aliases
          .filter((a) => a.chargeCatalogId === sub.id)
          .map((a) => a.aliasPattern),
      }))}
    />
  );
}
