# RheoFlow

Interactive browser-based simulator for fully developed flow of generalized Newtonian fluids in circular ducts.

## Models

- Newtonian
- Power-Law
- Bingham
- Herschel–Bulkley

The application visualizes velocity and shear-stress profiles, the unyielded plug region, animated flow, wall stress, flow rate, and the plasticity index

\[
\mathrm{Pl}=\frac{\tau_0}{\tau_w}=\frac{R_p}{R}.
\]

## Run locally

Open `index.html` directly or serve the repository with any static HTTP server, for example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

1. Go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Pushing to `main` will trigger the workflow in `.github/workflows/pages.yml`.
4. The site will be published at:

https://filipeduardo.github.io/RheoFlowDemo/
