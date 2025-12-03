import { TrendingUp, Settings, Star, ArrowRight } from 'lucide-react';
import { ActionableRecommendation } from '../types';

interface ActionableRecommendationsProps {
  recommendations: ActionableRecommendation[];
}

const recommendationIcons = {
  promote: Star,
  optimize: TrendingUp,
  tune: Settings,
};

const recommendationColors = {
  promote: 'bg-blue-50 border-blue-200 text-blue-800',
  optimize: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  tune: 'bg-purple-50 border-purple-200 text-purple-800',
};

export default function ActionableRecommendations({ recommendations }: ActionableRecommendationsProps) {
  if (recommendations.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center text-gray-500">
          <span>Aucune recommandation disponible</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Recommandations</h2>
      
      <div className="space-y-3">
        {recommendations.map((rec, index) => {
          const Icon = recommendationIcons[rec.type];
          
          return (
            <div
              key={index}
              className={`border rounded-lg p-4 ${recommendationColors[rec.type]}`}
            >
              <div className="flex items-start space-x-3">
                <Icon size={20} className="mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">{rec.title}</h3>
                  <p className="text-sm mb-2">{rec.message}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-xs opacity-75">
                      <strong>Action:</strong> {rec.action}
                    </p>
                    <ArrowRight size={16} className="opacity-50" />
                  </div>
                  {rec.products && rec.products.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {rec.products.map((productId) => (
                        <span
                          key={productId}
                          className="px-2 py-1 bg-white bg-opacity-50 rounded text-xs font-medium"
                        >
                          {productId}
                        </span>
                      ))}
                    </div>
                  )}
                  {rec.count && (
                    <p className="text-xs mt-2 opacity-75">
                      {rec.count} élément(s) concerné(s)
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

