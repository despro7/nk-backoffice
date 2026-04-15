#!/usr/bin/env node
/**
 * 🧪 ESC/POS TCP Listener — емулятор термопринтера для тестування QZ Tray.
 * Слухає на порту 9100 (стандартний порт raw printing), отримує ESC/POS байти
 * і виводить hex-дамп + ASCII текст у консоль.
 *
 * Запуск:  node scripts/escpos-tcp-listener.js
 * Зупинка: Ctrl+C
 *
 * В QZ Tray налаштуваннях вказати принтер: socket[127.0.0.1:9100]
 */

import net from 'net';

const PORT = 9100;
const HOST = '127.0.0.1';

let jobCounter = 0;

const server = net.createServer((socket) => {
  jobCounter++;
  const jobId = jobCounter;
  const chunks = [];

  console.log(`\n📨 [Job #${jobId}] Підключення від ${socket.remoteAddress}:${socket.remotePort}`);

  socket.on('data', (chunk) => {
    chunks.push(chunk);
    process.stdout.write('.');
  });

  socket.on('end', () => {
    const data = Buffer.concat(chunks);
    console.log(`\n✅ [Job #${jobId}] Отримано ${data.length} байтів\n`);

    if (data.length === 0) {
      console.log('⚠️  ПОРОЖНІЙ БУФЕР — QZ Tray нічого не передав!');
      return;
    }

    // ASCII колонка — CP866 декодування для кирилиці
    // CP866: 0x80-0x9F = А-Я (великі), 0xA0-0xAF = а-п (малі), 0xE0-0xEF = р-я (малі)
    const cp866ToUnicode = (b) => {
      if (b >= 0x20 && b < 0x80) return String.fromCharCode(b); // ASCII
      if (b >= 0x80 && b <= 0x9F) return String.fromCharCode(0x0410 + (b - 0x80)); // А-Я
      if (b >= 0xA0 && b <= 0xAF) return String.fromCharCode(0x0430 + (b - 0xA0)); // а-п
      if (b >= 0xE0 && b <= 0xEF) return String.fromCharCode(0x0440 + (b - 0xE0)); // р-я
      if (b === 0xF0) return '\u0401'; // Ё
      if (b === 0xF1) return '\u0451'; // ё
      // Українські символи в CP866 (нестандартні позиції)
      if (b === 0xB2) return '\u0456'; // і
      if (b === 0xB3) return '\u0456'; // і (варіант)
      if (b === 0xFC) return '\u044C'; // ь (інша позиція)
      if (b < 0x20 || b === 0x7F) return '.'; // керуючі
      return `·`;
    };
    for (let i = 0; i < data.length; i += 16) {
      const slice = data.slice(i, i + 16);
      const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' ');
      const ascii = Array.from(slice).map(b => cp866ToUnicode(b)).join('');
      console.log(`  ${i.toString(16).padStart(4, '0')}  ${hex.padEnd(48)}  |${ascii}|`);
    }

    // ESC/POS команди
    console.log('\n─── ESC/POS КОМАНДИ ─────────────────────────────────');
    let i = 0;
    while (i < data.length) {
      const b = data[i];
      if (b === 0x1B) { // ESC
        const next = data[i + 1];
        if (next === 0x40) { console.log(`  [ESC @] RESET`); i += 2; }
        else if (next === 0x61) { const align = ['ЛІВО', 'ЦЕНТР', 'ПРАВО'][data[i+2]] || data[i+2]; console.log(`  [ESC a ${data[i+2]}] ВИРІВНЮВАННЯ: ${align}`); i += 3; }
        else if (next === 0x45) { console.log(`  [ESC E ${data[i+2]}] ЖИРНИЙ: ${data[i+2] ? 'ON' : 'OFF'}`); i += 3; }
        else if (next === 0x74) { console.log(`  [ESC t ${data[i+2]}] КОДОВА СТОРІНКА: ${data[i+2]} (0x11=CP866)`); i += 3; }
        else { console.log(`  [ESC ${next?.toString(16)}] невідома команда`); i += 2; }
      } else if (b === 0x1D) { // GS
        const next = data[i + 1];
        if (next === 0x56) { console.log(`  [GS V] CUT PAPER`); i += 4; }
        else { console.log(`  [GS ${next?.toString(16)}] невідома команда`); i += 2; }
      } else if (b === 0x0A) { // LF
        i++;
      } else if (b >= 0x20) {
        // Текст — збираємо до кінця рядка, декодуємо CP866
        let text = '';
        while (i < data.length && data[i] >= 0x20) {
          text += cp866ToUnicode(data[i]);
          i++;
        }
        if (text) console.log(`  [TEXT] "${text}"`);
      } else {
        i++;
      }
    }

    console.log('\n─────────────────────────────────────────────────────\n');
  });

  socket.on('error', (err) => {
    console.error(`❌ [Job #${jobId}] Socket error:`, err.message);
  });
});

server.listen(PORT, HOST, () => {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║      🖨️  ESC/POS TCP Listener (емулятор принтера)   ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║  Адреса:  ${HOST}:${PORT}                              ║`);
  console.log('║  В QZ Tray вкажи принтер:                          ║');
  console.log('║  → socket[127.0.0.1:9100]                          ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('\nЧекаю на ESC/POS дані... (Ctrl+C для зупинки)\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Порт ${PORT} вже зайнятий! Спробуй: netstat -ano | findstr :${PORT}`);
  } else {
    console.error('❌ Server error:', err);
  }
  process.exit(1);
});
