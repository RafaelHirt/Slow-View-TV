// These checks establish topology of an OSM relation, not timetable completeness
// or visual fidelity. Never bridge missing rails with an invented straight line.
const ignoredRoles = /^(platform|stop)(?:_|$)/;
const allowedRoles = new Set(['', 'forward', 'backward']);

function pointKey(point) { return `${point.lat},${point.lon}`; }
function coordinate(point) {
  return point && Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90
    && Number.isFinite(point.lon) && point.lon >= -180 && point.lon <= 180;
}

export function extractRailwayGeometry(relation, elements = [], { maxPoints = 100000 } = {}) {
  const issues = [];
  const issue = (code, message, detail = {}) => issues.push({ code, message, ...detail });
  if (!relation || relation.type !== 'relation' || relation.tags?.type !== 'route' || relation.tags?.route !== 'train') {
    issue('not_train_route', 'O identificador precisa ser uma relação OSM type=route, route=train.');
    return { points: [], diagnostics: { valid: false, issues, wayCount: 0, pointCount: 0, closedLoop: false } };
  }
  const lookup = new Map(elements.filter((element) => element.type === 'way').map((element) => [element.id, element]));
  const ways = [];
  for (const member of relation.members ?? []) {
    const role = member.role ?? '';
    if (ignoredRoles.test(role) || member.type === 'node') continue;
    if (member.type !== 'way') {
      issue('nested_member', 'A relação contém outra relação; é necessário revisar o percurso antes de importar.', { memberId: member.ref });
      continue;
    }
    if (!allowedRoles.has(role)) {
      issue('unsupported_role', 'Um trecho tem uma função que exige revisão manual.', { wayId: member.ref, role });
      continue;
    }
    const fullWay = lookup.get(member.ref);
    // A platform may be tagged on the way without a role on the relation.
    if (fullWay?.tags?.railway === 'platform' || fullWay?.tags?.public_transport === 'platform') continue;
    const geometry = fullWay?.geometry ?? member.geometry;
    if (!Array.isArray(geometry) || geometry.length < 2 || geometry.some((point) => !coordinate(point))) {
      issue('missing_geometry', 'Um trecho está sem geometria completa; não criamos uma ligação artificial.', { wayId: member.ref });
      continue;
    }
    if (new Set(geometry.map(pointKey)).size < 2) {
      issue('empty_way', 'Um trecho não contém dois pontos distintos.', { wayId: member.ref });
      continue;
    }
    const nodes = fullWay?.nodes ?? member.nodes;
    ways.push({ id: member.ref, role, geometry, nodes: Array.isArray(nodes) && nodes.length === geometry.length ? nodes : null });
  }
  if (!ways.length) issue('no_track_geometry', 'A relação não contém trilhos com geometria utilizável.');
  const rawPointCount = ways.reduce((count, way) => count + way.geometry.length, 0);
  // Count after joins too, so many short ways remain admissible. A generous raw
  // cap prevents pathological duplicate members consuming unbounded work.
  if (rawPointCount > maxPoints * 2) issue('too_many_points', `O percurso excede o limite de ${maxPoints.toLocaleString('pt-BR')} pontos; requer preparação sem perder o traçado.`);
  const fail = () => ({ points: [], diagnostics: { valid: false, issues, wayCount: ways.length, pointCount: rawPointCount, closedLoop: false } });
  if (issues.length) return fail();

  const useNodeIds = ways.every((way) => way.nodes);
  const vertices = new Map(), edges = [], seenEdges = new Set();
  for (let wayIndex = 0; wayIndex < ways.length; wayIndex += 1) {
    const way = ways[wayIndex];
    let previous;
    for (let index = 0; index < way.geometry.length; index += 1) {
      const point = way.geometry[index];
      const key = useNodeIds ? `node:${way.nodes[index]}` : pointKey(point);
      const existing = vertices.get(key);
      if (existing && pointKey(existing.point) !== pointKey(point)) {
        issue('conflicting_coordinates', 'Um nó compartilhado tem coordenadas inconsistentes.', { wayId: way.id });
      }
      if (!existing) vertices.set(key, { point: { lat: point.lat, lon: point.lon, ele: null }, edges: [] });
      if (previous !== undefined && previous !== key) {
        const edgeKey = [previous, key].sort().join('|');
        if (seenEdges.has(edgeKey)) issue('repeated_track', 'A relação repete o mesmo segmento de trilho; é necessário revisar o percurso.', { wayId: way.id });
        seenEdges.add(edgeKey);
        const edge = { id: edges.length, a: previous, b: key, wayIndex };
        edges.push(edge);
        vertices.get(previous).edges.push(edge);
        vertices.get(key).edges.push(edge);
      }
      previous = key;
    }
  }
  if (vertices.size > maxPoints) issue('too_many_points', `O percurso tem ${vertices.size} pontos; o limite atual é ${maxPoints}. Nenhum ponto foi descartado.`);
  if (!edges.length) issue('empty_track', 'Os trilhos não têm extensão utilizável.');
  const branches = [...vertices.values()].filter((vertex) => vertex.edges.length > 2);
  if (branches.length) issue('branching_track', 'O percurso tem bifurcações ou trilhos repetidos. Selecione uma relação direcional contínua ou revise os dados.', { branchCount: branches.length });
  if (issues.length) return fail();

  const terminals = [...vertices.entries()].filter(([, vertex]) => vertex.edges.length === 1).map(([key]) => key);
  if (terminals.length !== 0 && terminals.length !== 2) {
    issue('disconnected_track', 'Os trechos não formam um único percurso contínuo. Não foram criadas ligações artificiais.', { terminalCount: terminals.length });
    return fail();
  }
  const firstWay = ways[0];
  const firstKey = useNodeIds ? `node:${firstWay.nodes[0]}` : pointKey(firstWay.geometry[0]);
  let current = terminals[0] ?? firstKey;
  const path = [current], traversed = [], used = new Set();
  while (true) {
    const edge = vertices.get(current).edges.find((candidate) => !used.has(candidate.id));
    if (!edge) break;
    used.add(edge.id);
    const next = edge.a === current ? edge.b : edge.a;
    traversed.push({ edge, forward: edge.a === current });
    path.push(next);
    current = next;
  }
  if (used.size !== edges.length) {
    issue('disconnected_track', 'Há grupos de trilhos separados. A relação inteira não pode ser importada como uma viagem contínua.', { connectedSegments: used.size, totalSegments: edges.length });
    return fail();
  }
  let reverse = null;
  for (const { edge, forward } of traversed) {
    const role = ways[edge.wayIndex].role;
    if (role !== 'forward' && role !== 'backward') continue;
    const required = role === 'forward' ? !forward : forward;
    if (reverse !== null && reverse !== required) {
      issue('direction_conflict', 'Os sentidos forward/backward dos trilhos são incompatíveis; revise a relação antes de importar.');
      return fail();
    }
    reverse = required;
  }
  // With no explicit roles, the first member provides the best available source
  // ordering. This is not a claim that from/to names were geocoded or verified.
  if (reverse === null) reverse = !traversed.find(({ edge }) => edge.wayIndex === 0).forward;
  if (reverse) path.reverse();
  if (path.length > maxPoints) {
    issue('too_many_points', `O percurso excede ${maxPoints} pontos. Nenhum trecho foi simplificado automaticamente.`);
    return fail();
  }
  return {
    points: path.map((key) => vertices.get(key).point),
    diagnostics: {
      valid: true, issues, wayCount: ways.length, pointCount: path.length,
      closedLoop: terminals.length === 0, connectivity: useNodeIds ? 'shared-osm-nodes' : 'exact-coordinates',
      warnings: ['A continuidade do traçado não confirma horários, paradas, relevo ou fidelidade visual do cenário.'],
    },
  };
}
