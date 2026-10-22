import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { parseRebatchWizardSearchParams } from '@/features/product-movements/rebatchWizard';
import type { RebatchWizardLaunchParams } from '@/features/product-movements/rebatchWizard';
import { ReleaseSetsMainFlow } from './ReleaseSetsMainFlow';

export default function ReleaseSetsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [rebatchLaunch, setRebatchLaunch] = React.useState<RebatchWizardLaunchParams | null>(null);

  React.useEffect(() => {
    const entry = parseRebatchWizardSearchParams(searchParams);
    if (!entry) return;
    setRebatchLaunch(entry);
    navigate('/warehouse/releases', { replace: true });
  }, [searchParams, navigate]);

  return (
    <div className="container">
      <ReleaseSetsMainFlow
        rebatchLaunch={rebatchLaunch}
        onRebatchLaunchConsumed={() => setRebatchLaunch(null)}
      />
    </div>
  );
}
