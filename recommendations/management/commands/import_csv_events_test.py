"""
Commande Django pour importer les 5 premières lignes CSV vers MongoDB (collection productTest)
"""
from django.core.management.base import BaseCommand
import pandas as pd
import logging
import csv

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Importe les 5 premières lignes d\'un CSV vers MongoDB (collection productTest)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            required=True,
            help='Chemin vers le fichier CSV à importer'
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Supprimer les produits existants dans productTest avant l\'import'
        )

    def handle(self, *args, **options):
        file_path = options['file']
        clear_collection = options['clear']

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
                        f'Attention: Le fichier "{file_path}" ne semble pas être un fichier CSV.'
                    )
                )
                response = input('Continuer quand même? (o/n): ')
                if response.lower() != 'o':
                    return

            self.stdout.write(f'Lecture du fichier CSV: {file_path}')

            # Supprimer les produits existants si demandé
            if clear_collection:
                from mongoengine import get_db
                db = get_db()
                count = db.productTest.count_documents({})
                db.productTest.delete_many({})
                self.stdout.write(f'{count} produits supprimés de la collection productTest')

            # Détecter le délimiteur
            delimiter = ','
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    sample = f.read(1024)
                    sniffer = csv.Sniffer()
                    delimiter = sniffer.sniff(sample).delimiter
                    self.stdout.write(f'Délimiteur détecté: "{delimiter}"')
            except Exception as e:
                self.stdout.write(f'Impossible de détecter le délimiteur, utilisation de "," par défaut')

            # Lire seulement les 5 premières lignes du CSV
            df = None
            try:
                # Essayer d'abord avec on_bad_lines (pandas >= 1.3)
                df = pd.read_csv(
                    file_path,
                    nrows=5,  # Lire seulement les 5 premières lignes
                    delimiter=delimiter,
                    encoding='utf-8',
                    on_bad_lines='skip',
                    engine='python'
                )
            except TypeError:
                # Si on_bad_lines n'existe pas, utiliser error_bad_lines (pandas < 1.3)
                try:
                    df = pd.read_csv(
                        file_path,
                        nrows=5,
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
                    self.stdout.write(
                        self.style.ERROR(
                            f'Erreur lors de la lecture du CSV: {e2}\n'
                            f'Vérifiez que le fichier est bien un CSV valide.'
                        )
                    )
                    raise

            self.stdout.write(f'Colonnes détectées: {list(df.columns)}')
            self.stdout.write(f'{len(df)} lignes lues depuis le CSV\n')

            if len(df) == 0:
                self.stdout.write(self.style.WARNING('Aucune ligne à importer'))
                return

            # Préparer les documents à insérer dans productTest
            products_to_insert = []
            
            for idx, row in df.iterrows():
                # Créer un document avec toutes les colonnes disponibles
                product_data = {}
                
                # Parcourir toutes les colonnes du CSV
                for col in df.columns:
                    value = row[col]
                    
                    # Ignorer les valeurs NaN/None
                    if pd.notna(value):
                        col_lower = col.lower().strip()
                        
                        # Convertir en types appropriés selon le nom de la colonne
                        if col_lower in ['ratings', 'discount_price', 'actual_price', 'stock_quantity', 'price']:
                            try:
                                product_data[col] = float(value)
                            except (ValueError, TypeError):
                                product_data[col] = 0.0
                        elif col_lower in ['in_stock', 'available']:
                            try:
                                product_data[col] = bool(value)
                            except (ValueError, TypeError):
                                product_data[col] = True
                        else:
                            # Garder comme string pour les autres champs
                            product_data[col] = str(value).strip()
                
                # S'assurer qu'il y a un identifiant unique
                if 'itemid' not in product_data and '_id' not in product_data:
                    product_data['itemid'] = f'item_{idx + 1}'
                
                products_to_insert.append(product_data)
                
                # Afficher le document pour debug
                self.stdout.write(f'\nLigne {idx + 1}:')
                for key, val in product_data.items():
                    self.stdout.write(f'  {key}: {val}')

            # Insérer dans MongoDB (collection productTest)
            from mongoengine import get_db
            db = get_db()
            
            if products_to_insert:
                result = db.productTest.insert_many(products_to_insert)
                
                self.stdout.write(
                    self.style.SUCCESS(
                        f'\n{"="*60}\n'
                        f' Import terminé avec succès!\n'
                        f'{"="*60}\n'
                        f'Collection cible: productTest\n'
                        f'Documents insérés: {len(result.inserted_ids)}\n'
                        f'IDs MongoDB générés:\n'
                    )
                )
                
                for i, doc_id in enumerate(result.inserted_ids, 1):
                    self.stdout.write(f'  {i}. {doc_id}')
                
                self.stdout.write(f'\n{"="*60}')
            else:
                self.stdout.write(self.style.WARNING('Aucun document à insérer'))

        except FileNotFoundError as e:
            self.stdout.write(
                self.style.ERROR(f'Fichier non trouvé: {file_path}')
            )
        except pd.errors.ParserError as e:
            self.stdout.write(
                self.style.ERROR(
                    f'Erreur de parsing CSV: {e}\n'
                    f'Vérifiez que le fichier est bien un CSV valide.'
                )
            )
            logger.exception('Erreur détaillée lors du parsing CSV')
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(
                    f'Erreur lors de l\'import: {e}\n'
                    f'Type d\'erreur: {type(e).__name__}'
                )
            )
            logger.exception('Erreur détaillée lors de l\'import CSV')