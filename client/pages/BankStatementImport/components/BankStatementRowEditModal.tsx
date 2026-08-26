import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Textarea,
} from '@heroui/react';
import type { BankStatementRow } from '@shared/types/bankStatement';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';
import { DilovodDictAutocomplete } from './DilovodDictAutocomplete';
import { DilovodDictSelect } from './DilovodDictSelect';

interface BankStatementRowEditModalProps {
  row: BankStatementRow | null;
  onClose: () => void;
  onSave: (rowIndex: number, patch: Partial<BankStatementRow>) => void;
}

function isoToCalendarDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function BankStatementRowEditModal({ row, onClose, onSave }: BankStatementRowEditModalProps) {
  const { directories, loadDirectories } = useDilovodDirectories();
  const [operationNumber, setOperationNumber] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [correspondentName, setCorrespondentName] = useState('');
  const [correspondentIban, setCorrespondentIban] = useState('');
  const [edrpou, setEdrpou] = useState('');
  const [purpose, setPurpose] = useState('');
  const [amount, setAmount] = useState('');
  const [corAccount, setCorAccount] = useState('');
  const [settlementsKind, setSettlementsKind] = useState('');
  const [cashItem, setCashItem] = useState('');

  useEffect(() => {
    void loadDirectories();
  }, [loadDirectories]);

  useEffect(() => {
    if (!row) return;
    setOperationNumber(row.operationNumber);
    setDateStr(isoToCalendarDate(row.operationDate));
    setCorrespondentName(row.correspondentName);
    setCorrespondentIban(row.correspondentIban);
    setEdrpou(row.edrpou);
    setPurpose(row.purpose);
    setAmount(String(row.amount));
    setCorAccount(row.corAccount ?? '');
    setSettlementsKind(row.settlementsKind ?? '');
    setCashItem(row.cashItem ?? '');
  }, [row]);

  const ledgerAccounts = useMemo(
    () => (directories?.ledgerAccounts ?? []).filter((a) => a.id),
    [directories],
  );
  const settlementsKinds = useMemo(
    () => (directories?.settlementsKinds ?? []).filter((k) => k.id),
    [directories],
  );
  const cashItems = useMemo(
    () => (directories?.cashItems ?? []).filter((item) => item.id),
    [directories],
  );

  if (!row) return null;

  const handleSave = () => {
    const parsedAmount = Number(String(amount).replace(',', '.'));
    onSave(row.rowIndex, {
      operationNumber: operationNumber.trim(),
      operationDate: dateStr ? new Date(`${dateStr}T12:00:00`).toISOString() : row.operationDate,
      correspondentName: correspondentName.trim(),
      correspondentIban: correspondentIban.trim(),
      edrpou: edrpou.trim(),
      purpose: purpose.trim(),
      amount: Number.isFinite(parsedAmount) ? parsedAmount : row.amount,
      corAccount: corAccount.trim(),
      settlementsKind: settlementsKind.trim(),
      cashItem: cashItem.trim(),
    });
    onClose();
  };

  return (
    <Modal isOpen={Boolean(row)} onClose={onClose} size="lg">
      <ModalContent>
        <ModalHeader>Редагувати операцію</ModalHeader>
        <ModalBody className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="№ операції"
            size="sm"
            value={operationNumber}
            onValueChange={setOperationNumber}
          />
          <Input
            label="Дата"
            size="sm"
            type="date"
            value={dateStr}
            onValueChange={setDateStr}
          />
          <Input
            label="Сума"
            size="sm"
            value={amount}
            onValueChange={setAmount}
          />
          <Input
            label="ЄДРПОУ"
            size="sm"
            value={edrpou}
            onValueChange={setEdrpou}
          />
          <Input
            className="sm:col-span-2"
            label="Кореспондент"
            size="sm"
            value={correspondentName}
            onValueChange={setCorrespondentName}
          />
          <Input
            className="sm:col-span-2"
            label="IBAN"
            size="sm"
            value={correspondentIban}
            onValueChange={setCorrespondentIban}
          />
          <DilovodDictAutocomplete
            className="sm:col-span-2"
            label="Кор. рахунок (corAccount)"
            placeholder="Оберіть рахунок з плану Dilovod"
            dictItems={ledgerAccounts}
            selectedKey={corAccount}
            isClearable
            showParent
            onChange={setCorAccount}
          />
          <DilovodDictAutocomplete
            className="sm:col-span-2"
            label="Вид розрахунків"
            placeholder="Оберіть вид розрахунків Dilovod"
            dictItems={settlementsKinds}
            selectedKey={settlementsKind}
            isClearable
            onChange={setSettlementsKind}
          />
          <DilovodDictSelect
            className="sm:col-span-2"
            label="Стаття руху (cashItem)"
            placeholder="Оберіть статтю руху Dilovod"
            dictItems={cashItems}
            selectedKey={cashItem}
            isClearable
            onChange={setCashItem}
          />
          <Textarea
            className="sm:col-span-2"
            label="Призначення"
            size="sm"
            minRows={2}
            value={purpose}
            onValueChange={setPurpose}
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>Скасувати</Button>
          <Button color="primary" onPress={handleSave}>Зберегти</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
