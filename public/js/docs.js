/** Referencia interactiva del API generada a partir de docs/openapi.json (sin dependencias externas). */
import { $, html, mount } from './core/html.js';

const slug = text => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

function exampleFrom(schema, components, depth = 0) {
  if (!schema || depth > 4) return null;
  if (schema.$ref) return exampleFrom(components[schema.$ref.split('/').pop()], components, depth + 1);
  if (schema.type === 'object') return Object.fromEntries(Object.entries(schema.properties || {}).map(([k, v]) => [k, exampleFrom(v, components, depth + 1)]));
  if (schema.type === 'array') return [exampleFrom(schema.items, components, depth + 1)];
  if (schema.enum) return schema.enum[0];
  if (schema.default !== undefined) return schema.default;
  if (schema.format === 'email') return 'cliente@example.com';
  if (schema.format === 'date-time') return '2026-12-01T15:00:00Z';
  return { integer: 1, number: 1, boolean: true, string: 'texto' }[schema.type] ?? null;
}

function operation(path, method, op, spec) {
  const components = spec.components.schemas;
  const isPublic = Array.isArray(op.security) && op.security.length === 0;
  const bodyRef = op.requestBody?.content?.['application/json']?.schema;
  const codes = Object.entries(op.responses || {});
  return html`<details class="op" id="${method}-${slug(path)}">
    <summary><span class="method ${method}">${method.toUpperCase()}</span><span class="op-path">${path}</span><span class="op-summary">${op.summary}</span><span class="lock">${isPublic ? 'Pública' : 'Bearer JWT'}</span></summary>
    <div class="op-body">
      ${op.description ? html`<p>${op.description}</p>` : ''}
      ${op.parameters?.length ? html`<div><h4>Parámetros</h4><div class="table-wrap"><table><thead><tr><th>Nombre</th><th>En</th><th>Tipo</th><th>Restricciones</th></tr></thead><tbody>
        ${op.parameters.map(p => html`<tr><td><code>${p.name}</code>${p.required ? ' *' : ''}</td><td>${p.in}</td><td>${p.schema.type}</td><td class="muted">${[p.schema.enum?.join(' | '), p.schema.minimum !== undefined ? `mín ${p.schema.minimum}` : '', p.schema.maximum !== undefined ? `máx ${p.schema.maximum}` : '', p.schema.default !== undefined ? `por defecto ${p.schema.default}` : ''].filter(Boolean).join(' · ')}</td></tr>`)}
      </tbody></table></div></div>` : ''}
      ${bodyRef ? html`<div><h4>Cuerpo JSON (${bodyRef.$ref.split('/').pop()})</h4><pre class="schema">${JSON.stringify(exampleFrom(bodyRef, components), null, 2)}</pre></div>` : ''}
      <div><h4>Respuestas</h4><div class="codes">${codes.map(([code, r]) => html`<span class="code-pill ${code < 300 ? 'ok' : ''}" title="${r.description}">${code} ${r.description}</span>`)}</div></div>
    </div></details>`;
}

async function init() {
  const spec = await (await fetch('/api/openapi.json')).json();
  const groups = new Map();
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const tag = op.tags?.[0] || 'General';
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag).push([path, method, op]);
    }
  }
  mount($('#docsNav'), [...groups].map(([tag, ops]) => html`<a href="#${slug(tag)}">${tag}<small>${ops.length}</small></a>`));
  mount($('#docsMain'), html`
    <section class="docs-intro"><h1>${spec.info.title} <span class="muted">v${spec.info.version}</span></h1><p>${spec.info.description}</p>
      <div class="servers">${spec.servers.map(s => html`<code>${s.url}</code>`)}</div>
      <p>Autenticación: <code>POST /auth/login</code> devuelve un JWT; envíalo como <code>Authorization: Bearer &lt;token&gt;</code>. Errores con formato <code>{ error: { code, message, requestId, details } }</code>.</p></section>
    ${[...groups].map(([tag, ops]) => html`<section class="docs-group" id="${slug(tag)}"><h2>${tag}</h2>${ops.map(([path, method, op]) => operation(path, method, op, spec))}</section>`)}`);
}

init().catch(err => mount($('#docsMain'), html`<p class="form-error">No se pudo cargar la especificación: ${err.message}</p>`));
