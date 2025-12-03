import { Calendar } from 'lucide-react';

interface TimeRangeSelectorProps {
  days: number;
  onChange: (days: number) => void;
}

const presets = [
  { label: '7 jours', days: 7 },
  { label: '30 jours', days: 30 },
  { label: '90 jours', days: 90 },
  { label: '1 an', days: 365 },
];

export default function TimeRangeSelector({ days, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="flex items-center space-x-2">
      <Calendar size={18} className="text-gray-500" />
      <select
        value={days}
        onChange={(e) => onChange(Number(e.target.value))}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {presets.map((preset) => (
          <option key={preset.days} value={preset.days}>
            {preset.label}
          </option>
        ))}
      </select>
    </div>
  );
}

