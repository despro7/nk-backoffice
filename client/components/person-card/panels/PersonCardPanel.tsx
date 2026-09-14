import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { ToastService } from '@/services/ToastService';
import { formatDateTime } from '@/lib/formatUtils';
import { ContactAddressNotes } from '../fields/ContactAddressNotes';
import { ContactEmailField } from '../fields/ContactEmailField';
import { ContactNameFields } from '../fields/ContactNameFields';
import { ContactPhoneField, normalizePhoneForSave, validatePhoneField } from '../fields/ContactPhoneField';
import { ContactTaxCodeField } from '../fields/ContactTaxCodeField';
import { HrAuditAccordion } from '@/components/hr/HrAuditAccordion';
import { PersonDuplicatesAccordion } from '@/components/hr/PersonDuplicatesAccordion';
import { PersonMergedAccordion } from '@/components/hr/PersonMergedAccordion';
import { PersonStatusChip } from '@/components/hr/PersonStatusChip';
import { PersonMergeModal } from '@/pages/Hr/components/PersonMergeModal';
import { hasPersonNameTokensForDuplicateSearch, personsAreDuplicates } from '@shared/utils/hrPersonDuplicate';
import type { HrPersonDto, HrPersonWritePayload } from '@shared/types/hr';
import type { PersonCardInitialValues } from '../PersonCard.types';
import { EMPTY_PERSON_FORM, initialValuesToForm, personToForm, snapshotPersonForm } from './personCardForm';

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
  const isCreate = person == null;
  const [form, setForm] = useState<HrPersonWritePayload>(EMPTY_PERSON_FORM);
  const baselineRef = useRef('');
  const [baselineVersion, setBaselineVersion] = useState(0);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [duplicates, setDuplicates] = useState<HrPersonDto[]>([]);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeMainId, setMergeMainId] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);
  const [savedPerson, setSavedPerson] = useState<HrPersonDto | null>(person);

  const displayPerson = savedPerson ?? person;

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

  const isBusy = isSaving || merging;

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  useImperativeHandle(ref, () => ({
    save: handleSave,
    isBusy,
  }), [handleSave, isBusy]);

  const handleMerge = async () => {
    if (!displayPerson || !mergeMainId || mergeCandidates.length < 2) return;
    const sources = mergeCandidates.filter((item) => item.id !== mergeMainId);
    setMerging(true);
    try {
      let latestTarget: HrPersonDto | null = null;
      for (const source of sources) {
        const response = await fetch(`/api/hr/persons/${source.id}/merge`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetPersonId: mergeMainId }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          ToastService.show({ title: data.message || 'Не вдалося обʼєднати', color: 'danger' });
          return;
        }
        latestTarget = data.data as HrPersonDto;
      }
      ToastService.show({ title: 'Особи обʼєднано', color: 'success' });
      setMergeOpen(false);
      setAuditRefreshKey((prev) => prev + 1);
      if (latestTarget) {
        setSavedPerson(latestTarget);
        onSaved(latestTarget);
      }
      onClose();
    } finally {
      setMerging(false);
    }
  };

  const openMergeModal = () => {
    setMergeMainId(displayPerson?.id ?? mergeCandidates[0]?.id ?? null);
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
        <div className="space-y-3 pt-4 border-t border-border-subtle">
          <div className="flex flex-wrap items-center gap-2">
            <PersonStatusChip person={displayPerson} />
            {displayPerson.dilovodCode ? (
              <span className="text-xs font-mono text-text-secondary" title="Код контрагента в Dilovod">
                #{displayPerson.dilovodCode} (dilovod_id: {displayPerson.dilovodPersonTypeId})
              </span>
            ) : null}
          </div>

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

          <HrAuditAccordion
            className="mt-auto pt-6"
            entityType="person"
            entityId={displayPerson.id}
            refreshKey={auditRefreshKey}
          />

          {displayPerson.lastSyncedAt ? (
            <p className="text-xs text-text-secondary">
              Синхронізовано: {formatDateTime(displayPerson.lastSyncedAt)}
            </p>
          ) : null}
        </div>
      ) : showUnresolvedDuplicate ? (
        <div className="space-y-2 pt-4 border-t border-border-subtle">
          <PersonStatusChip person={{
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
            isDuplicateCandidate: true,
            mergedCount: 0,
            hasUnresolvedDuplicates: true,
          }} />
          {duplicates.length > 0 ? (
            <ul className="space-y-1.5">
              {duplicates.map((duplicate) => (
                <li key={duplicate.id} className="text-sm text-text-secondary">
                  {duplicate.displayName}
                  {duplicate.taxCode ? ` · ІПН ${duplicate.taxCode}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <PersonMergeModal
        isOpen={mergeOpen}
        isLoading={merging}
        variant="radio"
        candidates={mergeCandidates}
        selectedId={mergeMainId}
        currentPersonId={displayPerson?.id ?? null}
        onSelectedIdChange={setMergeMainId}
        onClose={() => setMergeOpen(false)}
        onConfirm={() => void handleMerge()}
      />

    </div>
  );
});
