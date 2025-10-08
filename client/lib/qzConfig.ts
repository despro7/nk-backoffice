import qz from 'qz-tray';

/**
 * QZ Tray Certificate Configuration
 * 
 * Для продакшену потрібно:
 * 1. Згенерувати приватний ключ та сертифікат
 * 2. Додати їх в змінні оточення або зберігати безпечно
 */

// Демо-сертифікат від QZ Tray (ТІЛЬКИ ДЛЯ РОЗРОБКИ!)
const DEMO_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIEPjCCAyagAwIBAgIJALm151zCHM+2MA0GCSqGSIb3DQEBCwUAMIGyMQswCQYD
VQQGEwJVUzELMAkGA1UECAwCTlkxETAPBgNVBAcMCENhbmFzdG90YTEbMBkGA1UE
CgwSUVogSW5kdXN0cmllcywgTExDMRswGQYDVQQLDBJRWiBJbmR1c3RyaWVzLCBM
TEMxGTAXBgNVBAMMEHF6aW5kdXN0cmllcy5jb20xKDAmBgkqhkiG9w0BCQEWGXNl
Y3VyaXR5QHF6aW5kdXN0cmllcy5jb20wHhcNMTkwMzE0MDM0OTI0WhcNMjkwMzEx
MDM0OTI0WjCBsjELMAkGA1UEBhMCVVMxCzAJBgNVBAgMAk5ZMREwDwYDVQQHDAhD
YW5hc3RvdGExGzAZBgNVBAoMElFaIEluZHVzdHJpZXMsIExMQzEbMBkGA1UECwwS
UVogSW5kdXN0cmllcywgTExDMRkwFwYDVQQDDBBxemluZHVzdHJpZXMuY29tMSgw
JgYJKoZIhvcNAQkBFhlzZWN1cml0eUBxemluZHVzdHJpZXMuY29tMIIBIjANBgkq
hkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuWQWzHx3RXQV7N7oVnCEJL0XDPOdvxbz
6p6aE7gBqUmTrH1eTZqK7d0VpIlvhLWYCJNrKr8l9mR6PoRJtBvE6H4XB2OTgXqj
fhtVFk+lFxL3i4Oa6H1BGPp2D7fJdG+FLW5h9tQnhJYZtYOHTzPfLNPqMW3YThBM
vU9d3MkKN8jtPbIxuR6xLFqoW6TJfNyDrmFgFdUNkZBqREXLndZ3frzO7gLnVMqh
cJXGCfO9d9aRJnLFDpLbXlQFaZ1rPHnJG+YIQJfD6tPpRQm8i7dXQdQRD8TfRfRO
yFz9hvDQpKZdqKZBVN0x6mGVfOhAzwVm6Nf3Sd1WzYgHhXBTmVQEZQIDAQABo1Aw
TjAdBgNVHQ4EFgQUW3J4vLLd0FhXH6xwN4eBRQAYG9AwHwYDVR0jBBgwFoAUW3J4
vLLd0FhXH6xwN4eBRQAYG9AwDAYDVR0TBAUwAwEB/zANBgkqhkiG9w0BAQsFAAOC
AQEALEEDa7Z44GNs8kx2PSq8FLWsJpFGPxKggqSv0XJmkTKyBMt8xLYADCFOJMDe
qaqOWCKlJqSMGfKk5ywZMDM8L8LxN2TvqNvGxcfbKZSwUG5qDR8S5MAWPHM8RWXl
IzKlGIvPGLLiHFTN9OOdPEDcEqLdF9e6n8f6sJJvZK5NU3YhqQsEuGVELqMHg0mB
n1V9pWJLqD+uYPKpXhAe2Wf8JC8U5kKRLVGNvLYLlqvnJZDwGVHNHPmYL8n4kv7i
9CKnQ6Xw2ql0vFIXIJwqb0J8xDMUF/X7z3eL9rQgHqxXLs7lPGGM/P7S5qPHMz5f
ROHbpM7hl7L2MXFPSkNgJmGVqQ==
-----END CERTIFICATE-----`;

/**
 * Ініціалізація QZ Tray
 * 
 * ВАРІАНТИ:
 * 1. Без сертифікатів - працює з ручним підтвердженням (для розробки)
 * 2. З сертифікатами - працює без підтверджень (для продакшену)
 */
export function initializeQzTray(): void {
  const useServerSigning = import.meta.env.VITE_QZ_USE_SERVER_SIGNING === 'true';
  
  if (!useServerSigning) {
    // РЕЖИМ БЕЗ СЕРТИФІКАТІВ (з ручним підтвердженням)
    console.log('QZ Tray: UNSIGNED mode (manual confirmation required)');
    return;
  }

  // РЕЖИМ З СЕРТИФІКАТАМИ (без підтверджень)
  try {
    qz.security.setCertificatePromise(function(resolve: any, reject: any) {
      // Отримати сертифікат з сервера
      fetch('/api/qz-tray/certificate')
        .then(response => {
          if (!response.ok) {
            console.warn('Failed to get certificate from server, using demo');
            resolve(DEMO_CERTIFICATE);
          } else {
            return response.json();
          }
        })
        .then(data => {
          if (data && data.certificate) {
            resolve(data.certificate);
          } else {
            resolve(DEMO_CERTIFICATE);
          }
        })
        .catch(error => {
          console.error('Error fetching certificate:', error);
          resolve(DEMO_CERTIFICATE);
        });
    });

    qz.security.setSignaturePromise(function(toSign: string) {
      return function(resolve: any, reject: any) {
        // Підписати на сервері
        fetch('/api/qz-tray/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: toSign })
        })
          .then(response => {
            if (!response.ok) {
              reject('Server signing failed: ' + response.statusText);
            } else {
              return response.json();
            }
          })
          .then(data => {
            resolve(data.signature);
          })
          .catch(error => {
            console.error('Error signing message:', error);
            reject(error);
          });
      };
    });

    console.log('QZ Tray: SIGNED mode (automatic printing enabled)');
  } catch (error) {
    console.error('QZ Tray initialization error:', error);
  }
}

/**
 * Перевірка з'єднання з QZ Tray
 */
export async function checkQzConnection(): Promise<boolean> {
  try {
    if (qz.websocket.isActive()) {
      return true;
    }
    await qz.websocket.connect();
    return true;
  } catch (error) {
    console.error('QZ Tray connection error:', error);
    return false;
  }
}

/**
 * Отримання версії QZ Tray
 */
export async function getQzVersion(): Promise<string> {
  try {
    const version = await qz.api.getVersion();
    return version;
  } catch (error) {
    console.error('Failed to get QZ version:', error);
    return 'Unknown';
  }
}
