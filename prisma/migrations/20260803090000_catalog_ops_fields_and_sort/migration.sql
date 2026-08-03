-- AlterTable catalog_goods: локальні ops-поля + сортування
ALTER TABLE `catalog_goods` ADD COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `catalog_goods` ADD COLUMN `unitRatio` DOUBLE NULL DEFAULT 1;
ALTER TABLE `catalog_goods` ADD COLUMN `stockBalanceByStock` LONGTEXT NULL;

CREATE INDEX `catalog_goods_parentId_sortOrder_idx` ON `catalog_goods`(`parentId`, `sortOrder`);

-- AlterTable catalog_good_components: примітка до рядка BOM
ALTER TABLE `catalog_good_components` ADD COLUMN `note` VARCHAR(512) NULL;

-- Backfill unitRatio / stockBalanceByStock з products за dilovodId
UPDATE `catalog_goods` cg
INNER JOIN `products` p ON p.dilovodId = cg.id
SET
  cg.unitRatio = COALESCE(p.unitRatio, 1),
  cg.stockBalanceByStock = p.stockBalanceByStock
WHERE cg.isGroup = false;

-- Backfill за sku, якщо dilovodId не співпав / порожній
UPDATE `catalog_goods` cg
INNER JOIN `products` p ON p.sku = cg.sku
SET
  cg.unitRatio = COALESCE(cg.unitRatio, p.unitRatio, 1),
  cg.stockBalanceByStock = COALESCE(cg.stockBalanceByStock, p.stockBalanceByStock)
WHERE cg.isGroup = false
  AND cg.sku IS NOT NULL
  AND (p.dilovodId IS NULL OR p.dilovodId = '' OR p.dilovodId <> cg.id);

-- Backfill sortOrder інтервалом 10 у межах parentId (папки першими, далі name)
UPDATE `catalog_goods` cg
INNER JOIN (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(parentId, '')
      ORDER BY isGroup DESC, name ASC, id ASC
    ) AS rn
  FROM `catalog_goods`
) ranked ON ranked.id = cg.id
SET cg.sortOrder = ranked.rn * 10;
