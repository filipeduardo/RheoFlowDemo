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

Pushing to `main` triggers the workflow in `.github/workflows/pages.yml`. In the repository settings, select **GitHub Actions** as the Pages deployment source. The site will then be published at:

https://filipeduardo.github.io/RheoFlowDemo/
