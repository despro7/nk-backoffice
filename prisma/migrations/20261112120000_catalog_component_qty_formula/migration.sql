-- Techcards phase 2c: derived quantity of a spec row (local only): batch qty = k * source net kg + b.
ALTER TABLE `catalog_good_components` ADD COLUMN `qtyFormulaJson` JSON NULL AFTER `rowKey`;
