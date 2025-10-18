# Valora

Valora is an open source web application that computes a **Smart Score** (0–100) for any publicly traded company using only free data sources.  The project is inspired by platforms like StockPEG and built with a modern React/TypeScript frontend, an Express backend proxy/cache and a simple continuous‑integration and deployment pipeline.

## Features

- **Smart Score calculation** – Combines value, growth, quality and sentiment metrics into a single 0–100 score.
- **Client–server architecture** – All API calls are routed through a Node/Express proxy to protect API keys and handle rate limits.  The proxy implements an LRU cache.
- **Modern frontend stack** – React + Vite + TypeScript + Tailwind with dark mode and responsive design.
- **Static hosting** – The frontend is deployed to GitHub Pages via GitHub Actions.  The backend can be deployed to a free Render web service.
- **Documentation** – See the `docs/` folder for research methodology and data source details.

## Repository Structure

- `frontend/` – React/Vite application.  Run `npm install` and `npm run dev` inside this directory to start a development server.
- `backend/` – Express proxy server with caching.  Run `npm install` and `npm start` here to start the server on port 3001 (or set `PORT`).
- `public/` – Static assets including the Valora logo and aurora hero graphic.
- `docs/` – Research and data source documentation used to design the scoring model.
- `.github/workflows/` – CI/CD pipelines for building, testing and deploying the project.

## Local Development

```
# Clone the repository
git clone https://github.com/WillWSmith/valora.git
cd valora

# Install dependencies for the frontend
cd frontend
npm install
npm run dev

# In a separate terminal, start the backend
cd ../backend
npm install
npm start
```

The frontend expects a proxy at `/api/proxy?url=…` to fetch data from third party APIs.  When deploying to Render, set the environment variables for your API keys (e.g. `ALPHA_VANTAGE_KEY`, `FMP_KEY`) and update the frontend’s `VITE_API_BASE_URL` accordingly.

## Deployment

GitHub Actions automatically build and deploy the frontend to GitHub Pages on every push to `main`.  The Pages URL will be of the form `https://<username>.github.io/valora`.  To deploy the backend, create a free web service on [Render](https://render.com/) and point it to the `backend/` directory.  See `docs/datasources.md` for information on rate limits and caching strategy.

## License

This project is released under the MIT License.  See `LICENSE` for more information.
