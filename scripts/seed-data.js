/**
 * Datos ficticios de demostración. Funciona con los repositorios SQL/MongoDB y con los de memoria.
 * Es idempotente: si ya existe el cliente de referencia, no vuelve a cargar nada.
 */
import bcrypt from 'bcryptjs';

const DAY = 86_400_000;
const ago = days => new Date(Date.now() - days * DAY).toISOString();
const ahead = days => new Date(Date.now() + days * DAY).toISOString();

export async function ensureAdmin(repository, config) {
  const email = config.ADMIN_EMAIL.toLowerCase();
  let admin = await repository.findUserByEmail(email);
  if (!admin) {
    admin = await repository.createUser({ name: config.ADMIN_NAME, email, role: 'admin', passwordHash: await bcrypt.hash(config.ADMIN_PASSWORD, 12) });
  }
  return admin;
}

async function ensureUser(repository, { name, email, role }, passwordHash, actorId) {
  return (await repository.findUserByEmail(email)) || repository.createUser({ name, email, role, passwordHash }, actorId);
}

// [nombre, correo, índice de segmento, estado]
const CLIENTS = [
  ['Lucía Mendoza', 'lucia.demo@example.com', 0, 'activo'],
  ['Estudio Nexo', 'nexo.demo@example.com', 1, 'activo'],
  ['Diego Salazar', 'diego.demo@example.com', 0, 'activo'],
  ['María Torres', 'maria.demo@example.com', 0, 'activo'],
  ['Andes Digital', 'andes.demo@example.com', 2, 'activo'],
  ['Valeria Ruiz', 'valeria.demo@example.com', 0, 'activo'],
  ['Ferretería El Sol', 'elsol.demo@example.com', 1, 'activo'],
  ['Clínica Santa Rosa', 'santarosa.demo@example.com', 2, 'activo'],
  ['Renzo Quispe', 'renzo.demo@example.com', 0, 'activo'],
  ['Café Altura', 'altura.demo@example.com', 1, 'activo'],
  ['Transportes Inca', 'inca.demo@example.com', 2, 'activo'],
  ['Gabriela Chávez', 'gabriela.demo@example.com', 0, 'activo'],
  ['Óptica Visión', 'vision.demo@example.com', 1, 'activo'],
  ['Martín Huamán', 'martin.demo@example.com', 0, 'activo']
];

// [cliente, servicio, categoría, gravedad, satisfacción, días atrás, descripción, resuelta hace N días | null, responsable]
const INCIDENTS = [
  [0, 0, 0, 3, 1, 5, 'El soporte no respondió a varias solicitudes y el problema de conexión continúa.', null, 1],
  [0, 2, 1, 2, 2, 2, 'El cliente recibió una respuesta poco cordial en atención comercial.', null, 2],
  [0, 0, 2, 2, null, 40, 'El equipo instalado presentó fallas intermitentes la semana de instalación.', 37, 0],
  [1, 1, 0, 2, 2, 4, 'El pedido lleva varios días de retraso sin una fecha confirmada.', null, 2],
  [1, 1, 0, 1, 3, 26, 'El courier no dejó constancia de visita y el pedido volvió al almacén.', 24, 2],
  [2, 0, 2, 1, 4, 1, 'La configuración presentó un error menor que ya fue corregido.', 0.5, 1],
  [3, 2, 3, 1, 4, 18, 'Consulta sobre un cobro duplicado, se explicó el detalle de la factura.', 17, 1],
  [4, 1, 2, 3, 1, 8, 'La entrega llegó incompleta y el cliente necesita una solución urgente.', null, 0],
  [4, 2, 3, 2, 2, 3, 'El cobro contiene un importe adicional que no fue explicado.', null, 1],
  [4, 0, 0, 2, 2, 1, 'El ticket de soporte sigue pendiente y el cliente reiteró su reclamo.', null, 2],
  [5, 0, 0, 1, 5, 30, 'Solicitud de cambio de contraseña atendida dentro del plazo.', 29, 2],
  [6, 1, 0, 2, 2, 12, 'Retraso en la reposición de stock prometida para inicio de mes.', null, 2],
  [6, 1, 2, 2, 3, 6, 'Llegaron productos dañados en la última entrega.', null, 0],
  [7, 0, 2, 3, 1, 3, 'El sistema de citas quedó fuera de servicio durante toda la mañana.', null, 1],
  [7, 0, 0, 3, 2, 9, 'Segundo corte del servicio en el mes; el cliente evalúa cambiar de proveedor.', 7, 1],
  [7, 2, 1, 2, 2, 15, 'El ejecutivo comercial no devolvió las llamadas sobre la renovación.', 13, 0],
  [8, 2, 3, 1, 3, 20, 'Error en la fecha de vencimiento de la factura.', 19, 2],
  [9, 1, 0, 2, 3, 10, 'El pedido de insumos llegó con dos días de demora.', 8, 2],
  [9, 2, 1, 1, null, 2, 'Reclamo por demora en la respuesta del chat comercial.', null, 1],
  [10, 1, 2, 3, 1, 4, 'La flota no recibió los repuestos críticos programados.', null, 0],
  [10, 1, 0, 2, 2, 11, 'Reprogramación de entrega sin aviso previo.', 10, 2],
  [10, 2, 3, 2, 2, 25, 'Diferencia en la facturación del contrato corporativo.', 21, 1],
  [11, 0, 0, 1, 4, 45, 'Consulta técnica resuelta en la primera llamada.', 45, 2],
  [12, 2, 1, 2, 3, 7, 'El cliente percibió un trato apresurado al solicitar información.', 6, 2],
  [3, 1, 0, 1, null, 52, 'Entrega fuera de la ventana horaria acordada.', 50, 2],
  [5, 2, 3, 1, 4, 34, 'Ajuste de facturación aplicado a solicitud del cliente.', 33, 1],
  [8, 0, 2, 2, 3, 48, 'El router fue reemplazado por falla de fábrica.', 46, 0],
  [12, 0, 0, 1, 5, 55, 'Soporte remoto exitoso para la configuración del sistema.', 55, 2],
  [2, 1, 0, 2, 3, 38, 'Pedido entregado en la dirección equivocada; se corrigió al día siguiente.', 36, 2],
  [13, 2, 1, 1, 4, 60, 'Consulta comercial antes de la baja del servicio.', 58, 1]
];

export async function seedData(repository, config, audit = null) {
  const admin = await ensureAdmin(repository, config);
  if ((await repository.listClients()).some(c => c.email === CLIENTS[0][1])) return;

  const teamHash = await bcrypt.hash(config.ADMIN_PASSWORD, 12);
  const analyst = await ensureUser(repository, { name: 'Carla Rojas', email: 'carla.analista@fugacliente.local', role: 'analista' }, teamHash, admin.id);
  const agent = await ensureUser(repository, { name: 'Jorge Paredes', email: 'jorge.agente@fugacliente.local', role: 'agente' }, teamHash, admin.id);
  const team = [admin, analyst, agent];

  const { segments, services, categories } = await repository.catalogs();
  const clients = [];
  for (const [name, email, segment] of CLIENTS) {
    clients.push(await repository.createClient({ name, email, phone: null, segmentId: segments[segment].id, status: 'activo' }, admin.id));
  }

  const incidents = [];
  for (const [c, s, cat, severity, satisfaction, days, description, resolvedDays, owner] of INCIDENTS) {
    const incident = await repository.createIncident({
      clientId: clients[c].id, serviceId: services[s].id, categoryId: categories[cat].id,
      severity, satisfaction, assignedUserId: team[owner].id, description, createdAt: ago(days)
    }, team[owner].id);
    incidents.push(incident);
    if (resolvedDays !== null) {
      await repository.updateIncident(incident.id, { status: 'resuelta', expectedVersion: incident.version, at: ago(resolvedDays) }, team[owner].id);
    }
  }

  // Cliente que dejó la empresa: se archiva y conserva su historial.
  await repository.updateClient(clients[13].id, { status: 'inactivo' }, admin.id);

  const action = async (c, owner, type, description, dueDays, outcome = null) => {
    const created = await repository.createAction({ clientId: clients[c].id, incidentId: null, assignedUserId: team[owner].id, type, description, dueAt: ahead(dueDays) }, admin.id);
    if (outcome) await repository.completeAction(created.id, outcome, team[owner].id);
  };
  await action(0, 1, 'contacto', 'Llamar a Lucía, escuchar el reclamo y coordinar la solución del soporte.', 1);
  await action(4, 0, 'seguimiento', 'Verificar la entrega completa y confirmar la corrección del cobro.', 2);
  await action(7, 1, 'compensacion', 'Ofrecer un mes de servicio sin costo por los cortes recientes.', 3);
  await action(10, 2, 'contacto', 'Coordinar con logística una entrega prioritaria de repuestos.', 1);
  await action(6, 2, 'seguimiento', 'Confirmar la reposición de los productos dañados.', 4);
  await action(1, 2, 'contacto', 'Informar la nueva fecha de entrega del pedido retrasado.', 2, 'contactado');
  await action(9, 1, 'seguimiento', 'Confirmar la satisfacción tras la entrega de insumos.', 5, 'recuperado');
  await action(12, 2, 'contacto', 'Disculparse por la atención y ofrecer asesoría personalizada.', 6, 'recuperado');
  await action(3, 2, 'seguimiento', 'Verificar que el cobro duplicado fue revertido.', 3, 'sin_respuesta');

  if (audit) {
    const note = (c, author, channel, text) => audit.addComment(clients[c].id, { text, channel }, team[author]);
    await note(0, 1, 'telefono', 'La clienta indica que evaluará otras opciones si no se soluciona esta semana.');
    await note(0, 2, 'interno', 'Se escaló el caso al equipo de redes con prioridad alta.');
    await note(4, 0, 'correo', 'Gerencia de Andes Digital solicita una reunión para revisar el contrato.');
    await note(7, 1, 'telefono', 'El director médico pidió un informe de las causas de los cortes.');
    await note(10, 2, 'web', 'El cliente registró un reclamo formal desde el portal.');
    await note(9, 1, 'interno', 'Cliente recuperado: confirmó que continuará con el servicio.');
  }
}
