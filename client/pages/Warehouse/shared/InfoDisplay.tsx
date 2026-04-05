// ---------------------------------------------------------------------------
// InfoDisplay — поле тільки для читання, показує розраховане значення
// ---------------------------------------------------------------------------

interface InfoDisplayProps {
  label: string;
  value: string | number;
  colorClass?: string;
}

export const InfoDisplay = ({ label, value, colorClass = 'text-gray-800' }: InfoDisplayProps) => (
  <div className="flex flex-col items-center gap-2">
    <span className="text-sm text-gray-500">{label}</span>
    <div className={`w-full h-18 flex items-center justify-center text-2xl font-medium bg-transparent border-2 border-gray-200 rounded-xl ${colorClass}`}>
      {value}
    </div>
  </div>
);
