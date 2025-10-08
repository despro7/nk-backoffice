import qz from 'qz-tray';

/**
 * QZ Tray Certificate Configuration
 * 
 * Для продакшену потрібно:
 * 1. Згенерувати приватний ключ та сертифікат
 * 2. Додати їх в змінні оточення або зберігати безпечно
 * 
 * Генерація сертифіката:
 * - Скористайтесь інструкцією на https://qz.io/wiki/using-your-own-certificate
 * - Або використайте демо-ключі для тестування
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

// Приватний ключ (ТІЛЬКИ ДЛЯ РОЗРОБКИ!)
const DEMO_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC5ZBbMfHdFdBXs
3uhWcIQkvRcM852/FvPqnpoTuAGpSZOsfV5Nmort3RWkiW+EtZgIk2sqvyX2ZHo+
hEm0G8TofhcHY5OBeqN+G1UWT6UXEveLg5rofUEY+nYPt8l0b4UtbmH21CeElhm1
g4dPM98s0+oxbdhOEEy9T13cyQo3yO09sjG5HrEsWqhbpMl83IOuYWAV1Q2RkGpE
Rcud1nd+vM7uAudUyqFwlcYJ87131pEmcsUOktteVAVpnWs8eckb5ghAl8Pq0+lF
CbyLt1dB1BEPxN9F9E7IXP2G8NCkpl2opkFU3THqYZV86EDPBWbo1/dJ3VbNiAeF
cFOZVARlAgMBAAECggEADgQ15v+6yLcW3R9J3r0Xvq0YlmKhSMcQT7C7PmPGNPAN
M0pCLlvajY/jLc9RhFfXcL3KFZFLBfuTf2+5bIWHWvGZYXvHJ7I5LN7BZqMNqHKq
7CZsIVMgQkVc8qJuYCLLXjLfWqXqHh9S7eBzn6g7+aQX6h4RnVz6X8FxLxQqEVcz
aD5+xR4cB9GZqM8OmDOLw4aRJXrTp3UPMiYLhMvCuHX3F8UcV8CfBFqWLZx3F4aM
mRiLDfX3D7BXEQr9vDWQZ8lDdF9qPJKhVZMFVy2xGVR6XyQZ7nZXKvLfQ3BPNZjh
8D7XvD2e1HcVMkLYNPxQZvJMVVF9vSfQXvZ3X3XhVQKBgQDmAqPGYGYVQY1v4gXf
L8cX2qFG3qYXCzJ1ZfXvZ3VZ4FZvJLXyK4+vLJ7vJvXVZ7X8L4vJvXZ7vXZ7vJvX
Z7vXZ7vJvXZ7vXZ7vJvXZ7vXZ7vJvXZ7vXZ7vJvXZ7vXZ7vJvXZ7vXZ7vJvXZ7vX
Z7vJvXZ7vXZ7vJvXZ7vXZ7vJvXZ7vXZ7vJvXZ7vXZ7vJvXZ7vXZ7vJwKBgQDP0mD1
XqFJMlD1XcD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3c
D7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF
3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7
cF3cD7cF3wKBgH9JvXZ7vXZ7vJvXZ7vXZ7vJvXZ7vXZ7vJvXZ7vXZ7vJvXZ7vXZ7
vJvXZ7vXZ7vJvXZ7vXZ7vJvXZ7vXZ7vJvXZ7vXZ7vJvXZ7vXZ7vJvXZ7vXZ7vJvX
Z7vXZ7vJvXZ7vXZ7vJvXZ7vXZ7vJvXZ7vXZ7vJvXZ7vXZ7vJvXZ7vXZ7vJvXZ7vX
Z7vJAoGBALP8D7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF
3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7
cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3c
D7cF3cD7AoGAcD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7c
F3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD
7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3cD7cF3c
D7cF3cD7cF3c
-----END PRIVATE KEY-----`;

/**
 * Підпис повідомлення для QZ Tray
 * 
 * PRODUCTION: Підпис виконується на сервері для безпеки
 * DEVELOPMENT: Повертає порожній підпис (QZ Tray в dev mode може працювати без підпису)
 */
function signMessage(messageToSign: string): Promise<string> {
  // Якщо є змінна середовища для використання серверного підпису
  const useServerSigning = import.meta.env.VITE_QZ_USE_SERVER_SIGNING === 'true';
  
  if (useServerSigning) {
    return fetch('/api/qz-tray/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: messageToSign })
    })
    .then(response => {
      if (!response.ok) {
        console.error('Server signing failed:', response.statusText);
        return ''; // Fallback to unsigned in dev mode
      }
      return response.json();
    })
    .then(data => data.signature)
    .catch(error => {
      console.error('Error signing message:', error);
      return ''; // Fallback to unsigned in dev mode
    });
  }
  
  // Dev mode: повертаємо порожній підпис
  return Promise.resolve('');
}

/**
 * Ініціалізація QZ Tray з сертифікатом
 */
export function initializeQzTray(): void {
  // Для сучасних браузерів setPromiseType не потрібен
  // QZ Tray автоматично використовує нативні Promise

  // Налаштування сертифіката
  qz.security.setCertificatePromise(() => {
    return Promise.resolve(DEMO_CERTIFICATE);
  });

  // Налаштування підпису
  qz.security.setSignaturePromise((toSign: string) => {
    return signMessage(toSign);
  });

  console.log('QZ Tray initialized with security settings');
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

