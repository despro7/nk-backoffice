// Скрипт для проверки состояния refresh токенов
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkRefreshTokens() {
  try {
    console.log('🔍 Проверяем состояние refresh токенов...\n');
    
    // Получаем всех пользователей с информацией о токенах
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        isActive: true,
        refreshToken: true,
        refreshTokenExpiresAt: true,
        lastLoginAt: true,
        lastActivityAt: true,
        createdAt: true,
      }
    });
    
    console.log(`📋 Найдено пользователей: ${users.length}\n`);
    
    const now = new Date();
    
    users.forEach((user, index) => {
      console.log(`👤 Пользователь ${index + 1}: ${user.email}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Активен: ${user.isActive ? '✅ Да' : '❌ Нет'}`);
      console.log(`   Refresh token: ${user.refreshToken ? '✅ Есть' : '❌ Нет'}`);
      
      if (user.refreshToken && user.refreshTokenExpiresAt) {
        const isExpired = now > user.refreshTokenExpiresAt;
        const timeUntilExpiry = user.refreshTokenExpiresAt.getTime() - now.getTime();
        const hoursUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60 * 60));
        const minutesUntilExpiry = Math.floor((timeUntilExpiry % (1000 * 60 * 60)) / (1000 * 60));
        
        console.log(`   Refresh истекает: ${user.refreshTokenExpiresAt.toLocaleString()}`);
        console.log(`   Статус: ${isExpired ? '❌ ИСТЁК' : '✅ Действителен'}`);
        
        if (!isExpired) {
          console.log(`   До истечения: ${hoursUntilExpiry}ч ${minutesUntilExpiry}м`);
        } else {
          const hoursAgo = Math.abs(hoursUntilExpiry);
          const minutesAgo = Math.abs(minutesUntilExpiry);
          console.log(`   Истёк: ${hoursAgo}ч ${minutesAgo}м назад`);
        }
      }
      
      console.log(`   Последний вход: ${user.lastLoginAt ? user.lastLoginAt.toLocaleString() : 'Не указано'}`);
      console.log(`   Последняя активность: ${user.lastActivityAt ? user.lastActivityAt.toLocaleString() : 'Не указано'}`);
      console.log('   ────────────────────────');
    });

    // Статистика
    const activeUsers = users.filter(u => u.isActive);
    const usersWithTokens = users.filter(u => u.refreshToken);
    const usersWithValidTokens = users.filter(u => 
      u.refreshToken && u.refreshTokenExpiresAt && now < u.refreshTokenExpiresAt
    );

    console.log('\n📊 Статистика:');
    console.log(`   Всего пользователей: ${users.length}`);
    console.log(`   Активных пользователей: ${activeUsers.length}`);
    console.log(`   Пользователей с refresh токеном: ${usersWithTokens.length}`);
    console.log(`   Пользователей с действительным токеном: ${usersWithValidTokens.length}`);

    if (usersWithTokens.length > usersWithValidTokens.length) {
      console.log('\n⚠️ ПРОБЛЕМА: Есть пользователи с устаревшими refresh токенами!');
      console.log('💡 Они должны перезайти в систему для получения новых токенов.');
    }

  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkRefreshTokens();
