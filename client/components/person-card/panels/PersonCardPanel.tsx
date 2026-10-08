import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, DatePicker, Divider } from '@heroui/react';
import { CalendarDate, parseDate, type DateValue } from '@internationalized/date';
import { I18nProvider } from '@react-aria/i18n';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { ToastService } from '@/services/ToastService';
import { formatDateTime } from '@/lib/formatUtils';
import { ContactAddressNotes } from '../fields/ContactAddressNotes';
import { ContactEmailField } from '../fields/ContactEmailField';
import { ContactNameFields } from '../fields/ContactNameFields';
import { ContactPhoneField, normalizePhoneForSave, validatePhoneField } from '../fields/ContactPhoneField';
import { ContactTaxCodeField } from '../fields/ContactTaxCodeField';
import { HrAuditAccordion } from '@/components/hr/HrAuditAccordion';
import { PersonDuplicatesAccordion } from '@/components/hr/PersonDuplicatesAccordion';
import { PersonEmploymentStatusChip } from '@/components/hr/PersonEmploymentStatusChip';
import { PersonStatusChip } from '@/components/hr/PersonStatusChip';
import { resolvePersonEmploymentDisplayStatus } from '@shared/utils/hrPersonEmploymentStatus';
import { PersonMergedAccordion } from '@/components/hr/PersonMergedAccordion';
import { PersonMergeModal } from '@/pages/Hr/components/PersonMergeModal';
import { SpecChip, hrEmployerTokensFromName } from '@/pages/Hr/hrUi';
import { useDebug } from '@/contexts/debug-context';
import { getSpecColorByHue } from '@shared/utils/specColorPalette';
import { hasPersonNameTokensForDuplicateSearch, personsAreDuplicates } from '@shared/utils/hrPersonDuplicate';
import { EMPTY_PERSON_FORM, initialValuesToForm, personToForm, snapshotPersonForm } from './personCardForm';
import { createDefaultMergeFieldSelections } from '@shared/utils/personMergeFields';
import { mergeHrPersonsBatch } from '@/services/hrPersonMerge';
import { personGroupAlignedWithEmployerFromDto } from '@shared/utils/personEmployerGroupAlign';
import { IconActionButton } from '@/components/table/IconActionButton';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { HrPersonDto, HrPersonMergeFieldSelections, HrPersonWritePayload } from '@shared/types/hr';
import type { PersonCardInitialValues } from '../PersonCard.types';

const personGroupTokens = getSpecColorByHue('slate', 'light', 'soft');

function ymdToDateValue(value: string): CalendarDate | null {
  if (!value) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

function dateValueToYmd(value: DateValue | null): string {
  if (!value) return '';
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

function PersonMetaField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-default-500">{label}</span>
      <div className="min-h-7 flex items-center">{children}</div>
    </div>
  );
}

function formAsDuplicateProbe(
  form: HrPersonWritePayload,
  personId?: number,
): { id: number; displayName: string; taxCode: string | null; phone: string | null } {
  return {
    id: personId ?? -1,
    displayName: form.displayName?.trim() ?? '',
    taxCode: form.taxCode?.trim() || null,
    phone: normalizePhoneForSave(form.phone),
  };
}

export interface PersonCardPanelHandle {
  save: () => Promise<void>;
  isBusy: boolean;
}

interface PersonCardPanelProps {
  person?: HrPersonDto | null;
  initialValues?: PersonCardInitialValues;
  canManage?: boolean;
  enableMerge?: boolean;
  syncOnSave?: boolean;
  isOpen: boolean;
  onSaved: (person: HrPersonDto) => void;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export const PersonCardPanel = forwardRef<PersonCardPanelHandle, PersonCardPanelProps>(function PersonCardPanel({
  person = null,
  initialValues,
  canManage = true,
  enableMerge = true,
  syncOnSave = true,
  isOpen,
  onSaved,
  onClose,
  onBusyChange,
  onDirtyChange,
}, ref) {
  const { isDebugMode } = useDebug();
  const isCreate = person == null;
  const [form, setForm] = useState<HrPersonWritePayload>(EMPTY_PERSON_FORM);
  const baselineRef = useRef('');
  const [baselineVersion, setBaselineVersion] = useState(0);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [duplicates, setDuplicates] = useState<HrPersonDto[]>([]);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeMainId, setMergeMainId] = useState<number | null>(null);
  const [mergeFieldSelections, setMergeFieldSelections] = useState<HrPersonMergeFieldSelections | null>(null);
  const [merging, setMerging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);
  const [savedPerson, setSavedPerson] = useState<HrPersonDto | null>(person);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [dismissDate, setDismissDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dismissing, setDismissing] = useState(false);
  const [aligningGroup, setAligningGroup] = useState(false);

  const displayPerson = savedPerson ?? person;

  const employerDisplayName =
    displayPerson?.employerName?.trim()
    || displayPerson?.linkedEmployee?.currentLegalEntityName?.trim()
    || null;

  const personGroupIsAligned = useMemo(() => {
    if (!displayPerson) return true;
    if (displayPerson.personGroupAlignedWithEmployer !== undefined) {
      return displayPerson.personGroupAlignedWithEmployer;
    }
    return personGroupAlignedWithEmployerFromDto(displayPerson);
  }, [displayPerson]);

  const loadDuplicates = useCallback(async () => {
    if (!isOpen) return;

    if (!isCreate && displayPerson) {
      setDuplicatesLoading(true);
      try {
        const response = await fetch(`/api/hr/persons/${displayPerson.id}/duplicates`, { credentials: 'include' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setDuplicates([]);
          return;
        }
        setDuplicates(Array.isArray(data.data) ? data.data as HrPersonDto[] : []);
      } finally {
        setDuplicatesLoading(false);
      }
      return;
    }

    const probe = formAsDuplicateProbe(form);
    if (!probe.displayName || !hasPersonNameTokensForDuplicateSearch(probe.displayName)) {
      setDuplicates([]);
      return;
    }

    setDuplicatesLoading(true);
    try {
      const params = new URLSearchParams({ search: probe.displayName });
      const response = await fetch(`/api/hr/persons?${params}`, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setDuplicates([]);
        return;
      }
      const matches = (Array.isArray(data.data) ? data.data as HrPersonDto[] : [])
        .filter((candidate) => personsAreDuplicates(probe, candidate));
      setDuplicates(matches);
    } finally {
      setDuplicatesLoading(false);
    }
  }, [displayPerson, form, isCreate, isOpen]);

  const commitBaseline = useCallback((nextForm: HrPersonWritePayload) => {
    baselineRef.current = snapshotPersonForm(nextForm);
    setBaselineVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      baselineRef.current = '';
      return;
    }
    const nextForm = person ? personToForm(person) : initialValuesToForm(initialValues);
    setForm(nextForm);
    commitBaseline(nextForm);
    setSavedPerson(person);
    setShowFieldErrors(false);
    setDuplicates([]);
    setMergeOpen(false);
    setMergeMainId(null);
    setMergeFieldSelections(null);
  }, [isOpen, person, initialValues, commitBaseline]);

  const isDirty = useMemo(() => {
    if (!isOpen || !canManage) return false;
    if (!baselineRef.current) return false;
    void baselineVersion;
    return snapshotPersonForm(form) !== baselineRef.current;
  }, [isOpen, canManage, form, baselineVersion]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => { void loadDuplicates(); }, 300);
    return () => window.clearTimeout(timer);
  }, [isOpen, loadDuplicates]);

  const patchForm = (field: keyof HrPersonWritePayload, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const displayNameFieldError = useMemo(() => {
    if (form.displayName?.trim()) return undefined;
    return 'Вкажіть ПІБ / назву контрагента';
  }, [form.displayName]);

  const phoneFieldError = useMemo(() => validatePhoneField(form.phone), [form.phone]);

  const taxCodeFieldError = useMemo(() => {
    const digits = form.taxCode?.replace(/\D/g, '') ?? '';
    if (!digits) return undefined;
    if (digits.length !== 10) return 'ІПН має містити 10 цифр';
    return undefined;
  }, [form.taxCode]);

  const mergeCandidates = useMemo(() => {
    if (!displayPerson) return duplicates;
    return [displayPerson, ...duplicates];
  }, [duplicates, displayPerson]);

  const validateForm = (): string | null => {
    if (!form.displayName?.trim()) return 'Вкажіть ПІБ';
    if (phoneFieldError) return phoneFieldError;
    if (taxCodeFieldError) return taxCodeFieldError;
    return null;
  };

  const handleSave = useCallback(async () => {
    setShowFieldErrors(true);
    const error = validateForm();
    if (error) {
      ToastService.show({ title: error, color: 'danger' });
      throw new Error(error);
    }

    setIsSaving(true);
    try {
      const payload: HrPersonWritePayload = {
        ...form,
        displayName: form.displayName?.trim(),
        taxCode: form.taxCode?.replace(/\D/g, '').slice(0, 10) || null,
        phone: normalizePhoneForSave(form.phone),
        email: form.email?.trim() || null,
        address: form.address?.trim() || null,
        notes: form.notes?.trim() || null,
      };

      const url = isCreate ? '/api/hr/persons' : `/api/hr/persons/${person!.id}`;
      const method = isCreate ? 'POST' : 'PUT';
      const response = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.message || 'Не вдалося зберегти';
        ToastService.show({ title: message, color: 'danger' });
        throw new Error(message);
      }

      const saved = data.data as HrPersonDto;

      if (!isCreate && canManage && syncOnSave) {
        await fetch(`/api/hr/persons/${person!.id}/sync/push`, {
          method: 'POST',
          credentials: 'include',
        });
      }

      ToastService.show({ title: isCreate ? 'Створено' : 'Збережено', color: 'success' });
      setSavedPerson(saved);
      setAuditRefreshKey((prev) => prev + 1);
      onSaved(saved);
      onClose();
    } catch (error) {
      console.error('Error saving person:', error);
      if (!(error instanceof Error)) {
        ToastService.show({ title: 'Не вдалося зберегти', color: 'danger' });
      }
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [canManage, form, isCreate, onClose, onSaved, person, phoneFieldError, syncOnSave, taxCodeFieldError]);

  const handleAlignGroupWithEmployer = useCallback(async () => {
    if (!displayPerson || aligningGroup || !canManage) return;

    setAligningGroup(true);
    try {
      let personForAlign = displayPerson;

      if (!personForAlign.dilovodPersonId) {
        const pushResponse = await fetch(`/api/hr/persons/${displayPerson.id}/sync/push`, {
          method: 'POST',
          credentials: 'include',
        });
        const pushData = await pushResponse.json().catch(() => ({}));
        if (!pushResponse.ok) {
          ToastService.show({
            title: pushData.message || 'Не вдалося створити контакт у Dilovod',
            color: 'danger',
          });
          return;
        }
        personForAlign = pushData.data as HrPersonDto;
        setSavedPerson(personForAlign);
        setAuditRefreshKey((prev) => prev + 1);
      }

      const response = await fetch(`/api/hr/persons/${personForAlign.id}/align-group-with-employer`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({
          title: data.message || 'Не вдалося перемістити в групу',
          color: 'danger',
        });
        return;
      }
      const updated = data.data as HrPersonDto;
      setSavedPerson(updated);
      setAuditRefreshKey((prev) => prev + 1);
      onSaved(updated);
      ToastService.show({
        title: employerDisplayName
          ? `Переміщено в папку «${employerDisplayName}»`
          : 'Переміщено в корінь «Працівники»',
        color: 'success',
      });
    } finally {
      setAligningGroup(false);
    }
  }, [aligningGroup, canManage, displayPerson, employerDisplayName, onSaved]);

  const isBusy = isSaving || merging || aligningGroup;

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  useImperativeHandle(ref, () => ({
    save: handleSave,
    isBusy,
  }), [handleSave, isBusy]);

  const handleMerge = async () => {
    if (!displayPerson || !mergeMainId || mergeCandidates.length < 2 || !mergeFieldSelections) return;
    const sourcePersonIds = mergeCandidates
      .filter((item) => item.id !== mergeMainId)
      .map((item) => item.id);
    setMerging(true);
    try {
      const latestTarget = await mergeHrPersonsBatch(mergeMainId, sourcePersonIds, mergeFieldSelections);
      ToastService.show({ title: 'Особи обʼєднано', color: 'success' });
      setMergeOpen(false);
      setAuditRefreshKey((prev) => prev + 1);
      setSavedPerson(latestTarget);
      onSaved(latestTarget);
      onClose();
    } catch (error) {
      ToastService.show({
        title: error instanceof Error ? error.message : 'Не вдалося обʼєднати',
        color: 'danger',
      });
    } finally {
      setMerging(false);
    }
  };

  const openMergeModal = () => {
    const defaultMainId = displayPerson?.id ?? mergeCandidates[0]?.id ?? null;
    setMergeMainId(defaultMainId);
    if (defaultMainId != null) {
      setMergeFieldSelections(createDefaultMergeFieldSelections(defaultMainId));
    }
    setMergeOpen(true);
  };

  const showUnresolvedDuplicate = isCreate
    ? duplicates.length > 0
    : Boolean(displayPerson?.hasUnresolvedDuplicates || duplicates.length > 0);

  return (
    <div className="flex flex-col min-h-full flex-1 gap-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
          <ContactNameFields
            mode="single"
            displayName={form.displayName ?? ''}
            canManage={canManage}
            showFieldErrors={showFieldErrors}
            displayNameError={displayNameFieldError}
            onDisplayNameChange={(value) => patchForm('displayName', value)}
          />
          <ContactTaxCodeField
            value={form.taxCode ?? ''}
            canManage={canManage}
            showFieldErrors={showFieldErrors}
            error={taxCodeFieldError}
            onChange={(value) => patchForm('taxCode', value)}
          />
        </div>

        <ContactPhoneField
          value={form.phone ?? ''}
          canManage={canManage}
          showFieldErrors={showFieldErrors}
          error={phoneFieldError}
          onChange={(value) => patchForm('phone', value)}
        />
        <ContactEmailField
          value={form.email ?? ''}
          canManage={canManage}
          onChange={(value) => patchForm('email', value)}
        />

        <ContactAddressNotes
          address={form.address ?? ''}
          notes={form.notes ?? ''}
          canManage={canManage}
          onAddressChange={(value) => patchForm('address', value)}
          onNotesChange={(value) => patchForm('notes', value)}
        />
      </div>

      {!isCreate && displayPerson ? (
        <div className="space-y-3 pt-4 border-t border-default-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PersonMetaField label="Роботодавець">
              {displayPerson.employerName || displayPerson.linkedEmployee?.currentLegalEntityName ? (
                <SpecChip
                  tokens={hrEmployerTokensFromName(
                    displayPerson.employerName || displayPerson.linkedEmployee?.currentLegalEntityName,
                  )}
                  rounded="sm"
                >
                  {displayPerson.employerName || displayPerson.linkedEmployee?.currentLegalEntityName}
                </SpecChip>
              ) : (
                <span className="text-sm text-default-400">Не обрано</span>
              )}
            </PersonMetaField>
            <PersonMetaField label="Група">
              {displayPerson.personGroupLabel ? (
                <SpecChip tokens={personGroupTokens} rounded="sm">
                  {displayPerson.personGroupLabel}
                </SpecChip>
              ) : (
                <span className="text-sm text-default-400">—</span>
              )}
              {canManage && !personGroupIsAligned ? (
                <IconActionButton
                  icon="folder-sync"
                  isLoading={aligningGroup}
                  label={
                    !displayPerson.dilovodPersonId
                      ? 'Створити в Dilovod і перемістити в потрібну папку'
                      : employerDisplayName
                        ? `Перемістити в папку роботодавця «${employerDisplayName}»`
                        : 'Перемістити в корінь «Працівники»'
                  }
                  onPress={() => void handleAlignGroupWithEmployer()}
                />
              ) : null}
            </PersonMetaField>
            <PersonMetaField label="Статус працівника">
              {displayPerson.linkedEmployee ? (
                <PersonEmploymentStatusChip person={displayPerson} emptyClassName="text-sm text-default-400" rounded="sm" />
              ) : (
                <span className="text-sm text-default-400">Не привʼязано</span>
              )}
            </PersonMetaField>
          </div>

          {displayPerson.dilovodCode ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <PersonMetaField
                label="Код в Dilovod"
                children={<span className="inline-flex items-center gap-1 text-sm">{displayPerson.dilovodCode}</span>}
              />
              {isDebugMode && displayPerson.dilovodPersonTypeId ? (
                <PersonMetaField
                  label="ID в Dilovod"
                  children={<span className="inline-flex items-center gap-1 text-sm">{displayPerson.dilovodPersonTypeId}</span>}
                />
              ) : null}
            </div>
          ) : null}

          {canManage && resolvePersonEmploymentDisplayStatus(displayPerson) === 'active' ? (
            <div className="flex flex-wrap items-center gap-3 mt-6">
              <Button
                color="danger"
                variant="flat"
                onPress={() => setDismissOpen(true)}
                startContent={<DynamicIcon name="user-round-minus" size={16} />}
              >
                Звільнити співробітника
              </Button>
            </div>
          ) : null}

          {showUnresolvedDuplicate ? (
            <PersonDuplicatesAccordion
              duplicates={duplicates}
              loading={duplicatesLoading}
              canMerge={canManage && enableMerge}
              onMerge={openMergeModal}
            />
          ) : null}

          <PersonMergedAccordion
            personId={displayPerson.id}
            mergedCount={displayPerson.mergedCount}
            refreshKey={auditRefreshKey}
          />
          
          <Divider className="bg-default-200"/>

          {displayPerson.lastSyncedAt ? (
            <p className="text-xs text-default-400 my-2">
              Синхронізовано: {formatDateTime(displayPerson.lastSyncedAt)}
            </p>
          ) : null}
        </div>
      ) : showUnresolvedDuplicate ? (
        <div className="space-y-2 pt-4 border-t border-default-200">
          <PersonMetaField label="Статус особи">
            <PersonStatusChip
              person={{
                id: -1,
                displayName: form.displayName ?? '',
                dilovodPersonId: null,
                dilovodCode: null,
                taxCode: null,
                phone: null,
                email: null,
                address: null,
                dilovodParentId: null,
                dilovodPersonTypeId: null,
                dilovodStateId: null,
                isDeletedInDilovod: false,
                localStatus: 'active',
                canonicalPersonId: null,
                duplicateOfId: null,
                notes: null,
                lastSyncedAt: null,
                mergedCount: 0,
                hasUnresolvedDuplicates: true,
              }}
              rounded="sm"
            />
          </PersonMetaField>
          {duplicates.length > 0 ? (
            <ul className="space-y-1.5">
              {duplicates.map((duplicate) => (
                <li key={duplicate.id} className="text-sm text-default-500">
                  {duplicate.displayName}
                  {duplicate.taxCode ? ` · ІПН ${duplicate.taxCode}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <HrAuditAccordion
        className="mt-auto pt-6"
        entityType="person"
        entityId={displayPerson.id}
        refreshKey={auditRefreshKey}
      />

      <PersonMergeModal
        isOpen={mergeOpen}
        isLoading={merging}
        candidates={mergeCandidates}
        mainPersonId={mergeMainId}
        fieldSelections={mergeFieldSelections ?? createDefaultMergeFieldSelections(mergeMainId ?? 0)}
        onMainPersonIdChange={setMergeMainId}
        onFieldSelectionsChange={setMergeFieldSelections}
        onClose={() => setMergeOpen(false)}
        onConfirm={() => void handleMerge()}
      />

      <ConfirmModal
        isOpen={dismissOpen}
        title="Звільнити працівника?"
        overlayZClassName="z-[2000]"
        message={
          displayPerson ? (
            <div className="space-y-4">
              <p>
                Підтвердьте звільнення «{displayPerson.displayName}». Особа буде переміщена в групу
                «Звільнені працівники», статус співробітника стане неактивним, а зайнятості буде закрито.
              </p>
              <I18nProvider locale="uk-UA">
                <DatePicker
                  label="Дата звільнення"
                  value={ymdToDateValue(dismissDate)}
                  onChange={(date) => setDismissDate(dateValueToYmd(date))}
                  showMonthAndYearPickers
                  isRequired={true}
                  granularity="day"
                  selectorButtonPlacement="end"
                  className="max-w-2xs"
                  classNames={{
                    segment: 'rounded',
                    label: 'text-xs font-medium',
                  }}
                />
              </I18nProvider>
            </div>
          ) : ''
        }
        confirmText="Звільнити"
        cancelText="Скасувати"
        confirmColor="danger"
        confirmLoading={dismissing}
        onConfirm={async () => {
          if (!displayPerson || dismissing) return;
          setDismissing(true);
          try {
            const response = await fetch(`/api/hr/persons/${displayPerson.id}/dismiss`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dismissedAt: dismissDate }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              ToastService.show({ title: data.message || 'Не вдалося звільнити', color: 'danger' });
              return;
            }
            const updated = data.data as HrPersonDto;
            setSavedPerson(updated);
            setAuditRefreshKey((prev) => prev + 1);
            onSaved(updated);
            ToastService.show({ title: 'Працівника звільнено', color: 'success' });
            setDismissOpen(false);
          } finally {
            setDismissing(false);
          }
        }}
        onCancel={() => {
          if (dismissing) return;
          setDismissOpen(false);
        }}
      />

    </div>
  );
});
