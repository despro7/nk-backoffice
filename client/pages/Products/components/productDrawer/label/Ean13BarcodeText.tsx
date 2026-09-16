import { encodeEan13ForFont } from '@shared/utils/encodeEan13Font';

interface Ean13BarcodeTextProps {
  barcode: string;
  className?: string;
}

/** Вертикальний EAN-13 через шрифт CodeEAN13.woff */
export function Ean13BarcodeText({ barcode, className = '' }: Ean13BarcodeTextProps) {
  const encoded = encodeEan13ForFont(barcode);

  if (!encoded) {
    return (
      <p className={`font-mono text-[8px] -rotate-90 whitespace-nowrap text-black/40 ${className}`}>
        {barcode || 'EAN-13'}
      </p>
    );
  }

  return (
    <p
      className={`-rotate-90 whitespace-nowrap text-center leading-none text-black ${className}`}
      style={{
        fontFamily: "'Code EAN13', 'CodeEAN13', monospace",
        fontSize: 36,
      }}
      aria-label={`Штрихкод ${barcode}`}
    >
      {encoded}
    </p>
  );
}
