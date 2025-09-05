const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
  console.log('🔍 Проверяем распределение заказов по статусам и датам...');

  // Получаем статистику по статусам
  const statusStats = await prisma.order.groupBy({
    by: ['status'],
    _count: { id: true },
    _max: { orderDate: true },
    _min: { orderDate: true }
  });

  console.log('\n📊 Статистика по статусам:');
  statusStats.forEach(stat => {
    console.log(`Статус ${stat.status}: ${stat._count.id} заказов, от ${stat._min.orderDate?.toISOString().split('T')[0]} до ${stat._max.orderDate?.toISOString().split('T')[0]}`);
  });

  // Проверяем заказы за последние дни
  const recentOrders = await prisma.order.findMany({
    where: {
      orderDate: {
        gte: new Date('2025-09-01'),
        lte: new Date('2025-09-05')
      }
    },
    select: {
      id: true,
      status: true,
      orderDate: true,
      orderNumber: true
    },
    orderBy: {
      orderDate: 'desc'
    },
    take: 20
  });

  console.log('\n📅 Недавние заказы (2025-09-01 до 2025-09-05):');
  recentOrders.forEach(order => {
    console.log(`${order.orderDate?.toISOString().split('T')[0]} | Статус: ${order.status} | Номер: ${order.orderNumber}`);
  });

  await prisma.$disconnect();
}

checkData().catch(console.error);
