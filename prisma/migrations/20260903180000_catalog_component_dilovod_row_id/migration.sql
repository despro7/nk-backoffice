-- Dilovod tpGoods.rowID для стабільного update BOM
ALTER TABLE `catalog_good_components`
  ADD COLUMN `dilovodRowId` VARCHAR(32) NULL AFTER `rowNum`;
