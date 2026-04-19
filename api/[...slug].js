// Deprecated catch-all route.
// All API endpoints have been explicitly defined as dedicated Vercel Serverless Functions.
export default function handler(req, res) {
  res.status(404).json({ error: 'Endpoint moved or not found' });
}
