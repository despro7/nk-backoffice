import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
  Button,
  Card,
  CardBody,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Switch,
} from '@heroui/react';
import { PersonDrawer } from '../components/PersonDrawer';
import { PersonMergeModal } from '../components/PersonMergeModal';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';
import type { HrPersonDto, HrPersonMergeFieldSelections } from '@shared/types/hr';
import { createDefaultMergeFieldSelections } from '@shared/utils/personMergeFields';
import { mergeHrPersonsBatch } from '@/services/hrPersonMerge';
import { HR_BTN_PRIMARY } from '@/lib/buttonStyles';
import { HR_BTN_NEUTRAL } from '../hrUi';
import {
  PersonsContextMenu,
  type PersonsContextMenuGroupTarget,
  type PersonsContextMenuState,
  type PersonsContextMenuTarget,
} from './PersonsContextMenu';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { PersonsTreeTable } from './PersonsTreeTable';
import { usePersonsTree } from './usePersonsTree';

export default function HrPersonsPage() {
  const { hasPermission } = useRoleAccess();
  const canManage = hasPermission(PERMISSIONS.ACTION_HR_PERSONS_MANAGE);
  const {
    visibleNodes,
    nodes,
    search,
    setSearch,
    duplicatesOnly,
    setDuplicatesOnly,
    loading,
    syncing,
    expandedIds,
    toggleExpanded,
    collapseSubtree,
    fetchTree,
    handleSync,
    handleSyncContacts,
    handleSyncGroups,
    isSearchMode,
    searchShowAllFolders,
    toggleSearchShowAllFolders,
  } = usePersonsTree();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<HrPersonDto | null>(null);
  const [mergeSource, setMergeSource] = useState<HrPersonDto | null>(null);
  const [mergeDuplicates, setMergeDuplicates] = useState<HrPersonDto[]>([]);
  const [mergeMainId, setMergeMainId] = useState<number | null>(null);
  const [mergeFieldSelections, setMergeFieldSelections] = useState<HrPersonMergeFieldSelections | null>(null);
  const [merging, setMerging] = useState(false);
  const [movingPersonId, setMovingPersonId] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<PersonsContextMenuState | null>(null);
  const [recordSyncing, setRecordSyncing] = useState(false);
  const [deletingGroupLegalEntityId, setDeletingGroupLegalEntityId] = useState<number | null>(null);
  const [localGroupUnlink, setLocalGroupUnlink] = useState<{ legalEntityId: number; label: string } | null>(null);

  const mergeCandidates = useMemo(() => {
    if (!mergeSource) return [];
    return [mergeSource, ...mergeDuplicates];
  }, [mergeDuplicates, mergeSource]);

  useEffect(() => {
    if (!mergeSource) {
      setMergeDuplicates([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/hr/persons/${mergeSource.id}/duplicates`, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (cancelled) return;
      setMergeDuplicates(Array.isArray(data.data) ? data.data as HrPersonDto[] : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [mergeSource]);

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };

  const openEdit = (person: HrPersonDto) => {
    setEditing(person);
    setDrawerOpen(true);
    void (async () => {
      const response = await fetch(`/api/hr/persons/${person.id}`, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;
      if (data.data) setEditing(data.data as HrPersonDto);
    })();
  };

  const showSyncToast = (
    result: { pulled?: number; updated?: number; groupsLinked?: number } | undefined,
    mode: 'all' | 'contacts' | 'groups',
  ) => {
    if (mode === 'groups') {
      ToastService.show({
        title: `Папки: звʼязано ${result?.groupsLinked ?? 0}`,
        color: 'success',
      });
      return;
    }
    if (mode === 'contacts') {
      ToastService.show({
        title: `Контакти: +${result?.pulled ?? 0}, оновлено ${result?.updated ?? 0}`,
        color: 'success',
      });
      return;
    }
    ToastService.show({
      title: `Синхронізовано: +${result?.pulled ?? 0}, оновлено ${result?.updated ?? 0}, груп ${result?.groupsLinked ?? 0}`,
      color: 'success',
    });
  };

  const runSync = async (mode: 'all' | 'contacts' | 'groups') => {
    try {
      const result = mode === 'all'
        ? await handleSync()
        : mode === 'contacts'
          ? await handleSyncContacts()
          : await handleSyncGroups();
      showSyncToast(result, mode);
    } catch (error) {
      ToastService.show({
        title: error instanceof Error ? error.message : 'Синхронізація не вдалась',
        color: 'danger',
      });
    }
  };

  const openContextMenu = (event: MouseEvent, target: PersonsContextMenuTarget) => {
    if (!canManage) return;
    setContextMenu({ x: event.clientX, y: event.clientY, target });
  };

  const handleSyncPersonRecord = async (person: HrPersonDto) => {
    if (recordSyncing) return;
    setRecordSyncing(true);
    const hadDilovodLink = Boolean(person.dilovodPersonId);
    try {
      const response = await fetch(`/api/hr/persons/${person.id}/sync/record`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({
          title: data.message || 'Не вдалося синхронізувати контакт',
          color: 'danger',
        });
        return;
      }
      ToastService.show({
        title: hadDilovodLink ? 'Контакт оновлено з Dilovod' : 'Контакт відправлено в Dilovod',
        color: 'success',
      });
      if (editing?.id === person.id && data.data) {
        setEditing(data.data as HrPersonDto);
      }
      await fetchTree({ refreshFullTree: true });
    } finally {
      setRecordSyncing(false);
    }
  };

  const handleSyncGroupRecord = async (group: PersonsContextMenuGroupTarget) => {
    if (recordSyncing || !group.legalEntityId) return;
    setRecordSyncing(true);
    try {
      const response = await fetch(`/api/hr/legal-entities/${group.legalEntityId}/sync/person-group`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({
          title: data.message || 'Не вдалося синхронізувати папку',
          color: 'danger',
        });
        return;
      }
      ToastService.show({
        title: `Папку «${group.label}» синхронізовано`,
        color: 'success',
      });
      await fetchTree({ refreshFullTree: true });
    } finally {
      setRecordSyncing(false);
    }
  };

  const handleDeleteEmptyGroup = async (legalEntityId: number, label: string, localOnly = false) => {
    if (deletingGroupLegalEntityId != null) return;
    setDeletingGroupLegalEntityId(legalEntityId);
    try {
      const query = localOnly ? '?localOnly=1' : '';
      const response = await fetch(`/api/hr/legal-entities/${legalEntityId}/person-group${query}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409 && data.code === 'PERSON_GROUP_MISSING_IN_DILOVOD' && !localOnly) {
          setLocalGroupUnlink({ legalEntityId, label });
          return;
        }
        ToastService.show({
          title: data.message || 'Не вдалося видалити папку',
          color: 'danger',
        });
        return;
      }
      setLocalGroupUnlink(null);
      ToastService.show({
        title: localOnly
          ? `Звʼязок із папкою «${label}» скинуто лише в backoffice`
          : `Папку «${label}» видалено`,
        color: 'success',
      });
      await fetchTree({ refreshFullTree: true });
    } finally {
      setDeletingGroupLegalEntityId(null);
    }
  };

  const handleMerge = async () => {
    if (!mergeMainId || mergeCandidates.length < 2 || !mergeFieldSelections) return;
    const sourcePersonIds = mergeCandidates
      .filter((person) => person.id !== mergeMainId)
      .map((person) => person.id);
    setMerging(true);
    try {
      await mergeHrPersonsBatch(mergeMainId, sourcePersonIds, mergeFieldSelections);
      ToastService.show({ title: 'Особи обʼєднано', color: 'success' });
      setMergeSource(null);
      setMergeMainId(null);
      setMergeFieldSelections(null);
      await fetchTree({ refreshFullTree: true });
    } catch (error) {
      ToastService.show({
        title: error instanceof Error ? error.message : 'Не вдалося обʼєднати',
        color: 'danger',
      });
    } finally {
      setMerging(false);
    }
  };

  const handleMoveToGroup = async (person: HrPersonDto, targetGroupId: string) => {
    if (movingPersonId === person.id) return;
    setMovingPersonId(person.id);
    try {
      const response = await fetch(`/api/hr/persons/${person.id}/move-to-group`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetGroupId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: data.message || 'Не вдалося перемістити', color: 'danger' });
        return;
      }
      ToastService.show({ title: 'Особу переміщено', color: 'success' });
      await fetchTree({ refreshFullTree: true });
    } finally {
      setMovingPersonId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Input
            classNames={{
              base: 'min-w-0 max-w-xs flex-1',
              inputWrapper: 'data-[hover=true]:bg-white',
            }}
            placeholder="Пошук за ПІБ, телефоном, ІПН (від 3 символів)"
            value={search}
            isClearable
            onValueChange={setSearch}
            startContent={<DynamicIcon name="search" size={16} className="text-default-400" />}
            autoComplete="off"
          />
          <Switch
            size="sm"
            classNames={{
              base: 'shrink-0',
              wrapper: 'border border-default-50/75 group-data-[selected=false]:bg-default-200',
            }}
            isSelected={duplicatesOnly}
            onValueChange={setDuplicatesOnly}
          >
            Лише дублікати
          </Switch>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <>
              <Dropdown placement="bottom-end">
                <DropdownTrigger>
                  <Button
                    variant="flat"
                    className={`${HR_BTN_NEUTRAL} bg-slate-50!`}
                    startContent={
                      <DynamicIcon
                        name="refresh-cw"
                        size={16}
                        className={`shrink-0 ${syncing ? 'animate-spin' : ''}`}
                      />
                    }
                    endContent={<DynamicIcon name="chevron-down" size={14} className="shrink-0 opacity-60" />}
                    isDisabled={syncing}
                  >
                    Синхронізація з Dilovod
                  </Button>
                </DropdownTrigger>
                <DropdownMenu aria-label="Синхронізація з Dilovod">
                  <DropdownItem
                    key="sync-all"
                    startContent={<DynamicIcon name="cloud-download" size={16} />}
                    onPress={() => void runSync('all')}
                  >
                    Усе (контакти + папки)
                  </DropdownItem>
                  <DropdownItem
                    key="sync-contacts"
                    startContent={<DynamicIcon name="users" size={16} />}
                    onPress={() => void runSync('contacts')}
                  >
                    Лише контакти
                  </DropdownItem>
                  <DropdownItem
                    key="sync-groups"
                    startContent={<DynamicIcon name="folder-sync" size={16} />}
                    onPress={() => void runSync('groups')}
                  >
                    Лише папки
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
              <Button className={HR_BTN_PRIMARY} startContent={<DynamicIcon name="plus" size={16} />} onPress={openCreate}>
                Нова особа
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Card className="shadow-none rounded-lg">
        <CardBody>
          <PersonsTreeTable
            nodes={nodes}
            loading={loading}
            canManage={canManage}
            isSearchMode={isSearchMode}
            searchShowAllFolders={searchShowAllFolders}
            onToggleSearchShowAllFolders={() => void toggleSearchShowAllFolders()}
            expandedIds={expandedIds}
            duplicatesOnly={duplicatesOnly}
            onToggleExpanded={toggleExpanded}
            onCollapseAll={collapseSubtree}
            onEditPerson={openEdit}
            onMergePerson={canManage ? (person) => {
              setMergeSource(person);
              setMergeMainId(person.id);
              setMergeFieldSelections(createDefaultMergeFieldSelections(person.id));
            } : undefined}
            onMovePerson={canManage ? handleMoveToGroup : undefined}
            onContextMenu={canManage ? openContextMenu : undefined}
            onDeleteEmptyGroup={canManage ? (legalEntityId, label) => void handleDeleteEmptyGroup(legalEntityId, label) : undefined}
            deletingGroupLegalEntityId={deletingGroupLegalEntityId}
          />
        </CardBody>
      </Card>

      <PersonsContextMenu
        state={contextMenu}
        canManage={canManage}
        recordSyncing={recordSyncing}
        duplicatesOnly={duplicatesOnly}
        onClose={() => setContextMenu(null)}
        onEditPerson={openEdit}
        onMergePerson={canManage ? (person) => {
          setMergeSource(person);
          setMergeMainId(person.id);
          setMergeFieldSelections(createDefaultMergeFieldSelections(person.id));
        } : undefined}
        onSyncPerson={canManage ? (person) => void handleSyncPersonRecord(person) : undefined}
        onSyncGroup={canManage ? (group) => void handleSyncGroupRecord(group) : undefined}
      />

      <PersonMergeModal
        isOpen={mergeSource != null}
        isLoading={merging}
        candidates={mergeCandidates}
        mainPersonId={mergeMainId}
        fieldSelections={mergeFieldSelections ?? createDefaultMergeFieldSelections(mergeMainId ?? 0)}
        onMainPersonIdChange={setMergeMainId}
        onFieldSelectionsChange={setMergeFieldSelections}
        onClose={() => {
          setMergeSource(null);
          setMergeMainId(null);
          setMergeFieldSelections(null);
        }}
        onConfirm={() => void handleMerge()}
      />

      <PersonDrawer
        isOpen={drawerOpen}
        person={editing}
        canManage={canManage}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => { void fetchTree({ refreshFullTree: true }); }}
      />

      <ConfirmModal
        isOpen={localGroupUnlink != null}
        title="Папки в Dilovod уже немає"
        message={
          localGroupUnlink
            ? `Папку «${localGroupUnlink.label}» у Dilovod не знайдено (можливо, її вже видалили вручну). Скинути лише локальний звʼязок з роботодавцем у backoffice?`
            : ''
        }
        confirmText="Скинути локально"
        confirmColor="warning"
        confirmLoading={deletingGroupLegalEntityId != null}
        onConfirm={() => {
          if (!localGroupUnlink) return;
          void handleDeleteEmptyGroup(localGroupUnlink.legalEntityId, localGroupUnlink.label, true);
        }}
        onCancel={() => setLocalGroupUnlink(null)}
      />
    </div>
  );
}
