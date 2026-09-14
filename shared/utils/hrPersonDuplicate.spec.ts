import { describe, expect, it } from 'vitest';
import {
  findAllPersonDuplicateMatchIds,
  findPersonNameDuplicateIds,
  findPersonDuplicateCandidateIds,
  getPersonNameTokens,
  getPersonSurnameToken,
  hasPersonNameTokensForDuplicateSearch,
  personNamesPartiallyMatch,
  personsAreDuplicates,
} from './hrPersonDuplicate.js';

describe('getPersonNameTokens', () => {
  it('extracts name tokens', () => {
    expect(getPersonNameTokens('Іванов Іван Іванович')).toEqual(['іванов', 'іван', 'іванович']);
  });
});

describe('getPersonSurnameToken', () => {
  it('returns first token as surname', () => {
    expect(getPersonSurnameToken('Іванов Іван')).toBe('іванов');
    expect(getPersonSurnameToken('Іван')).toBe('іван');
    expect(getPersonSurnameToken('')).toBeNull();
  });
});

describe('hasPersonNameTokensForDuplicateSearch', () => {
  it('requires surname and at least one more token', () => {
    expect(hasPersonNameTokensForDuplicateSearch('Іванов Іван')).toBe(true);
    expect(hasPersonNameTokensForDuplicateSearch('Іванов')).toBe(false);
    expect(hasPersonNameTokensForDuplicateSearch('Іван')).toBe(false);
    expect(hasPersonNameTokensForDuplicateSearch('Іванов І')).toBe(false);
  });
});

describe('personNamesPartiallyMatch', () => {
  it('matches when at least two tokens overlap', () => {
    expect(personNamesPartiallyMatch('Іванов Іван', 'Іван Іванов')).toBe(true);
    expect(personNamesPartiallyMatch('Петренко Олена', 'Олена Петренко Василівна')).toBe(true);
  });

  it('does not match single-token or unrelated names', () => {
    expect(personNamesPartiallyMatch('Іванов', 'Іванов Іван')).toBe(false);
    expect(personNamesPartiallyMatch('Іванов Іван', 'Петренко Олена')).toBe(false);
  });

  it('does not match when leading surname token is not shared', () => {
    expect(personNamesPartiallyMatch('Іванов Іван', 'Сидоров Іван Іванов')).toBe(false);
  });
});

describe('personsAreDuplicates', () => {
  it('matches by tax code and partial name', () => {
    expect(personsAreDuplicates(
      { id: 1, displayName: 'A B', taxCode: '1234567890' },
      { id: 2, displayName: 'C D', taxCode: '1234567890' },
    )).toBe(true);
    expect(personsAreDuplicates(
      { id: 1, displayName: 'Іванов Іван' },
      { id: 2, displayName: 'Іван Іванов' },
    )).toBe(true);
  });
});

describe('findPersonNameDuplicateIds', () => {
  it('marks both ids for partial name match', () => {
    const ids = findPersonNameDuplicateIds([
      { id: 1, displayName: 'Іванов Іван' },
      { id: 2, displayName: 'Іван Іванов' },
      { id: 3, displayName: 'Петренко Олена' },
    ]);
    expect(ids.has(1)).toBe(true);
    expect(ids.has(2)).toBe(true);
    expect(ids.has(3)).toBe(false);
  });
});

describe('findAllPersonDuplicateMatchIds', () => {
  it('includes both sides of duplicate groups', () => {
    const ids = findAllPersonDuplicateMatchIds([
      { id: 1, displayName: 'Іванов Іван', taxCode: null, phone: null },
      { id: 2, displayName: 'Іван Іванов', taxCode: null, phone: null },
      { id: 3, displayName: 'Петренко Олена', taxCode: '1111111111', phone: null },
      { id: 4, displayName: 'Інша', taxCode: '1111111111', phone: null },
    ]);
    expect(ids.has(1)).toBe(true);
    expect(ids.has(2)).toBe(true);
    expect(ids.has(3)).toBe(true);
    expect(ids.has(4)).toBe(true);
  });
});

describe('findPersonDuplicateCandidateIds', () => {
  it('marks later id for auto-status', () => {
    const ids = findPersonDuplicateCandidateIds([
      { id: 1, displayName: 'Іванов Іван' },
      { id: 2, displayName: 'Іван Іванов' },
    ]);
    expect(ids.has(2)).toBe(true);
    expect(ids.has(1)).toBe(false);
  });
});
