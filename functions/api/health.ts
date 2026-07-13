export const onRequestGet: PagesFunction = () =>
  Response.json({ ok: true, service: 'bernice', ts: new Date().toISOString() })
