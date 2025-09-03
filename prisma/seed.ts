import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import chalk from "chalk";

const prisma = new PrismaClient();
const doCreateUser = false;

async function main() {
  (doCreateUser) && (async () => {
    const name = "Марк";
    const email = "mark@example.com";
    const rawPassword = "123456789";
    const role = "storekeeper";
    const roleName = "Комірник";

    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const existingUser = await prisma.user.findUnique({
      where: {
        email: email,
      },
    });

    if (!existingUser) {
      const user = await prisma.user.create({
        data: {
          email: email,
          name: name,
          role: role,
          roleName: roleName,
          password: passwordHash,
        },
      });

      console.log(chalk.green(`Пользователь с именем ${user.name} создан!`));
      console.log("Email:", user.email, "\nПароль:", rawPassword, "\n");
    } else {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: name,
          roleName: roleName,
          password: passwordHash,
        },
      });
      console.log(chalk.yellow(`Пользователь с именем ${existingUser.name} обновлен!`));
      console.log("Email:", existingUser.email, "\nПароль:", rawPassword, "\n");
    }
  })();

  // Заполняем настройки коробок
  // console.log(chalk.blue("Заполняем настройки коробок..."));
  
  // Заполняем настройки погрешностей веса
  console.log(chalk.blue("Заполняем настройки погрешностей веса..."));
  
  // Создаем или обновляем настройки толерантности веса
  const weightToleranceSettings = [
    {
      key: 'weight_tolerance_percentage',
      value: '5',
      description: 'Допустимая погрешность веса в процентах'
    },
    {
      key: 'weight_tolerance_absolute',
      value: '0.1',
      description: 'Допустимая погрешность веса в кг'
    }
  ];

  for (const setting of weightToleranceSettings) {
    const existingSetting = await prisma.settingsBase.findUnique({
      where: { key: setting.key }
    });

    if (existingSetting) {
      await prisma.settingsBase.update({
        where: { key: setting.key },
        data: {
          value: setting.value,
          description: setting.description
        }
      });
      console.log(chalk.yellow(`Настройка ${setting.key} обновлена`));
    } else {
      await prisma.settingsBase.create({
        data: setting
      });
      console.log(chalk.green(`Настройка ${setting.key} создана`));
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
