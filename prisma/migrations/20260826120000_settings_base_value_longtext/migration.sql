-- План рахунків Dilovod (~300+ записів) не вміщається в TEXT (64KB)
ALTER TABLE `settings_base` MODIFY `value` LONGTEXT NOT NULL;
