/**
 * QzWrapper — централізований асинхронний wrapper для qz-tray
 * Завантажує `qz-tray` динамічно при першому використанні і кешує екземпляр.
 */
let qz: any = null;
let initializing: Promise<void> | null = null;

async function loadQz(): Promise<any> {
  if (qz) return qz;
  const mod = await import('qz-tray');
  qz = mod.default || mod;
  return qz;
}

export async function ensureInitialized(): Promise<void> {
  if (qz && initializing === null) return;
  if (initializing) return initializing;

  initializing = (async () => {
    await loadQz();
    // Инициализация сертификатов/подписей (qzConfig динамически импортирует qz при необходимости)
    try {
      const cfg = await import('../lib/qzConfig');
      if (typeof cfg.initializeQzTray === 'function') {
        // initializeQzTray может быть async
        await cfg.initializeQzTray();
      }
    } catch (e) {
      console.warn('QzWrapper: failed to run initializeQzTray', e);
    }
  })();

  await initializing;
  initializing = null;
}

export async function getQz(): Promise<any> {
  await ensureInitialized();
  return qz;
}

export async function isActive(): Promise<boolean> {
  const q = await getQz();
  return Boolean(q?.websocket?.isActive && q.websocket.isActive());
}

export async function connect(): Promise<void> {
  const q = await getQz();
  return q.websocket.connect();
}

export async function findPrinters(): Promise<any[]> {
  const q = await getQz();
  return q.printers.find();
}

export async function configsCreate(name: any, options?: any): Promise<any> {
  const q = await getQz();
  return q.configs.create(name, options);
}

export async function print(config: any, data: any): Promise<any> {
  const q = await getQz();
  return q.print(config, data);
}

export async function apiGetVersion(): Promise<string> {
  const q = await getQz();
  try {
    return await q.api.getVersion();
  } catch (e) {
    return 'Unknown';
  }
}

export default {
  ensureInitialized,
  getQz,
  isActive,
  connect,
  findPrinters,
  configsCreate,
  print,
  apiGetVersion,
};
