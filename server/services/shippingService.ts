export interface ShippingProvider {
  name: string;
  apiKey: string;
  baseUrl: string;
  bearerToken?: string;
  counterpartyToken?: string;
  statusBearerToken?: string;
}

export interface PrintTTNRequest {
  ttn: string;
  provider: 'novaposhta' | 'ukrposhta';
  format?: 'pdf' | 'html' | 'png';
}

export interface PrintTTNResponse {
  success: boolean;
  data?: string;
  error?: string;
}

export interface NovaPoshtaApiResponse {
  success: boolean;
  data?: any[];
  errors?: string[];
  warnings?: string[];
  info?: any;
  messageCodes?: string[];
  errorCodes?: string[];
  warningCodes?: string[];
  infoCodes?: string[];
}

export interface UkrPoshtaApiResponse {
  success: boolean;
  data?: any;
  errors?: string[];
  warnings?: string[];
}

export class ShippingService {
  private providers: { [key: string]: ShippingProvider } = {};

  constructor() {
    this.providers.novaposhta = {
      name: 'Нова Пошта',
      apiKey: process.env.NOVA_POSHTA_API_KEY || '',
      baseUrl: 'https://api.novaposhta.ua/v2.0/json/'
    };

    this.providers.ukrposhta = {
      name: 'Укрпошта',
      apiKey: process.env.UKR_POSHTA_API_KEY || '',
      baseUrl: 'https://api.ukrposhta.ua',
      bearerToken: process.env.UKR_POSHTA_BEARER_ECOM || '',
      counterpartyToken: process.env.UKR_POSHTA_COUNTERPARTY_TOKEN || '',
      statusBearerToken: process.env.UKR_POSHTA_BEARER_STATUS || ''
    };
  }

  async printTTN(request: PrintTTNRequest): Promise<PrintTTNResponse> {
    try {
      const provider = this.providers[request.provider];
      
      if (!provider) {
        throw new Error(`Провайдер ${request.provider} не настроен`);
      }

      if (request.provider === 'novaposhta') {
        if (!provider.apiKey) {
          throw new Error('API ключ Нова Пошта не настроен');
        }
        return await this.printNovaPoshtaTTN(request, provider);
      } else if (request.provider === 'ukrposhta') {
        return await this.printUkrPoshtaTTN(request, provider);
      } else {
        throw new Error(`Неподдерживаемый провайдер: ${request.provider}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      };
    }
  }

  private async printNovaPoshtaTTN(request: PrintTTNRequest, provider: ShippingProvider): Promise<PrintTTNResponse> {
    // Сначала попробуем printMarkings - специальный метод для наклеек
    try {
      const markingsPayload = {
        apiKey: provider.apiKey,
        modelName: 'InternetDocument',
        calledMethod: 'printMarkings',
        methodProperties: {
          DocumentRefs: [request.ttn],
          Type: 'pdf'
        }
      };

      const markingsResponse = await fetch(provider.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/pdf'
        },
        body: JSON.stringify(markingsPayload)
      });

      if (markingsResponse.ok) {
        const pdfBuffer = await markingsResponse.arrayBuffer();
        const base64PDF = Buffer.from(pdfBuffer).toString('base64');
        
        return {
          success: true,
          data: base64PDF
        };
      }
    } catch (markingsError) {
      // Игнорируем ошибку и пробуем обычный метод
    }

    // Если printMarkings не сработал, пробуем printDocument с дополнительными параметрами
    const payload = {
      apiKey: provider.apiKey,
      modelName: 'InternetDocument',
      calledMethod: 'printDocument',
      methodProperties: {
        DocumentRefs: [request.ttn],
        Type: request.format || 'pdf',
        // Попробуем другие параметры для получения наклейки
        PageFormat: 'A6',
        PrintFormat: 'sticker',
        StickerFormat: 'A6'
      }
    };

    const response = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': request.format === 'pdf' ? 'application/pdf' : 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (request.format === 'pdf' || !request.format) {
      const pdfBuffer = await response.arrayBuffer();
      const base64PDF = Buffer.from(pdfBuffer).toString('base64');
      
      return {
        success: true,
        data: base64PDF
      };
    }

    const data = await response.json() as NovaPoshtaApiResponse;

    if (data.success !== true) {
      throw new Error(data.errors?.[0] || data.warnings?.[0] || 'Ошибка API Нова Пошта');
    }

    return {
      success: true,
      data: data.data?.[0]?.Data
    };
  }

  private async printUkrPoshtaTTN(request: PrintTTNRequest, provider: ShippingProvider): Promise<PrintTTNResponse> {
    const printUrl = `https://ok.ukrposhta.ua/ua/lk/print/sticker/${request.ttn}`;
    
    return {
      success: true,
      data: printUrl
    };
  }

  async getTTNStatus(ttn: string, provider: 'novaposhta' | 'ukrposhta'): Promise<any> {
    try {
      const providerConfig = this.providers[provider];
      
      if (!providerConfig) {
        throw new Error(`Провайдер ${provider} не настроен`);
      }

      if (provider === 'novaposhta') {
        if (!providerConfig.apiKey) {
          throw new Error('API ключ Нова Пошта не настроен');
        }
        return await this.getNovaPoshtaStatus(ttn, providerConfig);
      } else {
        return { status: 'unknown', description: 'Статус недоступен' };
      }
    } catch (error) {
      throw error;
    }
  }

  private async getNovaPoshtaStatus(ttn: string, provider: ShippingProvider): Promise<any> {
    const payload = {
      apiKey: provider.apiKey,
      modelName: 'TrackingDocument',
      calledMethod: 'getStatusDocuments',
      methodProperties: {
        Documents: [ttn]
      }
    };

    const response = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json() as NovaPoshtaApiResponse;
    return data.data?.[0];
  }
}

export const shippingService = new ShippingService();