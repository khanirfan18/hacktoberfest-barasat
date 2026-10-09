import { OwnerScanner } from "@/components/owner/OwnerScanner";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  await requireRole("owner");
  return <OwnerScanner />;
}
