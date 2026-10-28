# PathAble AI

Turn photos of public spaces into **evidence-backed, human-verified reports** of potential accessibility barriers: blocked curb ramps, obstructed footpaths, damaged walking surfaces, and difficult entrances.

Built for the Meta Global AI Developer Hackathon with the Meta Model API:

- **Muse Spark 1.3** reasons about the scene and returns structured findings.
- **SAM 3.1** segments the visual evidence behind each finding.

## Quick start

```bash
npm install
cp .env.example .env.local   # then add your MODEL_API_KEY from https://dev.meta.ai
npm run dev                  # http://localhost:3000
```

Health check: `GET /api/health` reports whether the API key is configured.

Smoke test Muse Spark on one photo:

```bash
npm run smoke:spark -- path/to/photo.jpg
```

## Status

Work in progress. Architecture, evaluation results, and limitations will be documented here.
