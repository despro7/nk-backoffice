import { useEffect, useMemo } from 'react';
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
import { SpecChip, hrEmployerTokensFromName } from '@/pages/Hr/hrUi';
import { PersonEmploymentStatusChip } from '@/components/hr/PersonEmploymentStatusChip';
import { BTN_PRIMARY_BLUE } from '@/lib/buttonStyles';
import { getSpecColorByHue, specColorToClassNames } from '@shared/utils/specColorPalette';
import type { HrPersonDto, HrPersonMergeFieldSelections } from '@shared/types/hr';
import {
  HR_PERSON_MERGE_FIELD_LABELS,
  HR_PERSON_MERGE_PICKABLE_FIELDS,
  createDefaultMergeFieldSelections,
  getPersonMergeFieldDisplayValue,
} from '@shared/utils/personMergeFields';
import type { HrPersonMergePickableField } from '@shared/types/hr';

const personGroupTokens = getSpecColorByHue('slate', 'light', 'soft');
const mainColumnTokens = getSpecColorByHue('blue', 'light', 'soft');

const MERGE_TABLE_LABEL_COL_WIDTH = '9rem';
const mergeTableLabelCellClass =
  'w-36 max-w-36 min-w-36 px-3 py-3 align-top border-r border-default-200';
const mergeTableDataCellClass =
  'px-3 py-2 align-top border-r border-default-200 last:border-r-0';

function MergeFieldValue({
  person,
  field,
}: {
  person: HrPersonDto;
  field: HrPersonMergePickableField;
}) {
  const value = getPersonMergeFieldDisplayValue(person, field);
  if (!value) {
    return <span className="text-default-400">—</span>;
  }

  if (field === 'employer') {
    return (
      <SpecChip tokens={hrEmployerTokensFromName(value)} rounded="sm">
        {value}
      </SpecChip>
    );
  }
  if (field === 'personGroup') {
    return (
      <SpecChip tokens={personGroupTokens} rounded="sm">
        {value}
      </SpecChip>
    );
  }
  if (field === 'employeeStatus') {
    return <PersonEmploymentStatusChip person={person} emptyClassName="text-default-400" rounded="sm" />;
  }

  return <span className="text-sm text-default-700 break-words">{value}</span>;
}

interface PersonMergeModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  candidates: HrPersonDto[];
  mainPersonId: number | null;
  fieldSelections: HrPersonMergeFieldSelections;
  onMainPersonIdChange: (id: number | null) => void;
  onFieldSelectionsChange: (selections: HrPersonMergeFieldSelections) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function PersonMergeModal({
  isOpen,
  isLoading = false,
  candidates,
  mainPersonId,
  fieldSelections,
  onMainPersonIdChange,
  onFieldSelectionsChange,
  onClose,
  onConfirm,
}: PersonMergeModalProps) {
  const handleClose = () => {
    if (isLoading) return;
    onClose();
  };

  const canConfirm = mainPersonId != null && candidates.length >= 2;

  const candidateIdsKey = useMemo(
    () => candidates.map((item) => item.id).join(','),
    [candidates],
  );

  useEffect(() => {
    if (!isOpen || mainPersonId == null) return;
    onFieldSelectionsChange(createDefaultMergeFieldSelections(mainPersonId));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- скидаємо вибір полів лише при зміні основного запису або складу кандидатів
  }, [isOpen, mainPersonId, candidateIdsKey]);

  const setFieldSource = (field: HrPersonMergePickableField, personId: number) => {
    onFieldSelectionsChange({ ...fieldSelections, [field]: personId });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="4xl"
      scrollBehavior="inside"
      classNames={{ wrapper: '!z-[70]' }}
    >
      <ModalContent>
        <ModalHeader>Обʼєднати особи</ModalHeader>
        <ModalBody className="gap-5">
          <p className="text-sm text-default-500">
            Оберіть основний запис і значення полів, які залишаться після обʼєднання. Інші особи будуть позначені як дублікати,
            привʼязки співробітників перенесуться до основного запису, а відкинуті контакти перемістяться в Dilovod у папку «Дублікати контактів».
          </p>

          <div className="space-y-2">
            <p className="text-sm font-medium text-default-700">Основний запис і значення полів після обʼєднання</p>
            <div className="overflow-x-auto rounded-lg border border-default-200">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col style={{ width: MERGE_TABLE_LABEL_COL_WIDTH }} />
                  {candidates.map((candidate) => (
                    <col key={candidate.id} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="bg-default-50 text-left">
                    <th className={`${mergeTableLabelCellClass} font-medium text-xs`}>
                      Основний контакт
                    </th>
                    {candidates.map((candidate) => {
                      const isMain = mainPersonId === candidate.id;
                      return (
                        <th
                          key={candidate.id}
                          className={`${mergeTableDataCellClass} font-medium align-top ${isMain ? specColorToClassNames(mainColumnTokens, { border: false }) : ''}`}
                        >
                          <label className="flex cursor-pointer flex-col gap-1.5">
                            <span className="flex items-start gap-2">
                              <input
                                type="radio"
                                name="merge-main-person"
                                className="mt-0.5 shrink-0"
                                checked={isMain}
                                onChange={() => onMainPersonIdChange(candidate.id)}
                                disabled={isLoading}
                                aria-label={`Основний запис: ${candidate.displayName}`}
                              />
                              <span className={`line-clamp-3 text-left ${isMain ? 'font-semibold text-default-800' : 'text-default-600'}`}>
                                {candidate.displayName}
                              </span>
                            </span>
                          </label>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {HR_PERSON_MERGE_PICKABLE_FIELDS.map((field) => (
                    <tr key={field} className="border-t border-default-100">
                      <td className={`${mergeTableLabelCellClass} text-default-600 font-medium text-xs`}>
                        {HR_PERSON_MERGE_FIELD_LABELS[field]}
                      </td>
                      {candidates.map((candidate) => (
                        <td key={`${field}-${candidate.id}`} className={mergeTableDataCellClass}>
                          <label className="flex cursor-pointer gap-2 items-start">
                            <input
                              type="radio"
                              name={`merge-field-${field}`}
                              className="mt-1 shrink-0"
                              checked={fieldSelections[field] === candidate.id}
                              onChange={() => setFieldSource(field, candidate.id)}
                              disabled={isLoading}
                            />
                            <MergeFieldValue person={candidate} field={field} />
                          </label>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={handleClose} isDisabled={isLoading}>
            Скасувати
          </Button>
          <Button
            className={BTN_PRIMARY_BLUE}
            isLoading={isLoading}
            isDisabled={!canConfirm}
            onPress={onConfirm}
          >
            Обʼєднати
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
