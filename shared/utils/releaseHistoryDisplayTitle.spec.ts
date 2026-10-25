import { describe, expect, it } from 'vitest';
import {
  formatReleaseAuditAccordionTitle,
  formatReleaseHistoryDetailsHeading,
  formatReleaseHistoryDocTrail,
  formatReleaseHistoryLayerTitle,
  formatReleaseHistoryPrimaryTitle,
  parseReleaseHistoryPrimaryTitleParts,
} from './releaseHistoryDisplayTitle.js';

describe('releaseHistoryDisplayTitle', () => {
  it('formatReleaseHistoryDocTrail', () => {
    expect(formatReleaseHistoryDocTrail([])).toBeNull();
    expect(formatReleaseHistoryDocTrail(['K-000450'])).toBe('№450');
    expect(formatReleaseHistoryDocTrail(['K-000450', 'K-000452'])).toBe('№450/452');
  });

  it('formatReleaseHistoryPrimaryTitle', () => {
    expect(formatReleaseHistoryPrimaryTitle({ operationLabel: 'Комплектування' })).toBe('Комплектування');
    expect(formatReleaseHistoryPrimaryTitle({
      operationLabel: 'Комплектування',
      primaryDocNumber: 'K-000450',
    })).toBe('Комплектування №450');
    expect(formatReleaseHistoryPrimaryTitle({
      operationLabel: 'Коригування',
      docTrail: 'K-000450 → K-000452',
    })).toBe('Коригування №450/452');
  });

  it('parseReleaseHistoryPrimaryTitleParts', () => {
    expect(parseReleaseHistoryPrimaryTitleParts('Комплектування №450')).toEqual({
      label: 'Комплектування',
      docPrefix: '№450',
    });
  });

  it('formatReleaseHistoryLayerTitle', () => {
    expect(formatReleaseHistoryLayerTitle({
      operationLabel: 'Комплектування',
      docNumber: 'K-000450',
      stepPrefix: 'Крок 1 · ',
    })).toBe('Крок 1 · Комплектування №450');
  });

  it('formatReleaseHistoryDetailsHeading', () => {
    expect(formatReleaseHistoryDetailsHeading({ kind: 'operation', operationDocNumber: 'K-000451' }))
      .toBe('Деталі операції №451');
    expect(formatReleaseHistoryDetailsHeading({ kind: 'kit', operationDocNumber: 'K-000451' }))
      .toBe('Деталі комплектування №451');
    expect(formatReleaseHistoryDetailsHeading({ kind: 'unkit', operationDocNumber: 'K-000452' }))
      .toBe('Деталі розукомплектування №452');
    expect(formatReleaseHistoryDetailsHeading({
      kind: 'correction',
      docTrail: 'K-000450 → K-000452',
    })).toBe('Деталі коригування №450/452');
  });

  it('formatReleaseAuditAccordionTitle', () => {
    expect(formatReleaseAuditAccordionTitle('K-000498')).toBe('Історія змін №498');
  });
});
