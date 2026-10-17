import bcrypt from 'bcryptjs';
import { publicUser } from '../middlewares/auth.js';
import { conflict, missing } from '../utils/errors.js';

export const BCRYPT_COST = 12;

export class UserService {
  constructor(repository) {
    this.repository = repository;
  }

  async list() {
    return (await this.repository.listUsers()).map(publicUser);
  }

  async get(id) {
    const user = await this.repository.getUser(id);
    if (!user) throw missing('Usuario');
    return publicUser(user);
  }

  async create({ password, ...input }, actorId) {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    return publicUser(await this.repository.createUser({ ...input, passwordHash }, actorId));
  }

  /** Cambia nombre, rol o estado. Un administrador no puede degradarse ni desactivarse a sí mismo. */
  async update(id, patch, actor) {
    const target = await this.repository.getUser(id);
    if (!target) throw missing('Usuario');
    if (id === actor.id && (patch.active === false || (patch.role && patch.role !== actor.role))) {
      throw conflict('No puedes cambiar tu propio rol ni desactivar tu cuenta.');
    }
    if (target.role === 'admin' && (patch.active === false || (patch.role && patch.role !== 'admin'))) {
      const admins = (await this.repository.listUsers()).filter(u => u.role === 'admin' && u.active);
      if (admins.length <= 1) throw conflict('Debe existir al menos un administrador activo.');
    }
    return publicUser(await this.repository.updateUser(id, patch, actor.id));
  }
}
