import express from 'express';
import { HttpError } from './validation.mjs';

const MAX_NOTES_LENGTH = 20000;
const initialNotes = 'Primeira rota: Viena → Praga, de trem.\nObjetivo: uma viagem completa, com traçado ferroviário validado, cenário fiel aos lugares e exportação em 4K.\nSalvar variações de estação do ano, horário e clima sobre a mesma rota.\nDepois dos trens, estudar caminhadas em primeira pessoa e viagens de navio.';

const sources = [
  {
    id: 'railway', name: 'OSM, Overpass e OpenRailwayMap', category: 'Traçado ferroviário',
    status: 'prepared', statusLabel: 'Consulta implementada · sujeita à conexão',
    summary: 'A pesquisa de relações ferroviárias e a importação estão implementadas no ateliê. As consultas à fonte podem demorar ou falhar; o aplicativo informa quando não consegue obter os dados.',
    limitations: 'Mapa e consulta de rotas são serviços separados: visualizar trilhos não confirma uma rota importável. Ramificações, lacunas e trilhos paralelos precisam de validação. A5, D1 e D2 são rodovias e não definem a linha Viena–Praga. Creditar os contribuidores do OpenStreetMap.',
    links: [
      { label: 'OpenStreetMap e licença', url: 'https://www.openstreetmap.org/copyright' },
      { label: 'Overpass Turbo', url: 'https://overpass-turbo.eu/' },
      { label: 'OpenRailwayMap', url: 'https://www.openrailwaymap.org/' },
    ],
  },
  {
    id: 'timetables', name: 'ÖBB, České dráhy e GTFS', category: 'Viagem e horários',
    status: 'pending', statusLabel: 'Integração pendente',
    summary: 'Selecionar o serviço, a data e a sequência de paradas ajuda a escolher o caminho correto e a duração da viagem.',
    limitations: 'A disponibilidade e a licença dos feeds de cada operadora ainda precisam ser verificadas. GTFS fornece horários e formas de percurso; não garante a precisão dos trilhos. Informações em tempo real usam fontes próprias.',
    links: [
      { label: 'ÖBB', url: 'https://www.oebb.at/en/' },
      { label: 'České dráhy', url: 'https://www.cd.cz/en/' },
      { label: 'Especificação GTFS', url: 'https://gtfs.org/documentation/schedule/reference/' },
    ],
  },
  {
    id: 'terrain', name: 'Copernicus DEM', category: 'Relevo',
    status: 'pending', statusLabel: 'Integração pendente',
    summary: 'Usar dados de elevação para construir as montanhas, vales e o horizonte ao redor da ferrovia.',
    limitations: 'O produto é um modelo de superfície que inclui vegetação e construções. Não determina sozinho a altura dos trilhos. Pontes, túneis, cortes e datum vertical precisam de tratamento específico.',
    links: [{ label: 'Dados Copernicus DEM', url: 'https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM' }],
  },
  {
    id: 'landcover', name: 'ESA WorldCover', category: 'Vegetação e ocupação',
    status: 'pending', statusLabel: 'Integração pendente',
    summary: 'Distribuir categorias de paisagem, como floresta, lavoura, água e área construída, usando a cobertura da terra.',
    limitations: 'O produto de 2021 tem resolução de 10 m e 11 classes amplas. Não identifica cada árvore, espécie ou edifício, nem mostra automaticamente a paisagem atual. Referências locais continuam necessárias.',
    links: [{ label: 'WorldCover e documentação', url: 'https://esa-worldcover.org/en/data-access' }],
  },
  {
    id: 'engine', name: 'Cesium e Unreal Engine', category: 'Cenário e câmera 3D',
    status: 'pending', statusLabel: 'Motor ainda não integrado',
    summary: 'Caminho proposto para posicionar terreno e cenários reais no espaço e movimentar a câmera por uma viagem contínua.',
    limitations: 'A prévia atual usa um cenário ilustrativo próprio. O plugin aberto não torna todos os dados gratuitos, nem garante detalhe na altura da cabine. A IA pode ajudar no acabamento, mas também pode deformar trilhos e objetos.',
    links: [
      { label: 'Cesium for Unreal', url: 'https://github.com/CesiumGS/cesium-unreal' },
      { label: 'Unreal Engine', url: 'https://www.unrealengine.com/' },
    ],
  },
  {
    id: 'audio', name: 'Sons ambientes licenciados', category: 'Áudio',
    status: 'pending', statusLabel: 'Seleção e integração pendentes',
    summary: 'Criar camadas de trem, vento e chuva, com variações coerentes em estações, pontes e túneis.',
    limitations: 'A exportação atual não tem áudio. Cada gravação precisa permitir o uso comercial pretendido; verifique também atribuição, alterações e redistribuição. Sons Creative Commons podem ter condições diferentes.',
    links: [{ label: 'Entender as licenças Creative Commons', url: 'https://creativecommons.org/share-your-work/cclicenses/' }],
  },
  {
    id: 'gpu', name: 'Processamento externo com GPU', category: 'Infraestrutura de produção',
    status: 'pending', statusLabel: 'Ainda não contratado ou integrado',
    summary: 'Referência para o piloto 3D: 8 vCPU, 32 GB de RAM, GPU RTX 4090 com 24 GB de memória e 100–200 GB de disco, ligados sob demanda.',
    limitations: 'RunPod documenta a RTX 4090 de 24 GB; DigitalOcean também oferece máquinas com GPU. Disponibilidade, região, armazenamento e preços precisam ser conferidos antes de contratar. O dimensionamento deve ser ajustado depois de medir um trecho representativo. Não há trabalhador remoto conectado hoje.',
    links: [
      { label: 'Guia oficial RunPod', url: 'https://github.com/runpod/docs/blob/d267bc5c7b0e6ee99fe0adcc2ddd8052c44f9375/pods/choose-a-pod.mdx' },
      { label: 'API oficial DigitalOcean', url: 'https://github.com/digitalocean/openapi/blob/840dc604b18ea5ba4607d573a46343b4009116e8/specification/resources/droplets/droplets_list.yml' },
    ],
  },
  {
    id: 'earthstudio', name: 'Google Earth Studio', category: 'Referência opcional',
    status: 'reference', statusLabel: 'Referência · uso a avaliar',
    summary: 'Pode ajudar a estudar o território, mas não é indispensável para construir o sistema.',
    limitations: 'Cobertura vista do alto não garante qualidade junto aos trilhos. Os termos atuais para exportação, transformação por IA e publicação comercial precisam ser revistos antes do uso. Não há integração ativa.',
    links: [
      { label: 'Google Earth Studio', url: 'https://earth.google.com/studio/' },
      { label: 'Diretrizes de uso geográfico', url: 'https://www.google.com/permissions/geoguidelines/' },
    ],
  },
];

export function createKnowledgeRouter({ db }) {
  db.exec(`CREATE TABLE IF NOT EXISTS project_knowledge (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    project_notes TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  db.prepare('INSERT OR IGNORE INTO project_knowledge (id, project_notes, updated_at) VALUES (1, ?, ?)')
    .run(initialNotes, new Date().toISOString());

  function snapshot() {
    const row = db.prepare('SELECT project_notes, updated_at FROM project_knowledge WHERE id = 1').get();
    return { sources, projectNotes: row.project_notes, updatedAt: row.updated_at };
  }

  const router = express.Router();
  router.get('/', (_req, res) => res.json(snapshot()));
  router.put('/', (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.projectNotes !== 'string') {
      throw new HttpError(400, 'As notas do projeto devem ser um texto.');
    }
    if (Object.keys(body).some((key) => key !== 'projectNotes')) {
      throw new HttpError(400, 'Somente as notas do projeto podem ser alteradas por este formulário.');
    }
    if (body.projectNotes.length > MAX_NOTES_LENGTH) {
      throw new HttpError(400, 'As notas do projeto podem ter até 20.000 caracteres.');
    }
    db.prepare('UPDATE project_knowledge SET project_notes = ?, updated_at = ? WHERE id = 1')
      .run(body.projectNotes, new Date().toISOString());
    res.json(snapshot());
  });
  return router;
}
