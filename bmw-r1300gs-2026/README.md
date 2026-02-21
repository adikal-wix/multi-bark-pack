# BMW R 1300 GS 2026 One Pager

Static mobile-first one-page site for GitHub Pages.

## Local preview

```bash
cd bmw-r1300gs-2026
python3 -m http.server 8080
```

Open: http://localhost:8080

## Sources

- BMW Motorrad official model page: https://www.bmwmotorcycles.com/en/models/adventure/r1300gs.html
- BMW Group PressClub technical data + official images: https://www.press.bmwgroup.com/global/article/detail/T0438285EN/the-new-bmw-r-1300-gs

## Deployment

GitHub Actions workflow: `.github/workflows/deploy-bmw-r1300gs.yml`

It deploys the `bmw-r1300gs-2026/` folder to GitHub Pages on pushes to `main`.
