#!/bin/bash
# Lance le jeu en local sur le Mac (http://localhost:8080) et l'ouvre dans le navigateur.
cd "$(dirname "$0")"
PORT=8080
if lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Le port $PORT est déjà utilisé : j'ouvre simplement la page."
else
  /usr/local/bin/python3 -m http.server $PORT --directory source --bind 127.0.0.1 &
  sleep 1
fi
open "http://localhost:$PORT/"
echo "Syllabaire servi sur http://localhost:$PORT — fermer cette fenêtre arrête le serveur."
wait
