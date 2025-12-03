import { RecommendationModel } from '../types';

export const recommendationModelOptions: {
  value: RecommendationModel;
  label: string;
  description: string;
}[] = [
  {
    value: 'hybrid',
    label: 'Hybrid',
    description: 'Combine content-based and collaborative signals.',
  },
  {
    value: 'content-based',
    label: 'Content-Based',
    description: 'Recommendations purely driven by product similarity.',
  },
  {
    value: 'collaborative-filtering',
    label: 'Collaborative Filtering',
    description: 'Recommendations based on user behavior patterns.',
  },
];

export const selectedModelToStrategy = (
  model?: RecommendationModel | string
): 'content' | 'collaborative' | 'hybrid' => {
  switch (model) {
    case 'content-based':
      return 'content';
    case 'collaborative-filtering':
      return 'collaborative';
    case 'hybrid':
    default:
      return 'hybrid';
  }
};

export const strategyToSelectedModel = (
  strategy: 'content' | 'collaborative' | 'hybrid'
): RecommendationModel => {
  switch (strategy) {
    case 'content':
      return 'content-based';
    case 'collaborative':
      return 'collaborative-filtering';
    case 'hybrid':
    default:
      return 'hybrid';
  }
};

