import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  getAllSchemaFamilies,
  getSchemaFamily,
  getSchemaResource,
  getSchemaBundle,
  renderSchemaIndexHtml,
  renderSchemaFamilyHtml
} from '../data-format/schema-registry';

export const schemaRouter = Router();

// CORS middleware for all schema routes
schemaRouter.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  next();
});

// Handle OPTIONS preflight
schemaRouter.options('*', (_req: Request, res: Response) => {
  res.status(204).end();
});

// GET /schemas -> Index HTML
schemaRouter.get('/', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(renderSchemaIndexHtml());
});

// GET /schemas/:family -> Documentation HTML
schemaRouter.get('/:family', (req: Request, res: Response, next: NextFunction) => {
  const familyId = req.params.family;
  const html = renderSchemaFamilyHtml(familyId);
  if (!html) {
    return next();
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(html);
});

// GET /schemas/:family/:version -> Canonical JSON Schema
schemaRouter.get('/:family/:version', (req: Request, res: Response, next: NextFunction) => {
  const { family, version } = req.params;
  const schema = getSchemaResource(family, version);
  if (!schema) {
    return next();
  }
  res.setHeader('Content-Type', 'application/schema+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.json(schema);
});

// GET /schemas/:family/:version/bundle -> Compound Schema Document Bundle
schemaRouter.get('/:family/:version/bundle', (req: Request, res: Response, next: NextFunction) => {
  const { family, version } = req.params;
  const bundle = getSchemaBundle(family, version);
  if (!bundle) {
    return next();
  }
  res.setHeader('Content-Type', 'application/schema+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.json(bundle);
});

// Fallback 404 for any other /schemas/** request
// Ensures schema requests never fall through to the SPA index.html
schemaRouter.all('*', (req: Request, res: Response) => {
  res.status(404);
  const accept = req.headers.accept || '';
  if (accept.includes('application/json') || accept.includes('application/schema+json')) {
    res.json({
      error: 'Not Found',
      message: `Schema resource '${req.originalUrl}' not found.`,
      availableFamilies: getAllSchemaFamilies().map((f) => f.family)
    });
  } else {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html>
<head><title>404 Not Found - NFCWeb Schemas</title></head>
<body style="font-family: sans-serif; padding: 2rem; background: #090d16; color: #f8fafc;">
  <h1>404 - Schema Resource Not Found</h1>
  <p>The requested schema resource <code>${req.originalUrl}</code> was not found.</p>
  <p><a href="/schemas" style="color: #38bdf8;">Return to Schema Directory</a></p>
</body>
</html>`);
  }
});
