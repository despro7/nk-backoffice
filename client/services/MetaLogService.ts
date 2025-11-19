// Універсальний сервіс для логування мета-логів
export class MetaLogService {
  static async log({ category = 'default', title = '', status = 'info', message = '', data = null }: {
    category?: string;
    title?: string;
    status?: string;
    message?: string;
    data?: any;
  }) {
    try {
      await fetch('/api/meta-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, title, status, message, data })
      });
    } catch (err) {
      // Можна додати додаткову обробку помилок або логування
    }
  }
}
