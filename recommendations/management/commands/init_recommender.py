"""
Commande Django pour initialiser le système de recommandation
"""
from django.core.management.base import BaseCommand
from recommendations.engine import (
    initialize_recommender,
    initialize_cf_recommender
)


class Command(BaseCommand):
    help = 'Initialise les systèmes de recommandation (content-based et collaborative filtering)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--content-only',
            action='store_true',
            help='Initialiser uniquement le modèle content-based'
        )
        parser.add_argument(
            '--collaborative-only',
            action='store_true',
            help='Initialiser uniquement le modèle collaborative filtering'
        )
        parser.add_argument(
            '--max-events',
            type=int,
            default=None,
            help='Nombre maximum d\'événements à utiliser pour l\'entraînement CF (défaut: None = tous)'
        )
        parser.add_argument(
            '--sample-ratio',
            type=float,
            default=1.0,
            help='Ratio d\'échantillonnage pour CF (0.0 à 1.0, défaut: 1.0 = 100%% = tous les événements)'
        )
        parser.add_argument(
            '--min-interactions',
            type=int,
            default=2,
            help='Nombre minimum d\'interactions par item pour CF (défaut: 2)'
        )

    def handle(self, *args, **options):
        content_only = options['content_only']
        collaborative_only = options['collaborative_only']
        
        if not collaborative_only:
            self.stdout.write('Initialisation du modèle content-based...')
            try:
                initialize_recommender()
                self.stdout.write(
                    self.style.SUCCESS('Modèle content-based initialisé avec succès')
                )
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'Erreur lors de l\'initialisation content-based: {e}')
                )
        
        if not content_only:
            self.stdout.write('Initialisation du modèle collaborative filtering (ITEM-BASED)...')
            max_events = options.get('max_events')
            sample_ratio = options.get('sample_ratio', 1.0)
            min_interactions = options.get('min_interactions', 2)
            
            if max_events:
                self.stdout.write(f'  - Limitation à {max_events:,} événements')
            elif sample_ratio < 1.0:
                self.stdout.write(f'  - Échantillonnage: {sample_ratio*100:.1f}% des données')
            else:
                self.stdout.write(f'  - Mode: TOUS les événements (entraînement incrémental)')
            self.stdout.write(f'  - Min interactions par item: {min_interactions}')
            
            try:
                initialize_cf_recommender(
                    max_events=max_events,
                    sample_ratio=sample_ratio,
                    min_interactions=min_interactions
                )
                self.stdout.write(
                    self.style.SUCCESS('Modèle collaborative filtering initialisé avec succès')
                )
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'Erreur lors de l\'initialisation collaborative filtering: {e}')
                )
        
        if not content_only and not collaborative_only:
            self.stdout.write(
                self.style.SUCCESS('\nTous les systèmes de recommandation ont été initialisés')
            )