import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

async function createAdmin() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔧 Создаем пользователя-админа...');
    
    // Проверяем, есть ли уже админ
    const existingAdmin = await prisma.user.findFirst({
      where: { role: 'admin' }
    });
    
    if (existingAdmin) {
      console.log('✅ Админ уже существует:', existingAdmin.email);
      return;
    }
    
    // Создаем админа
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const admin = await prisma.user.create({
      data: {
        email: 'g.dziov@gmail.com', // Ваш email
        name: 'Георгій Дзіов',
        password: hashedPassword,
        role: 'admin',
        roleName: 'Адміністратор',
        isActive: true,
        lastLoginAt: new Date(),
        lastActivityAt: new Date()
      }
    });
    
    console.log('✅ Админ создан:');
    console.log(`   Email: ${admin.email}`);
    console.log(`   Пароль: admin123`);
    console.log(`   Роль: ${admin.roleName}`);
    
  } catch (error) {
    console.error('❌ Ошибка при создании админа:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
