# Karteczka

Pływająca karteczka z zadaniami panelu task.kropidlowscy.pl na macOS.
Zawsze na wierzchu, widoczna na wszystkich biurkach, chowana skrótem Option+Spacja,
ikonka w pasku menu, autostart z systemem.

## Budowanie na Macu (Terminal)

```bash
# 1. Narzedzia Apple (jesli okienko - kliknij Zainstaluj i poczekaj)
xcode-select --install

# 2. Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

# 3. Node 20+ (jesli brak: https://nodejs.org - instalator LTS)
node -v

# 4. Kod i uruchomienie deweloperskie (apka otwiera sie od razu)
git clone https://github.com/JanekKropidlowski/karteczka-mac.git
cd karteczka-mac
npm install
npm run tauri dev

# 5. Pelny build (.app + .dmg w src-tauri/target/release/bundle/)
npm run tauri build
```

## Budowanie w chmurze (bez Maca)

Push tagu `v*` odpala GitHub Actions (runner macOS) i publikuje Release z .dmg.

## Pierwsze uruchomienie zbudowanej apki

Apka nie jest podpisana certyfikatem Apple. Po skopiowaniu do /Applications
uruchom dwuklikiem `Odblokuj.command` (usuwa kwarantanne) albo wejdz w
Ustawienia Systemowe -> Prywatnosc i bezpieczenstwo -> "Otworz mimo to".

## Skroty

- Option+Spacja - pokaz/ukryj karteczke (globalnie)
- Ikonka w pasku menu - pokaz/ukryj, Zakoncz
