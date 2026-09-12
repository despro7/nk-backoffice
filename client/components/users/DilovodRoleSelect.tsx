import { useMemo } from 'react';
import { Button, Select, SelectItem, Spinner } from '@heroui/react';
import { useDilovodRoles } from '@/hooks/useDilovodRoles';

interface DilovodRoleSelectProps {
  value: string;
  onChange: (roleId: string) => void;
  isDisabled?: boolean;
  isRequired?: boolean;
}

export function DilovodRoleSelect({
  value,
  onChange,
  isDisabled = false,
  isRequired = false,
}: DilovodRoleSelectProps) {
  const { roles, loading, error, reload } = useDilovodRoles();

  const selectedKeys = useMemo(
    () => (roles.some((role) => role.id === value) ? [value] : []),
    [roles, value],
  );

  return (
    <div className="space-y-1">
      <Select
        label="Роль в Діловоді"
        labelPlacement="outside"
        placeholder={loading ? 'Завантаження…' : 'Оберіть роль'}
        selectedKeys={selectedKeys}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys)[0];
          if (typeof selected === 'string') onChange(selected);
        }}
        isDisabled={isDisabled || loading || roles.length === 0}
        isRequired={isRequired}
        description="Синхронізується з обліковим записом Dilovod"
        startContent={loading ? <Spinner size="sm" /> : undefined}
      >
        {roles.map((role) => (
          <SelectItem key={role.id} textValue={role.name}>
            {role.name}
          </SelectItem>
        ))}
      </Select>
      {error ? (
        <div className="flex items-center gap-2">
          <p className="text-xs text-danger">Не вдалося завантажити ролі Dilovod</p>
          <Button size="sm" variant="light" onPress={() => void reload()}>
            Повторити
          </Button>
        </div>
      ) : null}
    </div>
  );
}
