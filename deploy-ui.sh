#!/bin/bash
# Deploy UI karteczki (OTA): build + kopia do NPM, apka na Macu laduje nowa
# wersje przy nastepnym otwarciu/odswiezeniu okna. Bez przebudowy na Macu.
set -e
cd /root/apps/karteczka-mac
npm run build
mkdir -p /opt/nginx-proxy-manager/data/karteczka
rsync -a --delete dist/ /opt/nginx-proxy-manager/data/karteczka/
echo "OTA wdrozone: https://task.kropidlowscy.pl/karteczka/"
