import { PrismaClient } from '@prisma/client';

export interface CreateShippingProviderRequest {
  name: string;
  providerType: 'novaposhta' | 'ukrposhta';
  senderName: string;
  isActive?: boolean;
  order?: number;
  apiKey?: string;
  bearerEcom?: string;
  counterpartyToken?: string;
  bearerStatus?: string;
}

export interface UpdateShippingProviderRequest extends Partial<CreateShippingProviderRequest> {
  id: number;
}

export interface ShippingProvider {
  id: number;
  name: string;
  providerType: 'novaposhta' | 'ukrposhta';
  senderName: string;
  isActive: boolean;
  order: number;
  apiKey?: string;
  bearerEcom?: string;
  counterpartyToken?: string;
  bearerStatus?: string;
  createdAt: Date;
  updatedAt: Date;
}

class ShippingProviderService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async getAllProviders(): Promise<ShippingProvider[]> {
    const providers = await this.prisma.shippingProvider.findMany({
      orderBy: [
        { order: 'asc' },
        { providerType: 'asc' },
        { senderName: 'asc' }
      ]
    });
    
    return providers.map(provider => ({
      ...provider,
      providerType: provider.providerType as 'novaposhta' | 'ukrposhta'
    }));
  }

  async getProviderById(id: number): Promise<ShippingProvider | null> {
    const provider = await this.prisma.shippingProvider.findUnique({
      where: { id }
    });
    
    if (!provider) return null;
    
    return {
      ...provider,
      providerType: provider.providerType as 'novaposhta' | 'ukrposhta'
    };
  }

  async getActiveProvider(): Promise<ShippingProvider | null> {
    const provider = await this.prisma.shippingProvider.findFirst({
      where: { isActive: true }
    });
    
    if (!provider) return null;
    
    return {
      ...provider,
      providerType: provider.providerType as 'novaposhta' | 'ukrposhta'
    };
  }

  async createProvider(data: CreateShippingProviderRequest): Promise<ShippingProvider> {
    // Отримуємо максимальний order для встановлення наступного
    const maxOrder = await this.prisma.shippingProvider.aggregate({
      _max: { order: true }
    });
    const nextOrder = (maxOrder._max.order || 0) + 1;

    // Якщо встановлюємо як активний, то деактивуємо всі інші того ж типу
    if (data.isActive) {
      await this.deactivateProvidersByType(data.providerType);
    }

    const provider = await this.prisma.shippingProvider.create({
      data: {
        name: data.name,
        providerType: data.providerType,
        senderName: data.senderName,
        isActive: data.isActive || false,
        order: data.order || nextOrder,
        apiKey: data.apiKey,
        bearerEcom: data.bearerEcom,
        counterpartyToken: data.counterpartyToken,
        bearerStatus: data.bearerStatus
      }
    });
    
    return {
      ...provider,
      providerType: provider.providerType as 'novaposhta' | 'ukrposhta'
    };
  }

  async updateProvider(data: UpdateShippingProviderRequest): Promise<ShippingProvider> {
    const { id, ...updateData } = data;

    // Якщо встановлюємо як активний, то деактивуємо всі інші того ж типу
    if (updateData.isActive) {
      const currentProvider = await this.prisma.shippingProvider.findUnique({
        where: { id }
      });
      if (currentProvider) {
        await this.deactivateProvidersByType(currentProvider.providerType as 'novaposhta' | 'ukrposhta');
      }
    }

    const provider = await this.prisma.shippingProvider.update({
      where: { id },
      data: updateData
    });
    
    return {
      ...provider,
      providerType: provider.providerType as 'novaposhta' | 'ukrposhta'
    };
  }

  async deleteProvider(id: number): Promise<void> {
    await this.prisma.shippingProvider.delete({
      where: { id }
    });
  }

  async setActiveProvider(id: number): Promise<ShippingProvider> {
    // Отримуємо провайдера для визначення типу
    const provider = await this.prisma.shippingProvider.findUnique({
      where: { id }
    });
    
    if (!provider) {
      throw new Error('Провайдер не знайдено');
    }

    // Деактивуємо всі провайдери того ж типу
    await this.deactivateProvidersByType(provider.providerType as 'novaposhta' | 'ukrposhta');

    // Активуємо вибраний
    const updatedProvider = await this.prisma.shippingProvider.update({
      where: { id },
      data: { isActive: true }
    });
    
    return {
      ...updatedProvider,
      providerType: updatedProvider.providerType as 'novaposhta' | 'ukrposhta'
    };
  }

  async updateProviderOrder(providers: { id: number; order: number }[]): Promise<void> {
    // Валідація даних
    for (const provider of providers) {
      if (typeof provider.id !== 'number' || typeof provider.order !== 'number') {
        throw new Error(`Невалідні дані провайдера: id=${provider.id}, order=${provider.order}`);
      }
    }
    
    // Оновлюємо порядок для всіх провайдерів
    await Promise.all(
      providers.map(provider => 
        this.prisma.shippingProvider.update({
          where: { id: provider.id },
          data: { order: provider.order }
        })
      )
    );
  }

  private async deactivateAllProviders(): Promise<void> {
    await this.prisma.shippingProvider.updateMany({
      data: { isActive: false }
    });
  }

  private async deactivateProvidersByType(providerType: 'novaposhta' | 'ukrposhta'): Promise<void> {
    await this.prisma.shippingProvider.updateMany({
      where: { providerType },
      data: { isActive: false }
    });
  }

  async validateProviderCredentials(provider: ShippingProvider): Promise<{ isValid: boolean; error?: string }> {
    try {
      if (provider.providerType === 'novaposhta') {
        if (!provider.apiKey) {
          return { isValid: false, error: 'API ключ Нової Пошти не вказано' };
        }
        // Тут можна додати реальну валідацію API ключа
        return { isValid: true };
      } else if (provider.providerType === 'ukrposhta') {
        if (!provider.bearerEcom || !provider.counterpartyToken) {
          return { isValid: false, error: 'Bearer токен або Counterparty токен Укрпошти не вказано' };
        }
        // Тут можна додати реальну валідацію токенів
        return { isValid: true };
      }
      return { isValid: false, error: 'Невідомий тип провайдера' };
    } catch (error) {
      return { isValid: false, error: 'Помилка валідації: ' + (error as Error).message };
    }
  }
}

export const shippingProviderService = new ShippingProviderService();
