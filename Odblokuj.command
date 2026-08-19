#!/bin/bash
# Usuwa kwarantanne Gatekeepera z Karteczki (apka bez podpisu Apple).
# Kliknij dwukrotnie ten plik po skopiowaniu Karteczka.app do Applications.
set -e
if [ -d "/Applications/Karteczka.app" ]; then
  xattr -cr "/Applications/Karteczka.app"
  echo "Odblokowano /Applications/Karteczka.app - mozesz uruchomic Karteczke."
elif [ -d "$(dirname "$0")/Karteczka.app" ]; then
  xattr -cr "$(dirname "$0")/Karteczka.app"
  echo "Odblokowano Karteczka.app obok tego skryptu."
else
  echo "Nie znaleziono Karteczka.app - skopiuj apke do /Applications i uruchom ponownie."
fi
read -p "Enter zamyka okno..."
