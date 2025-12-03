import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { TrendData } from '../types';

interface KPICardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  color: 'blue' | 'green' | 'yellow' | 'purple' | 'red' | 'indigo';
  trend?: TrendData;
  format?: 'number' | 'currency' | 'percent';
  subtitle?: string;
}

const colorClasses = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  yellow: 'bg-yellow-50 text-yellow-600',
  purple: 'bg-purple-50 text-purple-600',
  red: 'bg-red-50 text-red-600',
  indigo: 'bg-indigo-50 text-indigo-600',
};

const formatValue = (value: number | string, format: 'number' | 'currency' | 'percent' = 'number'): string => {
  if (typeof value === 'string') return value;
  
  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
    case 'percent':
      return `${value.toFixed(2)}%`;
    default:
      return value.toLocaleString('fr-FR');
  }
};

export default function KPICard({ 
  title, 
  value, 
  icon: Icon, 
  color, 
  trend,
  format = 'number',
  subtitle 
}: KPICardProps) {
  const formattedValue = formatValue(value, format);
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex-1">
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{formattedValue}</p>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon size={24} />
        </div>
      </div>
      
      {trend && (
        <div className="flex items-center space-x-2 mt-4 pt-4 border-t border-gray-100">
          {trend.trend === 'up' && (
            <TrendingUp size={16} className="text-green-600" />
          )}
          {trend.trend === 'down' && (
            <TrendingDown size={16} className="text-red-600" />
          )}
          {trend.trend === 'neutral' && (
            <Minus size={16} className="text-gray-400" />
          )}
          <span className={`text-sm font-medium ${
            trend.trend === 'up' ? 'text-green-600' : 
            trend.trend === 'down' ? 'text-red-600' : 
            'text-gray-600'
          }`}>
            {trend.change_percent > 0 ? '+' : ''}{trend.change_percent.toFixed(1)}%
          </span>
          <span className="text-xs text-gray-500">
            vs période précédente
          </span>
        </div>
      )}
    </div>
  );
}

