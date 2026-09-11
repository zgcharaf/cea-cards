# CEA Cards V2 — Top Quartile

Free installable PWA for iPhone and desktop.

## What's new
- 250 original study cards aligned to the themes and difficulty patterns of the official CEA QCM annales 2023, 2024 and 2025.
- Four preloaded decks:
  - Finance: 65
  - Statistiques: 65
  - Assurance non-vie: 65
  - Assurance vie: 55
- FSRS-style adaptive scheduling using:
  - card difficulty
  - memory stability
  - estimated retrievability
  - configurable target retention
- Weakness mode: prioritizes lapses, difficult cards and low predicted recall.
- Mastery by deck.
- Again / Hard / Good / Easy.
- Undo, browse/search, edit/add/delete, TSV import.
- JSON backup and restore.
- Offline cache after first load.

## Important
The scheduler is **FSRS-style**, not a byte-for-byte implementation of Anki's current FSRS algorithm. It uses the same core ideas—difficulty, stability, retrievability and desired retention—but a transparent custom update rule.

The 250 cards are original study material. They are based on concepts and question patterns seen in the official CEA annales, not a verbatim reproduction of the exam papers.

## Free iPhone installation
A PWA needs an HTTPS address to behave as a real installable/offline iPhone app.

### GitHub Pages
1. Create a public or Pages-enabled GitHub repository, for example `cea-cards`.
2. Upload every file in this ZIP to the repository root.
3. GitHub → Settings → Pages.
4. Build and deployment → Deploy from a branch.
5. Select `main` and `/ (root)`.
6. Open the generated Pages URL in Safari on iPhone.
7. Safari → Share → Add to Home Screen.

Your study data stays in browser storage on that device. Use **Stats → Exporter JSON** periodically for backups.

## Updating an earlier CEA Cards installation
V2 attempts to migrate V1 local study data automatically if it exists in the same website origin. If you change hosting URL/domain, export a JSON backup first and restore it on the new site.


## Annales officielles — mode examen

Nouvel onglet **Annales** :
- sujets officiels IRM 2023, 2024 et 2025 ;
- chronomètre 3 h ;
- feuille-réponse 56 questions ;
- réponses A/B/C/D/E ;
- questions marquées ;
- progression sauvegardée automatiquement ;
- reprise d'une tentative interrompue ;
- historique ;
- calcul du score si une clé de correction fiable de 56 réponses est fournie.

L'IRM indique explicitement que les corrigés ne sont pas publiés. L'application n'invente donc pas de clé « officielle ».
