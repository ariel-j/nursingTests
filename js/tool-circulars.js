// tools/circulars.html: action sorter, circulars-by-topic filter, support-worker drill, quiz.
import {
  AIDE_ITEMS, CIRCULARS_MAP, CIRCULARS_QUIZ, SORTER_ITEMS, ALL_TOPICS, filterMap, mapTopics,
} from './tool-core.js';
import { chipGroup, el, mountDrill } from './tool-ui.js';

mountDrill(document.getElementById('sorter-drill'), { items: SORTER_ITEMS, label: 'מיון פעולות' });
mountDrill(document.getElementById('aide-drill'), { items: AIDE_ITEMS, label: 'האם כוח עזר רשאי לבצע' });
mountDrill(document.getElementById('quiz-drill'), { items: CIRCULARS_QUIZ, label: 'חידון מהיר', shuffleOptions: true });

const tbody = document.getElementById('map-body');
const count = document.getElementById('map-count');

function renderMap(topic) {
  const rows = filterMap(CIRCULARS_MAP, topic);
  tbody.replaceChildren(
    ...rows.map(([circular, topicText]) => {
      const tr = el('tr');
      tr.append(el('td', 'nowrap', circular), el('td', null, topicText));
      return tr;
    }),
  );
  count.textContent = `מוצגים ${rows.length} חוזרים`;
}

document.getElementById('map-chips').replaceChildren(
  chipGroup('סינון לפי נושא', mapTopics(CIRCULARS_MAP), ALL_TOPICS, renderMap),
);
renderMap(ALL_TOPICS);
