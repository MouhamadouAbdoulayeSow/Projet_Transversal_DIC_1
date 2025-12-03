import { AlertTriangle, Info, AlertCircle, X } from 'lucide-react';
import { Alert } from '../types';
import { useState } from 'react';

interface AlertsPanelProps {
  alerts: Alert[];
  onDismiss?: (index: number) => void;
}

const alertIcons = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const alertColors = {
  critical: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
};

export default function AlertsPanel({ alerts, onDismiss }: AlertsPanelProps) {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const handleDismiss = (index: number) => {
    setDismissed(new Set([...dismissed, index]));
    if (onDismiss) {
      onDismiss(index);
    }
  };

  const visibleAlerts = alerts.filter((_, index) => !dismissed.has(index));

  if (visibleAlerts.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center text-gray-500">
          <Info size={20} className="mr-2" />
          <span>Aucune alerte active</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Alertes</h2>
        <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-semibold">
          {visibleAlerts.length}
        </span>
      </div>
      
      <div className="space-y-3">
        {visibleAlerts.map((alert, index) => {
          const Icon = alertIcons[alert.type];
          const originalIndex = alerts.indexOf(alert);
          
          return (
            <div
              key={originalIndex}
              className={`border rounded-lg p-4 ${alertColors[alert.type]}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <Icon size={20} className="mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">{alert.title}</h3>
                    <p className="text-sm mb-2">{alert.message}</p>
                    <p className="text-xs opacity-75">
                      <strong>Action:</strong> {alert.action}
                    </p>
                    <p className="text-xs opacity-60 mt-1">
                      {new Date(alert.timestamp).toLocaleString('fr-FR')}
                    </p>
                  </div>
                </div>
                {onDismiss && (
                  <button
                    onClick={() => handleDismiss(originalIndex)}
                    className="ml-2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

