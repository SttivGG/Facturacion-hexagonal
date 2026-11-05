import catalog from './data/divipola.json' with { type: 'json' };

export type LocationValue = { pais: string; departamento: string; ciudad: string; direccion: string };
export const locationKey = (value: string | null | undefined) =>
  (value ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/\s+/gu, ' ').toUpperCase();
export const isColombian = (pais: string) => !locationKey(pais) || locationKey(pais) === 'COLOMBIA';
export const departments = [...new Map(catalog.municipios.map(row => [row.cod_dpto, { code: row.cod_dpto, name: row.dpto }])).values()]
  .sort((a, b) => a.name.localeCompare(b.name, 'es'));
export const municipalities = (code: string) => catalog.municipios.filter(row => row.cod_dpto === code)
  .map(row => ({ code: row.cod_mpio, name: row.nom_mpio, type: row.tipo_municipio }))
  .sort((a, b) => a.name.localeCompare(b.name, 'es'));
export const searchLocations = <T extends { name: string }>(options: T[], query: string) =>
  options.filter(option => locationKey(option.name).includes(locationKey(query)));
const unique = <T,>(values: T[]) => values.length === 1 ? values[0] : undefined;

export function resolveLocation(value: Pick<LocationValue, 'pais' | 'departamento' | 'ciudad'>) {
  const department = isColombian(value.pais)
    ? unique(departments.filter(row => locationKey(row.name) === locationKey(value.departamento))) : undefined;
  const municipality = department
    ? unique(municipalities(department.code).filter(row => locationKey(row.name) === locationKey(value.ciudad))) : undefined;
  const recognized = isColombian(value.pais) && (!locationKey(value.departamento) || !!department)
    && (!locationKey(value.ciudad) || !!municipality);
  return { department, municipality, recognized };
}

export function sameGeography(a: Pick<LocationValue, 'pais' | 'departamento' | 'ciudad'>, b?: Pick<LocationValue, 'pais' | 'departamento' | 'ciudad'>) {
  return !!b && a.pais === b.pais && a.departamento === b.departamento && a.ciudad === b.ciudad;
}

export function validateLocation(value: LocationValue, original?: LocationValue): Record<string, string> {
  if (sameGeography(value, original) || !isColombian(value.pais)) return {};
  const { department, municipality } = resolveLocation(value);
  const errors: Record<string, string> = {};
  if ((locationKey(value.departamento) || locationKey(value.ciudad)) && !department)
    errors.departamento = 'Selecciona un departamento del catálogo.';
  if (locationKey(value.ciudad) && !municipality)
    errors.ciudad = 'Selecciona un municipio del departamento indicado.';
  return errors;
}
