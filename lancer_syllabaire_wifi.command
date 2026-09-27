#!/bin/bash
# Sert le jeu sur le réseau local pour le tester depuis l'iPad (même Wi-Fi que le Mac).
# Limites sans HTTPS : pas de micro dans la cabine, pas de mode hors ligne.
cd "$(dirname "$0")"
PORT=8080
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
if [ -z "$IP" ]; then echo "Pas d'adresse Wi-Fi trouvée : le Mac est-il connecté au réseau ?"; read -r; exit 1; fi
echo "Sur l'iPad, dans Safari, ouvrir :   http://$IP:$PORT/"
echo "(le Mac doit rester allumé et sur le même Wi-Fi ; fermer cette fenêtre arrête le serveur)"
open "http://localhost:$PORT/" 2>/dev/null
/usr/local/bin/python3 -m http.server $PORT --directory source --bind 0.0.0.0
