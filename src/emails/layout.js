// Every value in a message comes from a person: a business name someone typed
// when registering, a reason an administrator wrote. None of it may become
// markup.
const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const SIGNATURE = 'Cámara de Comercio, Turismo, Industria y Afines del Cantón de La Unión';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

// Paragraphs arrive already escaped, because each template decides which parts
// of its own text are markup it wrote and which are values it received.
function layout(heading, paragraphs) {
  const body = paragraphs.map((text) => `<p>${text}</p>`).join('');

  return `<div><h2>${escapeHtml(heading)}</h2>${body}<p>${SIGNATURE}</p></div>`;
}

module.exports = { layout, escapeHtml, SIGNATURE };
