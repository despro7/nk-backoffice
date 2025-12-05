export interface ShippingProvider {
  name: string;
  apiKey?: string;
  baseUrl?: string;
  bearerToken?: string;
  counterpartyToken?: string;
  statusBearerToken?: string;
}

export interface PrintTTNRequest {
  ttn: string;
  provider: 'novaposhta' | 'ukrposhta';
  senderId: number;
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
    // Fallback до env змінних якщо БД порожня
    this.providers.novaposhta = {
      name: 'Нова Пошта',
      apiKey: process.env.NOVA_POSHTA_API_KEY || '',
      baseUrl: 'https://api.novaposhta.ua/v2.0/json/'
    };

    this.providers.ukrposhta = {
      name: 'Укрпошта',
      bearerToken: process.env.UKR_POSHTA_BEARER_ECOM || '',
      counterpartyToken: process.env.UKR_POSHTA_COUNTERPARTY_TOKEN || '',
      statusBearerToken: process.env.UKR_POSHTA_BEARER_STATUS || ''
    };
  }

  async printTTN(request: PrintTTNRequest): Promise<PrintTTNResponse> {
    try {
      // Завантажуємо провайдер з БД за senderId
      const { shippingProviderService } = await import('./shippingProviderService.js');
      const dbProvider = await shippingProviderService.getProviderBySenderId(request.senderId, request.provider);

      let provider: ShippingProvider;
      let providerType: 'novaposhta' | 'ukrposhta';

      if (dbProvider) {
        // Використовуємо провайдер з БД
        provider = {
          name: dbProvider.name,
          apiKey: dbProvider.apiKey || '',
          baseUrl: dbProvider.providerType === 'novaposhta'
            ? 'https://api.novaposhta.ua/v2.0/json/'
            : 'https://www.ukrposhta.ua/forms/ecom/0.0.1',
          bearerToken: dbProvider.bearerEcom || '',
          counterpartyToken: dbProvider.counterpartyToken || '',
          statusBearerToken: dbProvider.bearerStatus || ''
        };
        providerType = dbProvider.providerType;
        console.log(`🔍 [ShippingService] Використовуємо провайдер з БД (senderId: ${request.senderId}): ${dbProvider.name}`);
      } else {
        // Fallback до env змінних
        provider = this.providers[request.provider];
        providerType = request.provider;
        if (!provider) {
          throw new Error(`Провайдер ${request.provider} не налаштовано`);
        }
        console.log(`🔍 [ShippingService] Fallback до env змінних для провайдера: ${request.provider}`);
      }

      if (providerType === 'novaposhta') {
        if (!provider.apiKey) {
          throw new Error('API ключ Нова Пошта не налаштовано');
        }
        return await this.printNovaPoshtaTTN(request, provider);
      } else if (providerType === 'ukrposhta') {
        return await this.printUkrPoshtaTTN(request, provider);
      } else {
        throw new Error(`Непідтримуваний провайдер: ${providerType}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Невідома помилка'
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
      const url = `${provider.baseUrl}/shipments/${ttn}/sticker?token=${provider.counterpartyToken}`;

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
          let shortMsg: string | null = null;

          // Try parse JSON body first (some endpoints may return JSON)
          try {
            const errorJson = JSON.parse(errorBody);
            if (errorJson) {
              if (typeof errorJson.message === 'string' && errorJson.message.trim()) {
                shortMsg = errorJson.message.trim();
              } else if (typeof errorJson.error === 'string' && errorJson.error.trim()) {
                shortMsg = errorJson.error.trim();
              } else {
                // Fallback to a compact JSON representation
                shortMsg = JSON.stringify(errorJson);
              }
            }
          } catch (e) {
            // Not JSON — try to extract Message block from HTML first, then strip all tags
            try {
              // First, try to extract Message block from HTML
              const messageBlockMatch = errorBody.match(/<p><b>Message<\/b>\s*(.*?)<\/p>/i);
              if (messageBlockMatch && messageBlockMatch[1]) {
                // Strip HTML from the message content and normalize whitespace
                shortMsg = messageBlockMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
              } else {
                // Fallback: Remove script/style blocks first, then strip all tags and normalize whitespace
                const withoutScripts = errorBody.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ');
                const stripped = withoutScripts.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

                // Look for a block that starts with "Message" and capture until the next known section label
                const messageMatch = stripped.match(/Message\s*(?:[:\-–])?\s*([\s\S]*?)(?=\s*(Description|Exception|Root Cause|Note|$))/i);
                if (messageMatch && messageMatch[1]) {
                  shortMsg = messageMatch[1].replace(/\s+/g, ' ').trim();
                } else {
                  // Fallback: first sentence-like fragment from the stripped text
                  const firstSentenceMatch = stripped.match(/([^\.\!\?]+[\.\!\?])/);
                  if (firstSentenceMatch && firstSentenceMatch[1]) {
                    shortMsg = firstSentenceMatch[1].trim();
                  } else if (stripped.length > 0) {
                    shortMsg = stripped.substring(0, 200).trim();
                  }
                }
              }
            } catch (e2) {
              // ignore parsing errors
            }
          }

          if (shortMsg) {
            // Use the full message content, but limit to 200 chars
            const limited = shortMsg.length > 200 ? shortMsg.substring(0, 197).trim() + '...' : shortMsg;
            errorText += ` - ${limited}`;
          }
        } catch (e) {
          // Ignore if body can't be read or parsing failed
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