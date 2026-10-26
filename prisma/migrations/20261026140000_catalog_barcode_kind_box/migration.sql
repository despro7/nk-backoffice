-- ШК коробки (NK) vs порції (Dilovod) для мобільного скану
ALTER TABLE `catalog_good_barcodes`
  ADD COLUMN `barcodeKind` VARCHAR(16) NOT NULL DEFAULT 'portion' AFTER `goodPartName`;

CREATE INDEX `catalog_good_barcodes_good_part_kind_idx`
  ON `catalog_good_barcodes` (`goodId`, `goodPart`, `barcodeKind`);
