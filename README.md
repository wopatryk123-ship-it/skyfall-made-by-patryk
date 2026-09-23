# SKYFALL — made by Patryk v20

## Co naprawiono
- Rejestracja i logowanie przez działające API Express.
- Przyciski UI są podpinane po załadowaniu DOM i mają obsługę błędów.
- Sesja logowania jest przywracana po odświeżeniu strony.
- Dodano `/api/me`, `/api/ping` i `/health` do diagnostyki.
- Sklep i zakup skinów używają tego samego mechanizmu API.
- Gra nie ukrywa lobby, dopóki WebSocket nie zaakceptuje logowania.
- Błędy WebSocket/API są pokazywane w lobby zamiast „nic się nie działo”.
- Serwer używa absolutnej ścieżki do `public` i `data.json`, więc uruchomienie z innego katalogu nie psuje ścieżek.

## Uruchomienie lokalne — Windows
1. Zainstaluj **Node.js 20 LTS lub nowszy**.
2. Rozpakuj ZIP.
3. Otwórz PowerShell/CMD w folderze projektu.
4. Wpisz:

```bash
npm install
npm start
```

5. Otwórz w przeglądarce:

`http://localhost:3000`

**Nie otwieraj `public/index.html` dwuklikiem.** Gra korzysta z backendu Node.js do rejestracji, logowania, sklepu i multiplayera.

## Sprawdzenie serwera
- `http://localhost:3000/health`
- `http://localhost:3000/api/ping`

Powinien pojawić się JSON z `ok: true`.

## Telefon w tej samej sieci Wi‑Fi
Serwer nasłuchuje na `0.0.0.0`. Sprawdź adres IPv4 komputera poleceniem `ipconfig`, np. `192.168.1.25`, a na telefonie otwórz:

`http://192.168.1.25:3000`

Jeśli Windows Firewall zapyta o dostęp dla Node.js, zezwól na prywatnych sieciach. Telefon i komputer muszą być w tej samej sieci.

## Multiplayer przez Internet
Do gry między telefonami przez różne sieci potrzebny jest publiczny hosting Node.js z WebSocketami (np. Render). Wtedy wszyscy otwierają ten sam adres HTTPS. Dla HTTPS klient automatycznie używa WSS.

## Ważne
To nadal jest build deweloperski. Dla produkcji należy ustawić własny `JWT_SECRET`, użyć trwałej bazy danych zamiast lokalnego `data.json` i włączyć właściwe zabezpieczenia hostingu.
