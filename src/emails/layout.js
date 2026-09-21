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

const COLORS = {
  brand: '#1F3A5F',
  brandDark: '#162A45',
  accent: '#C9A227',
  text: '#222222',
  muted: '#5B6B7C',
  border: '#E1E6EB',
  surface: '#F5F7FA',
  buttonText: '#FFFFFF',
};

const FONT_STACK = "Segoe UI, Roboto, Helvetica, Arial, sans-serif";

const SIGNATURE = 'Cámara de Comercio, Turismo, Industria y Afines del Cantón de La Unión';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

/**
 * Bloques aceptados por layout():
 *  - string                          -> párrafo ya escapado por la plantilla
 *  - { type: 'text', html }          -> párrafo
 *  - { type: 'button', href, label, url } -> botón + dirección textual
 */
function renderBlock(block) {
  if (typeof block === 'string') {
    return `<p style="margin:0 0 16px 0;font-family:${FONT_STACK};font-size:16px;line-height:24px;color:${COLORS.text};">${block}</p>`;
  }

  if (block && block.type === 'text') {
    return `<p style="margin:0 0 16px 0;font-family:${FONT_STACK};font-size:16px;line-height:24px;color:${COLORS.text};">${block.html}</p>`;
  }

  if (block && block.type === 'button') {
    const safeHref = escapeHtml(block.href);
    const safeUrl = escapeHtml(block.url || block.href);
    const safeLabel = escapeHtml(block.label);
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px 0;">
        <tr>
          <td align="center" bgcolor="${COLORS.brand}" style="border-radius:6px;">
            <a href="${safeHref}"
               style="display:inline-block;padding:14px 28px;font-family:${FONT_STACK};font-size:16px;font-weight:600;line-height:20px;color:${COLORS.buttonText};text-decoration:none;border-radius:6px;">
              ${safeLabel}
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 20px 0;font-family:${FONT_STACK};font-size:13px;line-height:20px;color:${COLORS.muted};">
        Si el botón no funciona, copie esta dirección en su navegador:<br>
        <span style="color:${COLORS.brand};word-break:break-all;">${safeUrl}</span>
      </p>
    `;
  }

  return '';
}


// Paragraphs arrive already escaped, because each template decides which parts
// of its own text are markup it wrote and which are values it received.
function layout(heading, paragraphs) {
  const body = paragraphs.map((text) => `<p>${text}</p>`).join('');

  return `<div><h2>${escapeHtml(heading)}</h2>${body}<p>${SIGNATURE}</p></div>`;
}

module.exports = { layout, escapeHtml, SIGNATURE };
