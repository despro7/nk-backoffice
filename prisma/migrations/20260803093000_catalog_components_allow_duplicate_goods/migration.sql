-- Дозволити кілька рядків одного інгредієнта в BOM (як Dilovod tpGoods).
-- Унікальність: (parentGoodId, rowNum) замість (parentGoodId, componentGoodId).

-- Нормалізуємо rowNum перед новим unique (уникнути колізій rowNum=0 / дублікатів)
UPDATE `catalog_good_components` AS `c`
INNER JOIN (
  SELECT
    `id`,
    ROW_NUMBER() OVER (
      PARTITION BY `parentGoodId`
      ORDER BY `rowNum` ASC, `id` ASC
    ) AS `rn`
  FROM `catalog_good_components`
) AS `t` ON `c`.`id` = `t`.`id`
SET `c`.`rowNum` = `t`.`rn`;

DROP INDEX `catalog_good_components_parentGoodId_componentGoodId_key` ON `catalog_good_components`;

CREATE UNIQUE INDEX `catalog_good_components_parentGoodId_rowNum_key` ON `catalog_good_components`(`parentGoodId`, `rowNum`);
