import { DesignSystemDemo } from '@/components/DesignSystemDemo';
import { DesignSystemPatterns } from '@/components/DesignSystemPatterns';

export default function DesignSystem() {
  return (
    <div className="w-full space-y-10 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-default-900">Дизайн-система</h1>
        <p className="mt-1 text-sm text-default-500">
          Жива вітрина еталонних патернів (таблиці, chips, drawer) і базових токенів.
        </p>
      </header>

      <DesignSystemPatterns />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-default-900">Токени</h2>
          <p className="mt-1 text-sm text-default-500">Кольори, типографіка, spacing, radius, shadows.</p>
        </div>
        <DesignSystemDemo />
      </section>
    </div>
  );
}
