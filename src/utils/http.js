/** Respuestas HTTP uniformes: todo recurso viaja dentro de `data`. */
export const ok = (res, data) => res.json({ data });
export const list = (res, page) => res.json(page);
export const created = (res, location, data) => res.location(location).status(201).json({ data });
export const noContent = res => res.status(204).end();
