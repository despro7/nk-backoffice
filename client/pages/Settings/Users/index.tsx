import { useRef } from 'react';
import { Button, Tab } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useSearchParams } from 'react-router-dom';
import PageTabs from '@/components/PageTabs';
import { UserRegistrationManager, type UsersTabActions } from './components/UserRegistrationManager';
import { RolesManager, type RolesTabActions } from './components/RolesManager';
import { parseUsersSettingsTab, PERMISSIONS } from '@shared/constants/permissions';
import { useRoleAccess } from '@/hooks/useRoleAccess';

export default function SettingsUsers() {
  const [params, setParams] = useSearchParams();
  const tab = parseUsersSettingsTab(params.toString());
  const { hasPermission } = useRoleAccess();
  const usersRef = useRef<UsersTabActions>(null);
  const rolesRef = useRef<RolesTabActions>(null);
  const canManageRoles = hasPermission(PERMISSIONS.ACTION_ROLES_MANAGE);

  if (!hasPermission(PERMISSIONS.PAGE_SETTINGS_USERS)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Доступ заборонено</h2>
          <p className="text-gray-600">У вас немає прав доступу до цієї сторінки.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageTabs
          selectedKey={tab}
          onSelectionChange={(key) => {
            const next = String(key) === 'roles' ? 'roles' : 'users';
            setParams(next === 'users' ? {} : { tab: next }, { replace: true });
          }}
        >
          <Tab key="users" title="Користувачі" />
          <Tab key="roles" title="Ролі" />
        </PageTabs>

        {tab === 'users' ? (
          <Button
            color="primary"
            startContent={<DynamicIcon name="plus" size={16} />}
            onPress={() => usersRef.current?.openCreate()}
          >
            Створити користувача
          </Button>
        ) : canManageRoles ? (
          <Button
            color="primary"
            startContent={<DynamicIcon name="plus" size={16} />}
            onPress={() => rolesRef.current?.openCreate()}
          >
            Нова роль
          </Button>
        ) : null}
      </div>

      {tab === 'users' ? <UserRegistrationManager ref={usersRef} /> : <RolesManager ref={rolesRef} />}
    </div>
  );
}
