import { CheckCircle, XCircle, AlertCircle, Database, Cpu, Activity, Users, Package } from 'lucide-react';
import { SystemHealth as SystemHealthType } from '../types';

interface SystemHealthProps {
  health: SystemHealthType;
}

const statusColors = {
  healthy: 'text-green-600 bg-green-50',
  degraded: 'text-yellow-600 bg-yellow-50',
  down: 'text-red-600 bg-red-50',
  running: 'text-green-600 bg-green-50',
  stopped: 'text-red-600 bg-red-50',
  unknown: 'text-gray-600 bg-gray-50',
  trained: 'text-green-600 bg-green-50',
  not_trained: 'text-yellow-600 bg-yellow-50',
  error: 'text-red-600 bg-red-50',
};

const statusIcons = {
  healthy: CheckCircle,
  degraded: AlertCircle,
  down: XCircle,
  running: CheckCircle,
  stopped: XCircle,
  unknown: AlertCircle,
  trained: CheckCircle,
  not_trained: AlertCircle,
  error: XCircle,
};

export default function SystemHealth({ health }: SystemHealthProps) {
  const getStatusDisplay = (status: string) => {
    const Icon = statusIcons[status as keyof typeof statusIcons] || AlertCircle;
    const colorClass = statusColors[status as keyof typeof statusColors] || 'text-gray-600 bg-gray-50';
    
    return { Icon, colorClass };
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">État du Système</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* MongoDB */}
        <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200">
          <Database size={20} className="text-blue-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700">MongoDB</p>
            <div className="flex items-center space-x-2 mt-1">
              {(() => {
                const { Icon, colorClass } = getStatusDisplay(health.mongodb);
                return (
                  <>
                    <Icon size={16} className={colorClass.split(' ')[0]} />
                    <span className={`text-xs px-2 py-1 rounded ${colorClass}`}>
                      {health.mongodb}
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        {/* API */}
        <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200">
          <Cpu size={20} className="text-purple-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700">API</p>
            <div className="flex items-center space-x-2 mt-1">
              {(() => {
                const { Icon, colorClass } = getStatusDisplay(health.api);
                return (
                  <>
                    <Icon size={16} className={colorClass.split(' ')[0]} />
                    <span className={`text-xs px-2 py-1 rounded ${colorClass}`}>
                      {health.api}
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        {/* ML Model */}
        <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200">
          <Activity size={20} className="text-green-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700">Modèle ML</p>
            <div className="flex items-center space-x-2 mt-1">
              {(() => {
                const { Icon, colorClass } = getStatusDisplay(health.ml_model.status);
                return (
                  <>
                    <Icon size={16} className={colorClass.split(' ')[0]} />
                    <span className={`text-xs px-2 py-1 rounded ${colorClass}`}>
                      {health.ml_model.status}
                    </span>
                  </>
                );
              })()}
            </div>
            <p className="text-xs text-gray-500 mt-1">v{health.ml_model.version}</p>
          </div>
        </div>

        {/* Celery */}
        <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200">
          <Activity size={20} className="text-indigo-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700">Celery</p>
            <div className="flex items-center space-x-2 mt-1">
              {(() => {
                const { Icon, colorClass } = getStatusDisplay(health.celery.status);
                return (
                  <>
                    <Icon size={16} className={colorClass.split(' ')[0]} />
                    <span className={`text-xs px-2 py-1 rounded ${colorClass}`}>
                      {health.celery.status}
                    </span>
                  </>
                );
              })()}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {health.celery.active_tasks} tâches actives
            </p>
          </div>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-200">
        <div className="text-center">
          <Package size={20} className="text-blue-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900">{health.products_count}</p>
          <p className="text-xs text-gray-600">Produits</p>
        </div>
        <div className="text-center">
          <Users size={20} className="text-green-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900">{health.active_users_24h}</p>
          <p className="text-xs text-gray-600">Utilisateurs (24h)</p>
        </div>
        <div className="text-center">
          <Users size={20} className="text-purple-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900">{health.active_users_7d}</p>
          <p className="text-xs text-gray-600">Utilisateurs (7j)</p>
        </div>
      </div>
    </div>
  );
}

