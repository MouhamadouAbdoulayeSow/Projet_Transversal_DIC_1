

"""
Commande Django pour importer des données CSV vers MongoDB
"""
from django.core.management.base import BaseCommand
from api.models import Event, Product
import pandas as pd
from datetime import datetime
import logging
import csv

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Importe des données CSV vers MongoDB (collection events et products)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            required=True,
            help='Chemin vers le fichier CSV à importer'
        )
        parser.add_argument(
            '--chunk-size',
            type=int,
            default=10000,
            help='Taille des chunks pour le traitement (défaut: 10000)'
        )
        parser.add_argument(
            '--clear-events',
            action='store_true',
            help='Supprimer les événements existants avant l\'import'
        )
        parser.add_argument(
            '--clear-products',
            action='store_true',
            help='Supprimer les produits existants avant l\'import'
        )

    def handle(self, *args, **options):
        file_path = options['file']
        chunk_size = options['chunk_size']
        clear_events = options['clear_events']
        clear_products = options['clear_products']

        try:
            # Vérifier que le fichier existe
            import os
            if not os.path.exists(file_path):
                self.stdout.write(
                    self.style.ERROR(f'Fichier non trouvé: {file_path}')
                )
                return

            # Vérifier que c'est bien un fichier CSV
            if not file_path.lower().endswith(('.csv', '.txt')):
                self.stdout.write(
                    self.style.WARNING(
                        f'Attention: Le fichier "{file_path}" ne semble pas être un fichier CSV.\n'
                        f'Assurez-vous de spécifier le chemin vers votre fichier CSV, pas le script Python.'
                    )
                )
                response = input('Continuer quand même? (o/n): ')
                if response.lower() != 'o':
                    return

            self.stdout.write(f'Lecture du fichier CSV: {file_path}')

            # Lire le CSV par chunks pour gérer les gros fichiers
            total_events = 0
            total_products = 0
            products_dict = {}  # Pour éviter les doublons

            # Supprimer les événements existants si demandé
            if clear_events:
                count = Event.objects.count()
                Event.objects.all().delete()
                self.stdout.write(f'{count} événements supprimés')

            # Supprimer les produits existants si demandé
            if clear_products:
                count = Product.objects.count()
                Product.objects.all().delete()
                self.stdout.write(f'{count} produits supprimés')

            # Essayer de détecter le délimiteur en lisant les premières lignes
            delimiter = ','
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    sample = f.read(1024)
                    sniffer = csv.Sniffer()
                    delimiter = sniffer.sniff(sample).delimiter
                    self.stdout.write(f'Délimiteur détecté: "{delimiter}"')
            except Exception as e:
                self.stdout.write(f'Impossible de détecter le délimiteur, utilisation de "," par défaut: {e}')

            # Lire le CSV avec gestion d'erreurs améliorée
            # Essayer différentes méthodes selon la version de pandas
            chunk_iter = None
            
            # Essayer d'abord avec on_bad_lines (pandas >= 1.3) et engine python
            try:
                chunk_iter = pd.read_csv(
                    file_path,
                    chunksize=chunk_size,
                    delimiter=delimiter,
                    encoding='utf-8',
                    on_bad_lines='skip',
                    engine='python'
                )
            except TypeError:
                # Si on_bad_lines n'existe pas, utiliser error_bad_lines (pandas < 1.3)
                try:
                    chunk_iter = pd.read_csv(
                        file_path,
                        chunksize=chunk_size,
                        sep=delimiter,
                        encoding='utf-8',
                        error_bad_lines=False,
                        warn_bad_lines=False,
                        engine='python',
                        skipinitialspace=True,
                        quotechar='"',
                        quoting=csv.QUOTE_MINIMAL
                    )
                except Exception as e2:
                    # Dernière tentative avec le parser C (plus rapide mais moins tolérant)
                    self.stdout.write(f'Tentative avec le parser C (plus rapide)...')
                    try:
                        chunk_iter = pd.read_csv(
                            file_path,
                            chunksize=chunk_size,
                            low_memory=False,
                            sep=delimiter,
                            encoding='utf-8',
                            error_bad_lines=False,
                            warn_bad_lines=False
                        )
                    except Exception as e3:
                        self.stdout.write(
                            self.style.ERROR(
                                f'Impossible de lire le fichier CSV avec toutes les méthodes tentées.\n'
                                f'Dernière erreur: {e3}\n'
                                f'Vérifiez que le fichier est bien un CSV valide.'
                            )
                        )
                        raise
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'Erreur lors de la lecture du CSV: {e}')
                )
                raise

            # Afficher les colonnes du premier chunk pour debug
            first_chunk = True
            
            for chunk_num, chunk in enumerate(chunk_iter, 1):
                if first_chunk:
                    self.stdout.write(f'Colonnes détectées dans le CSV: {list(chunk.columns)}')
                    first_chunk = False
                
                self.stdout.write(f'Traitement du chunk {chunk_num} ({len(chunk)} lignes)...')

                # Vérifier que les colonnes requises existent
                required_columns = ['visitorid', 'itemid', 'event']
                missing_columns = [col for col in required_columns if col not in chunk.columns]
                if missing_columns:
                    self.stdout.write(
                        self.style.ERROR(
                            f'Colonnes manquantes dans le CSV: {missing_columns}\n'
                            f'Colonnes disponibles: {list(chunk.columns)}'
                        )
                    )
                    return

                # Nettoyer et préparer les données - seulement les colonnes nécessaires
                initial_count = len(chunk)
                chunk = chunk.dropna(subset=['visitorid', 'itemid', 'event'])
                dropped_count = initial_count - len(chunk)
                if dropped_count > 0:
                    self.stdout.write(f'  {dropped_count} lignes ignorées (données manquantes)')
                
                if len(chunk) == 0:
                    self.stdout.write(f'  Aucune ligne valide dans ce chunk après nettoyage')
                    continue

                # Traiter le timestamp de manière optionnelle
                # Si le timestamp existe et est valide, on l'utilise, sinon on utilise la date actuelle
                if 'timestamp' in chunk.columns:
                    try:
                        # Essayer plusieurs formats de timestamp
                        chunk['timestamp'] = pd.to_datetime(
                            chunk['timestamp'],
                            errors='coerce',
                            infer_datetime_format=True
                        )
                        # Remplacer les timestamps invalides par la date actuelle
                        chunk['timestamp'] = chunk['timestamp'].fillna(pd.Timestamp.now())
                    except Exception:
                        # Si la conversion échoue complètement, utiliser la date actuelle
                        chunk['timestamp'] = pd.Timestamp.now()
                else:
                    # Si pas de timestamp, utiliser la date actuelle
                    chunk['timestamp'] = pd.Timestamp.now()

                # Traiter les événements
                events_to_create = []
                errors_count = 0
                for _, row in chunk.iterrows():
                    try:
                        # Normaliser le type d'événement
                        event_type = str(row['event']).lower().strip()
                        if event_type == 'addtocart':
                            event_type = 'addtocart'
                        elif event_type == 'transaction':
                            event_type = 'transaction'
                        elif event_type == 'view':
                            event_type = 'view'
                        elif event_type == 'removefromcart':
                            event_type = 'removefromcart'
                        else:
                            event_type = 'view'  # Par défaut

                        # Vérifier que le timestamp est valide
                        timestamp = row.get('timestamp', pd.Timestamp.now())
                        if pd.isna(timestamp):
                            timestamp = pd.Timestamp.now()

                        # Créer l'événement avec seulement les champs nécessaires
                        event_data = {
                            'visitorid': str(row['visitorid']).strip(),
                            'itemid': str(row['itemid']).strip(),
                            'event': event_type,
                            'timestamp': timestamp,
                        }

                        events_to_create.append(Event(**event_data))

                        # Collecter les produits uniques pour la collection products
                        itemid = str(row['itemid']).strip()
                        if itemid not in products_dict:
                            product_data = {
                                'itemid': itemid,
                            }
                            # Ajouter les données produit si présentes dans le CSV
                            if 'name' in row and pd.notna(row['name']):
                                product_data['name'] = str(row['name']).strip()
                            if 'image' in row and pd.notna(row['image']):
                                product_data['image'] = str(row['image']).strip()
                            if 'ratings' in row and pd.notna(row['ratings']):
                                try:
                                    product_data['ratings'] = float(row['ratings'])
                                except (ValueError, TypeError):
                                    product_data['ratings'] = 0.0
                            if 'discount_price' in row and pd.notna(row['discount_price']):
                                try:
                                    product_data['discount_price'] = float(row['discount_price'])
                                except (ValueError, TypeError):
                                    product_data['discount_price'] = 0.0
                            if 'actual_price' in row and pd.notna(row['actual_price']):
                                try:
                                    product_data['actual_price'] = float(row['actual_price'])
                                except (ValueError, TypeError):
                                    product_data['actual_price'] = 0.0

                            products_dict[itemid] = product_data

                    except Exception as e:
                        errors_count += 1
                        if errors_count <= 5:  # Afficher seulement les 5 premières erreurs
                            logger.warning(f'Erreur lors du traitement d\'une ligne: {e}')
                        continue

                if errors_count > 0:
                    self.stdout.write(f'  {errors_count} erreurs lors du traitement des lignes')

                # Insérer les événements par batch
                if events_to_create:
                    try:
                        Event.objects.insert(events_to_create, load_bulk=False)
                        total_events += len(events_to_create)
                        self.stdout.write(f'  {len(events_to_create)} événements insérés')
                    except Exception as e:
                        self.stdout.write(
                            self.style.ERROR(f'Erreur lors de l\'insertion des événements: {e}')
                        )
                        logger.exception('Erreur détaillée lors de l\'insertion')
                else:
                    if chunk_num == 1:
                        self.stdout.write(
                            self.style.WARNING(
                                f'Aucun événement créé dans le premier chunk. '
                                f'Vérifiez les données du CSV.'
                            )
                        )

            # Insérer ou mettre à jour les produits
            self.stdout.write(f'\nTraitement de {len(products_dict)} produits uniques...')
            products_to_create = []
            products_to_update = []

            for itemid, product_data in products_dict.items():
                try:
                    existing_product = Product.objects(itemid=itemid).first()
                    if existing_product:
                        # Mettre à jour les champs manquants
                        for key, value in product_data.items():
                            if key != 'itemid' and not hasattr(existing_product, key) or getattr(existing_product, key) is None:
                                setattr(existing_product, key, value)
                        products_to_update.append(existing_product)
                    else:
                        # Créer un nouveau produit avec des valeurs par défaut
                        product_data.setdefault('name', f'Product {itemid}')
                        product_data.setdefault('ratings', 0.0)
                        product_data.setdefault('discount_price', 0.0)
                        product_data.setdefault('actual_price', 0.0)
                        product_data.setdefault('in_stock', True)
                        product_data.setdefault('stock_quantity', 0)
                        products_to_create.append(Product(**product_data))
                except Exception as e:
                    logger.warning(f'Erreur lors du traitement du produit {itemid}: {e}')
                    continue

            # Insérer les nouveaux produits
            if products_to_create:
                Product.objects.insert(products_to_create, load_bulk=False)
                total_products += len(products_to_create)
                self.stdout.write(f'  {len(products_to_create)} nouveaux produits créés')

            # Mettre à jour les produits existants
            if products_to_update:
                for product in products_to_update:
                    product.save()
                total_products += len(products_to_update)
                self.stdout.write(f'  {len(products_to_update)} produits mis à jour')

            self.stdout.write(
                self.style.SUCCESS(
                    f'\nImport terminé avec succès!\n'
                    f'  - {total_events} événements importés\n'
                    f'  - {total_products} produits traités'
                )
            )

        except pd.errors.ParserError as e:
            self.stdout.write(
                self.style.ERROR(
                    f'Erreur de parsing CSV: {e}\n'
                    f'Vérifiez que le fichier est bien un CSV valide.\n'
                    f'Le fichier spécifié était: {file_path}'
                )
            )
            logger.exception('Erreur détaillée lors de l\'import CSV')
        except FileNotFoundError as e:
            self.stdout.write(
                self.style.ERROR(f'Fichier non trouvé: {file_path}')
            )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(
                    f'Erreur lors de l\'import: {e}\n'
                    f'Type d\'erreur: {type(e).__name__}'
                )
            )
            logger.exception('Erreur détaillée lors de l\'import CSV')

