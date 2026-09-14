const MIN_TOKEN_LENGTH = 2;

export function normalizePersonDisplayName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[''`ʼ]/g, "'")
    .replace(/\s+/g, ' ');
}

/** Токени ПІБ (слова від 2 символів) для порівняння дублікатів. */
export function getPersonNameTokens(name: string): string[] {
  const normalized = normalizePersonDisplayName(name);
  if (!normalized) return [];
  return normalized.split(' ').filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

/** Прізвище — перший токен ПІБ (формат «Прізвище Імʼя …»). */
export function getPersonSurnameToken(name: string): string | null {
  const tokens = getPersonNameTokens(name);
  return tokens[0] ?? null;
}

/** Чи достатньо токенів для пошуку дублікатів: обовʼязкове прізвище + ще один токен. */
export function hasPersonNameTokensForDuplicateSearch(name: string): boolean {
  const tokens = getPersonNameTokens(name);
  return tokens.length >= 2;
}

function personNameTokensMatchForDuplicate(tokensA: string[], tokensB: string[]): boolean {
  if (tokensA.length < 2 || tokensB.length < 2) return false;

  const setB = new Set(tokensB);
  const sharedTokens = new Set<string>();
  for (const token of tokensA) {
    if (setB.has(token)) sharedTokens.add(token);
  }
  if (sharedTokens.size < 2) return false;

  // Прізвище (перший токен) кожного запису має входити в спільні токени.
  return sharedTokens.has(tokensA[0]) && sharedTokens.has(tokensB[0]);
}

/**
 * Часткове співпадіння ПІБ: прізвище обох записів у спільних токенах + ще мінімум один збіг.
 */
export function personNamesPartiallyMatch(a: string, b: string): boolean {
  const tokensA = getPersonNameTokens(a);
  const tokensB = getPersonNameTokens(b);
  return personNameTokensMatchForDuplicate(tokensA, tokensB);
}

export interface PersonDuplicateFields {
  id: number;
  displayName: string;
  taxCode?: string | null;
  phone?: string | null;
}

export function personsAreDuplicates(a: PersonDuplicateFields, b: PersonDuplicateFields): boolean {
  if (a.id === b.id) return false;
  if (a.taxCode && b.taxCode && a.taxCode === b.taxCode) return true;
  if (a.phone && b.phone && a.phone === b.phone) return true;
  return personNamesPartiallyMatch(a.displayName, b.displayName);
}

export function findPersonNameDuplicateIds(
  persons: Array<{ id: number; displayName: string }>,
): Set<number> {
  const duplicateIds = new Set<number>();
  const byToken = new Map<string, number[]>();

  for (const person of persons) {
    for (const token of getPersonNameTokens(person.displayName)) {
      const list = byToken.get(token) ?? [];
      list.push(person.id);
      byToken.set(token, list);
    }
  }

  const tokensById = new Map(
    persons.map((person) => [person.id, getPersonNameTokens(person.displayName)]),
  );

  for (const person of persons) {
    const tokens = tokensById.get(person.id) ?? [];
    if (tokens.length < 2) continue;

    const sharedCounts = new Map<number, number>();
    for (const token of tokens) {
      for (const otherId of byToken.get(token) ?? []) {
        if (otherId === person.id) continue;
        sharedCounts.set(otherId, (sharedCounts.get(otherId) ?? 0) + 1);
      }
    }

    for (const [otherId] of sharedCounts) {
      const otherTokens = tokensById.get(otherId) ?? [];
      if (personNameTokensMatchForDuplicate(tokens, otherTokens)) {
        duplicateIds.add(person.id);
        duplicateIds.add(otherId);
      }
    }
  }

  return duplicateIds;
}

/** Усі особи, що входять хоча б в одну групу дублікатів (ІПН, телефон або ПІБ). */
export function findAllPersonDuplicateMatchIds(persons: PersonDuplicateFields[]): Set<number> {
  const duplicateIds = new Set<number>();

  const byTax = new Map<string, number[]>();
  const byPhone = new Map<string, number[]>();
  for (const person of persons) {
    if (person.taxCode) {
      const list = byTax.get(person.taxCode) ?? [];
      list.push(person.id);
      byTax.set(person.taxCode, list);
    }
    if (person.phone) {
      const list = byPhone.get(person.phone) ?? [];
      list.push(person.id);
      byPhone.set(person.phone, list);
    }
  }

  for (const ids of [...byTax.values(), ...byPhone.values()]) {
    if (ids.length > 1) ids.forEach((id) => duplicateIds.add(id));
  }
  for (const id of findPersonNameDuplicateIds(persons)) {
    duplicateIds.add(id);
  }

  return duplicateIds;
}

/** ID для auto-mark duplicate_candidate: зазвичай «пізніший» запис у парі. */
export function findPersonDuplicateCandidateIds(persons: PersonDuplicateFields[]): Set<number> {
  const duplicateIds = new Set<number>();

  const byTax = new Map<string, number[]>();
  const byPhone = new Map<string, number[]>();
  for (const person of persons) {
    if (person.taxCode) {
      const list = byTax.get(person.taxCode) ?? [];
      list.push(person.id);
      byTax.set(person.taxCode, list);
    }
    if (person.phone) {
      const list = byPhone.get(person.phone) ?? [];
      list.push(person.id);
      byPhone.set(person.phone, list);
    }
  }

  for (const ids of [...byTax.values(), ...byPhone.values()]) {
    if (ids.length > 1) ids.slice(1).forEach((id) => duplicateIds.add(id));
  }

  const byToken = new Map<string, number[]>();
  for (const person of persons) {
    for (const token of getPersonNameTokens(person.displayName)) {
      const list = byToken.get(token) ?? [];
      list.push(person.id);
      byToken.set(token, list);
    }
  }
  const tokensById = new Map(
    persons.map((person) => [person.id, getPersonNameTokens(person.displayName)]),
  );
  for (const person of persons) {
    const tokens = tokensById.get(person.id) ?? [];
    if (tokens.length < 2) continue;
    const sharedCounts = new Map<number, number>();
    for (const token of tokens) {
      for (const otherId of byToken.get(token) ?? []) {
        if (otherId === person.id) continue;
        sharedCounts.set(otherId, (sharedCounts.get(otherId) ?? 0) + 1);
      }
    }
    for (const [otherId] of sharedCounts) {
      const otherTokens = tokensById.get(otherId) ?? [];
      if (personNameTokensMatchForDuplicate(tokens, otherTokens)) {
        duplicateIds.add(Math.max(person.id, otherId));
      }
    }
  }

  return duplicateIds;
}

export function findDuplicatesForPerson(
  person: PersonDuplicateFields,
  persons: PersonDuplicateFields[],
): PersonDuplicateFields[] {
  return persons.filter((candidate) => personsAreDuplicates(person, candidate));
}
