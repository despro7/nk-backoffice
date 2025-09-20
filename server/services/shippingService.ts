export interface ShippingProvider {
  name: string;
  apiKey: string;
  baseUrl?: string;
  bearerToken?: string;
  counterpartyToken?: string;
  statusBearerToken?: string;
}

export interface PrintTTNRequest {
  ttn: string;
  provider: 'novaposhta' | 'ukrposhta';
  format?: 'pdf' | 'html' | 'png' | 'zpl';
}

export interface PrintTTNResponse {
  success: boolean;
  data?: string;
  error?: string;
  format?: 'pdf' | 'zpl';
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
    if (!provider.baseUrl) {
      throw new Error('Base URL для Нової Пошти не налаштовано');
    }

    // Сначала пробуем printMarkings - специальный метод для наклеек
    try {
      const markingsPayload = {
        apiKey: provider.apiKey,
        modelName: 'InternetDocument',
        calledMethod: 'printMarkings',
        methodProperties: {
          DocumentRefs: [request.ttn],
          Type: 'pdf',
          Copies: '1'
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
        return { success: true, data: base64PDF, format: 'pdf' };
      }
    } catch (error) {
      console.error('NovaPoshta printMarkings failed, falling back to printDocument:', error);
    }

    // Если printMarkings не сработал, пробуем printDocument
    const payload = {
      apiKey: provider.apiKey,
      modelName: 'InternetDocument',
      calledMethod: 'printDocument',
      methodProperties: {
        DocumentRefs: [request.ttn],
        Type: 'pdf',
        Copies: '1'
      }
    };

    const response = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Помилка від API Нової Пошти (статус ${response.status}): ${errorText}`);
    }

    const pdfBuffer = await response.arrayBuffer();
    const base64PDF = Buffer.from(pdfBuffer).toString('base64');

    return {
      success: true,
      data: base64PDF,
      format: 'pdf'
    };
  }

  private async printUkrPoshtaTTN(request: PrintTTNRequest, provider: ShippingProvider): Promise<PrintTTNResponse> {
    if (!provider.bearerToken || !provider.counterpartyToken) {
      throw new Error('Токени Bearer або Counterparty для Укрпошти не налаштовано');
    }

    try {
      const ttn = request.ttn;
      const url = `https://www.ukrposhta.ua/forms/ecom/0.0.1/shipments/${ttn}/sticker?token=${provider.counterpartyToken}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${provider.bearerToken}`,
          'Accept': 'application/pdf'
        }
      });

      if (!response.ok) {
        let errorText = `Помилка API Укрпошти: ${response.status} ${response.statusText}`;
        try {
          const errorBody = await response.text();
          try {
            const errorJson = JSON.parse(errorBody);
            errorText += ` - ${errorJson.message || JSON.stringify(errorJson)}`;
          } catch(e) {
            errorText += ` - ${errorBody}`;
          }
        } catch (e) {
          // Ignore if body can't be read
        }
        throw new Error(errorText);
      }

      const pdfBuffer = await response.arrayBuffer();
      const base64PDF = Buffer.from(pdfBuffer).toString('base64');

      return {
        success: true,
        data: base64PDF,
        format: 'pdf'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Невідома помилка при отриманні стікера Укрпошти'
      };
    }
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