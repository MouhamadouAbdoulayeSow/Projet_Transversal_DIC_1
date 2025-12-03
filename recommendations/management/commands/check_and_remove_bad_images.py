from django.core.management.base import BaseCommand
from api.models import Product
import urllib.request
import urllib.error
import time

class Command(BaseCommand):
    help = 'Vérifie les URLs d\'images et supprime les produits avec des images invalides (non-200)'

    def add_arguments(self, parser):
        parser.add_argument('--itemids', nargs='+', help='IDs de produits spécifiques à vérifier')
        parser.add_argument('--all', action='store_true', help='Vérifier tous les produits (défaut)')
        parser.add_argument('--batch-size', type=int, default=100, help='Nombre de produits à traiter avant affichage du résumé')
        parser.add_argument('--delay', type=float, default=0.1, help='Délai entre les requêtes (secondes)')

    def handle(self, *args, **options):
        if options['itemids']:
            # Convertir en int car MongoDB stocke les itemids comme des entiers
            items_to_check = []
            for itemid_str in options['itemids']:
                try:
                    items_to_check.append(int(itemid_str))
                except ValueError:
                    items_to_check.append(itemid_str)
            products = Product.objects.filter(itemid__in=items_to_check)
        else:
            # Par défaut, vérifier tous les produits
            products = Product.objects.all()

        total_products = products.count()
        self.stdout.write(f'\n🔍 Vérification de {total_products} produits...\n')

        deleted_count = 0
        valid_count = 0
        no_image_count = 0
        error_count = 0

        batch_size = options['batch_size']
        delay = options['delay']

        for idx, product in enumerate(products, 1):
            itemid = product.itemid
            
            # Afficher la progression tous les batch_size produits
            if idx % batch_size == 0 or idx == 1:
                self.stdout.write(f'\n📊 Progression: {idx}/{total_products} produits traités')
                self.stdout.write(f'   ✅ Valides: {valid_count} | ❌ Supprimés: {deleted_count} | ⚠️  Sans image: {no_image_count} | 🔴 Erreurs: {error_count}\n')
            
            try:
                if not product.image:
                    # Produit sans image - supprimer
                    product.delete()
                    deleted_count += 1
                    no_image_count += 1
                    if idx <= 10 or idx % batch_size == 0:
                        self.stdout.write(self.style.ERROR(f'  [{idx}] Produit {itemid}: ❌ Pas d\'image - SUPPRIMÉ'))
                    continue
                
                # Tester l'URL de l'image
                try:
                    req = urllib.request.Request(product.image)
                    req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
                    with urllib.request.urlopen(req, timeout=10) as response:
                        status = response.getcode()
                        if status != 200:
                            # Image invalide (pas 200) - supprimer le produit
                            product.delete()
                            deleted_count += 1
                            if idx <= 10 or idx % batch_size == 0:
                                self.stdout.write(self.style.ERROR(f'  [{idx}] Produit {itemid}: ❌ Image HTTP {status} - SUPPRIMÉ'))
                        else:
                            # Image valide (200)
                            valid_count += 1
                            if idx <= 10:
                                self.stdout.write(self.style.SUCCESS(f'  [{idx}] Produit {itemid}: ✅ Image valide'))
                            
                except urllib.error.HTTPError as e:
                    # Erreur HTTP (400, 404, etc.) - supprimer le produit
                    product.delete()
                    deleted_count += 1
                    if idx <= 10 or idx % batch_size == 0:
                        self.stdout.write(self.style.ERROR(f'  [{idx}] Produit {itemid}: ❌ Image HTTP {e.code} - SUPPRIMÉ'))
                        
                except urllib.error.URLError as e:
                    # Erreur URL (timeout, DNS, etc.) - supprimer le produit
                    product.delete()
                    deleted_count += 1
                    error_count += 1
                    if idx <= 10 or idx % batch_size == 0:
                        self.stdout.write(self.style.ERROR(f'  [{idx}] Produit {itemid}: ❌ Erreur URL ({e.reason}) - SUPPRIMÉ'))
                        
                except Exception as e:
                    # Autre erreur - supprimer le produit
                    product.delete()
                    deleted_count += 1
                    error_count += 1
                    if idx <= 10 or idx % batch_size == 0:
                        self.stdout.write(self.style.ERROR(f'  [{idx}] Produit {itemid}: ❌ Erreur ({str(e)[:50]}) - SUPPRIMÉ'))
                
                # Petit délai pour éviter de surcharger les serveurs
                if delay > 0:
                    time.sleep(delay)
                    
            except Exception as e:
                error_count += 1
                if idx <= 10 or idx % batch_size == 0:
                    self.stdout.write(self.style.ERROR(f'  [{idx}] Erreur pour produit {itemid}: {e}'))

        # Résumé final
        self.stdout.write(self.style.SUCCESS(f'\n\n{"="*60}'))
        self.stdout.write(self.style.SUCCESS('📊 RÉSUMÉ FINAL'))
        self.stdout.write(self.style.SUCCESS(f'{"="*60}'))
        self.stdout.write(self.style.SUCCESS(f'✅ Images valides (HTTP 200): {valid_count}'))
        self.stdout.write(self.style.ERROR(f'❌ Produits supprimés: {deleted_count}'))
        self.stdout.write(self.style.WARNING(f'   - Sans image: {no_image_count}'))
        self.stdout.write(self.style.WARNING(f'   - Image invalide (non-200): {deleted_count - no_image_count}'))
        self.stdout.write(self.style.ERROR(f'🔴 Erreurs: {error_count}'))
        self.stdout.write(self.style.SUCCESS(f'📦 Total traité: {total_products}'))
        self.stdout.write(self.style.SUCCESS(f'{"="*60}\n'))

