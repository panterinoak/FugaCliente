import bcrypt from 'bcryptjs';

export async function ensureAdmin(repository, config) {
  const email = config.ADMIN_EMAIL.toLowerCase();
  let admin = await repository.findUserByEmail(email);
  if (!admin) admin = await repository.createUser({ name: config.ADMIN_NAME, email, role: 'admin', passwordHash: await bcrypt.hash(config.ADMIN_PASSWORD, 12) });
  return admin;
}
export async function seedData(repository, config) {
  const admin = await ensureAdmin(repository, config);
  if ((await repository.listClients()).some(c => c.email === 'lucia.demo@example.com')) return;
  const { segments, services, categories } = await repository.catalogs();
  const names = [
    ['Lucía Mendoza', 'lucia.demo@example.com', 0], ['Estudio Nexo', 'nexo.demo@example.com', 1],
    ['Diego Salazar', 'diego.demo@example.com', 0], ['María Torres', 'maria.demo@example.com', 0],
    ['Andes Digital', 'andes.demo@example.com', 2], ['Valeria Ruiz', 'valeria.demo@example.com', 0]
  ];
  const clients = [];
  for (const [name, email, index] of names) clients.push(await repository.createClient({ name, email, phone: null, segmentId: segments[index].id, status: 'activo' }, admin.id));
  const ago = days => new Date(Date.now() - days * 86400000).toISOString();
  const entries = [
    [0, 0, 0, 3, 1, 5, 'El soporte no respondió a varias solicitudes y el problema continúa.', false],
    [0, 2, 1, 2, 2, 2, 'El cliente recibió una respuesta poco cordial en atención comercial.', false],
    [1, 1, 0, 2, 2, 4, 'El pedido lleva varios días de retraso sin una fecha confirmada.', false],
    [2, 0, 2, 1, 4, 1, 'La configuración presentó un error menor que ya fue corregido.', true],
    [4, 1, 2, 3, 1, 8, 'La entrega llegó incompleta y el cliente necesita una solución urgente.', false],
    [4, 2, 3, 2, 2, 3, 'El cobro contiene un importe adicional que no fue explicado.', false],
    [4, 0, 0, 2, 2, 1, 'El ticket de soporte sigue pendiente y el cliente reiteró su reclamo.', false]
  ];
  for (const [c, s, cat, severity, satisfaction, days, description, resolved] of entries) {
    const i = await repository.createIncident({ clientId: clients[c].id, serviceId: services[s].id, categoryId: categories[cat].id, severity, satisfaction,
      assignedUserId: admin.id, description, createdAt: ago(days) }, admin.id);
    if (resolved) await repository.updateIncident(i.id, { status: 'resuelta', expectedVersion: i.version }, admin.id);
  }
  await repository.createAction({ clientId: clients[0].id, incidentId: null, assignedUserId: admin.id, type: 'contacto',
    description: 'Llamar a Lucía, escuchar el reclamo y coordinar la solución del soporte.', dueAt: new Date(Date.now() + 86400000).toISOString() }, admin.id);
  await repository.createAction({ clientId: clients[4].id, incidentId: null, assignedUserId: admin.id, type: 'seguimiento',
    description: 'Verificar la entrega completa y confirmar la corrección del cobro.', dueAt: new Date(Date.now() + 2 * 86400000).toISOString() }, admin.id);
}
